"""Transport (F9): vehicles, routes, stops, student assignment. Module: transport."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..auth import audit, require, require_area, require_module
from ..db import get_db
from ..deps import name_maps, owned, resolve_student
from ..models import Role, Route, Stop, StudentTransport, User, Vehicle, utcnow
from ..util import today

router = APIRouter(prefix="/transport", tags=["transport"], dependencies=[Depends(require_module("transport"))])

TIME = r"^$|^([01]\d|2[0-3]):[0-5]\d$"


class VehicleIn(BaseModel):
    number: str = Field(min_length=1, max_length=30)
    kind: str = Field(default="bus", pattern="^(bus|van|auto|other)$")
    capacity: int = Field(default=40, ge=1, le=120)
    insurance_until: date | None = None
    fitness_until: date | None = None
    driver_name: str = ""
    driver_phone: str = ""
    driver_licence: str = ""
    licence_until: date | None = None
    attendant_name: str = ""
    attendant_phone: str = ""


class StopIn(BaseModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    pickup_time: str = Field(default="", pattern=TIME)
    drop_time: str = Field(default="", pattern=TIME)


class RouteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    vehicle_id: int | None = None
    stops: list[StopIn] = []


class AssignIn(BaseModel):
    student_ids: list[int]
    route_id: int | None = None    # None = remove transport
    stop_id: int | None = None


def _vehicle_out(v: Vehicle, used: int = 0) -> dict:
    t = today()
    soon = t + timedelta(days=30)
    expiring = [label for label, d in (("Insurance", v.insurance_until), ("Fitness", v.fitness_until), ("Driver licence", v.licence_until))
                if d and d <= soon]
    return {"id": v.id, "number": v.number, "kind": v.kind, "capacity": v.capacity, "insurance_until": v.insurance_until,
            "fitness_until": v.fitness_until, "driver_name": v.driver_name, "driver_phone": v.driver_phone,
            "driver_licence": v.driver_licence, "licence_until": v.licence_until, "attendant_name": v.attendant_name,
            "attendant_phone": v.attendant_phone, "expiring": expiring, "seats_used": used}


def _stops(db: Session, route_id: int) -> list[Stop]:
    return list(db.scalars(select(Stop).where(Stop.route_id == route_id, Stop.is_active.is_(True)).order_by(Stop.seq)))


def _route_out(db: Session, r: Route) -> dict:
    counts = dict(db.execute(select(StudentTransport.stop_id, func.count()).where(StudentTransport.route_id == r.id)
                             .group_by(StudentTransport.stop_id)).all())
    v = db.get(Vehicle, r.vehicle_id) if r.vehicle_id else None
    riders = sum(counts.values())
    return {"id": r.id, "name": r.name, "vehicle_id": r.vehicle_id, "vehicle_number": v.number if v else None,
            "capacity": v.capacity if v else None, "riders": riders,
            "stops": [{"id": s.id, "name": s.name, "seq": s.seq, "pickup_time": s.pickup_time, "drop_time": s.drop_time,
                       "riders": counts.get(s.id, 0)} for s in _stops(db, r.id)]}


# ---------------------------------------------------------------- overview
@router.get("/overview")
def overview(user: User = Depends(require_area("transport", "view")), db: Session = Depends(get_db)):
    vehicles = list(db.scalars(select(Vehicle).where(Vehicle.school_id == user.school_id, Vehicle.is_active.is_(True)).order_by(Vehicle.number)))
    routes = list(db.scalars(select(Route).where(Route.school_id == user.school_id, Route.is_active.is_(True)).order_by(Route.name)))
    route_out = [_route_out(db, r) for r in routes]
    used_by_vehicle: dict[int, int] = {}
    for r in route_out:
        if r["vehicle_id"]:
            used_by_vehicle[r["vehicle_id"]] = used_by_vehicle.get(r["vehicle_id"], 0) + r["riders"]
    v_out = [_vehicle_out(v, used_by_vehicle.get(v.id, 0)) for v in vehicles]
    total_students = db.scalar(select(func.count()).select_from(User).where(User.school_id == user.school_id, User.role == Role.student, User.active.is_(True))) or 0
    riders = sum(r["riders"] for r in route_out)
    return {"vehicles": v_out, "routes": route_out, "riders": riders, "students": total_students,
            "alerts": [{"vehicle": v["number"], "items": v["expiring"]} for v in v_out if v["expiring"]] +
                      [{"vehicle": v["number"], "items": ["Over capacity"]} for v in v_out if v["seats_used"] > v["capacity"]]}


# ---------------------------------------------------------------- vehicles
@router.post("/vehicles")
def add_vehicle(body: VehicleIn, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    v = Vehicle(school_id=user.school_id, **{k: (x.strip() if isinstance(x, str) else x) for k, x in body.model_dump().items()})
    db.add(v)
    audit(db, user, "transport.vehicle.added", v.number)
    db.commit()
    return _vehicle_out(v)


@router.put("/vehicles/{vid}")
def edit_vehicle(vid: int, body: VehicleIn, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    v = owned(db, Vehicle, vid, user, "Vehicle")
    for k, x in body.model_dump().items():
        setattr(v, k, x.strip() if isinstance(x, str) else x)
    db.commit()
    return _vehicle_out(v)


@router.delete("/vehicles/{vid}")
def archive_vehicle(vid: int, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    v = owned(db, Vehicle, vid, user, "Vehicle")
    v.is_active, v.archived_at, v.archived_by = False, utcnow(), user.id
    for r in db.scalars(select(Route).where(Route.vehicle_id == vid)):
        r.vehicle_id = None
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- routes
def _check_vehicle(db: Session, user: User, vid: int | None) -> None:
    if vid is not None:
        owned(db, Vehicle, vid, user, "Vehicle")


def _save_stops(db: Session, user: User, route: Route, stops: list[StopIn]) -> None:
    existing = {s.id: s for s in db.scalars(select(Stop).where(Stop.route_id == route.id, Stop.is_active.is_(True)))}
    keep = set()
    for i, s in enumerate(stops):
        if s.id and s.id in existing:
            st = existing[s.id]
            st.name, st.pickup_time, st.drop_time, st.seq = s.name.strip(), s.pickup_time, s.drop_time, i
            keep.add(st.id)
        else:
            db.add(Stop(school_id=user.school_id, route_id=route.id, name=s.name.strip(), seq=i, pickup_time=s.pickup_time, drop_time=s.drop_time))
    for sid, st in existing.items():
        if sid not in keep:
            riders = db.scalar(select(func.count()).select_from(StudentTransport).where(StudentTransport.stop_id == sid)) or 0
            if riders:
                raise HTTPException(409, f"Stop “{st.name}” has {riders} student(s). Move them before removing the stop.")
            st.is_active = False


@router.post("/routes")
def add_route(body: RouteIn, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    _check_vehicle(db, user, body.vehicle_id)
    r = Route(school_id=user.school_id, name=body.name.strip(), vehicle_id=body.vehicle_id)
    db.add(r)
    db.flush()
    _save_stops(db, user, r, body.stops)
    audit(db, user, "transport.route.added", r.name)
    db.commit()
    return _route_out(db, r)


@router.put("/routes/{rid}")
def edit_route(rid: int, body: RouteIn, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    r = owned(db, Route, rid, user, "Route")
    _check_vehicle(db, user, body.vehicle_id)
    r.name, r.vehicle_id = body.name.strip(), body.vehicle_id
    _save_stops(db, user, r, body.stops)
    db.commit()
    return _route_out(db, r)


@router.delete("/routes/{rid}")
def archive_route(rid: int, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    r = owned(db, Route, rid, user, "Route")
    riders = db.scalar(select(func.count()).select_from(StudentTransport).where(StudentTransport.route_id == rid)) or 0
    if riders:
        raise HTTPException(409, f"{riders} student(s) use this route. Move them first.")
    r.is_active, r.archived_at, r.archived_by = False, utcnow(), user.id
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- students
@router.get("/students")
def riders(route_id: int | None = None, user: User = Depends(require_area("transport", "view")), db: Session = Depends(get_db)):
    q = select(StudentTransport, User).join(User, User.id == StudentTransport.student_id).where(StudentTransport.school_id == user.school_id, User.active.is_(True))
    if route_id:
        q = q.where(StudentTransport.route_id == route_id)
    _, classes, _ = name_maps(db, user.school_id)
    stops = {s.id: s.name for s in db.scalars(select(Stop).where(Stop.school_id == user.school_id))}
    return [{"student_id": u.id, "name": u.name, "class_name": classes.get(u.class_id), "route_id": st.route_id,
             "stop_id": st.stop_id, "stop_name": stops.get(st.stop_id)} for st, u in db.execute(q).all()]


@router.put("/students")
def assign(body: AssignIn, user: User = Depends(require_area("transport", "edit")), db: Session = Depends(get_db)):
    valid = set(db.scalars(select(User.id).where(User.id.in_(body.student_ids or [0]), User.school_id == user.school_id, User.role == Role.student)))
    if set(body.student_ids) - valid:
        raise HTTPException(400, "Some selected people are not students of this school")
    if body.route_id is None:
        db.execute(delete(StudentTransport).where(StudentTransport.student_id.in_(valid or {0})))
        db.commit()
        return {"ok": True, "removed": len(valid)}
    r = owned(db, Route, body.route_id, user, "Route")
    if body.stop_id is not None:
        s = db.get(Stop, body.stop_id)
        if not s or s.route_id != r.id or not s.is_active:
            raise HTTPException(400, "Stop is not on this route")
    for sid in valid:
        row = db.get(StudentTransport, sid)
        if row:
            row.route_id, row.stop_id = r.id, body.stop_id
        else:
            db.add(StudentTransport(student_id=sid, school_id=user.school_id, route_id=r.id, stop_id=body.stop_id))
    db.commit()
    return {"ok": True, "assigned": len(valid)}


# ---------------------------------------------------------------- student / parent view
@router.get("/me")
def my_bus(student_id: int | None = None, user: User = Depends(require(Role.student, Role.parent)), db: Session = Depends(get_db)):
    st = resolve_student(db, user, student_id)
    row = db.get(StudentTransport, st.id)
    if not row:
        return {"assigned": False}
    r = db.get(Route, row.route_id)
    if not r or not r.is_active:
        return {"assigned": False}
    stop = db.get(Stop, row.stop_id) if row.stop_id else None
    v = db.get(Vehicle, r.vehicle_id) if r.vehicle_id else None
    return {"assigned": True, "student_name": st.name, "route": r.name,
            "stop": stop.name if stop else None, "pickup_time": stop.pickup_time if stop else None, "drop_time": stop.drop_time if stop else None,
            "vehicle_number": v.number if v else None, "vehicle_kind": v.kind if v else None,
            "driver_name": v.driver_name if v else None, "driver_phone": v.driver_phone if v else None,
            "attendant_name": v.attendant_name if v else None, "attendant_phone": v.attendant_phone if v else None,
            "stops": [{"name": s.name, "pickup_time": s.pickup_time, "drop_time": s.drop_time, "mine": stop is not None and s.id == stop.id}
                      for s in _stops(db, r.id)]}


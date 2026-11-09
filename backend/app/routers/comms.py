"""Banners (F15) and consent forms & polls (F20)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import admin_only, audit, require_area, require_module, school_user
from ..db import get_db
from ..deps import children, class_students, get_school, name_maps, owned
from ..models import Banner, ParentLink, Poll, PollResponse, Role, SchoolClass, User, utcnow
from ..subscription import school_modules
from ..util import today

router = APIRouter(tags=["communication"])

AUDIENCE_ROLES = ("principal", "vice_principal", "coordinator", "teacher", "student", "parent")
COLORS = ("primary", "amber", "green", "red", "purple")


# ================================================================ banners
class BannerIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(default="", max_length=600)
    image_url: str = Field(default="", max_length=500)
    color: str = "primary"
    roles: list[str] = []
    class_ids: list[int] = []
    start_date: date | None = None
    end_date: date | None = None
    popup: bool = False
    sort: int = 0


def _banner_out(b: Banner) -> dict:
    return {"id": b.id, "school_id": b.school_id, "title": b.title, "text": b.text, "image_url": b.image_url, "color": b.color,
            "roles": b.roles or [], "class_ids": b.class_ids or [], "start_date": b.start_date, "end_date": b.end_date,
            "popup": b.popup, "sort": b.sort, "platform": b.school_id is None, "created_at": b.created_at}


def _clean_banner(body: BannerIn, allow_images: bool) -> dict:
    if body.end_date and body.start_date and body.end_date < body.start_date:
        raise HTTPException(400, "End date is before the start date")
    if body.image_url and not body.image_url.startswith("https://"):
        raise HTTPException(400, "Image link must start with https://")
    if body.image_url and not allow_images:
        raise HTTPException(403, "MODULE_NOT_ENABLED:communication")
    bad = set(body.roles) - set(AUDIENCE_ROLES)
    if bad:
        raise HTTPException(400, f"Unknown audience: {', '.join(bad)}")
    data = body.model_dump()
    data["color"] = body.color if body.color in COLORS else "primary"
    data["title"], data["text"], data["image_url"] = body.title.strip(), body.text.strip(), body.image_url.strip()
    return data


def _visible_to(b: Banner, user: User, class_ids: set[int]) -> bool:
    t = today()
    if (b.start_date and t < b.start_date) or (b.end_date and t > b.end_date):
        return False
    if b.roles and user.role.value not in b.roles:
        return False
    if b.class_ids and user.role in (Role.student, Role.parent) and not (set(b.class_ids) & class_ids):
        return False
    return True


@router.get("/banners/active")
def active_banners(user: User = Depends(school_user), db: Session = Depends(get_db)):
    if user.role == Role.student:
        cls = {user.class_id} if user.class_id else set()
    elif user.role == Role.parent:
        cls = {k.class_id for k in children(db, user) if k.class_id}
    else:
        cls = set()
    rows = db.scalars(select(Banner).where(or_(Banner.school_id == user.school_id, Banner.school_id.is_(None)),
                                           Banner.is_active.is_(True)).order_by(Banner.school_id.is_(None).desc(), Banner.sort, Banner.id.desc()))
    return [_banner_out(b) for b in rows if _visible_to(b, user, cls)]


@router.get("/banners")
def list_banners(user: User = Depends(require_area("notices", "view")), db: Session = Depends(get_db)):
    return [_banner_out(b) for b in db.scalars(select(Banner).where(Banner.school_id == user.school_id, Banner.is_active.is_(True)).order_by(Banner.sort, Banner.id.desc()))]


@router.post("/banners")
def create_banner(body: BannerIn, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    allow = "communication" in school_modules(db, get_school(db, user))
    b = Banner(school_id=user.school_id, created_by=user.id, **_clean_banner(body, allow))
    db.add(b)
    audit(db, user, "banner.created", b.title)
    db.commit()
    return _banner_out(b)


@router.put("/banners/{bid}")
def update_banner(bid: int, body: BannerIn, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    b = owned(db, Banner, bid, user, "Banner")
    allow = "communication" in school_modules(db, get_school(db, user))
    for k, v in _clean_banner(body, allow).items():
        setattr(b, k, v)
    db.commit()
    return _banner_out(b)


@router.delete("/banners/{bid}")
def archive_banner(bid: int, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    b = owned(db, Banner, bid, user, "Banner")
    b.is_active, b.archived_at, b.archived_by = False, utcnow(), user.id
    db.commit()
    return {"ok": True}


# -- platform-wide banners (Admin)
@router.get("/admin/banners")
def admin_banners(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_banner_out(b) for b in db.scalars(select(Banner).where(Banner.school_id.is_(None), Banner.is_active.is_(True)).order_by(Banner.sort, Banner.id.desc()))]


@router.post("/admin/banners")
def admin_create_banner(body: BannerIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    b = Banner(school_id=None, created_by=me.id, **_clean_banner(body, True))
    db.add(b)
    audit(db, me, "platform.banner.created", b.title, school_id=None)
    db.commit()
    return _banner_out(b)


@router.put("/admin/banners/{bid}")
def admin_update_banner(bid: int, body: BannerIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    b = db.get(Banner, bid)
    if not b or b.school_id is not None:
        raise HTTPException(404, "Banner not found")
    for k, v in _clean_banner(body, True).items():
        setattr(b, k, v)
    db.commit()
    return _banner_out(b)


@router.delete("/admin/banners/{bid}")
def admin_archive_banner(bid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    b = db.get(Banner, bid)
    if not b or b.school_id is not None:
        raise HTTPException(404, "Banner not found")
    b.is_active, b.archived_at = False, utcnow()
    db.commit()
    return {"ok": True}


# ================================================================ polls & consent forms
poll_router = APIRouter(prefix="/polls", tags=["polls"], dependencies=[Depends(require_module("communication"))])


class PollIn(BaseModel):
    kind: str = Field(pattern="^(consent|poll)$")
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    options: list[str] = []
    multi: bool = False
    audience: list[str] = ["parent"]
    class_ids: list[int] = []
    deadline: date | None = None
    amount: float | None = Field(default=None, ge=0)


class RespondIn(BaseModel):
    choices: list[int]
    comment: str = Field(default="", max_length=500)
    student_id: int | None = None


def _eligible(db: Session, p: Poll) -> list[tuple[int, int]]:
    """(user_id, student_id) pairs expected to answer. Consent for parents is per child."""
    pairs: list[tuple[int, int]] = []
    if p.class_ids:
        students = [s for c in p.class_ids for s in class_students(db, c)]
    else:
        students = list(db.scalars(select(User).where(User.school_id == p.school_id, User.role == Role.student, User.active.is_(True))))
    sids = {s.id for s in students}
    if "student" in p.audience:
        pairs += [(s.id, 0) for s in students]
    if "parent" in p.audience:
        links = list(db.scalars(select(ParentLink).where(ParentLink.student_id.in_(sids or {0}))))
        active_parents = set(db.scalars(select(User.id).where(User.id.in_({link.parent_id for link in links} or {0}), User.active.is_(True))))
        if p.kind == "consent":
            pairs += [(link.parent_id, link.student_id) for link in links if link.parent_id in active_parents]
        else:
            pairs += [(pid, 0) for pid in sorted(active_parents)]
    if "teacher" in p.audience:
        pairs += [(t, 0) for t in db.scalars(select(User.id).where(User.school_id == p.school_id, User.role == Role.teacher, User.active.is_(True)))]
    return pairs


def _poll_out(db: Session, p: Poll, user: User, names: dict | None = None) -> dict:
    names = names or name_maps(db, p.school_id)[0]
    mine = list(db.scalars(select(PollResponse).where(PollResponse.poll_id == p.id, PollResponse.user_id == user.id)))
    eligible = _eligible(db, p)
    my_pairs = [(u, s) for (u, s) in eligible if u == user.id]
    responses = list(db.scalars(select(PollResponse).where(PollResponse.poll_id == p.id)))
    counts = [0] * len(p.options)
    for r in responses:
        for c in r.choices or []:
            if 0 <= c < len(counts):
                counts[c] += 1
    open_ = not p.closed and (p.deadline is None or today() <= p.deadline)
    return {
        "id": p.id, "kind": p.kind, "title": p.title, "description": p.description, "options": p.options, "multi": p.multi,
        "audience": p.audience, "class_ids": p.class_ids, "deadline": p.deadline, "amount": p.amount, "closed": p.closed,
        "open": open_, "created_by_name": names.get(p.created_by, ""), "created_at": p.created_at,
        "eligible": len(eligible), "responded": len({(r.user_id, r.student_id) for r in responses}), "counts": counts,
        "my_targets": [{"student_id": s, "student_name": names.get(s) if s else None,
                        "response": next(({"choices": r.choices, "comment": r.comment, "at": r.at} for r in mine if r.student_id == s), None)}
                       for (_, s) in my_pairs],
    }


def _is_manager(user: User) -> bool:
    from ..perms import RANK, level_of
    return user.role == Role.principal or RANK[level_of(user, "notices")] >= RANK["view"]


@poll_router.get("")
def list_polls(user: User = Depends(school_user), db: Session = Depends(get_db)):
    q = select(Poll).where(Poll.school_id == user.school_id, Poll.is_active.is_(True)).order_by(Poll.created_at.desc()).limit(100)
    names = name_maps(db, user.school_id)[0]
    out = []
    for p in db.scalars(q):
        row = _poll_out(db, p, user, names)
        if _is_manager(user) or p.created_by == user.id or row["my_targets"]:
            row["can_manage"] = _is_manager(user) or p.created_by == user.id
            out.append(row)
    return out


@poll_router.post("")
def create_poll(body: PollIn, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    opts = ["Yes", "No"] if body.kind == "consent" else [o.strip() for o in body.options if o.strip()]
    if body.kind == "poll" and len(opts) < 2:
        raise HTTPException(400, "A poll needs at least 2 options")
    if len(opts) > 10:
        raise HTTPException(400, "At most 10 options")
    aud = [a for a in body.audience if a in ("parent", "teacher", "student")]
    if not aud:
        raise HTTPException(400, "Choose who should answer")
    for c in body.class_ids:
        owned(db, SchoolClass, c, user, "Class")
    p = Poll(school_id=user.school_id, kind=body.kind, title=body.title.strip(), description=body.description.strip(), options=opts,
             multi=body.multi and body.kind == "poll", audience=aud, class_ids=body.class_ids, deadline=body.deadline,
             amount=body.amount, created_by=user.id)
    db.add(p)
    audit(db, user, f"{body.kind}.created", p.title)
    db.commit()
    return _poll_out(db, p, user)


@poll_router.post("/{pid}/respond")
def respond(pid: int, body: RespondIn, user: User = Depends(school_user), db: Session = Depends(get_db)):
    p = owned(db, Poll, pid, user, "Poll")
    if p.closed or (p.deadline and today() > p.deadline):
        raise HTTPException(409, "This form is closed")
    sid = body.student_id or 0
    if (user.id, sid) not in set(_eligible(db, p)):
        raise HTTPException(403, "This form isn't for you" + (" (pick a child)" if user.role == Role.parent and p.kind == "consent" and not sid else ""))
    choices = sorted(set(body.choices))
    if not choices or any(c < 0 or c >= len(p.options) for c in choices) or (len(choices) > 1 and not p.multi):
        raise HTTPException(400, "Pick a valid option")
    r = db.scalar(select(PollResponse).where(PollResponse.poll_id == pid, PollResponse.user_id == user.id, PollResponse.student_id == sid))
    if r:
        r.choices, r.comment, r.at = choices, body.comment.strip(), utcnow()
    else:
        db.add(PollResponse(poll_id=pid, user_id=user.id, student_id=sid, choices=choices, comment=body.comment.strip()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Already answered")
    return _poll_out(db, p, user)


@poll_router.get("/{pid}/results")
def results(pid: int, user: User = Depends(school_user), db: Session = Depends(get_db)):
    p = owned(db, Poll, pid, user, "Poll")
    if not (_is_manager(user) or p.created_by == user.id):
        raise HTTPException(403, "Only the creator and managers can see results")
    names, classes, _ = name_maps(db, user.school_id)
    stu_class = dict(db.execute(select(User.id, User.class_id).where(User.school_id == user.school_id, User.role == Role.student)).all())
    responses = {(r.user_id, r.student_id): r for r in db.scalars(select(PollResponse).where(PollResponse.poll_id == pid))}

    def who(u: int, s: int) -> dict:
        cid = stu_class.get(s or u)
        return {"user_id": u, "name": names.get(u, ""), "student_id": s or None, "student_name": names.get(s) if s else None,
                "class_name": classes.get(cid) if cid else None}

    answered, pending = [], []
    for (u, s) in _eligible(db, p):
        r = responses.get((u, s))
        if r:
            answered.append({**who(u, s), "choices": r.choices, "answer": ", ".join(p.options[c] for c in r.choices if c < len(p.options)),
                             "comment": r.comment, "at": r.at})
        else:
            pending.append(who(u, s))
    return {**_poll_out(db, p, user, names), "answered": answered, "pending": pending}


@poll_router.post("/{pid}/close")
def close_poll(pid: int, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    p = owned(db, Poll, pid, user, "Poll")
    p.closed = True
    db.commit()
    return _poll_out(db, p, user)


@poll_router.delete("/{pid}")
def archive_poll(pid: int, user: User = Depends(require_area("notices", "edit")), db: Session = Depends(get_db)):
    p = owned(db, Poll, pid, user, "Poll")
    p.is_active, p.archived_at, p.archived_by = False, utcnow(), user.id
    db.commit()
    return {"ok": True}

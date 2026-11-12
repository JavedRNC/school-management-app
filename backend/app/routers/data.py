"""F30/F31 · Excel template, full backup download, import & restore (principal; admin with time-boxed support access).

Handlers are plain `def` so FastAPI runs them in its thread pool: a long import never blocks other requests.
"""
import hashlib
import os
import threading
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import LOCK_MINUTES, MAX_FAILED, admin_only, audit, require, verify_password
from ..databook import export_workbook
from ..dataimport import run_import
from ..db import get_db
from ..deps import get_school
from ..models import DataSnapshot, Role, School, User, utcnow

router = APIRouter(tags=["data"])
MAX_BYTES = 20 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
principal_only = require(Role.principal)

_imports = threading.BoundedSemaphore(1)  # one import at a time on this small (512 MB) server…
_school_locks: dict[int, threading.Lock] = {}   # …and one per school
_locks_guard = threading.Lock()
KEEP_SNAPSHOTS = 3
SNAPSHOT_DAYS = 30
_last_export: dict[int, float] = {}      # school id → time of last backup download
EXPORT_GAP = 20                          # seconds


def _file(content: bytes, school: School, kind: str) -> Response:
    name = f"Prangan-{'Backup' if kind == 'backup' else 'Template'}-{school.code}-{date.today().isoformat()}.xlsx"
    return Response(content, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{name}"',
                                                        "Cache-Control": "no-store"})


def _throttle(school: School) -> None:
    now = time.monotonic()
    if now - _last_export.get(school.id, -1e9) < EXPORT_GAP:
        raise HTTPException(429, "A backup was just made — please wait a few seconds and try again")
    _last_export[school.id] = now


def _read(file: UploadFile) -> bytes:
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is bigger than 20 MB")
    if not data.startswith(b"PK"):
        raise HTTPException(400, "That file isn't an Excel (.xlsx) workbook")
    return data


def _do_import(db: Session, school: School, me: User, data: bytes, mode: str, confirm: bool, confirm_code: str,
               password: str) -> dict:
    if confirm and mode == "replace":
        if confirm_code.strip().upper() != school.code.upper():
            raise HTTPException(400, f"Type the school code ({school.code}) to confirm Replace")
        _check_password(db, me, password, school)
    with _locks_guard:
        lock = _school_locks.setdefault(school.id, threading.Lock())
    if not lock.acquire(blocking=False):
        raise HTTPException(429, "An import for this school is already running — wait for it to finish")
    if not _imports.acquire(blocking=False):
        lock.release()
        raise HTTPException(429, "The server is busy with another school's import — try again in a minute")
    try:
        snapshot = None
        if confirm and mode == "replace":
            snapshot = export_workbook(db, school, "backup")      # undo point, saved together with the import
        report, creds = run_import(db, school, me, data, mode, confirm)
        if not report["ok"] or not confirm:
            db.rollback()
            report["saved"] = False
            return report
        db.execute(delete(DataSnapshot).where(DataSnapshot.created_at < utcnow() - timedelta(days=SNAPSHOT_DAYS)))
        if snapshot is not None:
            db.add(DataSnapshot(school_id=school.id, content=snapshot, created_by=me.name))
            db.flush()
            keep = list(db.scalars(select(DataSnapshot.id).where(DataSnapshot.school_id == school.id)
                                   .order_by(DataSnapshot.created_at.desc(), DataSnapshot.id.desc()).limit(KEEP_SNAPSHOTS)))
            db.execute(delete(DataSnapshot).where(DataSnapshot.school_id == school.id, DataSnapshot.id.not_in(keep)))
        added = sum(s["add"] for s in report["sheets"])
        updated = sum(s["update"] for s in report["sheets"])
        audit(db, me, f"data.import.{mode}",
              f"{report['kind']} file sha256 {hashlib.sha256(data).hexdigest()[:16]} · {'verified' if report['verified'] else 'not verified'} · "
              f"{added} added, {updated} updated, {len(creds)} new logins" + (", passwords kept" if report["passwords_kept"] else "")
              + (" · previous data saved as undo backup" if snapshot is not None else ""), school_id=school.id)
        db.commit()
        report["saved"] = True
        report["credentials"] = creds
        report["undo_saved"] = snapshot is not None
        return report
    except Exception:
        db.rollback()
        raise
    finally:
        _imports.release()
        lock.release()


def _check_password(db: Session, me: User, password: str, school: School) -> None:
    """Replace needs the caller's own password — throttled and audited like a sign-in."""
    if me.locked_until and me.locked_until > utcnow():
        raise HTTPException(429, "Too many wrong passwords — try again later")
    if password and verify_password(password, me.password_hash):
        me.failed_logins = 0
        return
    me.failed_logins = (me.failed_logins or 0) + 1
    if me.failed_logins >= MAX_FAILED:
        me.locked_until = utcnow() + timedelta(minutes=LOCK_MINUTES)
        me.failed_logins = 0
    audit(db, me, "data.replace.wrong_password", "", school_id=school.id)
    db.commit()
    raise HTTPException(400, "Enter your own password to confirm Replace")


def _latest_snapshot(db: Session, school_id: int) -> DataSnapshot | None:
    db.execute(delete(DataSnapshot).where(DataSnapshot.school_id == school_id,
                                          DataSnapshot.created_at < utcnow() - timedelta(days=SNAPSHOT_DAYS)))
    db.commit()
    return db.scalar(select(DataSnapshot).where(DataSnapshot.school_id == school_id)
                     .order_by(DataSnapshot.created_at.desc(), DataSnapshot.id.desc()).limit(1))


def _snapshot_file(db: Session, school: School) -> Response:
    snap = _latest_snapshot(db, school.id)
    if not snap:  # noqa: SIM108
        raise HTTPException(404, "No undo backup yet — one is saved automatically before every Replace import")
    name = f"Prangan-Before-Replace-{school.code}-{snap.created_at:%Y-%m-%d-%H%M}.xlsx"
    return Response(snap.content, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{name}"',
                                                             "Cache-Control": "no-store"})


# ---------------------------------------------------------------- principal
@router.get("/data/template")
def template(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    content = export_workbook(db, school, "template")
    audit(db, me, "data.template.downloaded", "setup data incl. people's contact details")
    db.commit()
    return _file(content, school, "template")


@router.get("/data/backup")
def backup(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    _throttle(school)
    content = export_workbook(db, school, "backup")
    audit(db, me, "data.backup.downloaded", f"{len(content) // 1024} KB")
    db.commit()
    return _file(content, school, "backup")


@router.get("/data/snapshot")
def snapshot_info(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    snap = _latest_snapshot(db, me.school_id)
    return {"exists": bool(snap), "created_at": snap.created_at if snap else None, "created_by": snap.created_by if snap else "",
            "keep": f"last {KEEP_SNAPSHOTS}, for {SNAPSHOT_DAYS} days"}


@router.get("/data/snapshot/file")
def snapshot_file(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    audit(db, me, "data.undo_backup.downloaded", "")
    db.commit()
    return _snapshot_file(db, school)


@router.post("/data/import")
def import_file(file: UploadFile = File(...), mode: str = Form("merge"), confirm: bool = Form(False),
                confirm_code: str = Form(""), password: str = Form(""),
                me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    if os.getenv("APP_ENV", "prod") == "prod" and os.getenv("ALLOW_DEMO_IMPORT") != "1" and school.code.upper().startswith("DEMO"):
        # the demo school's sign-in is public: it must not be able to load the live server with uploads
        raise HTTPException(403, "Import is switched off for the public demo school. Try it in your own school.")
    data = _read(file)
    return _do_import(db, school, me, data, mode, confirm, confirm_code, password)


# ---------------------------------------------------------------- admin (only during the school's time-boxed support access)
def _admin_school(db: Session, sid: int) -> School:
    s = db.get(School, sid)
    if not s:
        raise HTTPException(404, "School not found")
    if not (s.support_access_until and s.support_access_until > utcnow()):
        raise HTTPException(403, "This school hasn't given support access. Ask the principal to allow it for 24 hours in Privacy settings.")
    return s


@router.get("/admin/schools/{sid}/data/template")
def admin_template(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    content = export_workbook(db, s, "template")
    audit(db, me, "data.template.downloaded", "by platform admin", school_id=s.id)
    db.commit()
    return _file(content, s, "template")


@router.get("/admin/schools/{sid}/data/backup")
def admin_backup(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    _throttle(s)
    content = export_workbook(db, s, "backup", with_vault=False)     # never passwords/permissions for the admin
    audit(db, me, "data.backup.downloaded", f"by platform admin · {len(content) // 1024} KB (no passwords)", school_id=s.id)
    db.commit()
    return _file(content, s, "backup")


@router.get("/admin/schools/{sid}/data/snapshot/file")
def admin_snapshot_file(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    audit(db, me, "data.undo_backup.downloaded", "by platform admin", school_id=s.id)
    db.commit()
    return _snapshot_file(db, s)


@router.post("/admin/schools/{sid}/data/import")
def admin_import(sid: int, file: UploadFile = File(...), mode: str = Form("merge"), confirm: bool = Form(False),
                 confirm_code: str = Form(""), password: str = Form(""),
                 me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    data = _read(file)
    return _do_import(db, s, me, data, mode, confirm, confirm_code, password)

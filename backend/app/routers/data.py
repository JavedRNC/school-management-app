"""F30/F31 · Excel template, full backup download, import & restore (principal; admin with time-boxed support access).

Handlers are plain `def` so FastAPI runs them in its thread pool: a long import never blocks other requests.
"""
import hashlib
import threading
import time
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import admin_only, audit, require, verify_password
from ..databook import export_workbook
from ..dataimport import run_import
from ..db import get_db
from ..deps import get_school
from ..models import DataSnapshot, Role, School, User, utcnow

router = APIRouter(tags=["data"])
MAX_BYTES = 20 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
principal_only = require(Role.principal)

_import_lock = threading.Lock()          # one import at a time on this (small) server
_last_export: dict[int, float] = {}      # school id → time of last backup download
EXPORT_GAP = 20                          # seconds


def _file(content: bytes, school: School, kind: str) -> Response:
    name = f"SchoolHub-{'Backup' if kind == 'backup' else 'Template'}-{school.code}-{date.today().isoformat()}.xlsx"
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
        if not password or not verify_password(password, me.password_hash):
            raise HTTPException(400, "Enter your own password to confirm Replace")
    if not _import_lock.acquire(blocking=False):
        raise HTTPException(429, "Another import is running right now — try again in a minute")
    try:
        snapshot = None
        if confirm and mode == "replace":
            snapshot = export_workbook(db, school, "backup")      # undo point, saved together with the import
        report, creds = run_import(db, school, me, data, mode, confirm)
        if not report["ok"] or not confirm:
            db.rollback()
            report["saved"] = False
            return report
        if snapshot is not None:
            snap = db.get(DataSnapshot, school.id)
            if snap:
                snap.content, snap.created_at, snap.created_by = snapshot, utcnow(), me.name
            else:
                db.add(DataSnapshot(school_id=school.id, content=snapshot, created_by=me.name))
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
        _import_lock.release()


def _snapshot_file(db: Session, school: School) -> Response:
    snap = db.get(DataSnapshot, school.id)
    if not snap:
        raise HTTPException(404, "No undo backup yet — one is saved automatically before every Replace import")
    name = f"SchoolHub-Before-Replace-{school.code}-{snap.created_at:%Y-%m-%d-%H%M}.xlsx"
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
    snap = db.get(DataSnapshot, me.school_id)
    return {"exists": bool(snap), "created_at": snap.created_at if snap else None, "created_by": snap.created_by if snap else ""}


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
    data = _read(file)
    return _do_import(db, get_school(db, me), me, data, mode, confirm, confirm_code, password)


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

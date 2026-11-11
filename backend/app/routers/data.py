"""F30/F31 · Excel template, full backup download, import & restore (principal; admin with support access)."""
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import admin_only, audit, require
from ..databook import export_workbook
from ..dataimport import run_import
from ..db import get_db
from ..deps import get_school
from ..models import Role, School, User
from .admin import full_access

router = APIRouter(tags=["data"])
MAX_BYTES = 20 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
principal_only = require(Role.principal)


def _file(content: bytes, school: School, kind: str) -> Response:
    name = f"SchoolHub-{'Backup' if kind == 'backup' else 'Template'}-{school.code}-{date.today().isoformat()}.xlsx"
    return Response(content, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{name}"',
                                                        "Cache-Control": "no-store"})


async def _read(file: UploadFile) -> bytes:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is bigger than 20 MB")
    if not data.startswith(b"PK"):
        raise HTTPException(400, "That file isn't an Excel (.xlsx) workbook")
    return data


def _do_import(db: Session, school: School, me: User, data: bytes, mode: str, confirm: bool, confirm_code: str) -> dict:
    if confirm and mode == "replace" and confirm_code.strip().upper() != school.code.upper():
        raise HTTPException(400, f"Type the school code ({school.code}) to confirm Replace")
    try:
        report, creds = run_import(db, school, me, data, mode)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    if not report["ok"] or not confirm:
        db.rollback()
        report["saved"] = False
        return report
    added = sum(s["add"] for s in report["sheets"])
    updated = sum(s["update"] for s in report["sheets"])
    audit(db, me, f"data.import.{mode}", f"{report['kind']} file: {added} added, {updated} updated, {len(creds)} new logins"
          + (", passwords kept from backup" if report["passwords_kept"] else ""), school_id=school.id)
    db.commit()
    report["saved"] = True
    report["credentials"] = creds
    return report


# ---------------------------------------------------------------- principal
@router.get("/data/template")
def template(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    return _file(export_workbook(db, school, "template"), school, "template")


@router.get("/data/backup")
def backup(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    school = get_school(db, me)
    content = export_workbook(db, school, "backup")
    audit(db, me, "data.backup.downloaded", f"{len(content) // 1024} KB")
    db.commit()
    return _file(content, school, "backup")


@router.post("/data/import")
async def import_file(file: UploadFile = File(...), mode: str = Form("merge"), confirm: bool = Form(False),
                      confirm_code: str = Form(""), me: User = Depends(principal_only), db: Session = Depends(get_db)):
    data = await _read(file)
    return _do_import(db, get_school(db, me), me, data, mode, confirm, confirm_code)


# ---------------------------------------------------------------- admin (only while the school allows support access)
def _admin_school(db: Session, sid: int) -> School:
    s = db.get(School, sid)
    if not s:
        raise HTTPException(404, "School not found")
    if not full_access(s):
        raise HTTPException(403, "This school hasn't given support access. Ask the principal to allow it in Privacy settings.")
    return s


@router.get("/admin/schools/{sid}/data/template")
def admin_template(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    return _file(export_workbook(db, s, "template"), s, "template")


@router.get("/admin/schools/{sid}/data/backup")
def admin_backup(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    content = export_workbook(db, s, "backup")
    audit(db, me, "data.backup.downloaded", f"by platform admin · {len(content) // 1024} KB", school_id=s.id)
    db.commit()
    return _file(content, s, "backup")


@router.post("/admin/schools/{sid}/data/import")
async def admin_import(sid: int, file: UploadFile = File(...), mode: str = Form("merge"), confirm: bool = Form(False),
                       confirm_code: str = Form(""), me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _admin_school(db, sid)
    data = await _read(file)
    return _do_import(db, s, me, data, mode, confirm, confirm_code)

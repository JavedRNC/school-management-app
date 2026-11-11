"""F16 · Tell phones about new app builds: optional ("Later") or forced (below the minimum build)."""
import json
import logging
import os
import re
import time
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import admin_only, audit
from ..db import get_db
from ..models import AppVersion, User, utcnow

router = APIRouter(tags=["app"])
REPO = os.getenv("GITHUB_REPO", "JavedRNC/school-management-app")
DEFAULT_URL = f"https://github.com/{REPO}/releases/download/latest-apk/SchoolHub.apk"
_cache: dict = {"at": 0.0, "build": None, "notes": ""}
CACHE_SECONDS = 600


def github_latest() -> tuple[int | None, str]:
    """Newest build number from the 'latest-apk' release body ("Build 12 from commit …"), cached 10 minutes."""
    now = time.monotonic()
    if now - _cache["at"] < CACHE_SECONDS:
        return _cache["build"], _cache["notes"]
    _cache["at"] = now
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/releases/tags/latest-apk",
                                     headers={"Accept": "application/vnd.github+json", "User-Agent": "school-hub-api"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read(200_000))
        m = re.search(r"Build (\d+)", data.get("body") or "")
        _cache["build"] = int(m.group(1)) if m else None
    except Exception as e:  # noqa: BLE001 — GitHub down/rate-limited: fall back to the admin's number
        logging.getLogger("appversion").warning("GitHub release check failed: %s", e)
    return _cache["build"], _cache["notes"]


def get_row(db: Session) -> AppVersion:
    row = db.get(AppVersion, 1)
    if not row:
        row = AppVersion(id=1, auto_latest=True, latest_build=0, min_build=0, message="", url="")
        db.add(row)
        db.commit()
    return row


def effective(db: Session) -> dict:
    row = get_row(db)
    latest = row.latest_build
    source = "admin"
    if row.auto_latest:
        gh, _ = github_latest()
        if gh:
            latest, source = max(gh, row.latest_build), "github"
    return {"latest_build": latest, "min_build": min(row.min_build, latest) if latest else row.min_build,
            "message": row.message, "url": row.url or DEFAULT_URL, "source": source}


@router.get("/app/version")
def app_version(db: Session = Depends(get_db)):
    """Public: the app calls this on start. No personal data."""
    return effective(db)


class VersionIn(BaseModel):
    auto_latest: bool = True
    latest_build: int = Field(default=0, ge=0, le=1_000_000)
    min_build: int = Field(default=0, ge=0, le=1_000_000)
    message: str = Field(default="", max_length=500)
    url: str = Field(default="", max_length=500)


@router.get("/admin/app-version")
def admin_get(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    row = get_row(db)
    gh, _ = github_latest()
    return {"auto_latest": row.auto_latest, "latest_build": row.latest_build, "min_build": row.min_build, "message": row.message,
            "url": row.url, "default_url": DEFAULT_URL, "github_build": gh, "effective": effective(db),
            "updated_at": row.updated_at, "updated_by": row.updated_by}


@router.put("/admin/app-version")
def admin_set(body: VersionIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    url = body.url.strip()
    if url and not url.startswith("https://"):
        raise HTTPException(400, "The download link must start with https://")
    row = get_row(db)
    gh, _ = github_latest()
    newest = max(body.latest_build, gh or 0) if body.auto_latest else body.latest_build
    if body.min_build > newest:
        raise HTTPException(400, f"Minimum build can't be above the newest build ({newest})")
    row.auto_latest, row.latest_build, row.min_build = body.auto_latest, body.latest_build, body.min_build
    row.message, row.url, row.updated_at, row.updated_by = body.message.strip(), url, utcnow(), me.name
    audit(db, me, "app.version.updated", f"latest {'auto' if body.auto_latest else body.latest_build}, minimum {body.min_build}")
    db.commit()
    return admin_get(me, db)

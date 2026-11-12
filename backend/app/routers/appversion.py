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
from ..models import AppVersion, Meta, User, utcnow

router = APIRouter(tags=["app"])
REPO = os.getenv("GITHUB_REPO", "JavedRNC/school-management-app")
# PROD reads the "latest-apk" release; the DEV server sets APK_RELEASE_TAG=dev-apk and APK_FILE=PranganDev.apk.
TAG = os.getenv("APK_RELEASE_TAG", "latest-apk")
DEFAULT_URL = f"https://github.com/{REPO}/releases/download/{TAG}/{os.getenv('APK_FILE', 'Prangan.apk')}"
_cache: dict = {"at": 0.0, "build": None, "notes": ""}
CACHE_SECONDS = 120   # GitHub allows ~60 unauthenticated calls/hour; this uses 30 at most


BUILD_FILE = f"https://github.com/{REPO}/releases/download/{TAG}/build.json"
API_URL = f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}"


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json, application/json", "User-Agent": "prangan-api"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return r.read(200_000)


def _from_build_file() -> int | None:
    """build.json is uploaded next to the APK. A plain download: not subject to GitHub's API rate limit,
    which shared hosting IPs (Render) often hit."""
    n = json.loads(_fetch(BUILD_FILE)).get("build")
    return int(n) if n else None


def _from_api() -> int | None:
    m = re.search(r"Build (\d+)", json.loads(_fetch(API_URL)).get("body") or "")
    return int(m.group(1)) if m else None


def github_latest() -> tuple[int | None, str]:
    """Newest published build number, cached 2 minutes. A failed lookup keeps the last known number."""
    now = time.monotonic()
    if now - _cache["at"] < CACHE_SECONDS:
        return _cache["build"], _cache["notes"]
    _cache["at"] = now
    for source in (_from_build_file, _from_api):
        try:
            n = source()
            if n:
                _cache["build"] = max(n, _cache["build"] or 0)
                break
        except Exception as e:  # noqa: BLE001 — GitHub down/rate-limited: try the next source, then the admin's number
            logging.getLogger("appversion").warning("Build lookup via %s failed: %s", source.__name__, e)
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
        seen = db.get(Meta, "seen_build")        # survives restarts and GitHub outages
        seen_n = int(seen.value) if seen and seen.value.isdigit() else 0
        if gh and gh > seen_n:
            if seen:
                seen.value = str(gh)
            else:
                db.add(Meta(key="seen_build", value=str(gh)))
            db.commit()
        gh = max(gh or 0, seen_n)
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

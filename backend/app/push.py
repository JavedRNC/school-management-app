"""Push notifications through Firebase Cloud Messaging (HTTP v1), with no extra dependency.

Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON as text) in the environment; without it every send is a
quiet no-op, so the rest of the app never depends on push being set up."""
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt
from sqlalchemy import delete, select

log = logging.getLogger("push")
_token: dict = {"value": None, "exp": 0.0}
_lock = threading.Lock()
SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


def _account() -> dict | None:
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw:
        return None
    try:
        acc = json.loads(raw)
        return acc if acc.get("private_key") and acc.get("client_email") and acc.get("project_id") else None
    except ValueError:
        log.warning("FIREBASE_SERVICE_ACCOUNT is not valid JSON — push is off")
        return None


def configured() -> bool:
    return _account() is not None


def _access_token(acc: dict) -> str:
    with _lock:
        if _token["value"] and time.time() < _token["exp"] - 60:
            return _token["value"]
        now = int(time.time())
        assertion = jwt.encode({"iss": acc["client_email"], "scope": SCOPE, "aud": "https://oauth2.googleapis.com/token",
                                "iat": now, "exp": now + 3600}, acc["private_key"], algorithm="RS256")
        body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode()
        with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), timeout=8) as r:
            data = json.loads(r.read(20_000))
        _token["value"], _token["exp"] = data["access_token"], time.time() + int(data.get("expires_in", 3600))
        return _token["value"]


def _send_one(acc: dict, access: str, token: str, title: str, body: str, data: dict) -> str:
    """'ok' | 'gone' (token no longer valid) | 'error'."""
    msg = {"message": {"token": token, "notification": {"title": title[:120], "body": body[:400]},
                       "data": {k: str(v)[:200] for k, v in data.items()},
                       "android": {"priority": "HIGH", "notification": {"channel_id": "default"}}}}
    req = urllib.request.Request(f"https://fcm.googleapis.com/v1/projects/{acc['project_id']}/messages:send",
                                 data=json.dumps(msg).encode(),
                                 headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8):
            return "ok"
    except urllib.error.HTTPError as e:
        return "gone" if e.code in (404, 410) or (e.code == 400 and b"registration" in e.read(2000).lower()) else "error"
    except Exception:  # noqa: BLE001
        return "error"


def _deliver(user_ids: list[int], title: str, body: str, data: dict) -> None:
    from .db import SessionLocal
    from .models import PushToken

    acc = _account()
    if not acc or not user_ids:
        return
    try:
        with SessionLocal() as db:
            tokens = list(db.scalars(select(PushToken.token).where(PushToken.user_id.in_(user_ids)).limit(500)))
            if not tokens:
                return
            access = _access_token(acc)
            gone = [t for t in tokens if _send_one(acc, access, t, title, body, data) == "gone"]
            if gone:
                db.execute(delete(PushToken).where(PushToken.token.in_(gone)))
                db.commit()
    except Exception:  # noqa: BLE001 — a notification must never break the request that caused it
        log.exception("push delivery failed")


def notify(user_ids: list[int], title: str, body: str, data: dict | None = None) -> None:
    """Send in the background; returns at once."""
    if not user_ids or not configured():
        return
    threading.Thread(target=_deliver, args=(list(user_ids), title, body, data or {}), daemon=True).start()

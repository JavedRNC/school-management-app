import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .migrate import migrate
from .routers import (academics, admin, appversion, auth, bell, comms, dashboard, data, fees, leaves, onboarding, portal, public,
                      school, settings, staff_attendance, transport)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    migrate()
    from .auth import ensure_secret
    from .db import SessionLocal
    from .seed import ensure_platform, seed_demo_if_empty

    with SessionLocal() as db:
        ensure_secret(db)
        from datetime import timedelta

        from sqlalchemy import delete

        from .models import DataSnapshot, utcnow
        db.execute(delete(DataSnapshot).where(DataSnapshot.created_at < utcnow() - timedelta(days=30)))   # undo copies expire
        db.commit()

    ensure_platform()  # plans + super admin account
    if os.getenv("SEED_DEMO", "1") == "1":
        # demo data must never stop the server from starting
        from . import seed

        for fn in (seed.seed_demo_if_empty, seed.seed_phase2_demo, seed.seed_fees_demo, seed.seed_bell_demo, seed.seed_showcase_demo):
            try:
                fn()
            except Exception:  # noqa: BLE001
                logging.getLogger("seed").exception("%s failed — skipped", fn.__name__)
    yield


APP_ENV = os.getenv("APP_ENV", "prod")
# The interactive API reference is for DEV and TEST; the live API does not publish its own map.
_docs = APP_ENV != "prod" or os.getenv("API_DOCS") == "1"
app = FastAPI(title="Prangan API", version="0.6.0", lifespan=lifespan, docs_url="/docs" if _docs else None,
              redoc_url=None, openapi_url="/openapi.json" if _docs else None)

# Which websites may call this API from a browser (the Android app is not a browser and is unaffected).
# Each environment allows only ITS OWN portal site, plus the public Prangan website; localhost only outside PROD.
# If Render gives a portal site a different address, list it in CORS_ORIGINS (comma separated) on that API service.
_portal = {"prod": "https://prangan-portal.onrender.com", "test": "https://prangan-portal-test.onrender.com",
           "dev": "https://prangan-portal-dev.onrender.com"}.get(APP_ENV, "")
_origins = [o for o in [_portal, "https://javedrnc.github.io"] if o]
_origins += [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip().startswith("https://") or APP_ENV != "prod" and o.strip()]
_origin_re = r"http://(localhost|127\.0\.0\.1)(:\d+)?" if APP_ENV != "prod" else None



PUBLIC_CACHEABLE = {"/", "/app/version", "/public/schools"}
MAX_JSON_BODY = 1024 * 1024              # 1 MB is far above any real form or list this API accepts
MAX_UPLOAD_BODY = 21 * 1024 * 1024       # the two Excel import routes (their own check is 20 MB)


class BodyLimit:
    """Refuse oversized request bodies BEFORE they are read into memory or onto disk — this runs ahead of sign-in,
    so an anonymous caller can't exhaust the small server with one huge request."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.inner(scope, receive, send)
        limit = MAX_UPLOAD_BODY if scope["path"].endswith("/data/import") else MAX_JSON_BODY
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length", b"")
        too_big = JSONResponse({"detail": "That request is too large."}, status_code=413)
        if declared.isdigit() and int(declared) > limit:
            return await too_big(scope, receive, send)
        seen = 0

        async def limited():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body") or b"")
                if seen > limit:
                    raise _TooLarge
            return msg

        try:
            await self.inner(scope, limited, send)
        except _TooLarge:
            await too_big(scope, receive, send)


class _TooLarge(Exception):
    pass


app.add_middleware(BodyLimit)
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_origin_regex=_origin_re, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Content-Disposition"], max_age=600)




@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc: RequestValidationError):
    """Say which field is wrong and why, without echoing back what was sent (it may hold a password or a huge body)."""
    return JSONResponse({"detail": [{"loc": list(e.get("loc", ())), "msg": str(e.get("msg", "Invalid value")), "type": e.get("type", "")}
                                    for e in exc.errors()[:20]]}, status_code=422)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path not in PUBLIC_CACHEABLE:          # everything else may hold personal data
        response.headers.setdefault("Cache-Control", "no-store")
    return response


for r in (auth.router, school.router, academics.router, dashboard.router, settings.router, admin.router,
          leaves.router, comms.router, comms.poll_router, staff_attendance.router, transport.router, fees.router, bell.router, data.router, appversion.router, public.router, onboarding.router, portal.router):
    app.include_router(r)


@app.get("/")
def health():
    return {"ok": True, "app": "prangan-api", "version": app.version, "env": os.getenv("APP_ENV", "prod")}

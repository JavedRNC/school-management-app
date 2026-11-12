import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


app = FastAPI(title="Prangan API", version="0.6.0", lifespan=lifespan)

APP_ENV = os.getenv("APP_ENV", "prod")
# Which websites may call this API from a browser (the Android app is not a browser and is unaffected).
# Each environment allows only ITS OWN portal site, plus the public Prangan website; localhost only outside PROD.
# If Render gives a portal site a different address, list it in CORS_ORIGINS (comma separated) on that API service.
_portal = {"prod": "https://prangan-portal.onrender.com", "test": "https://prangan-portal-test.onrender.com",
           "dev": "https://prangan-portal-dev.onrender.com"}.get(APP_ENV, "")
_origins = [o for o in [_portal, "https://javedrnc.github.io"] if o]
_origins += [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip().startswith("https://") or APP_ENV != "prod" and o.strip()]
_origin_re = r"http://(localhost|127\.0\.0\.1)(:\d+)?" if APP_ENV != "prod" else None
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_origin_regex=_origin_re, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["Content-Disposition"], max_age=600)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith(("/auth", "/admin", "/data", "/school", "/fees")):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


for r in (auth.router, school.router, academics.router, dashboard.router, settings.router, admin.router,
          leaves.router, comms.router, comms.poll_router, staff_attendance.router, transport.router, fees.router, bell.router, data.router, appversion.router, public.router, onboarding.router, portal.router):
    app.include_router(r)


@app.get("/")
def health():
    return {"ok": True, "app": "prangan-api", "version": app.version, "env": os.getenv("APP_ENV", "prod")}

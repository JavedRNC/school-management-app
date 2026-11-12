import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrate import migrate
from .routers import academics, admin, appversion, auth, public, comms, bell, dashboard, data, fees, leaves, school, settings, staff_attendance, transport


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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, school.router, academics.router, dashboard.router, settings.router, admin.router,
          leaves.router, comms.router, comms.poll_router, staff_attendance.router, transport.router, fees.router, bell.router, data.router, appversion.router, public.router):
    app.include_router(r)


@app.get("/")
def health():
    return {"ok": True, "app": "prangan-api", "version": app.version}

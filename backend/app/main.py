import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrate import migrate
from .routers import academics, admin, auth, dashboard, school, settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    migrate()
    from .seed import ensure_platform, seed_demo_if_empty

    ensure_platform()  # plans + super admin account
    if os.getenv("SEED_DEMO", "1") == "1":
        seed_demo_if_empty()
    yield


app = FastAPI(title="School Hub API", version="0.3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, school.router, academics.router, dashboard.router, settings.router, admin.router):
    app.include_router(r)


@app.get("/")
def health():
    return {"ok": True, "app": "school-hub-api", "version": app.version}

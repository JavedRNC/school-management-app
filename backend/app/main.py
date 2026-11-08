import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routers import academics, auth, dashboard, school


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    # Fill demo data on an empty DB (set SEED_DEMO=0 to disable)
    if os.getenv("SEED_DEMO", "1") == "1":
        from .seed import seed_if_empty

        seed_if_empty()
    yield


app = FastAPI(title="School Management API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, school.router, academics.router, dashboard.router):
    app.include_router(r)


@app.get("/")
def health():
    return {"ok": True, "app": "school-management-api"}

"""F16 · app update prompt settings."""
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.routers.appversion as av  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    av.github_latest = lambda: (7, "")          # pretend GitHub's newest build is 7
    with TestClient(app) as client:
        yield client


def admin(c):
    from sqlalchemy import select

    from app.auth import hash_password
    from app.db import SessionLocal
    from app.models import Role, User
    with SessionLocal() as db:
        a = db.scalar(select(User).where(User.role == Role.admin))
        a.password_hash, a.must_change_password = hash_password("Admin#2026"), False
        db.commit()
    r = c.post("/auth/login", json={"school_code": "ADMIN", "login_id": "admin", "password": "Admin#2026"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_public_version_and_admin_settings(c):
    v = c.get("/app/version").json()                       # no login needed
    assert v["latest_build"] == 7 and v["min_build"] == 0 and v["url"].endswith("Prangan.apk") and v["source"] == "github"
    h = admin(c)
    assert c.put("/admin/app-version", json={"min_build": 9}, headers=h).status_code == 400     # above newest
    r = c.put("/admin/app-version", json={"min_build": 5, "message": "Fees screen fix"}, headers=h).json()
    assert r["effective"]["min_build"] == 5
    v = c.get("/app/version").json()
    assert v["min_build"] == 5 and v["message"] == "Fees screen fix"
    r = c.put("/admin/app-version", json={"auto_latest": False, "latest_build": 6, "min_build": 6, "url": "https://example.com/a.apk"}, headers=h)
    assert c.get("/app/version").json() == {"latest_build": 6, "min_build": 6, "message": "", "url": "https://example.com/a.apk", "source": "admin"}
    assert c.put("/admin/app-version", json={"url": "http://x"}, headers=h).status_code == 400
    p = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "principal", "password": "demo123"}).json()["token"]
    assert c.put("/admin/app-version", json={}, headers={"Authorization": f"Bearer {p}"}).status_code == 403

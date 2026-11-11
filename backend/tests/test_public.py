"""Website: schools that opt in + aggregate stats. Nothing personal leaves the API."""
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.routers.public as pub  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def tok(c, code, lid, pw="demo123"):
    return {"Authorization": "Bearer " + c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw}).json()["token"]}


def test_public_listing_and_privacy(c):
    pub._cache["data"] = None
    d = c.get("/public/schools").json()
    names = {s["name"]: s for s in d["schools"]}
    assert "Green Valley Public School" in names and names["Green Valley Public School"]["demo"] is True
    gv = names["Green Valley Public School"]
    assert gv["city"] == "Ranchi" and gv["crest"]["initials"] == "GV" and gv["crest"]["color"].startswith("#")
    assert set(gv) == {"name", "city", "board", "demo", "since", "crest"}                 # no codes, ids or people
    assert d["stats"] == {"schools": 0, "students": 0, "teachers": 0, "parents": 0}      # demo schools aren't counted
    # principal hides the school; teachers can't change it
    assert c.put("/school/showcase", json={"show": False}, headers=tok(c, "DEMO01", "T001")).status_code == 403
    r = c.put("/school/showcase", json={"show": False, "city": "Ranchi"}, headers=tok(c, "DEMO01", "principal"))
    assert r.status_code == 200 and r.json()["show"] is False
    assert "Green Valley Public School" not in {s["name"] for s in c.get("/public/schools").json()["schools"]}
    c.put("/school/showcase", json={"show": True, "city": "Ranchi, Jharkhand"}, headers=tok(c, "DEMO01", "principal"))
    assert any(s["city"] == "Ranchi, Jharkhand" for s in c.get("/public/schools").json()["schools"])


def test_initials():
    assert pub.initials("Green Valley Public School") == "GV"
    assert pub.initials("St. Xavier's School") == "SX"
    assert pub.initials("Kendriya Vidyalaya") == "K"

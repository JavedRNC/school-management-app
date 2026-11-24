"""Staff GPS check-in: fake locations are refused (and logged), doubtful ones are let through but shown to the principal."""
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

GATE = (23.3441, 85.3096)            # the demo school's location
T0 = 1_790_000_000_000.0             # a reading time in milliseconds


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def login(c, lid):
    r = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": lid, "password": "demo123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def fix(dlat=0.0, dlng=0.0, acc=8.0, t=0.0, mocked=False):
    return {"lat": GATE[0] + dlat, "lng": GATE[1] + dlng, "accuracy": acc, "t": T0 + t, "mocked": mocked}


def reading(samples, **kw):
    last = samples[-1]
    return {"lat": last["lat"], "lng": last["lng"], "accuracy": last["accuracy"], "mocked": False, "samples": samples, **kw}


@pytest.fixture(scope="module")
def school_day(c):
    me = c.get("/staff-attendance/me", headers=login(c, "T002")).json()
    if not me["today"]["is_school_day"]:
        pytest.skip("not a school day in the demo school today")
    return True


def audit(c, action):
    p = login(c, "principal")
    return [a for a in c.get("/school/audit", params={"group": "attendance"}, headers=p).json() if a["action"] == action]


@pytest.mark.tc("TC-B-147", "Fake locations are refused and logged")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_fake_locations_are_refused(c, school_day):
    t = login(c, "T002")
    tries = {
        "mock flag on one reading": reading([fix(), fix(t=1000, mocked=True), fix(t=2000)]),
        "mock flag on the main reading": {**reading([fix(), fix(t=1000)]), "mocked": True},
        "perfect accuracy": reading([fix(acc=0.0), fix(t=1000, acc=0.0)]),
        "a 500 m jump in a second": reading([fix(), fix(dlat=0.0045, t=1000)]),
        "readings out of order": reading([fix(t=2000), fix(t=1000)]),
        "sent location differs from the readings": {**reading([fix(), fix(t=1000)]), "lat": GATE[0] + 0.0003},
    }
    for name, body in tries.items():
        r = c.post("/staff-attendance/check-in", json=body, headers=t)
        assert r.status_code == 400 and "fake-location" in r.json()["detail"], (name, r.status_code, r.text)
    assert c.get("/staff-attendance/me", headers=t).json()["today"]["record"] is None, "nothing was recorded"
    logged = audit(c, "staff_attendance.fake_location")
    assert len(logged) >= len(tries) and all(a["actor_role"] == "teacher" for a in logged)


@pytest.mark.tc("TC-B-148", "Real readings check in cleanly, even with normal GPS corrections")
@pytest.mark.sanity
@pytest.mark.regression
def test_real_readings_check_in(c, school_day):
    t = login(c, "T003")
    # a coarse first fix corrected by GPS: 300 m off with ±400 m accuracy is a correction, not a jump
    body = reading([fix(dlat=0.0027, acc=400, t=0), fix(dlat=0.00001, acc=12, t=1000), fix(dlng=0.00002, acc=9, t=2000), fix(acc=7.5, t=3000)])
    r = c.post("/staff-attendance/check-in", json=body, headers=t)
    assert r.status_code == 200, r.text
    rec = c.get("/staff-attendance/me", headers=t).json()["today"]["record"]
    assert rec["check_in_at"] and "⚠" not in (rec["note"] or "")
    # an older app sends one reading without samples: still accepted
    assert c.post("/staff-attendance/check-out", json={"lat": GATE[0], "lng": GATE[1], "accuracy": 10}, headers=t).status_code == 200


@pytest.mark.tc("TC-B-149", "Doubtful readings are let through and shown to the principal")
@pytest.mark.sanity
@pytest.mark.regression
def test_doubtful_readings_are_flagged(c, school_day):
    t = login(c, "T004")
    same = [fix(acc=5, t=0), fix(acc=5, t=1000), fix(acc=5, t=2000)]
    r = c.post("/staff-attendance/check-in", json=reading(same, rooted=True), headers=t)
    assert r.status_code == 200, r.text
    rec = c.get("/staff-attendance/me", headers=t).json()["today"]["record"]
    assert "⚠ check-in" in rec["note"] and "rooted phone" in rec["note"] and "readings did not change" in rec["note"]
    p = login(c, "principal")
    board = c.get("/staff-attendance/day", headers=p).json()
    row = next(x for x in board["rows"] if x["login_id"] == "T004")
    assert "rooted phone" in row["note"]
    assert audit(c, "staff_attendance.location_doubt")


@pytest.mark.tc("TC-B-150", "Too many readings and bad values are refused")
@pytest.mark.regression
def test_reading_limits(c, school_day):
    t = login(c, "T005")
    many = reading([fix(t=i * 1000) for i in range(11)])
    assert c.post("/staff-attendance/check-in", json=many, headers=t).status_code == 422
    assert c.post("/staff-attendance/check-in", json=reading([fix(acc=-1)]), headers=t).status_code == 422
    assert c.post("/staff-attendance/check-in", json=reading([{**fix(), "lat": 95}]), headers=t).status_code == 422

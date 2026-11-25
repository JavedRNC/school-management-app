"""Staff GPS check-in: readings that Android marks as coming from a fake-location app are refused (and logged);
other odd signs let the check-in through but leave a note for the principal, so honest teachers are never blocked."""
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


@pytest.fixture(autouse=True)
def every_day_is_a_school_day(monkeypatch):
    """The tests must not depend on the calendar (Sundays, holidays)."""
    from app.routers import staff_attendance
    monkeypatch.setattr(staff_attendance, "day_status", lambda db, school, d: (True, ""))


def login(c, lid):
    r = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": lid, "password": "demo123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def fix(dlat=0.0, dlng=0.0, acc=8.0, t=0.0, mocked=False):
    return {"lat": GATE[0] + dlat, "lng": GATE[1] + dlng, "accuracy": acc, "t": T0 + t, "mocked": mocked}


def reading(samples, **kw):
    """What the app sends: its last reading as the location, plus all the readings."""
    last = samples[-1]
    return {"lat": last["lat"], "lng": last["lng"], "accuracy": last["accuracy"], "mocked": False, "samples": samples, **kw}


def actions(c, action, who):
    p = login(c, "principal")
    return [a for a in c.get("/school/audit", params={"group": "attendance", "q": who}, headers=p).json() if a["action"] == action]


def record(c, h):
    return c.get("/staff-attendance/me", headers=h).json()["today"]["record"]


@pytest.mark.tc("TC-B-147", "A location the phone marks as fake is refused and logged")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_fake_locations_are_refused(c):
    t = login(c, "T002")
    tries = {
        "mock flag on one reading": (reading([fix(), fix(t=1000, mocked=True), fix(t=2000)]), "fake-location app"),
        "mock flag on the main reading": ({**reading([fix(), fix(t=1000)]), "mocked": True}, "fake-location app"),
        "sent location differs from the readings": ({**reading([fix(), fix(t=1000)]), "lat": GATE[0] + 0.0003}, "differs from the phone's GPS readings"),
    }
    for name, (body, why) in tries.items():
        r = c.post("/staff-attendance/check-in", json=body, headers=t)
        assert r.status_code == 400 and "fake-location" in r.json()["detail"], (name, r.status_code, r.text)
    assert record(c, t) is None, "nothing was recorded"
    logged = [a["detail"] for a in actions(c, "staff_attendance.fake_location", "T002")]
    assert len(logged) == len(tries)
    for _, why in tries.values():
        assert any(why in d for d in logged), why
    assert not any(str(GATE[0])[:6] in d for d in logged), "the reported position is not kept in the log"


@pytest.mark.tc("TC-B-148", "Real readings check in cleanly, including normal GPS corrections")
@pytest.mark.sanity
@pytest.mark.regression
def test_real_readings_check_in(c):
    t = login(c, "T003")
    # a coarse first fix corrected by GPS a fraction of a second later, then steady jitter
    body = reading([fix(dlat=0.0027, acc=400, t=0), fix(dlat=0.0004, acc=15, t=200), fix(dlng=0.00002, acc=9, t=1200),
                    fix(acc=7.5, t=2200), fix(acc=7.5, t=3200)])
    r = c.post("/staff-attendance/check-in", json=body, headers=t)
    assert r.status_code == 200, r.text
    assert "⚠" not in (record(c, t)["note"] or "")
    # a stationary phone repeating the same reading is normal, not a doubt
    same = reading([fix(acc=5, t=0), fix(acc=5, t=1000), fix(acc=5, t=2000)])
    assert c.post("/staff-attendance/check-out", json=same, headers=t).status_code == 200
    assert "⚠" not in (record(c, t)["note"] or "")


@pytest.mark.tc("TC-B-149", "Odd signs let the check-in through and leave a note for the principal")
@pytest.mark.sanity
@pytest.mark.regression
def test_doubtful_readings_are_noted(c):
    t = login(c, "T004")
    body = reading([fix(acc=0.0, t=0), fix(dlat=0.02, acc=0.0, t=1000), fix(acc=0.0, t=2000)], rooted=True)
    body["lat"], body["lng"], body["accuracy"] = GATE[0], GATE[1], 0.0
    r = c.post("/staff-attendance/check-in", json=body, headers=t)
    assert r.status_code == 200, r.text                                       # a phone with no accuracy is not blocked
    note = record(c, t)["note"]
    for sign in ("⚠ check-in", "rooted phone", "no GPS accuracy reported", "location jumped"):
        assert sign in note, sign
    board = c.get("/staff-attendance/day", headers=login(c, "principal")).json()
    assert "rooted phone" in next(x for x in board["rows"] if x["login_id"] == "T004")["note"]
    assert actions(c, "staff_attendance.location_doubt", "T004")
    # an older app sends one reading without samples: accepted, noted only if odd
    assert c.post("/staff-attendance/check-out", json={"lat": GATE[0], "lng": GATE[1], "accuracy": 10}, headers=t).status_code == 200


@pytest.mark.tc("TC-B-150", "Bad reading values are refused before any check")
@pytest.mark.regression
def test_reading_limits(c):
    t = login(c, "T005")
    good = reading([fix(), fix(t=1000)])
    bad_samples = {
        "eleven readings": [fix(t=i * 1000) for i in range(11)],
        "negative accuracy": [fix(), {**fix(t=1000), "accuracy": -1}],
        "latitude out of range": [{**fix(), "lat": 95}, fix(t=1000)],
        "negative time": [{**fix(), "t": -5}, fix(t=1000)],
    }
    for name, samples in bad_samples.items():
        body = {**good, "samples": samples}            # the main location stays valid: only the readings are wrong
        r = c.post("/staff-attendance/check-in", json=body, headers=t)
        assert r.status_code == 422, (name, r.status_code)
    r = c.post("/staff-attendance/check-in", content='{"lat": 23.3441, "lng": 85.3096, "samples": [{"lat": 23.3441, "lng": 85.3096, "t": NaN}]}',
               headers={**t, "Content-Type": "application/json"})
    assert r.status_code == 422
    assert record(c, t) is None

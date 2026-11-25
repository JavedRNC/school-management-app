"""The one-time fresh start of DEV and TEST (app/reset.py) and the full-size demo school they get.

Each case runs in its own process with its own throw-away database, so the shared test database is never touched.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

SCRIPT = r"""
import json, os
from sqlalchemy import func, select
from app.migrate import migrate
from app.db import SessionLocal
from app.models import Meta, Plan, Role, School, User
from app.reset import reset_if_asked
from app.seed import ensure_platform, seed_demo_if_empty, seed_fees_demo, seed_phase2_demo, seed_payroll_demo
from app.auth import hash_password

def counts():
    with SessionLocal() as db:
        return {"schools": db.scalar(select(func.count(School.id))),
                "people": db.scalar(select(func.count(User.id)).where(User.role != Role.admin)),
                "admins": db.scalar(select(func.count(User.id)).where(User.role == Role.admin)),
                "plans": db.scalar(select(func.count(Plan.id))),
                "demo01": db.scalar(select(func.count(User.id)).join(School, School.id == User.school_id).where(School.code == "DEMO01"))}

migrate(); ensure_platform()
first = reset_if_asked()                      # an empty database: nothing to remove, but the reset is recorded
seed_demo_if_empty(); seed_phase2_demo(); seed_fees_demo(); seed_payroll_demo()
with SessionLocal() as db:                    # someone's own school, and a changed admin password
    s = School(code="MINE01", name="Mine", plan_id=db.scalar(select(Plan.id)))
    db.add(s); db.flush()
    db.add(User(school_id=s.id, login_id="principal", name="P", role=Role.principal, password_hash="x"))
    db.scalar(select(User).where(User.role == Role.admin)).password_hash = hash_password("Kept#Admin1")
    db.commit()
before = counts()
again = reset_if_asked()                      # same DATA_RESET id: nothing happens
with SessionLocal() as db:
    row = db.get(Meta, "data_reset")       # as if the code carried a new id
    if row:
        db.delete(row); db.commit()
wiped = reset_if_asked()
after = counts()
seed_demo_if_empty()
with SessionLocal() as db:
    from app.auth import verify_password
    kept_pw = verify_password("Kept#Admin1", db.scalar(select(User).where(User.role == Role.admin)).password_hash)
print("RESULT" + json.dumps({"first": first, "again": again, "wiped": wiped, "before": before, "after": after,
                             "reseeded": counts(), "kept_pw": kept_pw}))
"""


def run(env_name: str, size: str | None = None) -> dict:
    db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    env = {k: v for k, v in os.environ.items() if k not in ("APP_ENV", "DEMO_SIZE", "DATABASE_URL", "TEST_DATABASE_URL")}
    env.update({"DATABASE_URL": f"sqlite:///{db}", "APP_ENV": env_name, "ALLOW_DEFAULT_ADMIN_PASSWORD": "1"})
    if size:
        env["DEMO_SIZE"] = size
    out = subprocess.run([sys.executable, "-c", SCRIPT], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=600)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.split("RESULT", 1)[1])


@pytest.mark.tc("TC-B-161", "DEV and TEST start fresh once: every school goes, the admin and plans stay; production never resets")
@pytest.mark.regression
def test_fresh_start():
    # TC-B-161.1 — on TEST: one wipe per DATA_RESET id; schools and people go, admin (with its password) and plans stay
    r = run("test", "small")
    assert r["before"]["schools"] == 3 and r["before"]["people"] > 50
    assert r["again"] is False, "the same reset id must not wipe a second time"
    assert r["wiped"] is True
    assert r["after"] == {"schools": 0, "people": 0, "admins": 1, "plans": r["before"]["plans"], "demo01": 0}
    assert r["kept_pw"], "the admin keeps the password they chose"
    assert r["reseeded"]["demo01"] == r["before"]["demo01"], "the demo schools come back"

    # TC-B-161.2 — production (and an unset APP_ENV) never resets
    p = run("prod")
    assert (p["first"], p["again"], p["wiped"]) == (False, False, False)
    assert p["after"]["schools"] == 3 and p["after"]["people"] == p["before"]["people"]


@pytest.mark.tc("TC-B-162", "DEV and TEST get a full-size demo school of over 500 people; tests and local runs keep the small one")
@pytest.mark.regression
def test_large_demo():
    # TC-B-162.1 — DEMO_SIZE=large: 526 people in DEMO01
    assert run("dev", "large")["before"]["demo01"] == 526
    # TC-B-162.2 — the default outside DEV/TEST is the small school
    assert run("prod")["before"]["demo01"] < 60

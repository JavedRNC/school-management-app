"""A rush must never freeze the server (found by the 1500-person stress test, tools/stress).

Before main.RequestGate, a burst larger than the database pool locked the API up: every worker thread waited for a
connection while every connection belonged to a request waiting for a thread, and it stayed stuck long after the burst.
"""
import asyncio
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
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


def run_gate(gate, paths):
    """Sends one request per path through the gate at the same moment; returns the status codes, in order."""
    async def one(path):
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(msg):
            if msg["type"] == "http.response.start":
                sent.append(msg["status"])

        await gate({"type": "http", "method": "GET", "path": path, "headers": [], "query_string": b""}, receive, send)
        return sent[0]

    async def all_():
        return await asyncio.gather(*(one(p) for p in paths))

    return asyncio.run(all_())


@pytest.mark.tc("TC-B-158", "Only a few requests are worked on at once; the rest wait, and are told 'busy' if they wait too long")
@pytest.mark.sanity
@pytest.mark.regression
def test_request_gate(monkeypatch):
    inside, most = 0, 0

    async def slow_app(scope, receive, send):
        nonlocal inside, most
        inside += 1
        most = max(most, inside)
        await asyncio.sleep(0.2)
        inside -= 1
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    # TC-B-158.1 — at most MAX_ACTIVE at once, and everyone who waits a little is served
    monkeypatch.setattr(main, "MAX_ACTIVE", 3)
    monkeypatch.setattr(main, "MAX_WAIT_S", 5)
    assert run_gate(main.RequestGate(slow_app), ["/posts"] * 12) == [200] * 12
    assert most == 3
    # TC-B-158.2 — whoever would wait longer than MAX_WAIT_S gets 503 'busy' instead of a reply nobody waits for
    monkeypatch.setattr(main, "MAX_WAIT_S", 0.3)
    codes = run_gate(main.RequestGate(slow_app), ["/posts"] * 9)
    assert codes.count(200) == 6 and codes.count(503) == 3          # two rounds of 3 fit in 0.3 s + 0.2 s
    # TC-B-158.3 — a queue that is already long is told 'busy' at once
    monkeypatch.setattr(main, "MAX_WAIT_S", 5)
    monkeypatch.setattr(main, "MAX_WAITING", 2)
    codes = run_gate(main.RequestGate(slow_app), ["/posts"] * 8)
    assert codes.count(200) == 5 and codes.count(503) == 3
    # TC-B-158.4 — the health check never waits in the queue
    monkeypatch.setattr(main, "MAX_WAITING", 400)
    most = 0
    run_gate(main.RequestGate(slow_app), ["/"] * 6)
    assert most == 6


@pytest.mark.tc("TC-B-159", "The database pool is larger than the number of requests let in (so the deadlock can't come back)")
@pytest.mark.regression
def test_pool_is_bigger_than_the_gate():
    from app.db import engine

    assert engine.pool.size() + engine.pool._max_overflow >= 2 * main.MAX_ACTIVE      # a request may use two connections
    assert engine.pool._timeout <= main.MAX_WAIT_S


@pytest.mark.tc("TC-B-160", "A burst of 150 requests at once is answered, and the server answers straight after")
@pytest.mark.smoke
@pytest.mark.regression
def test_burst_does_not_freeze_the_server(c):
    r = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "principal", "password": "demo123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    paths = ["/posts", "/classes", "/auth/me", "/school/me", "/timetable", "/dashboard"] * 25
    t = time.time()
    with ThreadPoolExecutor(150) as ex:
        codes = list(ex.map(lambda p: c.get(p, headers=h).status_code, paths))
    took = time.time() - t
    # TC-B-160.1 — every request of the burst is answered (none waits for the 10 s pool timeout)
    assert codes.count(200) == len(paths), {x: codes.count(x) for x in set(codes)}
    assert took < 60, took
    # TC-B-160.2 — straight after the burst the server answers at normal speed
    t = time.time()
    assert c.get("/auth/me", headers=h).status_code == 200
    assert time.time() - t < 2

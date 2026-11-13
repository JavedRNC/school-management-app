"""Browser tests for the portal (Playwright).

Local run (throw-away API with demo data + a fresh portal build):
    cd portal && npm ci && python -m pytest e2e -q

Against a deployed environment (QA):
    E2E_WEB_URL=https://… E2E_API_URL=https://… E2E_ADMIN_PASSWORD=… python -m pytest e2e -q

Rules the tests follow so they are safe on a shared QA environment:
  * everything a test creates carries this run's TAG in its name and is removed when the run ends;
  * school work happens in one dedicated school (code E2EQA1), never in real or demo schools;
  * steps that would leave something permanent behind (a brand-new school) run only locally (`local_only`).
"""
import json
import os
import random
import string
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

PORTAL = Path(__file__).resolve().parents[1]
BACKEND = PORTAL.parent / "backend"
API_PORT, WEB_PORT = 8011, 4181
REMOTE = bool(os.getenv("E2E_WEB_URL"))
API = (os.getenv("E2E_API_URL") or f"http://127.0.0.1:{API_PORT}").rstrip("/")
WEB = (os.getenv("E2E_WEB_URL") or f"http://127.0.0.1:{WEB_PORT}").rstrip("/")
ADMIN_PW = os.getenv("E2E_ADMIN_PASSWORD") or "Admin#2026x"
SCHOOL_CODE = "E2EQA1"
TAG = "".join(random.choices(string.ascii_uppercase, k=2)) + "".join(random.choices(string.digits, k=3))    # e.g. QX417
PRINCIPAL_PW = f"Run#{TAG}pw9"

local_only = pytest.mark.skipif(REMOTE, reason="would leave permanent data on a shared environment")


def call(method, path, token=None, body=None, query=None, timeout=60):
    """A direct API call, for arranging data and checking what the browser did. Returns (status, json)."""
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw[:1] in (b"{", b"[", b'"') or raw in (b"null", b"true", b"false") else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except ValueError:
            return e.code, raw


def ok(result):
    status, data = result
    assert status < 300, f"API call failed: {status} {data}"
    return data


def _wait(url: str, seconds: int) -> None:
    end = time.time() + seconds
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=10)
            return
        except urllib.error.HTTPError:
            return                      # it answered: awake
        except Exception:  # noqa: BLE001
            time.sleep(1)
    raise RuntimeError(f"{url} did not answer within {seconds}s")


@pytest.fixture(scope="session")
def servers():
    if REMOTE:
        _wait(API + "/", 240)           # a sleeping free server takes about a minute to wake
        _wait(WEB + "/", 120)
        yield {"api": API, "web": WEB}
        return
    db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}", "APP_ENV": "dev", "JWT_SECRET": "e2e-" + "k" * 40, "SEED_DEMO": "1", "ALLOW_DEFAULT_ADMIN_PASSWORD": "1",
           "CORS_ORIGINS": WEB}
    build_env = {**os.environ, "VITE_API_URL": API, "VITE_APP_ENV": "dev"}
    subprocess.run(["npm", "run", "build"], cwd=PORTAL, env=build_env, check=True, capture_output=True)
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(API_PORT), "--log-level", "warning"], cwd=BACKEND, env=env)
    web = subprocess.Popen([sys.executable, "-m", "http.server", str(WEB_PORT), "--bind", "127.0.0.1", "--directory", str(PORTAL / "dist")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        _wait(API + "/", 60)
        _wait(WEB + "/", 60)
        yield {"api": API, "web": WEB}
    finally:
        api.terminate()
        web.terminate()


def login(code, login_id, password, web=True):
    return call("POST", "/auth/login", body={"school_code": code, "login_id": login_id, "password": password, **({"client": "web"} if web else {})})


@pytest.fixture(scope="session")
def admin(servers):
    """The platform admin's session. Locally the admin still has the start-up password, which must be changed first."""
    status, data = login("ADMIN", "admin", ADMIN_PW)
    if status != 200 and not REMOTE:
        first = ok(login("ADMIN", "admin", "admin123"))
        ok(call("POST", "/auth/password", first["token"], {"old_password": "admin123", "new_password": ADMIN_PW}))
        status, data = login("ADMIN", "admin", ADMIN_PW)
    assert status == 200, f"Admin sign-in failed ({status}). On a deployed environment set E2E_ADMIN_PASSWORD. {data}"
    return {"token": data["token"], "user": data["user"]}


def fresh_principal(admin, sid):
    """Admin resets the test school's principal; the principal then chooses this run's password. Returns the new session."""
    principals = ok(call("GET", f"/admin/schools/{sid}/users", admin["token"], query={"role": "principal"}))
    assert principals, "the test school has no principal"
    temp = "Temp#" + "".join(random.choices(string.ascii_letters + string.digits, k=10))
    ok(call("PUT", f"/admin/schools/{sid}/users/{principals[0]['id']}", admin["token"], {"password": temp, "active": True}))
    first = ok(login(SCHOOL_CODE, "principal", temp))
    done = ok(call("POST", "/auth/password", first["token"], {"old_password": temp, "new_password": PRINCIPAL_PW}))
    token = done.pop("token")
    return {"token": token, "user": done}


@pytest.fixture(scope="session")
def school(admin):
    """One dedicated school for the tests, on the richest plan, free and not suspended. Created the first time it is needed."""
    t = admin["token"]
    plans = ok(call("GET", "/admin/plans", t))
    best = max(plans, key=lambda p: len(p["modules"]))
    found = [s for s in ok(call("GET", "/admin/schools", t)) if s["code"] == SCHOOL_CODE]
    if found:
        sid = found[0]["id"]
    else:
        sid = ok(call("POST", "/admin/schools", t, {"code": SCHOOL_CODE, "name": "E2E Test School", "address": "1 Test Lane", "board": "CBSE", "plan_id": best["id"],
                                                    "principal_name": "Asha Tester", "principal_login_id": "principal", "principal_password": "Start#12345"}))["id"]
    ok(call("PUT", f"/admin/schools/{sid}", t, {"name": "E2E Test School", "plan_id": best["id"], "use_plan_modules": True, "clear_custom_price": True, "is_free": True, "free_until": None,
                                                 "suspended": False, "max_students": None}))
    info = {"id": sid, "code": SCHOOL_CODE, "plan": best, "password": PRINCIPAL_PW, "principal": fresh_principal(admin, sid)}
    ok(call("PUT", "/school/settings", info["principal"]["token"], {"working_days": [0, 1, 2, 3, 4, 5, 6]}))      # so "today" is always a school day
    ok(call("DELETE", "/school/support-access", info["principal"]["token"]))
    yield info
    _cleanup(admin, info)


def _cleanup(admin, info):
    """Archive whatever this run created in the test school (best effort: a failure here never fails the run)."""
    try:
        t = fresh_principal(admin, info["id"])["token"]
        for path, key in (("/polls", "title"), ("/banners", "title"), ("/posts", "title"), ("/holidays", "name"), ("/exams", "name")):
            for row in call("GET", path, t, query={"start": "2000-01-01", "end": "2099-12-31"} if path == "/holidays" else None)[1] or []:
                if TAG in str(row.get(key, "")):
                    call("DELETE", f"{path}/{row['id']}", t)
        for role in ("student", "parent", "teacher", "vice_principal", "coordinator"):
            for u in call("GET", "/users", t, query={"role": role})[1] or []:
                if TAG in u["login_id"] or TAG in u["name"]:
                    call("DELETE", f"/users/{u['id']}", t)
        tr = call("GET", "/transport/overview", t)[1] or {}
        for r in tr.get("routes", []):
            if TAG in r["name"]:
                call("DELETE", f"/transport/routes/{r['id']}", t)
        for v in tr.get("vehicles", []):
            if TAG in v["number"]:
                call("DELETE", f"/transport/vehicles/{v['id']}", t)
        for b in call("GET", "/fees/batches", t)[1] or []:
            if TAG in b["title"]:
                call("DELETE", f"/fees/batches/{b['id']}", t)
        for c in call("GET", "/classes", t)[1] or []:
            if TAG in c["name"]:
                call("DELETE", f"/classes/{c['id']}", t)
        for s in call("GET", "/subjects", t)[1] or []:
            if TAG in s["name"]:
                call("DELETE", f"/subjects/{s['id']}", t)
        call("DELETE", "/school/support-access", t)
    except Exception as e:  # noqa: BLE001
        print(f"clean-up skipped: {e}")


@pytest.fixture(scope="session")
def seeded(school):
    """A small class to work with: 2 teachers, 2 subjects, 1 class with 3 students — all named with this run's TAG."""
    t = school["principal"]["token"]
    teachers = [ok(call("POST", "/users", t, {"name": f"Teacher {n} {TAG}", "login_id": f"T{TAG}{n}", "password": "Teach#12345", "role": "teacher", "phone": f"98000{random.randint(10000, 99999)}"}))
                for n in ("One", "Two")]
    subjects = [ok(call("POST", "/subjects", t, {"name": f"{name} {TAG}"})) for name in ("Maths", "Science")]
    klass = ok(call("POST", "/classes", t, {"name": f"6-{TAG}", "class_teacher_id": teachers[0]["id"]}))
    students = [ok(call("POST", "/users", t, {"name": f"{name} {TAG}", "login_id": f"S{TAG}{i}", "password": "Stud#12345", "role": "student", "class_id": klass["id"], "roll_no": i}))
                for i, name in enumerate(("Aman Verma", "Bina Das", "Chirag Rao"), 1)]
    ok(call("POST", "/assignments", t, {"teacher_id": teachers[0]["id"], "class_id": klass["id"], "subject_id": subjects[0]["id"]}))
    return {"teachers": teachers, "subjects": subjects, "klass": klass, "students": students}


# ---------------------------------------------------------------- browser
@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _open(browser, session=None, phone=False):
    opts = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "has_touch": True, "is_mobile": True} if phone else {"viewport": {"width": 1366, "height": 850}}
    ctx = browser.new_context(accept_downloads=True, **opts)
    ctx.set_default_timeout(20000 if REMOTE else 10000)
    if session:
        # signed in before the first page loads, exactly as if this tab had just logged in
        ctx.add_init_script("if (!sessionStorage.getItem('prangan.session')) sessionStorage.setItem('prangan.session', %s);" % json.dumps(json.dumps(session)))
    pg = ctx.new_page()
    pg.problems = []
    pg.on("pageerror", lambda e: pg.problems.append(str(e)))
    pg.on("console", lambda m: pg.problems.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    return ctx, pg


def _close(ctx, pg, request):
    if getattr(request.node, "failed_call", False):
        try:
            pg.screenshot(path=os.environ.get("E2E_SHOT_DIR", tempfile.gettempdir()) + f"/fail-{request.node.name[:60]}.png")
        except Exception:  # noqa: BLE001
            pass
    problems = list(pg.problems)
    ctx.close()
    if not getattr(request.node, "failed_call", False):
        assert not problems, f"the browser reported errors: {problems}"


@pytest.fixture
def page(browser, servers, request):
    """A signed-out desktop browser."""
    ctx, pg = _open(browser)
    yield pg
    _close(ctx, pg, request)


@pytest.fixture
def phone(browser, servers, request):
    """A signed-out phone-sized browser."""
    ctx, pg = _open(browser, phone=True)
    yield pg
    _close(ctx, pg, request)


@pytest.fixture
def admin_page(browser, admin, request):
    ctx, pg = _open(browser, admin)
    yield pg
    _close(ctx, pg, request)


@pytest.fixture
def principal_page(browser, school, request):
    ctx, pg = _open(browser, school["principal"])
    yield pg
    _close(ctx, pg, request)


@pytest.fixture
def principal_phone(browser, school, request):
    ctx, pg = _open(browser, school["principal"], phone=True)
    yield pg
    _close(ctx, pg, request)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call":
        item.failed_call = rep.failed
        if rep.failed and os.getenv("GITHUB_ACTIONS"):
            # an annotation on the run: which line failed, and what the page showed at that moment
            crash = getattr(rep.longrepr, "reprcrash", None)
            where = f"line {crash.lineno}: {crash.message[:300]}" if crash else str(rep.longrepr)[-300:]
            seen = ""
            pg = next((item.funcargs[k] for k in ("page", "phone", "admin_page", "principal_page", "principal_phone") if k in item.funcargs), None)
            if pg is not None:
                try:
                    seen = f" | url={pg.url} | page says: {pg.inner_text('body')[:400]}"
                except Exception:  # noqa: BLE001
                    pass
            text = (where + seen).replace("%", "%25").replace("\r", "").replace("\n", " / ")
            print(f"\n::error title={item.name}::{text}")

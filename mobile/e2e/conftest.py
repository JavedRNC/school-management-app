"""Browser tests for the Android app's look and key screens (Playwright, the app's web build at phone size).

They check the DEFAULT appearance (Chalk) — colours, fonts and layout of sign-in, the homes, attendance, marks and
Me → Appearance — plus the behaviour those screens must keep (marking, saving, the List / Grid switch).

Run locally (throw-away API with the demo school + a fresh web build of the app):
    cd mobile && npm ci
    npm i --no-save --legacy-peer-deps react-native-web@0.21.4 @expo/metro-runtime@58.0.17   # web-only, never shipped
    python -m pytest e2e -q

Everything runs against a private SQLite database that is deleted afterwards; nothing touches DEV, TEST or PROD.
"""
import datetime as dt
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect, sync_playwright

MOBILE = Path(__file__).resolve().parents[1]
BACKEND = MOBILE.parent / "backend"
API_PORT, WEB_PORT = 8021, 4191
API = f"http://127.0.0.1:{API_PORT}"
WEB = f"http://127.0.0.1:{WEB_PORT}"
DEMO = "DEMO01"
DEMO_PW = "demo123"
# The demo school works in Indian time, like every school.
TODAY = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=5, minutes=30)).date()

# Chalk tokens (mobile/src/lib/theme.ts) as the browser reports them.
CHALK = {
    "ground": "rgb(245, 246, 242)",
    "green": "rgb(30, 77, 63)",
    "white": "rgb(255, 255, 255)",
    "marigold": "rgb(232, 163, 23)",
    "absent": "rgb(180, 65, 15)",
    "ground_dark": "rgb(15, 22, 19)",
}


def call(method, path, token=None, body=None, query=None):
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def token_for(login_id):
    status, data = call("POST", "/auth/login", body={"school_code": DEMO, "login_id": login_id, "password": DEMO_PW})
    assert status == 200, data
    return data["token"]


def _wait(url, seconds):
    end = time.time() + seconds
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=5)
            return
        except urllib.error.HTTPError:
            return
        except Exception:  # noqa: BLE001
            time.sleep(0.5)
    raise RuntimeError(f"{url} did not answer within {seconds}s")


class _SpaHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the exported app; any path that is not a file gets index.html (the app routes in the browser)."""

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if not path.exists():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *args):  # quiet
        pass


@pytest.fixture(scope="session")
def servers():
    if not (MOBILE / "node_modules" / "react-native-web").exists():
        pytest.fail("The web build needs react-native-web: "
                    "npm i --no-save --legacy-peer-deps react-native-web@0.21.4 @expo/metro-runtime@58.0.17")
    tmp = Path(tempfile.mkdtemp(prefix="prangan-app-e2e-"))
    out = tmp / "web"
    tsconfig = (MOBILE / "tsconfig.json").read_text()
    try:
        build = subprocess.run(["npx", "expo", "export", "--platform", "web", "--output-dir", str(out), "--clear"], cwd=MOBILE,
                               env={**os.environ, "PRANGAN_APP_E2E_API": API, "EXPO_OFFLINE": "1", "CI": "1"},
                               capture_output=True, text=True)
    finally:
        (MOBILE / "tsconfig.json").write_text(tsconfig)       # expo may rewrite it; the repo copy must not change
    assert build.returncode == 0, build.stdout[-3000:] + build.stderr[-3000:]

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp / 'app.db'}", "APP_ENV": "dev", "JWT_SECRET": "e2e-" + "k" * 40,
           "SEED_DEMO": "1", "ALLOW_DEFAULT_ADMIN_PASSWORD": "1", "CORS_ORIGINS": WEB}
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(API_PORT), "--log-level", "warning"], cwd=BACKEND, env=env)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", WEB_PORT), functools.partial(_SpaHandler, directory=str(out)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        _wait(API + "/", 60)
        _wait(WEB + "/", 30)
        yield {"api": API, "web": WEB}
    finally:
        httpd.shutdown()
        api.terminate()
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def browser(servers):
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _new_page(browser, scheme="light", storage: dict | None = None) -> Page:
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme, timezone_id="Asia/Kolkata", locale="en-IN")
    if storage:
        ctx.add_init_script(script=f"for (const [k, v] of Object.entries({json.dumps(storage)})) localStorage.setItem(k, v);")
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.errors = []  # type: ignore[attr-defined]
    page.on("pageerror", lambda e: page.errors.append(str(e)))  # type: ignore[attr-defined]
    return page


@pytest.fixture
def phone(browser):
    """A fresh phone-sized page in light mode with nothing saved (so the app shows its default appearance)."""
    page = _new_page(browser)
    yield page
    page.context.close()


@pytest.fixture
def new_phone(browser):
    """Make extra phones: new_phone(scheme='dark', storage={...})."""
    made = []

    def make(scheme="light", storage=None):
        page = _new_page(browser, scheme, storage)
        made.append(page)
        return page
    yield make
    for p in made:
        p.context.close()


# ---------------------------------------------------------------- page helpers
def css(locator, prop):
    return locator.evaluate(f"(el) => getComputedStyle(el).getPropertyValue('{prop}')")


def bg_of(locator):
    """The first non-transparent background at or above this element."""
    return locator.evaluate("""(el) => { for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return null; }""")


def open_app(page: Page, path="/"):
    page.goto(WEB + path)
    expect(page.get_by_text("Prangan", exact=True).first).to_be_visible()


def dismiss_popups(page: Page):
    """Home screens greet with announcement pop-ups; close them so they don't cover what the test looks at."""
    for _ in range(4):
        got = page.get_by_text("Got it", exact=True)
        if not got.count():
            page.wait_for_timeout(400)
            if not got.count():
                return
        got.first.click()
        page.wait_for_timeout(300)


def sign_in_demo(page: Page, role_label: str, desc: str):
    """Signs in with one of the demo buttons on the sign-in screen, e.g. ('Teacher', 'Attendance & marks')."""
    open_app(page)
    page.get_by_role("button", name=f"Demo: {role_label}, {desc}").click()
    page.wait_for_url(lambda u: "/login" not in u and u.rstrip("/") != WEB, timeout=20000)
    dismiss_popups(page)


def go(page: Page, path: str):
    page.goto(WEB + path)
    page.wait_for_load_state("networkidle")
    dismiss_popups(page)

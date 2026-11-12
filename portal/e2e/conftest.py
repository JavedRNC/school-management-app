"""Browser tests for the portal. Starts a throw-away API (SQLite, demo data) and serves a fresh portal build.

Run:  cd portal && npm ci && python -m pytest e2e -q      (needs: pip install pytest playwright; playwright install chromium)
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

PORTAL = Path(__file__).resolve().parents[1]
BACKEND = PORTAL.parent / "backend"
API_PORT, WEB_PORT = 8011, 4181
API = f"http://127.0.0.1:{API_PORT}"
WEB = f"http://127.0.0.1:{WEB_PORT}"


def _wait(url: str, seconds: int = 60) -> None:
    end = time.time() + seconds
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    raise RuntimeError(f"{url} did not start")


@pytest.fixture(scope="session")
def servers():
    db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}", "APP_ENV": "dev", "JWT_SECRET": "e2e-" + "k" * 40, "SEED_DEMO": "1", "ALLOW_DEFAULT_ADMIN_PASSWORD": "1",
           "CORS_ORIGINS": WEB}
    build_env = {**os.environ, "VITE_API_URL": API, "VITE_APP_ENV": "dev"}
    subprocess.run(["npm", "run", "build"], cwd=PORTAL, env=build_env, check=True, capture_output=True)
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(API_PORT), "--log-level", "warning"], cwd=BACKEND, env=env)
    web = subprocess.Popen([sys.executable, "-m", "http.server", str(WEB_PORT), "--bind", "127.0.0.1", "--directory", str(PORTAL / "dist")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        _wait(API + "/")
        _wait(WEB + "/")
        yield {"api": API, "web": WEB}
    finally:
        api.terminate()
        web.terminate()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def page(browser, servers):
    ctx = browser.new_context(viewport={"width": 1366, "height": 850}, accept_downloads=True)
    pg = ctx.new_page()
    pg.problems = []
    pg.on("pageerror", lambda e: pg.problems.append(str(e)))
    pg.on("console", lambda m: pg.problems.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    yield pg
    try:
        pg.screenshot(path=os.environ.get("E2E_SHOT_DIR", tempfile.gettempdir()) + f"/last-{os.environ.get('PYTEST_CURRENT_TEST', 't').split('::')[-1].split(' ')[0]}.png")
    except Exception:  # noqa: BLE001
        pass
    assert not pg.problems, f"browser errors: {pg.problems}"
    ctx.close()


@pytest.fixture
def phone(browser, servers):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    yield pg
    ctx.close()


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
            pg = item.funcargs.get("page") or item.funcargs.get("phone")
            if pg is not None:
                try:
                    seen = f" | url={pg.url} | page says: {pg.inner_text('body')[:400]}"
                except Exception:  # noqa: BLE001
                    pass
            text = (where + seen).replace("%", "%25").replace("\r", "").replace("\n", " / ")
            print(f"\n::error title={item.name}::{text}")

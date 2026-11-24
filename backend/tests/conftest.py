"""Test settings shared by every test module (set before the app is imported)."""
import os

os.environ.setdefault("ALLOW_DEFAULT_ADMIN_PASSWORD", "1")     # tests sign in as admin/admin123; real servers never get that default
os.environ.setdefault("ALLOW_DEMO_IMPORT", "1")                # the import tests use the demo school

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app import ratelimit
    ratelimit.reset()
    yield


# ---------------------------------------------------------------- every API endpoint must be called by some test
# The suite records each (method, path) that answered with success. At the end it lists the endpoints no test got a
# success from (being refused alone does not count); with API_ROUTE_GATE=1
# (set in CI) such an endpoint fails the run. Run one file and the list is simply printed, never enforced.
import re  # noqa: E402

_HITS: set[tuple[str, str]] = set()        # calls that succeeded (2xx): the endpoint was really exercised, not just refused


class _Recorder:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def watch(message):
            if message["type"] == "http.response.start" and 200 <= message["status"] < 300:
                _HITS.add((scope["method"], scope["path"]))
            await send(message)
        await self.app(scope, receive, watch)


def pytest_collection_finish(session):
    import sys
    if "app.main" in sys.modules:                       # the app is imported by the test modules (after they set the database)
        from app.main import app
        app.add_middleware(_Recorder)


def _endpoints():
    from app.main import app
    out = []
    for path, ops in app.openapi()["paths"].items():
        rx = re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", re.escape(path).replace(r"\{", "{").replace(r"\}", "}")) + "$")
        for m in ops:
            if m in ("get", "post", "put", "delete", "patch"):
                out.append((m.upper(), path, rx))
    return out


def pytest_sessionfinish(session, exitstatus):
    import os
    import sys
    if "app.main" not in sys.modules or not _HITS:
        return
    eps = _endpoints()
    hit = {(m, p) for m, p, rx in eps if any(hm == m and rx.match(hp) for hm, hp in _HITS)}
    missing = sorted((m, p) for m, p, _ in eps if (m, p) not in hit)
    tr = session.config.pluginmanager.get_plugin("terminalreporter")
    if tr:
        tr.write_line(f"\nAPI endpoints with a successful call in the tests: {len(hit)} of {len(eps)}")
        for m, p in missing:
            tr.write_line(f"  not tested: {m} {p}")
    if missing and os.getenv("API_ROUTE_GATE") == "1":
        session.exitstatus = 1


# ---------------------------------------------------------------- test case numbers and suites
# Every test carries @pytest.mark.tc("TC-…", "title") and is in the regression suite; some are also smoke and/or sanity.
#   python -m pytest -m smoke            only the smoke tests      (-m sanity, -m regression likewise)
#   python -m pytest --tc TC-B-008       one test case (repeat --tc for more; a prefix such as TC-P-0 works too)
# The end of every run lists each test case that was executed and its result. The list of all cases is docs/test-cases.md.
_TC_RESULTS: dict[str, str] = {}


def pytest_configure(config):
    for line in ("smoke: quick check that the product starts, signs in and its main pages open",
                 "sanity: the main happy path of each module",
                 "regression: the full suite (every test)",
                 "tc(id, title): the test case number and title (see docs/test-cases.md)"):
        config.addinivalue_line("markers", line)


def pytest_addoption(parser):
    parser.addoption("--tc", action="append", default=[], help="run only these test case numbers (TC-B-008, or a prefix)")


def _tc_of(item):
    m = item.get_closest_marker("tc")
    return m.args[0] if m else None


def pytest_collection_modifyitems(config, items):
    unmarked = [i.nodeid for i in items if not _tc_of(i)]
    assert not unmarked, f"every test needs @pytest.mark.tc(...) — missing on: {unmarked}"
    wanted = config.getoption("--tc")
    if wanted:
        keep = [i for i in items if any(_tc_of(i).startswith(w) for w in wanted)]
        config.hook.pytest_deselected(items=[i for i in items if i not in keep])
        items[:] = keep


def pytest_runtest_logreport(report):
    item_tc = dict(report.user_properties).get("tc")
    if not item_tc:
        return
    if report.when == "call" or report.outcome != "passed":
        worst = {"failed": 2, "skipped": 1, "passed": 0}
        if worst.get(report.outcome, 0) >= worst.get(_TC_RESULTS.get(item_tc, "passed"), 0):
            _TC_RESULTS[item_tc] = report.outcome


def pytest_runtest_setup(item):
    tc = _tc_of(item)
    if tc:
        param = item.callspec.id if hasattr(item, "callspec") else ""
        item.user_properties.append(("tc", f"{tc} [{param}]" if param else tc))


def pytest_terminal_summary(terminalreporter):
    if not _TC_RESULTS:
        return
    terminalreporter.section("test cases executed")
    for tc in sorted(_TC_RESULTS):
        terminalreporter.write_line(f"{tc:<40} {_TC_RESULTS[tc]}")
    counts = {o: list(_TC_RESULTS.values()).count(o) for o in ("passed", "failed", "skipped")}
    terminalreporter.write_line(f"{len(_TC_RESULTS)} executed · " + " · ".join(f"{n} {o}" for o, n in counts.items() if n))

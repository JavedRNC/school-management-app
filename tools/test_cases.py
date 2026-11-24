"""Builds docs/test-cases.md from the Playwright tests, so the list never drifts from the code.

    python tools/test_cases.py           write docs/test-cases.md
    python tools/test_cases.py --check   fail if docs/test-cases.md is out of date (used by CI)

Each test carries @pytest.mark.tc("TC-…", "title") plus @pytest.mark.smoke / sanity / regression. Inside a test, a comment
"# TC-P-008.2 — what is checked" marks where each covered sub-case starts. Cases that have no Playwright test yet are listed
in MANUAL below.
"""
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUITES = [("API (backend, pytest)", ROOT / "backend/tests", "backend/tests"),
          ("Portal (web, Admin + Principal — Playwright)", ROOT / "portal/e2e", "portal/e2e"),
          ("Android app (web build — Playwright)", ROOT / "mobile/e2e", "mobile/e2e")]
SUB = re.compile(r"#\s*(TC-[A-Z]+-\d+\.\d+)\s+—\s+(.*)$")

# Cases without a Playwright test (yet). The server side of most of them is covered by the API tests in backend/tests.
MANUAL = [
    ("TC-M-001", "Parent pays by UPI in the app and sends the UTR for checking", "Regression", "API tests only (TC-B: parent UPI claim)"),
    ("TC-M-002", "Principal app screens for classes, notices, fees and payroll (the portal versions are automated)", "Regression", "API tests only"),
    ("TC-M-003", "Coordinator in the app limited to their classes", "Regression", "API tests only"),
    ("TC-M-004", "Push notifications reach an Android phone", "Regression", "Not automated"),
    ("TC-M-005", "App update prompt when the build is older than the oldest allowed build", "Sanity", "API tests only"),
    ("TC-M-006", "APK installs on a phone; Test and Prod apps install side by side", "Smoke", "Not automated"),
    ("TC-M-007", "Public website pages and the school listing", "Regression", "Not automated"),
]


def _suites(fn) -> list[str]:
    names = {d.attr for d in fn.decorator_list if isinstance(d, ast.Attribute)}
    return [s.title() for s in ("smoke", "sanity", "regression") if s in names]


def _tc(fn):
    for d in fn.decorator_list:
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "tc":
            return d.args[0].value, d.args[1].value
    return None


def _value(node, consts):
    """A parametrize list: a literal, a module constant, or sorted(CONST) / sorted(CONST.items())."""
    if isinstance(node, ast.Name):
        return consts.get(node.id)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "sorted" and node.args:
        inner = node.args[0]
        if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute) and inner.func.attr == "items":
            v = _value(inner.func.value, consts)
            return sorted(v.items()) if isinstance(v, dict) else sorted(v or [])
        v = _value(inner, consts)
        return sorted(v or [])
    try:
        return ast.literal_eval(node)
    except ValueError:
        return []


def _params(fn, consts):
    """Sub-cases of a parametrized test: one per value, numbered in order."""
    for d in fn.decorator_list:
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "parametrize":
            src = d.args[1]
            values = _value(src, consts)
            return [(f"{v[1]} ({v[0]})" if v[1] else str(v[0])) if isinstance(v, (list, tuple)) else str(v) for v in values or []]
    return []


def collect():
    groups = []
    for label, folder, rel in SUITES:
        rows = []
        for f in sorted(folder.glob("test_*.py")):
            text = f.read_text()
            tree = ast.parse(text)
            lines = text.split("\n")
            consts = {}
            for node in tree.body:
                if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                    try:
                        consts[node.targets[0].id] = ast.literal_eval(node.value)
                    except ValueError:
                        if isinstance(node.value, ast.Dict):        # a dict whose values are expressions: its keys are enough
                            try:
                                consts[node.targets[0].id] = {ast.literal_eval(k): None for k in node.value.keys}
                            except ValueError:
                                pass
            for fn in [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name.startswith("test_")]:
                tc = _tc(fn)
                if not tc:
                    raise SystemExit(f"{rel}/{f.name}::{fn.name} has no @pytest.mark.tc")
                local = any(isinstance(d, ast.Name) and d.id == "local_only" for d in fn.decorator_list)
                subs = [SUB.search(l).groups() for l in lines[fn.lineno - 1: fn.end_lineno] if SUB.search(l)]
                subs += [(f"{tc[0]}.{i}", p) for i, p in enumerate(_params(fn, consts), 1)]
                rows.append({"id": tc[0], "title": tc[1], "suites": _suites(fn), "where": f"{rel}/{f.name}::{fn.name}",
                             "local": local, "subs": subs})
        rows.sort(key=lambda r: r["id"])
        groups.append((label, rows))
    return groups


def endpoints() -> list[tuple[str, str, str]]:
    """Every API endpoint (method, path, summary), read from the app itself."""
    import os
    import tempfile
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.gettempdir()}/prangan-endpoints.db")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import app
    out = []
    for path, ops in app.openapi()["paths"].items():
        for m, op in ops.items():
            if m in ("get", "post", "put", "delete", "patch"):
                out.append((m.upper(), path, (op.get("summary") or "").strip()))
    return sorted(out, key=lambda x: (x[1], x[0]))


def render(groups) -> str:
    all_rows = [r for _, rows in groups for r in rows]
    n_sub = sum(len(r["subs"]) for r in all_rows)
    count = lambda s: sum(1 for r in all_rows if s in r["suites"])  # noqa: E731
    out = ["# Prangan — test cases", "",
           "Generated by `python tools/test_cases.py` from the tests themselves (API, portal, app) — do not edit by hand.", "",
           "**How to read it.** Each Playwright test is one test case (for example `TC-P-008`). When one test covers several",
           "checks, each check is a sub-case (`TC-P-008.1`, `TC-P-008.2`, …): it is marked with a comment where that check starts in",
           "the test, and it is executed whenever its parent test runs.", "",
           "**Suites.** Smoke: the product starts, people sign in and the main pages open. Sanity: the main happy path of each",
           "module. Regression: everything (every test is in it).", "",
           "**Run.** API: `python -m pytest -m smoke` in `backend/`; browser: `python -m pytest e2e -m smoke` in `portal/` or `mobile/`",
           "(or `-m sanity`, `-m regression`); `--tc TC-P-008` runs one case. Every run ends with the list of cases executed and their",
           "result. In the API suite every endpoint must also get a successful call from some test (CI fails otherwise).",
           "On TEST, the workflow *QA browser tests* runs the whole portal suite after every release to `test`; *Checks* runs both",
           "suites on every push to `dev`.", "",
           "## Summary", "",
           "| | Count |", "|---|---|",
           f"| Automated test cases | {len(all_rows)} |",
           *[f"| — {label.split(' (')[0]} | {len(rows)} |" for label, rows in groups],
           f"| Automated sub-cases inside them | {n_sub} |",
           f"| Smoke | {count('Smoke')} |", f"| Sanity | {count('Sanity')} |", f"| Regression | {count('Regression')} |",
           f"| Not automated yet | {len(MANUAL)} |",
           f"| **Total cases in this list** | **{len(all_rows) + n_sub + len(MANUAL)}** |", ""]
    for label, rows in groups:
        out += [f"## {label}", "", "| TC No. | Test case | Suite | Automation status | Playwright test |", "|---|---|---|---|---|"]
        for r in rows:
            status = "Automated — local runs only (skipped on TEST)" if r["local"] else "Automated"
            out.append(f"| **{r['id']}** | **{r['title']}** | {', '.join(r['suites'])} | {status} | `{r['where']}` |")
            for sid, text in r["subs"]:
                out.append(f"| {sid} | ↳ {text} | {', '.join(r['suites'])} | {status} (in {r['id']}) | ″ |")
        out.append("")
    out += ["## Not automated yet", "",
            "| TC No. | Test case | Suite | Automation status | Note |", "|---|---|---|---|---|"]
    for tc, title, suite, note in MANUAL:
        out.append(f"| {tc} | {title} | {suite} | Not automated | {note} |")
    eps = endpoints()
    out += ["", "## API endpoints", "",
            f"All {len(eps)} endpoints. Every one is called successfully by at least one API test, and every one is also called by",
            "every kind of user (signed out, student, parent, teacher, coordinator, vice principal, another school's principal,",
            "admin) in TC-B-128…137, which check that nobody gets in where they shouldn't and that nothing crashes. The API suite",
            "fails in CI if an endpoint has no successful call (`API_ROUTE_GATE=1`).", "",
            "| # | Method | Endpoint | Status |", "|---|---|---|---|"]
    for i, (m, p, _) in enumerate(eps, 1):
        out.append(f"| {i} | {m} | `{p}` | Covered by API tests |")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    doc = render(collect())
    target = ROOT / "docs/test-cases.md"
    if "--check" in sys.argv:
        if not target.exists() or target.read_text() != doc:
            raise SystemExit("docs/test-cases.md is out of date — run: python tools/test_cases.py")
        print("docs/test-cases.md is up to date")
    else:
        target.write_text(doc)
        print(f"wrote {target.relative_to(ROOT)}")

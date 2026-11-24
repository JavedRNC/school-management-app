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
SUITES = [("Portal (web, Admin + Principal)", ROOT / "portal/e2e", "portal/e2e"), ("Android app (web build, Chalk look)", ROOT / "mobile/e2e", "mobile/e2e")]
SUB = re.compile(r"#\s*(TC-[A-Z]+-\d+\.\d+)\s+—\s+(.*)$")

# Cases without a Playwright test (yet). The server side of most of them is covered by the API tests in backend/tests.
MANUAL = [
    ("TC-M-001", "Student app: home, attendance ring, results, timetable, homework, notices", "Regression", "API tests only"),
    ("TC-M-002", "Parent app: consent at first sign-in, switching between children, fees and UPI payment claim", "Regression", "API tests only"),
    ("TC-M-003", "Parent app: leave request for a child", "Regression", "API tests only"),
    ("TC-M-004", "Teacher app: homework and notices, own leave request, GPS check-in / check-out", "Regression", "API tests only"),
    ("TC-M-005", "Teacher / VP / Coordinator app: My payslips", "Regression", "API tests only"),
    ("TC-M-006", "Principal app: people, classes, notices, fees, payroll screens (the portal versions are automated)", "Regression", "API tests only"),
    ("TC-M-007", "Vice Principal and Coordinator app with limited rights and class scope", "Regression", "API tests only"),
    ("TC-M-008", "Register and Marigold Night themes: colours, fonts, P/A register rows, grid by default", "Regression", "Not automated"),
    ("TC-M-009", "Push notifications reach an Android phone", "Regression", "Not automated"),
    ("TC-M-010", "App update prompt when the build is older than the oldest allowed build", "Sanity", "API tests only"),
    ("TC-M-011", "APK installs on a phone; Test and Prod apps install side by side", "Smoke", "Not automated"),
    ("TC-M-012", "Excel Replace-import with the automatic undo backup (recovery drill on TEST)", "Regression", "API tests only"),
    ("TC-M-013", "Public website pages and the school listing", "Regression", "Not automated"),
]


def _suites(fn) -> list[str]:
    names = {d.attr for d in fn.decorator_list if isinstance(d, ast.Attribute)}
    return [s.title() for s in ("smoke", "sanity", "regression") if s in names]


def _tc(fn):
    for d in fn.decorator_list:
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "tc":
            return d.args[0].value, d.args[1].value
    return None


def _params(fn, consts):
    """Sub-cases of a parametrized test: one per value, numbered in order."""
    for d in fn.decorator_list:
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "parametrize":
            src = d.args[1]
            values = consts.get(src.id) if isinstance(src, ast.Name) else ast.literal_eval(src)
            return [f"{v[1]} ({v[0]})" if isinstance(v, (list, tuple)) else str(v) for v in values or []]
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


def render(groups) -> str:
    all_rows = [r for _, rows in groups for r in rows]
    n_sub = sum(len(r["subs"]) for r in all_rows)
    count = lambda s: sum(1 for r in all_rows if s in r["suites"])  # noqa: E731
    out = ["# Prangan — test cases", "",
           "Generated by `python tools/test_cases.py` from the Playwright tests — do not edit by hand.", "",
           "**How to read it.** Each Playwright test is one test case (for example `TC-P-008`). When one test covers several",
           "checks, each check is a sub-case (`TC-P-008.1`, `TC-P-008.2`, …): it is marked with a comment where that check starts in",
           "the test, and it is executed whenever its parent test runs.", "",
           "**Suites.** Smoke: the product starts, people sign in and the main pages open. Sanity: the main happy path of each",
           "module. Regression: everything (every test is in it).", "",
           "**Run.** `python -m pytest e2e -m smoke` (or `-m sanity`, `-m regression`) in `portal/` or `mobile/`;",
           "`python -m pytest e2e --tc TC-P-008` runs one case. Every run ends with the list of test cases executed and their result.",
           "On TEST, the workflow *QA browser tests* runs the whole portal suite after every release to `test`; *Checks* runs both",
           "suites on every push to `dev`.", "",
           "## Summary", "",
           "| | Count |", "|---|---|",
           f"| Automated test cases | {len(all_rows)} |",
           f"| Automated sub-cases inside them | {n_sub} |",
           f"| Smoke | {count('Smoke')} |", f"| Sanity | {count('Sanity')} |", f"| Regression | {count('Regression')} |",
           f"| Not automated in Playwright yet | {len(MANUAL)} |", ""]
    for label, rows in groups:
        out += [f"## {label}", "", "| TC No. | Test case | Suite | Automation status | Playwright test |", "|---|---|---|---|---|"]
        for r in rows:
            status = "Automated — local runs only (skipped on TEST)" if r["local"] else "Automated"
            out.append(f"| **{r['id']}** | **{r['title']}** | {', '.join(r['suites'])} | {status} | `{r['where']}` |")
            for sid, text in r["subs"]:
                out.append(f"| {sid} | ↳ {text} | {', '.join(r['suites'])} | {status} (in {r['id']}) | ″ |")
        out.append("")
    out += ["## Not automated in Playwright yet", "",
            "| TC No. | Test case | Suite | Automation status | Note |", "|---|---|---|---|---|"]
    for tc, title, suite, note in MANUAL:
        out.append(f"| {tc} | {title} | {suite} | Not automated | {note} |")
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

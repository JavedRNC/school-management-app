"""Stress test, step 3: take the stress school out of use again.

    STRESS_API_URL=https://… STRESS_ADMIN_PASSWORD=… python tools/stress/cleanup.py

Archives every person in the stress school except the principal (they can no longer sign in), and suspends the school,
which also ends every session still open. Prangan has no "delete a school" action, so the empty, suspended school
itself stays (one row on the admin's school list, marked Stress Test School); the next run uses it again.
Safe to run more than once, and also after a run that stopped half-way.
"""
import time
from concurrent.futures import ThreadPoolExecutor

from common import SCHOOL_CODE, admin_token, call, ok, principal_session, wait_awake


def admin_when_calm(minutes=20):
    """Right after a rush the server is still working through requests people gave up on, and answers "busy".
    Waits until the admin can sign in, and says how long the server needed to be usable again."""
    t0, last = time.time(), None
    while time.time() - t0 < minutes * 60:
        try:
            at = admin_token()
            print(f"server usable again after {time.time() - t0:.0f}s", flush=True)
            return at
        except SystemExit as e:              # 503 busy, or a timeout: try again shortly
            last = e
            time.sleep(15)
    raise SystemExit(f"server still busy after {minutes} min: {last}")


def main():
    wait_awake()
    at = admin_when_calm()
    found = [s for s in ok(call("GET", "/admin/schools", at)) if s["code"] == SCHOOL_CODE]
    if not found:
        print("no stress school: nothing to clean")
        return
    sid = found[0]["id"]
    ok(call("PUT", f"/admin/schools/{sid}", at, {"suspended": False}))        # the principal must be able to act
    pt, _ = principal_session(at, sid)
    left = []
    for role in ("student", "parent", "teacher", "coordinator", "vice_principal"):
        s, rows = call("GET", "/users", pt, query={"role": role})
        left += rows if s == 200 and isinstance(rows, list) else []
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda u: call("DELETE", f"/users/{u['id']}", pt)[0], left))
    bad = sum(1 for r in res if r != 200)
    ok(call("PUT", f"/admin/schools/{sid}", at, {"suspended": True, "admin_notes": "Stress test school — suspended between runs"}), "suspend")
    print(f"archived {len(left) - bad} people ({bad} failed), school {SCHOOL_CODE} suspended")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

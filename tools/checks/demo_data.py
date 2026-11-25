"""Counts what DEV and TEST hold after a fresh start: signs in to the demo school DEMO01 (public demo password) and lists
its people, and checks that the old stress school is gone. Read-only.

    python tools/checks/demo_data.py https://prangan-api-dev.onrender.com https://prangan-api-test.onrender.com
"""
import json
import sys
import time
import urllib.error
import urllib.request


def call(api, method, path, token=None, body=None):
    req = urllib.request.Request(api + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


bad = 0
for api in sys.argv[1:]:
    for _ in range(40):
        s, root = call(api, "GET", "/")
        if s == 200:
            break
        time.sleep(15)
    s, d = call(api, "POST", "/auth/login", body={"school_code": "DEMO01", "login_id": "principal", "password": "demo123", "client": "web"})
    if s != 200:
        print(f"{api}: DEMO01 sign-in failed {s} {d}")
        bad += 1
        continue
    t = d["token"]
    counts = {}
    for role in ("student", "parent", "teacher", "vice_principal", "coordinator"):
        s, rows = call(api, "GET", f"/users?role={role}", t)
        counts[role] = len(rows) if s == 200 and isinstance(rows, list) else f"error {s}"
    stress = call(api, "POST", "/auth/login", body={"school_code": "STRESS1", "login_id": "principal", "password": "x"})[0]
    total = sum(v for v in counts.values() if isinstance(v, int)) + 1
    print(f"{api} ({root.get('env')}, {root.get('version')}): DEMO01 has {total} people {counts}; STRESS1 sign-in → {stress}")
    bad += total < 500
sys.exit(1 if bad else 0)

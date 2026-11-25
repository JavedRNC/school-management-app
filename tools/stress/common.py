"""Shared helpers for the stress test: talking to the API, and the one school the test uses.

The test never touches real or demo schools. It works only inside the school with code STRESS1, which it creates the first
time. Each run adds its own 1500 people (login IDs carry the run number), and cleanup.py archives them and suspends the
school again, so nobody can sign in to it between runs.
"""
import io
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = (os.getenv("STRESS_API_URL") or "http://127.0.0.1:8765").rstrip("/")
ADMIN_PW = os.getenv("STRESS_ADMIN_PASSWORD", "")
SCHOOL_CODE = "STRESS1"
RUN = int(os.getenv("STRESS_RUN", str(int(time.time()) % 1000))) % 1000
STATE = os.getenv("STRESS_STATE", "stress-state.json")        # accounts and tokens for this run; never uploaded anywhere
TODAY = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()   # school days are in Indian time

# The school's size: 20 classes of 36 = 720 students, one parent each, 59 teachers and the principal = 1500 people.
CLASSES = [f"{g}-{s}" for g in range(1, 11) for s in "AB"]
PER_CLASS = 36
TEACHERS = 59
SUBJECTS = ["English", "Hindi", "Maths", "Science", "Social Science", "Computer"]


def password() -> str:
    return "Pw#" + secrets.token_urlsafe(9) + "7a"


def call(method, path, token=None, body=None, query=None, timeout=120, files=None):
    """Returns (status, json). Network errors come back as status 0."""
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    headers = {**({"Authorization": f"Bearer {token}"} if token else {})}
    data = None
    if files is not None:
        boundary = "----stress" + secrets.token_hex(8)
        parts = []
        for k, v in (body or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (name, content) in files.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\n'
                         f"Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n".encode() + content + b"\r\n")
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except ValueError:
            return e.code, raw[:300]
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def ok(result, what=""):
    status, data = result
    if not 200 <= status < 300:
        raise SystemExit(f"{what or 'API call'} failed: {status} {data}")
    return data


def login(code, login_id, pw, web=False):
    return call("POST", "/auth/login", body={"school_code": code, "login_id": login_id, "password": pw, **({"client": "web"} if web else {})})


def wait_awake(seconds=300):
    end = time.time() + seconds
    while time.time() < end:
        s, _ = call("GET", "/", timeout=15)
        if s:
            return
        time.sleep(3)
    raise SystemExit(f"{API} did not answer within {seconds}s")


def admin_token() -> str:
    local = "127.0.0.1" in API
    keep = STATE + ".admin"                    # local rehearsal only: the admin password chosen on the first run
    pw = ADMIN_PW or (open(keep).read() if local and os.path.exists(keep) else "")
    s, d = login("ADMIN", "admin", pw, web=True) if pw else (0, None)
    if s != 200 and local:                     # a fresh local server: the admin still has the start-up password
        pw = "Admin#" + secrets.token_hex(6)
        first = ok(login("ADMIN", "admin", "admin123", web=True), "local admin sign-in")
        ok(call("POST", "/auth/password", first["token"], {"old_password": "admin123", "new_password": pw}))
        with open(keep, "w") as f:
            f.write(pw)
        s, d = login("ADMIN", "admin", pw, web=True)
    if s != 200:
        raise SystemExit(f"Admin sign-in failed ({s}). Set STRESS_ADMIN_PASSWORD. {d}")
    return d["token"]


def stress_school(t: str) -> int:
    """The test's own school: created once, then made usable (not suspended, free, every module, every day a school day)."""
    plans = ok(call("GET", "/admin/plans", t))
    best = max(plans, key=lambda p: len(p["modules"]))
    found = [s for s in ok(call("GET", "/admin/schools", t)) if s["code"] == SCHOOL_CODE]
    if found:
        sid = found[0]["id"]
    else:
        sid = ok(call("POST", "/admin/schools", t, {"code": SCHOOL_CODE, "name": "Stress Test School", "address": "Load test only",
                                                    "board": "CBSE", "plan_id": best["id"], "principal_name": "Stress Principal",
                                                    "principal_login_id": "principal", "principal_password": "Start#" + secrets.token_hex(6)}),
                 "create the stress school")["id"]
    ok(call("PUT", f"/admin/schools/{sid}", t, {"name": "Stress Test School", "plan_id": best["id"], "use_plan_modules": True,
                                                 "clear_custom_price": True, "is_free": True, "free_until": None, "suspended": False,
                                                 "max_students": None, "admin_notes": f"stress-run {RUN} {int(time.time())}"}), "prepare the stress school")
    return sid


def principal_session(t: str, sid: int) -> tuple[str, str]:
    """Admin resets the stress school's principal; the principal picks this run's password. Returns (token, password)."""
    p = ok(call("GET", f"/admin/schools/{sid}/users", t, query={"role": "principal"}))[0]
    temp, pw = "Temp#" + secrets.token_hex(6), password()
    ok(call("PUT", f"/admin/schools/{sid}/users/{p['id']}", t, {"password": temp, "active": True}))
    first = ok(login(SCHOOL_CODE, "principal", temp, web=True), "principal sign-in")
    ok(call("POST", "/auth/password", first["token"], {"old_password": temp, "new_password": pw}), "principal password")
    return ok(login(SCHOOL_CODE, "principal", pw, web=True))["token"], pw


def ids(i: int) -> dict:
    """Login IDs for this run (so earlier runs' archived people never clash)."""
    return {"student": f"S{RUN:03d}{i:04d}", "parent": f"6{RUN:03d}{i:06d}", "teacher": f"T{RUN:03d}{i:03d}"}


def workbook() -> bytes:
    """The school's people and set-up as an import file, in the same format the principal's Excel template uses."""
    from openpyxl import Workbook

    wb = Workbook()
    wb.remove(wb.active)

    def sheet(name, headers, rows):
        ws = wb.create_sheet(name)
        ws.append(headers)
        for r in rows:
            ws.append(r)

    teachers = [ids(i)["teacher"] for i in range(TEACHERS)]
    sheet("Classes", ["Class", "Class teacher (employee code)", "Monthly fee ₹ (blank = school fee)", "Active"],
          [[c, teachers[i], 1200 + 100 * (i // 2), "Yes"] for i, c in enumerate(CLASSES)])
    sheet("Subjects", ["Subject", "Active"], [[s, "Yes"] for s in SUBJECTS])
    sheet("Staff", ["Employee code", "Name", "Role", "Phone", "Email", "Address", "Date of birth", "Blood group", "Coordinator's classes", "Active"],
          [[code, f"Teacher {i + 1}", "Teacher", "", "", "", "", "", "", "Yes"] for i, code in enumerate(teachers)])
    rows, n = [], 0
    for c in CLASSES:
        for roll in range(1, PER_CLASS + 1):
            k = ids(n)
            rows.append([k["student"], f"Student {n + 1}", c, roll, "", "", "", "", f"Parent {n + 1}", k["parent"], "Father", "Yes"])
            n += 1
    sheet("Students", ["Admission no.", "Name", "Class", "Roll no.", "Date of birth", "Blood group", "Phone", "Address", "Parent name",
                       "Parent mobile", "Relation", "Active"], rows)
    # every class: 6 subjects, taught by the class teacher and the 39 subject teachers in turn
    teach, k = [], 0
    for i, c in enumerate(CLASSES):
        for j, s in enumerate(SUBJECTS):
            who = teachers[i] if j == 0 else teachers[len(CLASSES) + (k % (TEACHERS - len(CLASSES)))]
            k += j > 0
            teach.append([c, s, who])
    sheet("Teaching", ["Class", "Subject", "Teacher (employee code)"], teach)
    times = [("Period", "1", "08:00", "08:40"), ("Period", "2", "08:40", "09:20"), ("Period", "3", "09:20", "10:00"),
             ("Break", "Lunch", "10:00", "10:30"), ("Period", "4", "10:30", "11:10"), ("Period", "5", "11:10", "11:50"),
             ("Period", "6", "11:50", "12:30")]
    sheet("Period timings", ["Day", "Type", "Label", "Start (HH:MM)", "End (HH:MM)"], [["All days", *t] for t in times])
    who = {(c, s): t for c, s, t in teach}
    sheet("Timetable", ["Class", "Day", "Period", "Subject", "Teacher (employee code)"],
          [[c, d, p, SUBJECTS[(p + di) % 6], who[(c, SUBJECTS[(p + di) % 6])]]
           for c in CLASSES for di, d in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) for p in range(1, 7)])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def save_state(state: dict) -> None:
    with open(STATE, "w") as f:
        json.dump(state, f)
    os.chmod(STATE, 0o600)


def load_state() -> dict:
    with open(STATE) as f:
        return json.load(f)

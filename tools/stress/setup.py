"""Stress test, step 1: build a 1500-person school on the server and sign everyone in once.

    STRESS_API_URL=https://… STRESS_ADMIN_PASSWORD=… python tools/stress/setup.py

New accounts get temporary passwords, so each person signs in and chooses a password, exactly like a school's first
day on Prangan. That part is timed and reported ("first day": everyone signing in for the first time).
Leaves stress-state.json (the accounts and their sessions) for the rush test. It holds passwords: it is never uploaded.
"""
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from common import (CLASSES, RUN, SCHOOL_CODE, SUBJECTS, TODAY, admin_token, call, login, ok, password, principal_session,
                    save_state, stress_school, wait_awake, workbook)

FIRST_DAY_WORKERS = int(sys.argv[1]) if len(sys.argv) > 1 else 10


def main():
    t0 = time.time()
    wait_awake()
    at = admin_token()
    sid = stress_school(at)
    pt, ppw = principal_session(at, sid)
    ok(call("PUT", "/school/settings", pt, {"working_days": [0, 1, 2, 3, 4, 5, 6], "share_contact_with_admin": False}), "school days")

    print(f"run {RUN}: importing 1499 people into {SCHOOL_CODE} …", flush=True)
    t = time.time()
    rep = ok(call("POST", "/data/import", pt, body={"mode": "merge", "confirm": "true"}, files={"file": ("stress.xlsx", workbook())}, timeout=600), "import")
    if not rep.get("saved"):
        raise SystemExit(f"import refused: {[i for s in rep.get('sheets', []) for i in s.get('issues', [])][:10] or rep}")
    creds = rep["credentials"]
    import_s = time.time() - t
    print(f"  imported in {import_s:.0f}s, {len(creds)} new accounts", flush=True)

    # what the people will look at during the rush: notices, an exam, this month's fees
    for i in range(8):
        ok(call("POST", "/posts", pt, {"kind": "notice", "title": f"Notice {i + 1}", "body": "Stress test notice. " * 20}), "notice")
    exam = ok(call("POST", "/exams", pt, {"name": f"Unit test {RUN}", "date": TODAY.isoformat(), "max_marks": 50}), "exam")
    call("POST", "/fees/generate", pt, {"period": TODAY.strftime("%Y-%m")})       # best effort: fees may need more set-up

    classes = {c["name"]: c for c in ok(call("GET", "/classes", pt))}
    subjects = {s["name"]: s["id"] for s in ok(call("GET", "/subjects", pt))}
    assigns = ok(call("GET", "/assignments", pt))

    # first day: everyone signs in with the temporary password and chooses their own
    timings, failed = [], []

    def first(c):
        new = password()
        a = time.time()
        s1, d1 = login(SCHOOL_CODE, c["login_id"], c["password"])
        if s1 != 200:
            failed.append((c["login_id"], s1, str(d1)[:120]))
            return None
        s2, d2 = call("POST", "/auth/password", d1["token"], {"old_password": c["password"], "new_password": new})
        if s2 != 200:
            failed.append((c["login_id"], s2, str(d2)[:120]))
            return None
        timings.append(time.time() - a)
        return {"login_id": c["login_id"], "role": c["role"], "password": new, "token": d2["token"], "id": d2["id"],
                "class_id": d2.get("class_id")}

    print(f"first day: {len(creds)} people sign in and choose a password ({FIRST_DAY_WORKERS} at a time) …", flush=True)
    t = time.time()
    with ThreadPoolExecutor(FIRST_DAY_WORKERS) as ex:
        people = [p for p in ex.map(first, creds) if p]
    first_s = time.time() - t
    q = statistics.quantiles(timings, n=20) if len(timings) > 20 else [0] * 19
    first_day = {"people": len(creds), "ok": len(people), "failed": len(failed), "seconds": round(first_s),
                 "per_minute": round(len(people) / first_s * 60) if first_s else 0, "median_s": round(statistics.median(timings), 2) if timings else None,
                 "p95_s": round(q[18], 2), "workers": FIRST_DAY_WORKERS, "errors": failed[:10]}
    print(f"  {first_day}", flush=True)

    lead = {c["class_teacher_id"]: c["id"] for c in classes.values() if c.get("class_teacher_id")}
    teaches = {}
    for a in assigns:
        teaches.setdefault(a["teacher_id"], []).append({"class_id": a["class_id"], "subject_id": a["subject_id"]})
    for p in people:
        if p["role"] == "teacher":
            p["lead_class"] = lead.get(p["id"])
            p["teaches"] = teaches.get(p["id"], [])
    save_state({"run": RUN, "school_id": sid, "principal": {"login_id": "principal", "password": ppw, "token": pt, "role": "principal"},
                "people": people, "exam_id": exam["id"], "classes": [c["id"] for c in classes.values()], "subjects": subjects,
                "import_s": round(import_s), "first_day": first_day, "setup_s": round(time.time() - t0),
                "sizes": {"classes": len(CLASSES), "subjects": len(SUBJECTS)}})
    if len(people) < len(creds) * 0.9:
        raise SystemExit(f"only {len(people)} of {len(creds)} people could sign in — the rush test needs them")


if __name__ == "__main__":
    main()

"""Stress test, step 2: the morning rush. Every one of the 1500 people opens the app within a few minutes and uses it
the way they do on a school morning. Uses the accounts setup.py signed in.

    locust -f tools/stress/locustfile.py --headless -u 1500 -r 3 -t 12m --host https://…

Each person opens the app (who am I, school, banners, polls), then every 15–45 seconds looks at something:
students and parents their home (attendance, marks, notices, homework, timetable, holidays, fees, bus), teachers their
timetable and classes, class teachers take today's attendance once, subject teachers enter one class's marks once, the
principal watches the dashboard. A few people (about 3 in 100 actions) sign in again, as when a session ends or a phone
is changed — signing in is the most expensive thing the server does, because passwords are checked with bcrypt.
"""
import itertools
import random
import threading

from locust import HttpUser, between, events, task

from common import SCHOOL_CODE, TODAY, load_state

STATE = load_state()
ACCOUNTS = [STATE["principal"], *STATE["people"]]
random.Random(7).shuffle(ACCOUNTS)            # students, parents and teachers arrive mixed, as in a real morning
_next = itertools.cycle(ACCOUNTS)
_lock = threading.Lock()
MONTH = (TODAY.replace(day=1).isoformat(), (TODAY.replace(day=28)).isoformat())
TIMEOUT = 30                                  # a person gives up after about 30 seconds


@events.init_command_line_parser.add_listener
def _(parser):
    parser.add_argument("--relogin", type=float, default=0.03, help="share of actions that are a fresh sign-in")


class Person(HttpUser):
    wait_time = between(15, 45)

    def on_start(self):
        with _lock:
            self.me = dict(next(_next))
        self.child = None
        self.marked = False
        self.entered = False
        self.open_app()

    # ------------------------------------------------------------------ helpers
    def get(self, path, name=None, **params):
        with self.client.get(path, params=params or None, name=name or path, timeout=TIMEOUT,
                             headers={"Authorization": f"Bearer {self.me['token']}"}, catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"{r.status_code}")
            return r.json() if r.status_code == 200 else None

    def send(self, method, path, body, name=None):
        with self.client.request(method, path, json=body, name=name or path, timeout=TIMEOUT,
                                 headers={"Authorization": f"Bearer {self.me['token']}"}, catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"{r.status_code} {r.text[:80]}")
            return r.status_code == 200

    def kid(self):
        return {"student_id": self.child} if self.child else {}

    def open_app(self):
        self.get("/auth/me")
        self.get("/school/me")
        if self.me["role"] != "principal":
            self.get("/banners/active")
            self.get("/polls")
        if self.me["role"] == "parent":
            kids = self.get("/me/children") or []
            self.child = kids[0]["id"] if kids else None

    # ------------------------------------------------------------------ what people do
    @task
    def act(self):
        if random.random() < self.environment.parsed_options.relogin:
            return self.sign_in_again()
        role = self.me["role"]
        if role in ("student", "parent"):
            return self.family()
        if role == "teacher":
            return self.teacher()
        return self.get("/dashboard")

    def sign_in_again(self):
        with self.client.post("/auth/login", json={"school_code": SCHOOL_CODE, "login_id": self.me["login_id"], "password": self.me["password"]},
                              name="/auth/login", timeout=TIMEOUT, catch_response=True) as r:
            if r.status_code == 200:
                self.me["token"] = r.json()["token"]
            else:
                r.failure(f"{r.status_code}")
        if r.status_code == 200:
            self.open_app()

    def family(self):
        k = self.kid()
        random.choice([
            lambda: (self.get("/me/attendance", **k), self.get("/me/marks", **k), self.get("/posts", name="/posts (notices)", kind="notice", **k)),
            lambda: self.get("/posts", name="/posts (homework)", kind="homework", **k),
            lambda: self.get("/timetable", **k),
            lambda: self.get("/me/marks", **k),
            lambda: self.get("/fees/me", **k),
            lambda: self.get("/holidays", start=MONTH[0], end=MONTH[1]),
            lambda: self.get("/transport/me", **k),
        ])()

    def teacher(self):
        lead = self.me.get("lead_class")
        if lead and not self.marked:
            sheet = self.get("/attendance", class_id=lead, day=TODAY.isoformat())
            if sheet:
                rows = sheet.get("rows") or sheet.get("students") or []
                recs = [{"student_id": r["student_id"], "present": random.random() > 0.08} for r in rows]
                self.marked = self.send("POST", "/attendance", {"class_id": lead, "date": TODAY.isoformat(), "records": recs})
            return
        teaches = self.me.get("teaches") or []
        if teaches and not self.entered and random.random() < 0.4:
            t = random.choice(teaches)
            q = {"exam_id": STATE["exam_id"], "class_id": t["class_id"], "subject_id": t["subject_id"]}
            rows = self.get("/marks", **q)
            if rows:
                self.entered = self.send("POST", "/marks", {**q, "records": [{"student_id": r["student_id"], "score": random.randint(10, 50)} for r in rows]})
            return
        random.choice([
            lambda: self.get("/timetable"),
            lambda: (self.get("/classes"), self.get("/assignments")),
            lambda: self.get("/staff-attendance/me"),
            lambda: self.get("/posts", name="/posts (notices)", kind="notice"),
            lambda: self.get("/leaves/today"),
        ])()

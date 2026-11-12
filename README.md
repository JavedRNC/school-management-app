# Prangan — School Management Platform

One Android app (React Native / Expo) + Python API (FastAPI) for **many schools**. Each school signs in with its own **school code**; the platform owner manages everything as **Super Admin**.

| Role | Can do |
|---|---|
| Super Admin | Add schools & principals, plans and modules, subscriptions (free/sponsored, trials, payments), manage any school's people (contact details masked unless the school shares them), audit log |
| Principal | Insights dashboard, people (students, teachers, parents, staff roles), classes, subjects, timetable, exams, notices, school calendar, working days, archive, privacy & audit, plan |
| Vice Principal / Coordinator | Principal screens limited by permission areas (coordinators can be limited to some classes) |
| Teacher | Today's timetable, attendance (class teacher: required; others: optional), marks, homework & notices |
| Student | Attendance, report cards, timetable, homework, notices, calendar |
| Parent | Same as student for each linked child (child switcher), privacy consent on first login |

## Project layout
```
backend/     FastAPI + SQLAlchemy (SQLite locally, Postgres in prod), JWT auth, bcrypt passwords
mobile/      Expo SDK 58, Expo Router (src/app), TypeScript, React Native Paper (Material 3)
render.yaml  deploy config for the API on Render
features.md  feature backlog & decisions
context.md   compact project state for resuming work
```

## Demo logins
| Who | School code | Login ID | Password |
|---|---|---|---|
| Principal | `DEMO01` | `principal` | `demo123` |
| Vice Principal / Coordinator | `DEMO01` | `vp` / `coord` | `demo123` |
| Teacher | `DEMO01` | `T001` … `T005` | `demo123` |
| Student | `DEMO01` | `2026001` … `2026024` | `demo123` |
| Parent (2 children) | `DEMO01` | `9876500001` | `demo123` |
| Second school (Sun–Thu week) | `DEMO02` | `principal`, `T001`, `S001` | `demo123` |
| Super Admin | `ADMIN` | `admin` | `admin123` → must be changed at first login (or set `ADMIN_PASSWORD`) |

Demo data loads automatically on an empty database. Set `SEED_DEMO=0` to start empty (only the Super Admin is created).

## Run the API
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # docs at /docs
pytest -q                                                   # tests
```
Env vars: `DATABASE_URL` (default SQLite), `JWT_SECRET` (≥32 random characters; if missing the server makes one and keeps it in the database) (long random text), `SCHOOL_TZ` (default Asia/Kolkata), `SEED_DEMO`, `ADMIN_LOGIN_ID` / `ADMIN_PASSWORD` (Super Admin bootstrap), `ALLOW_SCHEMA_RESET`, `ADMIN_RESET_PASSWORD` (recovery: resets the admin password and unlocks it on restart — remove it right after logging in) (default 1; resets only the old single-school demo schema).

## Deploy (free): Neon database + Render API
Everything below works from a phone browser.

1. **Database — Neon** (free Postgres, doesn't expire): sign up at neon.com → *Create project* (region: Singapore/Mumbai if offered) → copy the **connection string** (`postgresql://…?sslmode=require`).
2. **API — Render:** render.com → *New* → *Blueprint* → pick this repo. Render reads `render.yaml` and asks for `DATABASE_URL` → paste the Neon string → *Apply*.
3. On first start the API creates all tables and loads demo data. Open `https://<your-service>.onrender.com/docs` to check it's live.
4. In the app's login screen → *Server settings* → paste the Render URL.

Notes: the free Render server sleeps after ~15 min idle (first request can take up to a minute); Neon suspends after 5 min idle (adds a second or two). Before using real school data, set `SEED_DEMO=0` and use fresh accounts. Without `DATABASE_URL` the API falls back to a local SQLite file, which is fine for testing but is wiped on Render redeploys.

Tests run on SQLite by default; to test against Postgres: `TEST_DATABASE_URL=postgresql://… pytest -q` (resets that database).

## Run the app
```bash
cd mobile
npm install
npx expo start
```
Open in **Expo Go** (Android/iPhone). Phone-only setup with live reload: see [docs/termux.md](docs/termux.md).

## Environments
| | PROD (live schools) | DEV (testing) |
|---|---|---|
| Git branch | `main` | `dev` |
| Server (Render) | `school-api` | `prangan-api-dev` |
| Database (Neon) | live database | separate test database, demo data only |
| App | **Prangan** (`latest-apk` release, website download) | **Prangan Dev** (`dev-apk` release), installs next to the real app |

Changes go to `dev` first. After testing in Prangan Dev they are released by merging `dev` into `main`.
The test server address is kept in `mobile/dev.json`.


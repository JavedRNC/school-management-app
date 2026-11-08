# School Hub — School Management App

Android app (React Native / Expo) + Python API (FastAPI) for **Principal, Teachers and Students**.

| Role | Can do |
|---|---|
| Principal | Analytics dashboard, add teachers/students, classes & subjects, assign subject teachers, edit timetable, create exams, school-wide notices |
| Teacher | Today's timetable, mark attendance (class or subject classes), enter exam marks, post homework & class notices |
| Student | Attendance % and recent days, report card per exam, timetable, homework, notices |

**Principal dashboard:** students/teachers/classes counts, today's attendance (overall + by class, unmarked classes), 30-day attendance trend, students below 75%, average by class and subject, pass rate, top/bottom 5, and an at-risk list (low attendance or low marks).

## Project layout
```
backend/   FastAPI + SQLAlchemy (SQLite locally, Postgres in prod), JWT auth
mobile/    Expo SDK 58, Expo Router (src/app), TypeScript
render.yaml  one-click deploy of the API on Render
context.md   compact project state for resuming work
```

## Demo accounts (password `demo123`)
`principal@school.com` · teachers `anita@`, `rakesh@`, `sunita@`, `imran@`, `priya@school.com` · students e.g. `aarav@school.com`, `diya@school.com`

Demo data (3 classes, 24 students, 30 days of attendance, 2 exams) loads automatically on an empty database. Set `SEED_DEMO=0` to start empty.

## Run the API
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # docs at /docs
pytest -q                                                   # tests
```
Env vars: `DATABASE_URL` (default SQLite), `JWT_SECRET`, `SCHOOL_TZ` (default Asia/Kolkata), `SEED_DEMO`.

**Deploy free on Render:** render.com → New → Blueprint → pick this repo → it reads `render.yaml`. Copy the service URL into the app's login screen under *Server settings*. (Free tier sleeps when idle — first request can take ~1 min. SQLite there resets on redeploy; add a Render Postgres and set `DATABASE_URL` to keep data.)

## Run the app
```bash
cd mobile
npm install
npx expo start
```
Open in **Expo Go** (Android/iPhone). Phone-only setup with live reload: see [docs/termux.md](docs/termux.md).

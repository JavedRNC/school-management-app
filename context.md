# context.md — session recovery (keep terse; update every 2–3 tasks or after major work)

## Project
School Hub: school mgmt app. Roles: Principal, Teacher, Student. Owner: Javed (GitHub JavedRNC).
Repo: JavedRNC/school-management-app (branch main; Claude has push access)

## Stack
- backend/: FastAPI, SQLAlchemy 2, SQLite dev / Postgres prod (DATABASE_URL), PyJWT, bcrypt. Tests: `pytest -q` (5 pass)
- mobile/: Expo SDK 58, RN 0.88, Expo Router in src/app, TS strict, react-native-svg charts (hand-drawn), @expo/vector-icons
- Deploy: render.yaml (Render free). App server URL editable on login screen (AsyncStorage)

## Gotchas
- `npx expo install` blocked by sandbox proxy → install versions from `expo/bundledNativeModules.json` via npm
- Tabs import: `expo-router/js-tabs`; Stack/Redirect from `expo-router`; role routes = folders principal/ teacher/ student/ (not groups)
- Dates: server uses SCHOOL_TZ (Asia/Kolkata); Sunday = holiday → dashboard uses last_school_day()
- Keep deps Expo-Go compatible (no custom native modules)

## Dev flow (no PC — phones only)
Claude codes in cloud → push GitHub → Android Termux pull loop → `npx expo start --offline` → Expo Go. Guide: docs/termux.md

## Built (v0.1)
- API: /auth (login, me, password); /classes /subjects /users /assignments /timetable /exams (principal CRUD); /attendance, /marks (teacher, access-checked); /me/attendance /me/marks (student); /posts (notice|homework); /dashboard
- Dashboard: overview, attendance today by class + unmarked, 30-day trend, <75% list, academics per exam (avg by class/subject, pass rate ≥33%, top/bottom 5), at-risk (att<75 or marks<40)
- Seed demo (pw demo123): principal@, anita@ rakesh@ sunita@ imran@ priya@ (teachers), 24 students (aarav@...), classes 8-A 8-B 9-A
- App screens: login(+demo buttons, server setting); principal: dashboard, people(+add), classes(subject teachers, timetable editor, setup: classes/subjects/exams), notices, profile; teacher: today, attendance, marks, posts, profile; student: home(attendance ring+notices), marks, timetable, homework, profile
- Verified: tsc clean, `expo export --platform android` bundles

## Status
- [x] Pushed to GitHub main (2026-11-08)
- [ ] Javed: deploy backend to Render, set Termux, test on phone
- [ ] Not yet visually tested on a device

## Next ideas
Exam-to-exam trend, teacher activity, parents, fees, push notifications, leave requests.

## Decisions log
- 2026-11-08: Android RN (Expo) + Python FastAPI. Phones only → Termux live preview. Claude chose MVP + dashboard metrics.

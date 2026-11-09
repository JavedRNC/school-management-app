# context.md — session recovery (keep terse; update every 2–3 tasks or after major work)

## Project
School Hub: school mgmt app. Roles: Principal, Teacher, Student. Owner: Javed (GitHub JavedRNC, works from Android phone, no PC).
Repo: JavedRNC/school-management-app — PUBLIC, branch main, Claude has push access.

## Live
- API: https://school-api-7y80.onrender.com (Render free Web Service, Ohio, auto-deploys on push to main). Settings: root `backend`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, env DATABASE_URL/JWT_SECRET/SCHOOL_TZ. Blueprint asked for payment → manual Web Service used.
- DB: Neon free Postgres, us-east-2. Demo data seeded (SEED_DEMO defaults to 1; set 0 before real use).
- App: Expo Go on Javed's Android via Termux (`npx expo start --offline`, Expo Go → exp://127.0.0.1:8081). Default apiUrl in mobile/app.json = live API.
- Claude's sandbox can't reach onrender.com → Javed verifies live endpoints.

## Stack
- backend/: FastAPI, SQLAlchemy 2, Postgres (SQLite fallback/tests), PyJWT, bcrypt. Tests: `pytest -q` (8 pass; also on PG via TEST_DATABASE_URL). db.py pool_pre_ping+recycle for Neon suspend.
- mobile/: Expo SDK 58, RN 0.88, Expo Router (src/app), TS strict, react-native-paper MD3 (deep blue + amber, auto dark), expo-haptics, expo-linear-gradient, react-native-svg charts, MaterialCommunityIcons.

## Code map (mobile)
- src/lib: theme.ts (tokens, pctTone/toneColors/gradeOf), feedback.tsx (haptics, Snackbar toast w/ Undo), api.ts, auth.tsx, useLoad.ts, types.ts
- src/components: ui.tsx (Hero, Panel, StatTile, FadeIn, PressScale, FilterChips, Row, Sheet, Skeleton, EmptyState, StackedContext→back arrow), charts.tsx, RoleTabs.tsx (Paper nav bar), TimetableView, PostList/PostComposer (create+edit), ProfileView
- src/screens: AttendanceScreen, MarksScreen (shared by teacher tabs + /records/* for principal; accept ?class_id)
- src/app: login, principal/{index,people,classes,notices,profile}, teacher/{index,attendance,marks,posts,profile}, student/{index,marks,timetable,homework,profile}, records/{attendance,marks}

## Features
- Principal: Insights dashboard (attendance today/trend/<75%, academics by class/subject, pass rate, top/bottom, at-risk); full CRUD — people (edit, reset pw, remove/restore), classes (rename/delete), subjects & exams (edit/delete with impact shown), teacher assignments (assign/unassign), timetable, notices/homework (create/edit/delete), attendance & marks registers per class.
- Teacher: today + timetable, attendance toggles, marks entry with live grades, homework/notices (own edit/delete).
- Student: attendance ring + day dots, results (grades, vs last exam), timetable, homework, notices.
- Demo logins (pw demo123): principal@school.com, anita@ (teacher), aarav@ (student).

## Delete policy (current)
- Soft: users (active=false; Removed tab restores; history kept).
- Hard (permanent, confirm dialog shows impact): class (blocked if students; cascades timetable/assignments/attendance/class posts), subject (cascades assignments/timetable/marks; posts untagged), exam (cascades marks), post, timetable slot, assignment.
- DECIDED 9 Nov: switch to soft delete (is_active flag) + Archive screen for all records (features.md F12) — not built yet.

## Gotchas
- `npx expo install` blocked by sandbox proxy → use versions from `expo/bundledNativeModules.json` via npm.
- Tabs from `expo-router/js-tabs`; custom tabBar uses emitter/navigateToTab.
- Sunday = holiday → dashboard uses last_school_day(); SCHOOL_TZ Asia/Kolkata.
- Expo Go only: no custom native modules.
- Termux: React Native DevTools "arm64" error on start is harmless. Expo rewrites tsconfig locally → update loop uses `git fetch && git reset --hard origin/main`.
- UI preview: `npm i --no-save --legacy-peer-deps react-native-web@~0.21.4`, point apiUrl to local API temporarily, `expo export --platform web`, serve + playwright (/usr/bin/google-chrome); then `npm install` and restore app.json.

## Feature workflow
- features.md = backlog. Javed adds requests; Claude records + suggests. IMPLEMENT ONLY when Javed says "implement". Recommended order: multi-school (F1) first since it adds school_id everywhere.

## Key product decisions (9 Nov, see features.md)
Multi-school with school code login (no email/OTP; principal issues temp passwords); Super Admin manages all schools & sees student PII; parent login; class-teacher attendance compulsory, others optional; no accountant; monthly student fee + principal rolls out extra fees to school/classes/students; banner with images; admin-configured optional/mandatory app updates; ONE app with role-based UI. Login IDs: teacher=employee code, student=admission no., parent=mobile, principal=set by Admin. Monthly fee = one amount for all students. Banner images via Cloudinary-type storage. Builds via GitHub Actions (F17), no Expo account for builds; OTA via EAS Update free plan (account only when F16 built; hot-updater fallback). F18 school holiday calendar per school.

## Status / to-do
- [ ] Javed: reset Neon password (was shared in chat) and update DATABASE_URL on Render.
- [ ] Before real use: SEED_DEMO=0, fresh accounts.
- Next ideas: exam-to-exam trend, teacher activity, parents, fees, push notifications, leave requests.

## Decisions log
- 2026-11-08: Android RN (Expo) + Python FastAPI; phones only → Termux live preview. Claude chose MVP + dashboard metrics.
- 2026-11-08: Material 3 redesign, deep blue + amber.
- 2026-11-08: DB = Neon free Postgres (Render free PG expires in 30 days; Render disk not persistent).
- 2026-11-09: API on Render free (Ohio). Repo made public (for Termux clone).
- 2026-11-09: Principal full CRUD; users soft-deleted, others hard-deleted (pending archive decision).

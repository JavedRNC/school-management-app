# context.md — session recovery (keep terse; update every 2–3 tasks or after major work)

## Project
School management app. Roles: Principal, Teacher, Student. Owner: Javed (GitHub JavedRNC).
Repo: JavedRNC/school-management-app

## Stack
- mobile/: React Native (Expo), Android first; iOS via Expo Go works too
- backend/: Python FastAPI + SQLAlchemy, SQLite dev → Postgres prod, JWT auth
- Deploy (planned): backend on free host (Render) from GitHub

## Dev flow (no PC — phones only)
Claude codes in cloud → pushes to GitHub → Android Termux auto `git pull` loop → `npx expo start` → Expo Go hot-reloads.
Rules: keep deps Expo-Go compatible (no custom native modules); keep project in Termux home; small frequent commits.

## MVP scope (proposed, awaiting Javed's OK)
- Auth: login by role; Principal creates teacher/student accounts
- Principal: classes/sections, assign teacher→class+subject, timetable, school announcements, attendance overview
- Teacher: mark daily attendance, enter exam marks, post homework/class notices, view timetable
- Student: view attendance %, marks/report card, timetable, homework/notices
- Later: parents, fees, push notifications, leave requests, exam schedule, chat

## Status
- [x] GitHub connected; context.md created
- [ ] Javed approves MVP
- [ ] Backend scaffold
- [ ] Mobile scaffold
- [ ] Termux setup guide

## Decisions log
- 2026-11-08: Web app idea dropped → Android RN + Python. No PC; Termux on Android for live preview.

## Next
Get MVP approval → scaffold backend + mobile → Termux guide.

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
Multi-school with school code login (no email/OTP; principal issues temp passwords); Super Admin manages all schools & sees student PII; parent login; class-teacher attendance compulsory, others optional; no accountant; monthly student fee + principal rolls out extra fees to school/classes/students; banner with images; admin-configured optional/mandatory app updates; ONE app with role-based UI. Login IDs: teacher=employee code, student=admission no., parent=mobile, principal=set by Admin. Monthly fee = one amount for all students. Banner images via Cloudinary-type storage. Builds via GitHub Actions (F17), no Expo account for builds; OTA via EAS Update free plan (account only when F16 built; hot-updater fallback). F18 school holiday calendar per school. 9 Nov eve: added F19 student leave, F20 consent/polls, F21 ID card, F22 GPS staff attendance, F23 admissions, F24 VP/Coordinator roles, F25 privacy (Admin sees only allowed data — supersedes 'Admin sees PII'), F26 modular subscriptions (per-module per school, Admin manual config, free/sponsored schools), F27 gallery; infra & effort plan in features.md.

## Phase 1 (built 9 Nov) — architecture
- Backend: models.py (School, Plan, SubscriptionPayment, AuditLog, User w/ school_id+login_id+must_change_password+permissions+scope_class_ids+consent_at, ParentLink, Holiday, Meta; Archivable is_active on classes/subjects/exams/posts/holidays). perms.py (AREAS, DEFAULT_PERMISSIONS, MODULES, DEFAULT_PLANS). subscription.py (status active/free/trial/grace/expired/suspended; can_write → 402 read-only). auth.py (school-code login, lockout 5/15min, PASSWORD_CHANGE_REQUIRED, require_area/require_module). deps.py tenant helpers (owned(), visible_class_ids, resolve_student for parents). routers: auth, school, academics, dashboard, settings (school/me, settings, support-access, audit, archive, holidays), admin. migrate.py schema v2 (v1 demo DB auto-reset). Tests: 14 (SQLite+PG).
- App: lib/auth.tsx (school info, homeFor/roleHome, usePerm/useCan/useModule, ROLE_LABEL); login (code+ID), change-password, consent; tabs: admin/, principal/ (also VP/coordinator, tabs by permission), teacher/, student/, parent/ (ChildProvider lib/child.tsx); stacked: admin-school/[id], records/*, more/{calendar,settings,archive,privacy,plan}. Shared screens: screens/student/*, AttendanceScreen, MarksScreen; components/admin/*, people/*, StatusBanner.
- Demo: DEMO01 (principal, vp, coord, T001–T005, 2026001–2026024, parents 98765000xx; 9876500001 has 2 kids), DEMO02 (Sun–Thu, Basic plan), ADMIN/admin/admin123 (must change).
- Git: work happens on main; phase1-wip branch was used while building (merged).

## Phase 2 (built 9 Nov)
- Backend: models SchoolPrefs (leave_quotas, geo_lat/lng, geo_radius_m, late_after — separate table, no ALTER), LeaveRequest, Banner (school_id NULL = platform), Poll/PollResponse (consent per child via student_id), StaffAttendance, Vehicle/Route/Stop/StudentTransport. Routers: leaves.py, comms.py (banners + poll_router), staff_attendance.py, transport.py. New areas: leaves, staff_attendance, transport. Schema v3 additive; seed_phase2_demo() idempotent for DEMO01 (location 23.3441,85.3096). Tests: tests/test_phase2.py (7) + test_api.py (14).
- App: more/{leaves,banners,polls,poll/[id],staff-attendance,transport}, admin-banners/; components BannerCarousel, PollsCard (PendingPollsCard), CheckInCard (expo-location), BusCard (MyBusCard), leaves/LeaveSummaryCard, OpsGrid (useOps → Me hub links + home grid), comms/*, staff/*, transport/*.
- expo-location added (package.json + app.json plugin) → phone needs `npm install` once.

## Phase 3 (built 9 Nov) — fees
- Backend: models FeeConfig (school_id PK; monthly_amount, class_amounts{cid:amt}, route_amounts{rid:amt}, due_day, start_month, auto_generate, upi_id/name, receipt_prefix/note, generated_months), FeeBatch (extra fee rollout, Archivable), FeeItem (kind monthly|transport|extra|fine; unique student+kind+period; period YYYY-MM / b<batch> / x<ms>; is_active=false = waived/voided), FeePayment (status confirmed|pending|rejected|cancelled; receipt_no set on confirm; submitted_by = parent UPI claim), FeeAllocation, ReceiptCounter (per school + academic year Apr–Mar). Only confirmed payments count; cancel never edits.
- routers/fees.py (module fees, area fees: VP view, coord none): config, generate (idempotent; lazy ensure_current bills this month once), batches (preview/create/withdraw voids unpaid), students (?status), students/{id} ledger, items (add/concession), payments (record/list/cancel), receipts/{id} (staff or own parent/student), me + me/claim (UPI UTR), claims (+confirm/reject), summary. amount_in_words (Indian). Schema v4 additive. seed_fees_demo() idempotent (₹1500, 9-A ₹1800, routes ₹600/₹800, UPI greenvalley@sbi, prefix GVPS, 3 months, defaulters, 1 pending claim, Annual day ₹300). Tests: tests/test_fees.py (7) → 28 total.
- App: lib/fees.ts (inr, upiLink…), types Fee*; more/fees/{index,students,student/[id],claims,payments,setup,extra,receipt/[id],my}; components/fees/* (receiptHtml via expo-print + expo-sharing, PaySheet with react-native-qrcode-svg, FeeDueCard, FeeSummaryCard). New deps → phone `npm install` once.

## Phase 4 (built 11 Nov) — period timings, add many, Excel import/backup
- F28: model BellSchedule (school_id+day PK; day -1 default, 0–6 override; slots JSON [{kind period|break,label,start,end}]); app/bell.py (clean_slots, period_count); routers/bell.py GET/PUT/DELETE /school/bell (409 if timetable periods would be cut). PUT /timetable checks period ≤ day's count + teacher belongs to school. Schema v5 (additive). seed_bell_demo.
- F29: app/people.py engine (plan_rows → apply_plan; strict for new data, lenient for backups; temp passwords random 8 chars, bcrypt cost 8; parents auto-created/linked from parent_mobile). POST /users/bulk {role, rows≤300, dry_run}.
- F30/F31: app/databook.py (sheet SPEC, Writer, export_workbook template|backup; formula-safe cells; hidden _meta + _auth (hashes, HMAC with JWT secret)) and app/dataimport.py (Book reader with zip-bomb/size/row caps; Importer.run: wipe on replace (keeps principals) → setup sheets → people → refs → bell → timetable → holidays → fees → transport → history; one transaction; preview = rollback). routers/data.py: principal /data/template|backup|import; admin /admin/schools/{id}/data/* only with full_access. Tests tests/test_data.py (11).
- Security: auth.ensure_secret() stores a random JWT secret in meta when JWT_SECRET env is missing (never the public default).

## Android APK (F17)
- .github/workflows/android-apk.yml: push to main (mobile/**) or manual → APK at github.com/JavedRNC/school-management-app/releases/tag/latest-apk (SchoolHub.apk). versionCode = run number. apiUrl baked from app.json. Debug-key signed (fine for sideload; Play Store needs real keystore secrets).

## Status / to-do
- [ ] Javed: reset Neon password (was shared in chat) and update DATABASE_URL on Render.
- [ ] Before real use: SEED_DEMO=0, fresh accounts.
- Next: F21 ID cards, F23 admissions, F17 APK builds, F16 update popup; need Javed's accounts: image storage, EAS, payment gateway (F11-C).

## Decisions log
- 2026-11-08: Android RN (Expo) + Python FastAPI; phones only → Termux live preview. Claude chose MVP + dashboard metrics.
- 2026-11-08: Material 3 redesign, deep blue + amber.
- 2026-11-08: DB = Neon free Postgres (Render free PG expires in 30 days; Render disk not persistent).
- 2026-11-09: API on Render free (Ohio). Repo made public (for Termux clone).
- 2026-11-09: Principal full CRUD; users soft-deleted, others hard-deleted (pending archive decision).

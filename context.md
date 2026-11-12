# context.md — session recovery (keep terse; update every 2–3 tasks or after major work)

## Project
Prangan (प्रांगण; first builds were called "School Hub"): school mgmt app. Brand: ink-blue + marigold arch/book/diya logo (website/assets/logo.svg; app icons mobile/assets). Android package is com.javedrnc.prangan since 12 Nov (Javed: use Prangan everywhere); earlier builds used com.javedrnc.schoolhub, so they do not update in place — install new, uninstall old.apk + Prangan.apk (old links). Roles: Principal, Teacher, Student. Owner: Javed (GitHub JavedRNC, works from Android phone, no PC).
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
- Security (Fable review 11 Nov, fixed): auth.secret() fails closed; JWT_SECRET env used only if ≥32 chars, else random secret stored in meta. Backups: whole-file HMAC (derived key) in _meta.data_sig; hashes/permissions/consent AES-GCM in hidden _vault (AAD = school code). Unverified files → strict validation, history attributed to importer, new VP/coord get no permissions. Reader caps: zip 60MB/40MB member/300 entries, rows 300k physical, 40 cols, blank-run 1000, cell 32k, people 20k; no hashing in previews. Imports in thread pool + global lock; backups throttled 20s. Replace = school code + own password, auto pre-Replace DataSnapshot (schema v6) at /data/snapshot/file. Admin data routes only during support_access_until window and never with _vault.

## F16 update prompt (11 Nov)
- Model AppVersion (id=1: auto_latest, latest_build, min_build, message, url). routers/appversion.py: public GET /app/version (auto reads "Build N" from GitHub latest-apk release, cached 10 min); admin GET/PUT /admin/app-version. Schema v7.
- CI stamps expo.extra.buildNumber + android.versionCode = run number. components/UpdateGate.tsx (root layout): build < min → forced dialog; < latest → optional with Later (remembers skipped build). Screen /admin-updates. APKs built before this have no build number → never prompted (install once manually).

## Website (11 Nov)
- website/ = static bilingual site (EN in HTML, Hindi in i18n.js; toggle remembered; auto Hindi for hi browsers). Fonts Martel+Mukta self-hosted (OFL). Sections: hero + live IST "school day" strip, roles tabs (app screenshots in assets/*.webp), features, steps, schools (crests generated from initials — never real logos), download (GitHub APK, build/size from GitHub API, QR), install steps, demo logins, FAQ.
- Deploy: .github/workflows/website.yml → GitHub Pages (owner must set Settings → Pages → Source: GitHub Actions once). URL https://javedrnc.github.io/school-management-app/
- Backend: SchoolShowcase (opt-in, city) schema v8; GET /public/schools (name, city, board, demo flag, crest; stats exclude DEMO schools; cached 5 min); principal GET/PUT /school/showcase; admin PUT /admin/schools/{id}/showcase. App: components/WebsiteListing.tsx in School settings.

## Android APK (F17)
- .github/workflows/android-apk.yml: push to main (mobile/**) or manual → APK at github.com/JavedRNC/school-management-app/releases/tag/latest-apk (Prangan.apk). versionCode = run number. apiUrl baked from app.json. Debug-key signed (fine for sideload; Play Store needs real keystore secrets).

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

## F32/F33 (12 Nov)
- F32: mobile/src/lib/saveFile.ts saveToPhone() — Android saves via SAF folder picker (Directory.pickDirectoryAsync, starts at Documents; folder uri kept in AsyncStorage 'save_folder'; Download root not selectable on Android 11+), toast "saved in <folder>" with Share action; falls back to share sheet if write fails; iOS = share sheet. Used by DataTools (template/backup/undo/login CSV), add-many CSV, receipt "Save PDF on phone".
- F33: server address hidden from everyone but Admin. api.ts: DEFAULT_URL, override key 'api_url_admin' (old 'api_url' dropped on start), tryServer/keepServer/revertServer — a new server is on trial until an Admin signs in on it. Login: no server link; tap logo 7× shows field. Me → Server row + switch sheet for Admin only. "Can't reach the server" text no longer shows the URL.
- Update popup: AppVersion defaults auto_latest=True, min_build=0 → every new APK build prompts optional update (builds ≥4). Forced only if Admin sets min build in Admin → App updates.

## Environments (12 Nov)
- PROD = branch main → Render school-api (school-api-7y80.onrender.com) + Neon prod DB + "Prangan" APK (release latest-apk) + website.
- DEV = branch dev → Render prangan-api-dev (env APP_ENV=dev, APK_RELEASE_TAG=dev-apk, APK_FILE=PranganDev.apk) + separate Neon DB + "Prangan Dev" APK (package com.javedrnc.prangan.dev, release dev-apk). Dev API = https://prangan-api-dev.onrender.com (mobile/dev.json; live since 12 Nov).
- Flow: Claude commits to dev → Javed tests in Prangan Dev → on "release", `git merge --ff-only dev` into main and push. Never push features straight to main.
- Update check: server reads releases/download/<tag>/build.json (no API rate limit), falls back to API, remembers newest in meta 'seen_build'.

- Naming rule (Javed, 12 Nov): use "prangan" in every new name (packages, services, files). Only the existing PROD Render service/URL (school-api-7y80) and the GitHub repo name keep the old wording.
- TEST = branch test → Render prangan-api-test (https://prangan-api-test.onrender.com, live 12 Nov) + Neon prangan-test + "Prangan Test" APK (com.javedrnc.prangan.test, release test-apk; address in mobile/test.json). Firebase project prangan-b9556 has all 3 Android apps; google-services.json received from Javed (not committed yet — add with push notifications).

## Web portal, onboarding, push, security hardening (12 Nov) — on dev + test, NOT on main yet
- portal/ = React+TS (Vite, HashRouter) for Admin + Principal + public "Register your school" (/#/register, /#/register/status). Token in sessionStorage; build settings VITE_API_URL, VITE_APP_ENV. Render static sites prangan-portal-dev/-test/(prod) per docs/operations.md. Docs: docs/portal.md, docs/operations.md.
- Backend v9 (additive): school_details, onboarding_requests, onboarding_events, push_tokens. Routers: onboarding.py, portal.py; ratelimit.py (in-memory), push.py (FCM v1, needs FIREBASE_SERVICE_ACCOUNT), importprobe.py (memory-limited child parse).
- Auth now: every token carries pw stamp → all sessions end on password change/reset; POST /auth/password returns new `token`; admin tokens 12 h; web login `client:"web"` (Admin/Principal only). Login: generic message, limits per IP / IP+account / account (memory). Staff self-chosen passwords ≥8.
- No default admin password: random temp logged once ("temporary password" in Render logs) or ADMIN_PASSWORD; tests use ALLOW_DEFAULT_ADMIN_PASSWORD=1. ALLOW_SCHEMA_RESET default 0. API docs off on prod. CORS: each env allows only its own portal + github.io (CORS_ORIGINS adds).
- Admin may create/change a school's logins only during support access (exceptions: first principal; reset existing principal).
- Import limits for 512 MB server: 600k cells, 2 MB per non-sheet part, sheets by relationship + expat pre-scan + child probe (env IMPORT_MAX_CELLS, IMPORT_MAX_PART_MB, IMPORT_PROBE_MB). Import blocked for DEMO* schools on prod.
- App: register-school.tsx (from login), admin-requests/, lib/push.ts (expo-notifications, google-services.json). APK signing: secrets ANDROID_KEYSTORE_B64 + ANDROID_KEYSTORE_PASSWORD (PROD build fails without; dev/test fall back to debug key).
- Tests: backend 63 (pytest), portal 10 browser tests (portal/e2e, python playwright); .github/workflows/checks.yml on dev/test/main.
- Security review (independent, 6 rounds): no open Critical/High/Moderate in code. Open by owner action: signing secrets (H1). Accepted/known: principal-reset by admin (audited), in-memory rate limits, GPS check-in trust, coordinator scope on timetable/dashboard, token in AsyncStorage.
- Release state: dev = test = this work. main (PROD) untouched since rebrand build 11; "release to prod" also switches the app id to com.javedrnc.prangan (new install needed) and needs the signing secrets first.


# Prangan web portal

A second front end, beside the Android app, on the same API and database. Code: `portal/` (React + TypeScript, Vite).

## Who uses it

| Role | Does |
|---|---|
| Admin | Dashboard · schools (search, filter, sort, export, add) · one school: details, plan and features, price and dates, suspend, users, payments, website listing, import & export, activity · onboarding requests · plans & pricing · announcements for every school · app update settings · activity log |
| Principal | Dashboard · people (add, edit, reset password, remove, add many by pasting from Excel, parent links, Vice Principal / Coordinator rights) · classes, subjects, subject teachers · timetable and period timings · attendance · exams and marks · notices and homework · calendar · leaves and staff leave allowance · staff attendance and school location · fees (setup, dues, collect, receipts, cancel, UPI payments to check, one-time charges, month billing) · transport · polls and consent forms · banners · import & export · settings (profile, working days, privacy and support access, website listing, plan, archive and restore) · activity |
| Public | "Register your school" form and a status check (reference + mobile) |

Everything Admin and Principal can do in the Android app can be done here. The pages for paid features (Fees, Transport, Leaves,
Staff attendance, Polls) appear only when the school's plan includes them. When a subscription has lapsed the portal is view-only.
Press **Ctrl+K** anywhere to jump to a page.

Teachers, parents and students cannot sign in to the portal; the server refuses a portal session for those roles.
Every permission is enforced by the API. The portal's route guards are only for navigation.

## Sign-in on the web

`POST /auth/login` with `client: "web"` → a 12-hour token (the app's lasts 7 days; the platform admin's is always 12 hours) that only
Admin and Principal can get. It is kept in `sessionStorage` (ends with the tab) and sent as a header (no cookies, so no CSRF surface).
Every session of a user, web or app, ends when that user's password is changed or reset. Failed sign-ins are limited per account (lockout) and per network address.

## API added for the portal

Public
- `POST /public/onboarding` — submit a request. Limits: 5 per hour per address, 2000 stored per day overall; trap field for bots; duplicate and already-registered checks.
- `POST /public/onboarding/status` (`reference`, `mobile`) — status for the applicant; needs both values.

Admin only
- `GET /admin/onboarding` (`q`, `status`, `date_from`, `date_to`, `page`, `size`) · `GET /admin/onboarding/summary` · `GET /admin/onboarding/{id}`
- `POST /admin/onboarding/{id}/status` (`status`, `remarks`; a reason is required to reject or to ask for information)
- `POST /admin/onboarding/{id}/notes` · `POST /admin/onboarding/{id}/assign`
- `POST /admin/onboarding/{id}/onboard` (`code`, optional `plan_id`, `principal_login_id`) — creates the school through the same code as the admin "new school" form and returns the principal's one-time password once.
- `GET /admin/schools-page` (`q`, `status`, `sort`, `dir`, `page`, `size`) · `GET /admin/schools-export` (Excel) · `GET /admin/trends`
- `GET|PUT /admin/schools/{id}/details` · `GET /admin/schools/{id}/data/history` (needs the school's support access)

Principal
- `GET /data/history` — import/export history of the own school.

Any signed-in user
- `POST /push/register`, `POST /push/unregister` — this phone's notification token.

Interactive API reference: `<api address>/docs` on DEV and TEST (switched off on PROD).

## Request lifecycle

`PENDING → UNDER_REVIEW → APPROVED → ONBOARDED`, with `ADDITIONAL_INFORMATION_REQUIRED` and `REJECTED` as side states.
Every change is stored in `onboarding_events` with the previous status, new status, who, when and remarks. Internal notes are never shown to the applicant.

## Database (schema version 9, additive)

| Table | Holds |
|---|---|
| `school_details` | registration no., category, state, district, city, PIN, email, contact person, source request |
| `onboarding_requests` | one row per request from either channel |
| `onboarding_events` | history of each request |
| `push_tokens` | Firebase tokens per user |

No existing table was changed. Import/export history is read from the existing `audit_logs`.

## Tests

- API: `cd backend && python -m pytest -q`
- Browser (Playwright), local: `cd portal && npm ci && python -m pytest e2e -q` — starts a throw-away API with demo data and a fresh build.
- Browser, against a deployed environment: set `E2E_WEB_URL`, `E2E_API_URL`, `E2E_ADMIN_PASSWORD`, then the same command.
  The workflow **QA browser tests** (`.github/workflows/qa-e2e.yml`) does this on TEST for every push to `test`; it needs the
  repository secret `QA_ADMIN_PASSWORD`. It first waits until TEST is running the pushed commit (`/` on the API and
  `version.json` on the portal report the commit).
- The tests work in their own school (code `E2EQA1`, created on first use), put a run tag in every name they create and archive
  those items when the run ends. Steps that would leave a permanent school behind run only locally.

Release order: `dev` → checks green → `test` → QA browser tests green → `main`.

## Known limits

- No document uploads on the registration form (no file storage yet).
- Push notifications reach Android phones only; the portal shows a pending count.
- One school per principal.
- Imports and exports run inside the request, one at a time; no live progress bar. An import file may hold up to 600,000
  cells and 400,000 rows, and is first trial-parsed in a separate memory-limited process. That is sized for the 512 MB server: a full
  backup of a large school (roughly 500+ students with a year of attendance) will not restore there until the server is upgraded and
  `IMPORT_MAX_CELLS` / `IMPORT_PROBE_MB` are raised.
- Admin's view of a school's detailed data depends on that school's support access.
- Rate limits are kept in the API's memory: they reset on a restart and assume one API instance.
- Staff check-in (GPS) is done from the phone app only; the portal shows it and lets the principal mark by hand.
- Logging out forgets the session in the browser; the server session ends by itself after 12 hours or on a password change.

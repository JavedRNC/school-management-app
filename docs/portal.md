# Prangan web portal

A second front end, beside the Android app, on the same API and database. Code: `portal/` (React + TypeScript, Vite).

## Who uses it

| Role | Sees |
|---|---|
| Admin | Platform dashboard, schools (search, filter, sort, pages, export), school detail, onboarding requests, activity log |
| Principal | Own school's dashboard, people (read-only), import & export with history |
| Public | "Register your school" form and a status check (reference + mobile) |

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
- Browser: `cd portal && npm ci && python -m pytest e2e -q` (starts a throw-away API and a fresh portal build)

## Known limits

- No document uploads on the registration form (no file storage yet).
- Push notifications reach Android phones only; the portal shows a pending count.
- One school per principal.
- Imports and exports run inside the request, one at a time; no live progress bar. An import file may hold up to 1.5 million
  cells and 400,000 rows (sized for the 512 MB server; `IMPORT_MAX_CELLS` raises it on a bigger one).
- Admin's view of a school's detailed data depends on that school's support access.
- Rate limits are kept in the API's memory: they reset on a restart and assume one API instance.
- People, plans, prices and payments are managed in the app, not in the portal.

# Security review and test report — 12 Nov 2026

## How it was reviewed

An independent reviewer (a separate AI model session that did not write the code) audited the whole repository — API, portal, app,
deployment files — and confirmed findings by running the API locally. Fixes were re-checked by the same reviewer over six rounds until
it reported no open Critical, High or Moderate issue in the code. Nothing was tested against the live Render, Neon, GitHub or Firebase
services, on PostgreSQL, or on a real Android phone.

## Result

| Severity | Found | Status |
|---|---|---|
| Critical | 0 | — |
| High | 3 | 2 fixed in code; 1 fixed in code and waiting for the owner to add the signing secrets |
| Moderate | 7 (+2 raised during re-review) | all fixed |
| Low | 11 (+3) | 9 fixed, 5 accepted or partly fixed (below) |

### High
- **H1 App signed with a public debug key.** The build can now sign with a private key from two repository secrets and the PROD build
  refuses to run without them. *Open until the secrets are added and a signed build is published.*
- **H2 Well-known default admin password.** Removed: a random one-time password is logged once, or `ADMIN_PASSWORD` is used; an unchanged
  default is replaced at start-up.
- **H3 A small Excel upload could exhaust the server's memory.** Fixed in layers: size caps on every part, sheets resolved by the
  workbook's relationships, a streaming XML pre-scan, a trial parse in a memory-limited child process, totals sized for the 512 MB server,
  and no import for the public demo school on PROD. Reviewer's worst accepted file: 240 MB peak.

### Moderate (all fixed)
Sessions surviving a password change · account lockout usable as denial of service · admin able to create side-door logins without the
school's support access, and phone numbers visible as login IDs or in the audit view · rate limits bypassable with forged address headers ·
database wiped by default when a version row was missing · unlimited request bodies before sign-in · Replace import failing when a
removed user had a registered phone.

### Accepted or partly fixed (Low)
- Platform admin can reset the existing principal's password. This is the recovery path for a locked-out principal; it is audited and
  visible to the school.
- Rate-limit counters are in the API's memory: they reset on restart and assume one API instance.
- The public registration form tells an applicant that a school is already known (needed to stop duplicate requests).
- A coordinator limited to some classes is restricted on the people list but still sees all classes on the dashboard and timetable.
- Staff GPS check-in trusts the phone's reported location (inherent to the feature).
- A push token can be claimed by another signed-in user who already knows its value.
- Not changed: app session token kept in ordinary app storage; GitHub Actions pinned by tag, not commit; backup signature canonical form.

### Verified sound by the reviewer
All 168 API operations need sign-in except six intentionally public ones · every `/admin/*` route refuses all non-admin roles · about 75
cross-school probes and the parent/student/teacher/vice-principal probes found no access to other people's data · forced password change
cannot be bypassed · no raw SQL; search wildcards escaped · exports neutralise spreadsheet formulas · portal has no script-injection sink
and a strict content security policy · the principal's one-time password appears only once and is never stored readable.

## Test results (final commit on `dev`/`test`)

| Suite | Result |
|---|---|
| API tests (`backend/tests`, pytest, SQLite) | 63 passed |
| Browser tests (`portal/e2e`, Playwright, desktop + phone sizes) | 10 passed |
| Portal type-check and production build | passed |
| App type-check and Android bundle | passed |
| GitHub "Checks" workflow | green |

Browser tests cover: public registration and status check, validation errors, wrong password, forced password change, admin dashboard
numbers against the API, request review → approval → school creation → one-time password, the new principal's first sign-in, principal
dashboard, people, template download and re-import, role enforcement by the server, logout and expired sessions, phone layout without
sideways scrolling, labelled form fields, and a stored script payload staying inert.

Not covered by automated tests: the Android screens (no phone or emulator available), push delivery through Firebase, PostgreSQL-specific
behaviour, and the live deployments.

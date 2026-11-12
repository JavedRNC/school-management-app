# Prangan — environments, deployment, rollback, backup

## The three environments

| | DEV | TEST | PROD |
|---|---|---|---|
| Purpose | daily development | checking before release | live schools |
| Git branch | `dev` | `test` | `main` |
| API (Render web service) | `prangan-api-dev` · https://prangan-api-dev.onrender.com | `prangan-api-test` · https://prangan-api-test.onrender.com | `school-api` · https://school-api-7y80.onrender.com |
| Database (Neon) | project `prangan-dev` | project `prangan-test` | the live project |
| Portal (Render static site) | `prangan-portal-dev` | `prangan-portal-test` | `prangan-portal` |
| Android app | Prangan Dev (`com.javedrnc.prangan.dev`, release `dev-apk`) | Prangan Test (`…prangan.test`, release `test-apk`) | Prangan (`com.javedrnc.prangan`, release `latest-apk`) |
| Data | demo only | demo only | real |

The same code runs everywhere. Differences are configuration only:

- **API** — environment variables on each Render service: `DATABASE_URL`, `JWT_SECRET` (different in each), `APP_ENV` (`dev`/`test`; unset = prod),
  `APK_RELEASE_TAG`, `APK_FILE`, `SEED_DEMO`, `FIREBASE_SERVICE_ACCOUNT`, optional `CORS_ORIGINS`.
- **Portal** — two build settings on each static site: `VITE_API_URL`, `VITE_APP_ENV`.
- **App** — the build stamps name, package id and API address from the branch (`mobile/dev.json`, `mobile/test.json`).

DEV and TEST cannot reach live data: they do not hold the live database address, and each API only accepts browser calls from its own portal site.

## Creating a portal site on Render (once per environment)

Render → **New → Static Site** → repo `JavedRNC/school-management-app`.

| Setting | DEV | TEST | PROD |
|---|---|---|---|
| Name | `prangan-portal-dev` | `prangan-portal-test` | `prangan-portal` |
| Branch | `dev` | `test` | `main` |
| Root Directory | `portal` | `portal` | `portal` |
| Build Command | `npm ci && npm run build` | same | same |
| Publish Directory | `dist` | `dist` | `dist` |
| Env `VITE_API_URL` | `https://prangan-api-dev.onrender.com` | `https://prangan-api-test.onrender.com` | `https://school-api-7y80.onrender.com` |
| Env `VITE_APP_ENV` | `dev` | `test` | `prod` |

If Render gives the site a different address than `https://<name>.onrender.com` (the name was taken), add that address to `CORS_ORIGINS`
on the matching API service, otherwise the portal cannot call the API.

Optional but recommended, under the site's **Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` for path `/*` (they are also listed in `render.yaml`).

## How a change is released

1. Work is committed to `dev`. DEV API, DEV portal and Prangan Dev rebuild on their own. The **Checks** workflow runs the API tests and the browser tests.
2. "release to test": `git checkout test && git merge --ff-only dev && git push`. TEST rebuilds.
3. "release to prod": `git checkout main && git merge --ff-only test && git push`. PROD rebuilds.

Never push a feature straight to `test` or `main`. Do not release when Checks is red.

## Rollback

- **Code**: `git revert <merge or commit>` on the affected branch and push; Render redeploys the previous behaviour. Or, in Render →
  the service → **Deploys** → pick an earlier deploy → **Rollback**.
- **Database**: schema changes only ever add tables (`backend/app/migrate.py`, version 9), so older code keeps working against a newer database
  and a code rollback needs no database rollback.
- **App**: publish a build from the reverted branch; raise the minimum build in Admin → App updates only if the bad build must be blocked.

## Backup and recovery

| What | How | Who |
|---|---|---|
| Whole database | Neon point-in-time restore (Neon console → project → Restore). History length depends on the Neon plan. | Owner |
| One school | Full backup `.xlsx` (portal or app → Import & export). Restore with Import → Replace (school code + password). | Principal; Admin during support access |
| Before every Replace | An automatic undo copy is kept (last 3, 30 days). | automatic |
| Code and config | Git history; `render.yaml` describes every service. | — |

Recovery drill worth doing once on TEST: download a backup, Replace-import it, confirm the numbers match.

## Secrets

Kept only in Render's Environment pages, one set per service: database address, `JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT`.
Never in Git, chat or screenshots. `mobile/google-services.json` is not a secret (it ships inside every APK).
To rotate `JWT_SECRET`: change it on the service; everyone is signed out once.

## Before real schools use PROD

- `SEED_DEMO=0` and `ALLOW_SCHEMA_RESET=0` on the PROD API.
- Reset the Neon password once and update `DATABASE_URL`.
- Change the platform admin password from the first-run default (the app forces this at first sign-in).
- Consider Render's paid instance: the free one sleeps and the first request then takes up to a minute.
- Monitoring today is Render's logs and deploy notifications only; error tracking (e.g. Sentry) is not set up.

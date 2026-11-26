# School website — backend (Django)

The content engine for the school website. **Every word, image, menu entry, page, notice, fee and staff member is
edited from the admin panel — nothing is hardcoded.** It exposes a small JSON API that the Next.js front end reads, and
handles the public forms (admission enquiry, contact, newsletter, job applications) and Razorpay donations/zakat.

This folder is self-contained: copy it into any repo and it still runs on its own.

## Run it (two ways)

### A. Docker (Postgres included)
```bash
docker compose up -d --build
docker compose exec web python manage.py seed_site       # starter content
docker compose exec web python manage.py createsuperuser # your admin login
```
Admin: http://localhost:8000/admin · API: http://localhost:8000/api/

### B. Locally without Docker
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # edit if you want Postgres / Razorpay; blank DATABASE_URL uses SQLite
python manage.py migrate
python manage.py seed_site
python manage.py createsuperuser
python manage.py runserver
```

## What's inside
- `core/models.py` — the whole content schema (site settings, menu, homepage sections, pages, notices/events, staff &
  board, fees, admissions, careers, gallery, donations, contact, newsletter).
- `core/admin.py` — the admin panel (Django builds the screens). Admissions, contact messages, newsletter and donations
  export to Excel from the list "Actions" menu.
- `core/serializers.py`, `core/views.py`, `core/urls.py` — the public API.

## The API (all under `/api/`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/site/` | settings + header/footer menus (the shell) |
| GET | `/api/home/` | everything the homepage shows, in one call |
| GET | `/api/pages/`, `/api/pages/<slug>/` | pages (About, Parents, Policies …) |
| GET | `/api/notices/?kind=notice|event`, `/api/notices/<slug>/` | notices & events |
| GET | `/api/people/?category=leadership|staff|board` | staff & board |
| GET | `/api/fees/` · `/api/gallery/` · `/api/careers/`, `/api/careers/<slug>/` | fees, gallery, careers |
| POST | `/api/admissions/` · `/api/contact/` · `/api/newsletter/` | public forms |
| POST | `/api/careers/<slug>/apply/` | job application (multipart for the résumé) |
| POST | `/api/donations/create/` → `/api/donations/verify/` | Razorpay donation / zakat |

## Configuration
Everything machine-specific is in `.env` (see `.env.example`): `SECRET_KEY`, `DEBUG`, `DATABASE_URL`, `FRONTEND_ORIGINS`
(the Next.js origin allowed to call the API), and `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. With the Razorpay keys
blank, the donate form still records the intent — handy before payments are set up.

## Images / PDFs
Uploads are served from local `media/` in development. For production, point `MEDIA_ROOT` at a volume, or switch to S3
or Cloudinary (set the storage env and swap the storage backend — the models don't change).

## Payments (Razorpay)
`donations/create/` makes a Razorpay order; the browser pays; `donations/verify/` checks Razorpay's signature on the
server before marking the donation paid. Use **test** keys during development.

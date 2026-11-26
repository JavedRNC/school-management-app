# School website

A custom school website (no WordPress) where **every piece of content is managed from an admin panel** — text, images,
menu, pages, notices, fees, staff, gallery, donations. Layout/structure follows a modern school site; the words, logo
and photos are the school's own.

This whole `school-site/` folder is **standalone**: copy it into any repo and it runs on its own, separate from the school
management app.

## Structure
```
school-site/
  backend/    Django + DRF + PostgreSQL — the content, admin panel and API.   ← built, runnable now
  frontend/   Next.js + Tailwind — the public site that reads the API.        ← next
```

## Build order (per the plan)
1. **DB schema + API + admin panel** — done. See `backend/README.md` to run it; `/admin` edits everything.
2. **Public site design** (Next.js, Tailwind) — reads `/api/*` and renders Home, About, Parents, Registration, Fees,
   Donate, Zakat, Events, Gallery, Contact.
3. **Payments, SEO, deploy** — Razorpay donations/zakat (backend endpoints already in place), sitemap/meta, then
   Vercel (frontend) + VPS (backend).

## Tech
- Frontend: Next.js (React) + Tailwind CSS → Vercel
- Backend: Django + Django REST Framework (Django's admin is the content panel) → VPS
- Database: PostgreSQL
- Media: local in dev; S3 / Cloudinary in production (env-swappable)
- Payments: Razorpay (donation / zakat)

Standalone by design; if later it should share the school app's data, the API can be pointed at a shared database.

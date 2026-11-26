# School website — frontend (Next.js) · coming next

The public site: Next.js (React) + Tailwind CSS, reading the backend's `/api/*` endpoints. Nothing here yet — this is
the next phase. It will cover Home, About (+ sub-pages), Parents, Registration, Fees, Donate, Zakat, Events, Gallery
and Contact, all rendered from the admin-managed content.

Planned setup:
    npx create-next-app@latest . --ts --tailwind --app --eslint
    # set NEXT_PUBLIC_API_URL=http://localhost:8000/api in .env.local

Deploy target: Vercel. Point NEXT_PUBLIC_API_URL at the backend (VPS) in production.

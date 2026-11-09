# 🏫 School Hub — Feature Backlog

> **How this file works**
> Javed adds feature requests here over time. Claude records them, adds suggestions, and **implements only after Javed says "implement"** (for a feature, a group, or a phase).
>
> **Status:** 📝 Requested · 💡 Suggested by Claude · 🚧 In progress · ✅ Done · ⏸️ On hold
> **Size:** S (hours) · M (a day) · L (several days)

_Last updated: 9 Nov 2026_

---

## 📋 At a glance

| # | Feature | Status | Size | Phase |
|---|---|---|---|---|
| F1 | Multi-school platform (each school has its own logins) | 📝 | L | 1 |
| F2 | Super Admin dashboard (all schools) | 📝 | L | 1 |
| F3 | Secure one-way passwords | ✅ already in place · 📝 extras | S | 1 |
| F4 | Configurable working days / weekly off | 📝 | M | 1 |
| F5 | Class teacher takes attendance in the app | ✅ exists · 📝 refinements | S | 1 |
| F6 | Toasts on all important actions | ✅ mostly · 📝 audit | S | 1 |
| F7 | Richer, easier UI (cards, shadows, glows) | ✅ partly · 📝 polish | M | ongoing |
| F8 | Teacher leave requests & Principal approval | 📝 | M | 2 |
| F9 | Transport management | 📝 | L | 2 |
| F10 | Fee structure & fee receipts | 📝 | L | 3 |
| F11 | Fee submission (payments) — exploration | 📝 | L | 3–4 |
| F12 | Archive / Recycle bin instead of permanent delete | 💡 pending decision | M | 1 |

---

## 🧱 Phase 1 — Foundation

### F1 · Multi-school platform 📝 `L`
One app for many schools. Every school is fully separate and has its own Principal, Teachers and Students.

- **School account**: name, logo, address, phone, email, affiliation/board (CBSE/ICSE/State), academic year.
- **Data isolation**: every record (classes, students, attendance, marks, fees, transport…) belongs to one school; a user can never see another school's data.
- **Onboarding**: Super Admin creates a school and its first Principal account; the Principal then sets up everything else.
- **Login**: users sign in with email + password; the app knows their school automatically. *(Option: a short **school code** on the login screen for schools that share email domains.)*
- **School branding** 💡: school logo and name on the app header, receipts and report cards.

> ⚠️ **Why first:** this adds a "school" link to every table. Doing it before transport, leaves and fees avoids rework later.

### F2 · Super Admin dashboard 📝 `L`
A separate **Admin** role (superuser) above all schools.

- **Schools list**: search, add, edit, suspend/activate a school, reset a Principal's password.
- **Platform overview**: number of schools, students, teachers; active users; schools added this month.
- **Per-school summary** (only necessary info): counts, attendance %, fee collection totals, last activity, plan/status.
- **Privacy**: Admin sees summaries, not every child's personal details, unless opened on purpose for support (and that access is logged 💡).
- **Audit log** 💡: who did what and when (school created, principal reset, data exported).

### F3 · Secure one-way passwords ✅ / 📝 extras `S`
- ✅ **Already done:** passwords are stored with **bcrypt** (one-way hashing). Nobody — Admin, Principal, or Claude — can see any password; it can only be **reset**.
- 📝 Extras:
  - First-login **"set your own password"** when a Principal/Admin creates or resets an account.
  - Password rules (min length, not same as email).
  - Login attempt limit / temporary lock after repeated wrong passwords.
  - "Forgot password" via email OTP 💡.

### F4 · Working days / weekly off 📝 `M`
Principal chooses the school's working days (e.g. Mon–Sat, Sun–Thu, or Mon–Fri).

- **Settings → Working days**: tap to select days (multi-select chips).
- Used everywhere: attendance can't be marked on off-days, timetable shows only working days, dashboard trends and attendance % skip off-days.
- **Holiday calendar** 💡: add festivals/vacations as one-off holidays (same effect as weekly off), visible to teachers and students.
- **Second/fourth Saturday off** 💡: optional pattern, common in Indian schools.

### F5 · Class teacher attendance ✅ / 📝 refinements `S`
- ✅ **Already done:** teachers open **Attendance**, tap students present/absent, and save; Principal can view and correct it from the **Attendance register**.
- 📝 Refinements:
  - Only the **class teacher** can mark daily attendance; subject teachers view only *(confirm)*.
  - Late arrivals ("Late" status) and half-day 💡.
  - Lock attendance after a set time/day; Principal can still edit (with log).
  - Absent alert to student/parent 💡 (with notifications).

### F6 · Toasts on all important actions ✅ / 📝 audit `S`
- ✅ Most saves/deletes already show a toast, many with **Undo**.
- 📝 Audit every screen so each create/update/delete/approve/payment shows a clear success or error toast, with a vibration.

### F7 · UI polish 📝 `M` (ongoing)
- Cards with soft shadows, subtle **glow** on key cards (e.g. dashboard highlights, payment success), gradient accents.
- Bigger touch targets, fewer steps for common tasks, friendly empty states.
- Success animations for big moments (attendance saved, leave approved, fee paid ✓).

### F12 · Archive / Recycle bin 💡 `M` — *awaiting decision*
Deleting a class, subject, exam or post moves it to **Archive** instead of erasing it. Principal can restore it, or "Delete forever" from the bin.

---

## 🧑‍🏫 Phase 2 — Staff & Operations

### F8 · Teacher leave requests & approvals 📝 `M`
**Teacher**
- Apply for leave: type (Casual / Sick / Earned / Other), from–to dates, half-day option, reason, optional attachment (e.g. medical note).
- See status: Pending ⏳ / Approved ✅ / Rejected ❌, with Principal's comment.
- Leave balance per type 💡.
- Cancel a pending request.

**Principal**
- Inbox of pending requests with a badge count; approve/reject with an optional comment (toast + notification).
- Calendar view of who's on leave each day.
- **Substitute teacher** 💡: when a leave is approved, suggest free teachers for the affected timetable periods.
- Leave quotas per year set in Settings 💡.

### F9 · Transport management 📝 `L`
**Principal**
- **Vehicles**: bus/van number, type, capacity, registration, insurance/fitness expiry dates (with reminders 💡).
- **Drivers & attendants**: name, phone, licence number and expiry.
- **Routes & stops**: route name, ordered stops with pickup/drop times.
- **Assign students** to a route + stop; see seats used vs capacity.
- **Transport fee** per route/stop (links to F10).
- Reports: students per route, vehicles near capacity, expiring documents.

**Students / parents**
- See their bus number, stop, timings, and driver contact.

**Later ideas** 💡: live bus location (driver phone GPS), "bus arrived / delayed" alerts, transport attendance (boarded/not boarded).

---

## 💰 Phase 3–4 — Fees

### F10 · Fee structure & receipts 📝 `L`
**Setup (Principal)**
- **Fee heads**: Tuition, Admission, Exam, Transport, Lab, Sports, Late fine, etc.
- **Fee plan per class**: amount per head; frequency — monthly / quarterly / term / yearly; due dates.
- Discounts/concessions per student (sibling, staff ward, scholarship) and late-fee rules 💡.

**Collect & receipt**
- Each student has a **fee ledger**: due, paid, balance, overdue.
- Principal (or Accountant 💡) records a payment: amount, heads, mode (Cash / UPI / Cheque / Bank transfer / Online), reference no., date.
- **Receipt generated automatically**:
  - School name, logo, address, contact; receipt no. (sequential per school & year); date.
  - Student name, class/section, roll no., admission no., parent name.
  - Fee period, itemised heads with amounts, discount, fine, **total paid**, **amount in words**, payment mode + reference, **balance due**.
  - "Received by" + signature/stamp area; QR code to verify the receipt 💡.
  - **Download as PDF** and **share on WhatsApp**.
- Receipts can be **cancelled** (with reason), not edited — keeps accounts clean.

**Reports**
- Collected today / this month, by class, by mode; defaulters list; head-wise collection.
- Fee widgets on the Principal dashboard.

### F11 · Fee submission (payments) — exploration 📝 `L`
Goal: once a fee is paid, the receipt is created and the student's ledger updates automatically.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Record at counter** (recommended first) | Parent pays cash/UPI at school; Principal records it in the app → receipt + ledger update instantly | No setup, no fees, works today | Manual entry |
| **B. UPI QR + confirm** | App shows the school's UPI QR / payment link; parent pays and enters UTR; Principal verifies with one tap | Cheap, familiar in India | Still needs a manual check |
| **C. Online payment gateway** (Razorpay / Cashfree / PayU) | Parent pays in the app (UPI, cards, net banking); gateway confirms to our server → receipt + ledger update **automatically** | Fully automatic, real-time | Each school needs gateway KYC/bank account; ~2% fee per payment; webhooks, refunds and reconciliation to build |

**Recommended path:** build **A** with F10 → add **B** → add **C** once schools are live.

Technical notes for C:
- Use the gateway's **hosted checkout / payment links** opened in the browser — this works in **Expo Go** (native payment SDKs would need a custom app build).
- Server creates the order, the gateway sends a **signed webhook** on success; only then is the payment marked paid (never trust the phone alone).
- For many schools: each school connects its own gateway account (or a split-payment "route" setup) so money goes straight to that school.
- Idempotency (no double receipts), refunds, and a daily reconciliation report.

---

## 💡 More ideas from Claude (not requested yet)

| Idea | Why it helps | Size |
|---|---|---|
| **Parent login** | Parents are the ones who pay fees, read notices, and track attendance; one parent can see all their children | M |
| **Push notifications** | Absence alerts, leave decisions, fee due reminders, new homework | M |
| **Bulk import** (Excel/CSV) | Add hundreds of students/teachers at once when a school joins | M |
| **Academic year & promotion** | Close the year, promote students to the next class, keep history | M |
| **Exam timetable & report card PDF** | Date sheet for exams; printable report cards with school branding | M |
| **Student profile & documents** | Admission no., DOB, parents, address, blood group, photo, documents | M |
| **Accountant role** | Collects fees without full Principal access | S |
| **Hindi / regional language** | Easier for many parents and staff | M |
| **Offline attendance** | Mark attendance with poor network; syncs later | M |
| **Data backup & export** | Download school data; peace of mind for Principals | S |

---

## ❓ Open questions for Javed

1. **Login:** email only, or should users also enter a **school code**? Should students/parents log in with **mobile number + OTP** instead of email?
2. **Admin access:** how much student-level detail should the Super Admin see — summaries only, or full access for support?
3. **Attendance:** should *only* the class teacher mark daily attendance, or also subject teachers per period?
4. **Fees:** which payment option to start with — A (record at counter), B (UPI QR), or C (gateway)? Is there an **Accountant** at most schools?
5. **Parents:** add a Parent login (recommended), or keep fees/notices on the student login?
6. **Delete policy:** move classes/subjects/exams/posts to an **Archive** instead of permanent delete? (F12)
7. **Pricing:** will schools pay per student / per year? (Affects Admin dashboard: plans, renewals, billing.)

---

## 🗓️ Suggested build order
1. **Phase 1:** F1 Multi-school → F2 Admin → F3 extras → F4 Working days → F5/F6 refinements → F12 Archive
2. **Phase 2:** F8 Leaves → F9 Transport
3. **Phase 3:** F10 Fees & receipts (with payment option A)
4. **Phase 4:** F11 Online payments (B → C), Parent login, notifications

_Nothing in this file is built until Javed says **"implement"**._

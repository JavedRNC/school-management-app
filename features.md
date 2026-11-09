# 🏫 School Hub — Feature Backlog

> **How this file works**
> Javed adds feature requests here over time. Claude records them, adds suggestions, and **implements only after Javed says "implement"** (for a feature, a group, or a phase).
>
> **Status:** 📝 Requested · 💡 Suggested by Claude · 🚧 In progress · ✅ Done · ⏸️ On hold
> **Size:** S (hours) · M (a day) · L (several days)

_Last updated: 9 Nov 2026 — **Phase 2 built** (banners, leaves, consent forms & polls, GPS staff attendance, transport); **Phase 1 built** (multi-school, admin, roles, privacy, subscriptions, parents, archive, calendar, working days, attendance rules)_

---

## 📋 At a glance

| # | Feature | Status | Size | Phase |
|---|---|---|---|---|
| F1 | Multi-school platform + **school code** login | ✅ Done | L | 1 |
| F2 | Super Admin (add schools, manage all users & data) | ✅ Done | L | 1 |
| F3 | Secure one-way passwords + temporary password flow | ✅ Done | S | 1 |
| F13 | **Parent login** | ✅ Done | M | 1 |
| F12 | **Soft delete / Archive** (active flag on all records) | ✅ Done | M | 1 |
| F4 | Configurable working days / weekly off | ✅ Done | M | 1 |
| F18 | **School calendar & holidays** (yearly, set by Principal) | ✅ Done | M | 1 |
| F5 | Attendance: class teacher **compulsory**, others optional | ✅ Done | S | 1 |
| F6 | Toasts on all important actions | ✅ mostly · 📝 audit | S | 1 |
| F7 | Richer, easier UI (cards, shadows, glows) | ✅ partly · 📝 polish | M | ongoing |
| F15 | **Announcement banner** with images | ✅ Done (image via https link; upload needs storage) | M | 2 |
| F8 | Teacher leave requests & Principal approval | ✅ Done | M | 2 |
| F9 | Transport management | ✅ Done (transport fee per route in Phase 3) | L | 2 |
| F10 | **Monthly fees**, fee receipts & ledger | ✅ Done (Phase 3) | L | 3 |
| F14 | **Roll out extra fees** (activity/exam/maintenance) to school, classes or students | ✅ Done (Phase 3) | M | 3 |
| F11 | Fee submission (payments) | ✅ A + B done · C (gateway) later | L | 3–4 |
| F17 | **APK builds via GitHub Actions** | 📝 | S | any time |
| F24 | **Roles: Vice Principal / Coordinator** (limited powers) | ✅ Done | M | 1 |
| F25 | **Privacy & data access** (Admin sees only allowed data) | ✅ Done | M | 1 |
| F26 | **School subscriptions** (modular plans, free/sponsored schools, manual config) | ✅ Done (billing via Admin; online payment later) | L | 1–2 |
| F19 | **Student leave by parent** | ✅ Done | S | 2 |
| F20 | **Consent forms & polls** | ✅ Done | S | 2 |
| F22 | **Staff attendance (GPS geofence)** | ✅ Done (selfie needs storage) | M | 2 |
| F21 | **Digital ID card** (photo + QR) | 📝 | M | 3 |
| F23 | **Admissions & enquiries** | 📝 | M | 3 |
| F27 | **Photo gallery** | 📝 | M | 3 |
| F16 | **App update pop-up** (optional / mandatory) configured by Admin | 📝 | M | 4 (Admin page later) |

---

## ✅ Decisions (answered by Javed — 9 Nov 2026)

| Topic | Decision |
|---|---|
| Login | **School code + login ID + password.** No email, no OTP. |
| Accounts | Principal creates Teacher, Student and Parent accounts with a **temporary password**. |
| Super Admin | Adds schools; manages Principals, Teachers, Students, Parents. **Sees only allowed data** (updated 9 Nov — see F25). |
| Attendance | **Class teacher must mark** daily attendance; other teachers **may** mark (optional). |
| Accountant role | **Not needed.** Principal handles fees. |
| Extra fees | Principal can roll out fees (exam, activity, maintenance…) to **whole school, chosen classes, or chosen students**. |
| Parents | **Parent login: yes.** |
| Deleting | **Soft delete / archive** using an *active* flag — nothing is erased. |
| Student fee | Charged **monthly** per student. |
| App structure | **One app, different interface per role** (see "Architecture" below). |
| Login IDs | Teacher = employee code · Student = admission number · Parent = mobile number · Principal = set by Admin. |
| Monthly fee amount | **One amount for every student** (no per-student amounts). Built as a per-class amount with a "same for all classes" option; per-student discounts only if needed later. |
| Banner images | Free image storage service (Cloudinary or similar). |
| App builds | **GitHub Actions** builds the installable APK in the cloud (free, no Expo account). |
| OTA updates | **Yes** — EAS Update on the **free plan** (1,000 users/month); Expo account needed only when F16 is built. Switch to self-hosted hot-updater if usage grows and cost matters. |
| School calendar | Each school's yearly holiday calendar, fully configurable by the Principal (F18). |
| Business model | **Modular subscription**: schools pay for the modules they use; Admin can configure plans manually and give any school modules **free** (F26). |
| New features chosen | Student leave by parent, consent forms & polls, digital ID card, GPS staff attendance, admissions & enquiries, Vice Principal/Coordinator roles, privacy compliance, school subscriptions, photo gallery. |

---

## 🧱 Phase 1 — Foundation

### F1 · Multi-school platform + school code login 📝 `L`
One app for many schools; every school is completely separate.

- **School**: code (e.g. `DPS042`), name, logo, address, phone, board, academic year, status (active/suspended).
- **Data isolation**: every record belongs to one school; users can never see another school's data.
- **Login screen**: `School code` → `Login ID` → `Password`. The app remembers the school code on that phone.
- **Login IDs** (no email) — ✅ confirmed:
  - Principal: chosen by Admin (e.g. `principal`)
  - Teacher: employee code (e.g. `T001`)
  - Student: admission number (e.g. `2024-0153`)
  - Parent: parent's **mobile number** (one parent account sees all their children)
- **School branding**: logo and name in the app header, receipts and report cards.

### F2 · Super Admin 📝 `L`
A superuser above all schools.

- **Schools**: add, edit, suspend/activate; set school code; create/reset the Principal.
- **Manage people in any school**: Principals, Teachers, Students, Parents — add, edit, reset password, archive/restore.
- **View data**: only what F25 allows (summaries by default; personal details only where permitted, and logged).
- **Platform overview**: totals of schools/students/teachers/parents, active users, recently added schools.
- **Audit log**: records every Admin view/change of a school's data — who, what, when (part of F25).
- **Subscriptions & modules** → see **F26**.
- App update settings → see **F16**.

### F3 · Passwords & temporary password flow ✅ / 📝 `S`
- ✅ Passwords are stored with **bcrypt (one-way)** — no one can ever read them, only reset them.
- 📝 Principal/Admin sets a **temporary password** when creating or resetting an account.
- 📝 On first sign-in with a temporary password, the user **must set a new password** before using the app.
- 📝 Password rules (min 6–8 chars, not same as login ID); temporary lock after repeated wrong attempts.
- Forgot password → ask the Principal to reset it (no email/OTP).

### F13 · Parent login 📝 `M`
- Login with **school code + mobile number + password** (temporary password from Principal).
- **One parent, many children**: switch between children at the top of the screen.
- Sees each child's attendance, results, timetable, homework, notices, **fees due/paid + receipts**, bus details.
- Gets the banner (F15) and update pop-up (F16) like everyone else.
- Principal links parents ↔ students (father/mother/guardian) from the student profile.

### F12 · Soft delete / Archive 📝 `M`
- Every main record gets an **active flag** (`is_active`) plus who/when archived.
- "Delete" becomes **Archive**: hidden from screens, reports and analytics, but kept in the database.
- **Archive screen** for Principal (and Admin): filter by type (classes, subjects, exams, posts, students…), **Restore** with one tap.
- History stays intact: a restored exam brings back its marks; a restored class brings back its timetable.
- Permanent delete only by Admin, if ever needed 💡.

### F4 · Working days / weekly off 📝 `M`
- **Settings → Working days**: multi-select (e.g. Mon–Sat, Sun–Thu, Mon–Fri).
- Used everywhere: attendance not required on off-days, timetable shows only working days, dashboard % skips off-days.
- Works together with the **School calendar (F18)** for one-off holidays.
- **2nd/4th Saturday off** 💡 option.

### F18 · School calendar & holidays 📝 `M`
Each school keeps its own yearly calendar, **fully configurable by the Principal**.

**Principal**
- Add a holiday: **name** (e.g. Diwali), **date or date range** (e.g. summer vacation 15 May – 30 Jun), type, optional note.
- **Types** (colour-coded): National holiday · Festival · Vacation · Exam · Event · Other.
- Edit or archive any entry; see the whole academic year at a glance.
- 💡 **Quick start**: copy last year's calendar, or start from a template of common Indian national/festival holidays and adjust.
- 💡 **Events too**: PTM, Sports Day, Annual Function — shown on the calendar but school stays open.
- 💡 Option to apply an entry to **selected classes only** (e.g. exam days for Class 10).

**Everyone (teachers, students, parents)**
- **Month view** with coloured dots + **list of upcoming holidays**; tap a day to see details.
- "Next holiday" card on the home screen 💡.
- 💡 Reminder notification a day before a holiday (with notifications).

**Effects across the app**
- Holidays count as **non-working days** (with weekly offs from F4): attendance isn't required or counted, dashboard and attendance % skip them, timetable shows "Holiday".
- Teachers can't mark attendance on a holiday (Principal can override if school opens unexpectedly).

 ✅ / 📝 `S`
- ✅ Teachers already mark attendance in the app; Principal can view/correct it.
- 📝 **Class teacher: compulsory** — dashboard flags any class not marked by its class teacher; reminder 💡 near the end of school day.
- 📝 **Other teachers: optional** — can mark (e.g. when the class teacher is absent); the record shows who marked it.
- 📝 Lock after the day ends; Principal can still edit (logged).
- 💡 "Late" and "Half-day" statuses; absence alert to parents (with notifications).

### F6 · Toasts ✅ / 📝 audit `S`
Every create / update / archive / approve / payment shows a clear success or error toast (with a light vibration), and Undo where possible.

### F7 · UI polish 📝 `M` (ongoing)
Cards with soft shadows, subtle glow on key cards, gradients, big touch targets, celebratory animations for big moments (attendance saved, leave approved, fee paid ✓).

---

## 📣 Phase 2 — Communication & Operations

### F15 · Announcement banner (with images) 📝 `M`
Shown at the top of the home screen **as soon as the user opens the app**.

- **Principal creates banners**: image (upload from phone), title, short text, optional button/link (e.g. "View notice").
- **Audience**: whole school, or chosen roles (teachers / students / parents) and classes.
- **Schedule**: start and end date; auto-hides when expired.
- **Several banners** → swipeable carousel with dots; tap to open full view.
- Option: **show once as a pop-up** on next app open for urgent news 💡.
- Admin can also show a **platform-wide banner** to all schools 💡.
- Tech note: images need cloud storage (e.g. Cloudinary / Supabase Storage free tier) — Render's free server can't keep uploaded files.

### F8 · Teacher leave requests & approvals 📝 `M`
- **Teacher**: apply (Casual / Sick / Earned / Other), dates, half-day, reason, optional photo of note; see Pending / Approved / Rejected with comment; cancel pending.
- **Principal**: pending inbox with badge, approve/reject with comment, calendar of who's on leave.
- 💡 Leave balance per type; substitute teacher suggestions for affected periods.

### F9 · Transport management 📝 `L`
- **Vehicles**: number, type, capacity, registration, insurance/fitness expiry (reminders 💡).
- **Drivers/attendants**: name, phone, licence + expiry.
- **Routes & stops**: ordered stops with pickup/drop times.
- **Assign students** to route + stop; seats used vs capacity.
- **Transport fee** per route/stop → added to the monthly fee (F10).
- Students/parents see bus, stop, timings, driver contact.
- 💡 Later: live bus location, "bus arriving" alerts, boarding attendance.

---

## 💰 Phase 3–4 — Fees

### F10 · Monthly fees, ledger & receipts ✅ `L`
> Built: per-class amounts, transport per route, due day, auto-bill current month, ledger, concessions/waive, one-off charges, receipts (GVPS/2026-27/0001 style, PDF share), cancel with reason, reports, defaulters with call/WhatsApp. Not yet: late fine rule, school logo, verify-QR on receipt.
**Setup**
- **Monthly fee: one amount for every student** — set once (optionally per class, with a "same for all classes" shortcut), plus optional transport fee per route, due day (e.g. 10th), late fine rule 💡.
- Per-student concession/discount — ⏸️ not needed now (can add later).
- At the start of each month the app **auto-creates that month's fee** for every active student.

**Ledger** (per student): month-wise due / paid / balance; overdue highlighted.

**Collect (Principal)**: record a payment (amount, months/fees covered, mode: Cash / UPI / Cheque / Bank / Online, reference no., date) → **receipt generated automatically** and ledger updated.

**Receipt**
- School logo, name, address, contact; **receipt no.** (sequential per school & year); date.
- Student name, class, roll no., admission no., parent name.
- Months/fees covered, itemised amounts, discount, fine, **total paid**, **amount in words**, mode + reference, **balance due**.
- Signature/stamp area; QR to verify 💡.
- **PDF download** and **share on WhatsApp**; visible to parent & student in the app.
- Receipts can be **cancelled with a reason**, never edited.

**Reports**: collected today/this month, by class, by mode; **defaulters list** (students with dues); fee widgets on the Principal dashboard.

### F14 · Roll out extra fees ✅ `M`
For one-off or occasional charges: Examination fee, Activity fee, Maintenance fee, Annual day, Trip, etc.

- Principal creates a fee: **name, amount, due date**, optional note.
- **Who pays**: ① whole school ② selected classes ③ selected students (search + multi-select, or "all of class except…").
- **Preview before sending**: "₹500 × 214 students = ₹1,07,000".
- The fee is added to each chosen student's ledger and shown to parents/students; a toast + notification 💡 announces it.
- Can be **archived** (if rolled out by mistake) — removes it from unpaid ledgers, keeps an audit trail.

### F11 · Fee submission (payments) ✅ A + B · C later `L`
Once paid → receipt created and ledger updated automatically.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Record at counter** (start here) | Parent pays at school; Principal records it → receipt + ledger update instantly | No setup, no charges | Manual entry |
| **B. UPI QR + confirm** | App shows school's UPI QR; parent pays, enters UTR; Principal confirms with one tap | Cheap, familiar | Manual confirmation |
| **C. Online gateway** (Razorpay / Cashfree / PayU) | Parent pays in app; gateway confirms to server → receipt + ledger **automatic** | Fully automatic | Each school needs gateway KYC; ~2% per payment; webhooks/refunds/reconciliation |

**Path:** A → B → C. For C: hosted checkout/payment link (works without a custom app build), server-side signed webhook confirms payment, no duplicate receipts, each school's money goes to its own account.

---

## 📲 Phase 4 — App delivery

### F16 · App update pop-up (optional / mandatory) 📝 `M` — Admin page later
Admin controls which app versions are allowed.

- **Admin config** (per platform, Android/iOS): latest version, **minimum supported version**, update message, store/download link.
- On app open (and when returning to the app) it checks the server:
  - Version **≥ latest** → nothing shown.
  - Version **between minimum and latest** → **Optional update** pop-up: *Update now* / *Later* (asks again after a set time).
  - Version **below minimum** → **Mandatory update** full-screen block: only *Update now*; the app can't be used until updated.
- ✅ Decided: **Over-the-air (OTA) updates** with EAS Update: screen/logic changes reach phones **without a store download**; the pop-up is then only needed for bigger native changes. Saves time for every small fix.
- Needs a real app build (APK / Play Store) — in Expo Go this check is skipped.

---

### F17 · APK builds via GitHub Actions 📝 `S`
- A GitHub workflow builds a real, installable **Android APK** in the cloud — no computer and no Expo account needed.
- Runs automatically on every push to `main` (or on demand with a button in GitHub → Actions).
- Download the APK from the run's artifacts or a **GitHub Release** link, and install it on any Android phone.
- Version number taken from `app.json`; release builds signed with a keystore stored safely in GitHub Secrets (needed for Play Store later).
- Replaces the Termux + Expo Go setup for everyday users; Termux stays for live development.

---

### F24 · Roles: Vice Principal / Coordinator 📝 `M`
Extra staff roles with **limited powers**, created by the Principal.

- **Ready-made roles**: Vice Principal (almost everything except school settings, fees and subscriptions), Coordinator (selected classes: attendance, marks, timetable, notices).
- **Permission switches** per role, grouped by area: People · Classes & timetable · Attendance · Exams & marks · Notices & banner · Leaves · Fees · Transport · Admissions · Gallery · Settings. Each area: *No access / View / Edit*.
- **Scope**: whole school, or chosen classes only (for coordinators).
- The app shows only allowed tabs/buttons; the **server enforces** every permission (hiding buttons alone isn't security).
- Principal keeps full control and can't be limited.

### F25 · Privacy & data access 📝 `M`
Admin should see **only allowed data**; designed with India's **DPDP Act 2023** in mind.

- **Default for Admin**: school-level summaries only — counts, attendance %, fee totals, plan usage. No names, phone numbers or addresses.
- **Allowed fields per school**: each school's settings decide which personal fields Admin may see (e.g. names ✅, phone ❌, address ❌).
- **Support access** 💡: for a support request, the Principal grants Admin temporary full access (e.g. 24 hours); it expires automatically.
- **Audit log**: every Admin view/change of school data is recorded and visible to that school's Principal.
- **Masking** where useful: phone shown as `98XXXXX210` unless permitted.
- **Parent consent** on first login: short privacy notice + accept (stored with date).
- **Data rights**: export a school's data; archive/erase a person's data on request (Admin + Principal).
- Passwords one-way hashed (F3); data encrypted in transit (HTTPS) and at rest (Neon encrypts storage).

### F26 · School subscriptions (modular) 📝 `L`
Schools pay for **the modules they use**. Admin controls everything manually, including giving schools modules **for free**.

**Modules** (each can be ON/OFF per school)

| Module | Includes | Infra cost for us |
|---|---|---|
| **Core** (always on) | Logins (all roles), classes, timetable, attendance, marks, report cards, notices, calendar, banner (text), parent login | Low |
| **Communication** | Banner with images, consent forms & polls, push notifications | Low–Medium |
| **Leaves** | Teacher leaves (F8) + student leave by parent (F19) | Low |
| **Fees** | Monthly fees, extra fee rollout, receipts, reports (F10, F14, F11-A/B) | Low |
| **Online payments** | Gateway payments (F11-C) | Low (gateway fees paid per transaction) |
| **Transport** | Vehicles, routes, stops, student assignment (F9) | Low |
| **Staff attendance (GPS)** | Geofenced check-in/out, selfie optional (F22) | Medium (selfie storage) |
| **ID cards** | Student/staff ID cards with photo + QR (F21) | Medium (photo storage) |
| **Admissions** | Enquiries, follow-ups, online admission form (F23) | Low |
| **Gallery** | Event albums (F27) | **High** (storage + bandwidth) → storage quota per plan |
| **Extra roles** | Vice Principal / Coordinator (F24) | None |

**Pricing approach** (amounts set by Javed in the Admin panel — not hard-coded)
- **Per student per month** (matches how schools collect fees) with a **minimum monthly amount** per school.
- Core price + price of each add-on module, or **ready bundles**: *Basic* (Core) · *Standard* (Core + Communication + Leaves + Fees) · *Premium* (everything).
- **Storage quota** per plan (e.g. gallery/photos GB); extra storage as an add-on.
- Monthly or yearly billing (yearly discount optional).
- Pay-per-use items billed separately later: WhatsApp/SMS messages, AI features.

**Admin controls (manual)**
- Per school: choose bundle **or** switch modules individually; set **custom price** or **discount %**.
- **Free / Sponsored** flag: all or chosen modules free, with an optional end date (e.g. pilot schools, partners, NGOs).
- **Trial**: e.g. 30 days of Premium, then auto-switch to the chosen plan.
- Limits: max students, storage GB.
- Status: Active · Trial · Grace period · Suspended. On expiry → reminder → grace period → **read-only** (data never deleted, just locked from editing).
- Record payments received from schools (manual, like fee receipts) and generate an **invoice** PDF.
- Dashboard: revenue this month, schools by plan, expiring soon, free schools.

**How it works in the app**
- Each school has a **module list** stored on the server; the server rejects requests for modules the school doesn't have; the app hides those tabs and shows a friendly *"Available in Standard plan"* card to the Principal only.
- Usage meters: active students, storage used — shown to Principal and Admin.

---

## 🧩 Phase 2–3 — New modules (chosen 9 Nov)

### F19 · Student leave by parent 📝 `S`
- Parent applies: child, dates, reason (Sick / Family / Other), optional photo (e.g. doctor's note).
- **Class teacher approves/rejects** (Principal/VP can too); parent gets the result.
- Approved days show as **"On leave"** in attendance (not absent) and don't hurt the attendance warning the same way 💡.
- Class teacher sees "Who's on leave today" when marking attendance.

### F20 · Consent forms & polls 📝 `S`
- **Consent form**: e.g. "Trip to science museum on 20 Dec — ₹200". Parents tap **Yes / No** (+ optional comment); deadline; reminders.
- **Poll**: single/multiple choice for parents, teachers, or students (e.g. "Preferred PTM time").
- Audience: whole school / classes / roles. Live results with counts and a list of who hasn't responded.
- Export the list (e.g. students allowed on the trip). Optionally link a fee (F14) to a consent form 💡.

### F22 · Staff attendance (GPS geofence) 📝 `M`
- Principal sets the **school location** on a map + radius (e.g. 150 m).
- Teacher taps **Check in / Check out**; the app reads the phone's location and allows it **only inside the radius**.
- Optional **selfie** at check-in (setting); **fake-GPS apps detected** and blocked on Android.
- Late marks after a set time; works with working days, holidays (F4, F18) and approved leaves (F8).
- Principal: today's staff present/late/absent/on leave, monthly report.
- Location is read **only at check-in/out** — no background tracking (better privacy and battery).

### F21 · Digital ID card 📝 `M`
- Student and staff ID cards with **school logo, photo, name, class/role, admission no., blood group, parent phone, address**, validity year.
- **QR code** to verify the card (scan → shows the person is active in that school).
- View in the app; Principal can **print** cards as PDF (single or whole class, several per A4 page).
- Photo uploaded by Principal (or by parent, approved by school 💡).
- Template choice and colours per school 💡.

### F23 · Admissions & enquiries 📝 `M`
- **Enquiry**: parent name, phone, child, class sought, source (walk-in / call / website / referral), notes.
- **Pipeline**: New → Contacted → Visit scheduled → Applied → Admitted / Not interested; follow-up dates with reminders.
- **Online admission form**: a public link the school can share on WhatsApp/website; submissions arrive as enquiries.
- **Admit** in one tap → creates the student (and parent) account, with admission number and temporary password.
- Reports: enquiries this month, conversion rate, by source.

### F27 · Photo gallery 📝 `M`
- **Albums** per event (e.g. Sports Day 2026), for whole school or chosen classes.
- Principal/teachers upload many photos at once; photos are **compressed on the phone** before upload (saves data and storage).
- Parents/students view, swipe and download; who can upload is a permission (F24).
- **Storage quota** by plan (F26); old albums can be archived.

---

## 🖥️ Infrastructure & effort plan

**Today (free tier, fine for testing):** Render free API (sleeps when idle) · Neon free Postgres · no file storage.

**What real schools need**

| Need | Why | Option (approx. cost — confirm before buying) |
|---|---|---|
| API that doesn't sleep | First request after idle takes ~1 minute on free tier | Render paid instance (~$7/month to start) |
| Bigger database | More schools, photos metadata, audit logs | Neon paid plan when free limits are reached |
| **File storage** (photos, banners, ID cards, receipts PDFs) | Render can't keep files | **Cloudflare R2** (generous free tier, no download fees) or Cloudinary — one service for all images |
| Scheduled jobs | Monthly fee creation, subscription expiry, reminders | GitHub Actions scheduled workflow calling the API (free) or Render cron job |
| Push notifications | Alerts and reminders | Expo push service (free) / Firebase Cloud Messaging (free) |
| Backups | Safety | Neon point-in-time restore + weekly export |
| Optional paid per use | WhatsApp/SMS, AI, payment gateway | Billed to schools via F26 |

**Effort vs infra per feature**

| Feature | Dev effort | Infra impact | External service |
|---|---|---|---|
| F1 Multi-school, F3, F12 Archive | L | Low | — |
| F2 Admin, F25 Privacy, F24 Roles | L | Low | — |
| F26 Subscriptions | L | Low | — |
| F4 + F18 Calendar | M | Low | — |
| F13 Parent login | M | Low | — |
| F19 Student leave, F20 Consent & polls | S each | Low | Push (free) |
| F8 Teacher leaves | M | Low | — |
| F22 GPS staff attendance | M | Medium (selfies) | File storage |
| F15 Banner, F27 Gallery, F21 ID cards | M each | **Medium–High** (images) | File storage |
| F23 Admissions | M | Low | — |
| F9 Transport | L | Low | — |
| F10/F14 Fees & receipts | L | Low | PDF generation |
| F11-C Online payments | L | Low | Payment gateway |
| F16 Updates, F17 Builds | M / S | None | EAS (free), GitHub Actions (free) |

**Rule of thumb:** database-only features are cheap to run; anything with **photos** needs storage and should sit in paid modules with quotas.

## 🏗️ Architecture decision — one app or separate apps?

**Recommendation: ONE app, different interface per role** (what we already have). ✅

| Criteria | One app, role-based | Separate apps per role |
|---|---|---|
| Lightweight | ✅ Each role only loads its own screens; size difference is tiny (most of an app's size is the shared engine) | Slightly smaller each, but users with 2 roles (teacher + parent) need 2 apps |
| Maintenance | ✅ One codebase, shared components, one bug fix fixes all roles | 4 apps × builds, store listings, updates |
| Testing | ✅ One build to test; log in as each role | 4 builds to test and keep in sync |
| Updates (F16) | ✅ One version to manage | 4 versions, 4 update rules |
| AI maintenance | ✅ One repo, one `context.md`, one design system — easier for Claude to keep consistent | More context to juggle; easy for apps to drift apart |
| Security | ✅ Role checks happen on the **server**, so a student can't see principal data even inside the same app | Same server checks needed anyway |

**Notes**
- The **Super Admin** can live in the same app (only shows for admin logins) — handy since you work from your phone. Later, the same code can also be published as a **web admin panel** with no extra codebase.
- Separate apps only make sense for a very different user like a **bus driver GPS app** later — and even that can start as a role.

---

## 💡 More ideas from Claude (not requested yet)

| Idea | Why it helps | Size |
|---|---|---|
| **Push notifications** | Absence alerts, leave decisions, fee dues, consent reminders, banners (needed by many features above) | M |
| **Bulk import** (Excel/CSV) | Add hundreds of students/parents at once when a school joins | M |
| **Academic year & promotion** | Close the year, promote students, keep history | M |
| **Student profile** | Admission no., DOB, photo, parents, address, blood group, documents (feeds ID cards) | M |
| **Exam date sheet & report card PDF** | Printable, school-branded report cards | M |
| **Homework submission** | Students upload photos of work; teacher marks done/feedback | M |
| **Study material & quizzes** | Notes/PDFs per subject; auto-graded MCQ tests | M |
| **Parent ↔ teacher messages** | Chat with class teacher during set hours | M |
| **Gate pass / early pickup** | Parent requests, teacher approves, gate sees pass | S |
| **Certificates** | TC, Bonafide, Character certificate PDFs | M |
| **Syllabus tracker, remarks, salary slips** | Teacher productivity | S–M each |
| **Library, expenses, visitor log** | School operations | M each |
| **WhatsApp/SMS alerts** | Reach parents without the app (paid per message) | M |
| **AI helpers** | Ask-your-school data questions, report remarks, question papers, translation | M–L |
| **School groups** | One owner, many branches | M |
| **Hindi / regional language** | Easier for parents and staff | M |
| **Offline attendance** | Poor network areas | M |
| **Data backup & export** | Download school data | S |

---

## 🧪 Phase 1 notes
- Plan prices start at ₹0 — set real prices in **Admin → Plans**.
- Modules still marked **"Coming soon"**: Fees, Online payments, ID cards, Admissions, Gallery.
- Phase 2: banner images use an https link; photo upload, selfies at check-in and the gallery wait for image storage (Cloudinary/R2 account).
- Dates are typed (YYYY-MM-DD) with quick buttons; a calendar date picker can come later.

## ❓ Open questions for Javed
1. **Admin data access (F25):** by default, should Admin see student **names** across schools, or only counts/summaries unless the school allows more?
2. **Subscriptions (F26):** OK with **per student per month** + minimum per school, and bundles Basic / Standard / Premium plus individual add-ons?
3. **Phase 1 order:** F1 multi-school → F12 archive → F3 temp passwords → F13 parents → F24 roles → F25 privacy → F26 subscription engine (modules on/off) → F4/F18 calendar → F5 attendance rules. OK?

## 🔑 Accounts Javed will need when we implement
- **Cloudflare R2** or **Cloudinary** (free tier) — one storage for all images: banners, gallery, ID photos, selfies (F15, F21, F22, F27).
- **Expo** account (free) — only for EAS Update (F16). Builds use GitHub Actions instead.
- Payment gateway (Razorpay etc.) — only for option C of F11, much later.

_Nothing in this file is built until Javed says **"implement"**._

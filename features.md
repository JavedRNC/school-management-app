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
| F1 | Multi-school platform + **school code** login | 📝 | L | 1 |
| F2 | Super Admin (add schools, manage all users & data) | 📝 | L | 1 |
| F3 | Secure one-way passwords + temporary password flow | ✅ hashing · 📝 temp-password flow | S | 1 |
| F13 | **Parent login** | 📝 | M | 1 |
| F12 | **Soft delete / Archive** (active flag on all records) | 📝 | M | 1 |
| F4 | Configurable working days / weekly off | 📝 | M | 1 |
| F5 | Attendance: class teacher **compulsory**, others optional | ✅ base · 📝 rules | S | 1 |
| F6 | Toasts on all important actions | ✅ mostly · 📝 audit | S | 1 |
| F7 | Richer, easier UI (cards, shadows, glows) | ✅ partly · 📝 polish | M | ongoing |
| F15 | **Announcement banner** with images | 📝 | M | 2 |
| F8 | Teacher leave requests & Principal approval | 📝 | M | 2 |
| F9 | Transport management | 📝 | L | 2 |
| F10 | **Monthly fees**, fee receipts & ledger | 📝 | L | 3 |
| F14 | **Roll out extra fees** (activity/exam/maintenance) to school, classes or students | 📝 | M | 3 |
| F11 | Fee submission (payments) | 📝 | L | 3–4 |
| F16 | **App update pop-up** (optional / mandatory) configured by Admin | 📝 | M | 4 (Admin page later) |

---

## ✅ Decisions (answered by Javed — 9 Nov 2026)

| Topic | Decision |
|---|---|
| Login | **School code + login ID + password.** No email, no OTP. |
| Accounts | Principal creates Teacher, Student and Parent accounts with a **temporary password**. |
| Super Admin | Adds schools; manages Principals, Teachers, Students, Parents; **can see student details** (name, contact, address…). |
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
| OTA updates | **Yes** — set up EAS Update so small changes reach phones without a new download. |

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
- **View data**: student name, contact number, address, class, parents, attendance, fees.
- **Platform overview**: totals of schools/students/teachers/parents, active users, recently added schools.
- **Audit log** 💡 (recommended because Admin can see personal data): records every Admin view/change of a school's data — who, what, when.
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
- **Holiday calendar** 💡: festivals and vacations as one-off holidays, visible to all.
- **2nd/4th Saturday off** 💡 option.

### F5 · Attendance rules ✅ / 📝 `S`
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

### F10 · Monthly fees, ledger & receipts 📝 `L`
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

### F14 · Roll out extra fees 📝 `M`
For one-off or occasional charges: Examination fee, Activity fee, Maintenance fee, Annual day, Trip, etc.

- Principal creates a fee: **name, amount, due date**, optional note.
- **Who pays**: ① whole school ② selected classes ③ selected students (search + multi-select, or "all of class except…").
- **Preview before sending**: "₹500 × 214 students = ₹1,07,000".
- The fee is added to each chosen student's ledger and shown to parents/students; a toast + notification 💡 announces it.
- Can be **archived** (if rolled out by mistake) — removes it from unpaid ledgers, keeps an audit trail.

### F11 · Fee submission (payments) 📝 `L`
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
| **Push notifications** | Absence alerts, leave decisions, fee dues, new homework, banners | M |
| **Bulk import** (Excel/CSV) | Add hundreds of students/parents at once when a school joins | M |
| **Academic year & promotion** | Close the year, promote students, keep history | M |
| **Student profile** | Admission no., DOB, photo, parents, address, blood group, documents | M |
| **Exam date sheet & report card PDF** | Printable, school-branded report cards | M |
| **Hindi / regional language** | Easier for parents and staff | M |
| **Offline attendance** | Mark with poor network; syncs later | M |
| **Data backup & export** | Download school data | S |

---

## ❓ Open questions for Javed
_None right now._ 🎉

## 🔑 Accounts Javed will need when we implement
- **Cloudinary** (free) — for banner images (F15).
- **Expo** account (free) — for EAS Update / app builds (F16).
- Payment gateway (Razorpay etc.) — only for option C of F11, much later.

_Nothing in this file is built until Javed says **"implement"**._

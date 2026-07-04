# Dental Clinic System — Webhook, Reminders, & Billing Handoff

**Last updated:** 2026-07-03  
**Scope:** Messenger webhook hardening (Ate Claire AI), booking flow fixes, reminder/notification delivery fixes, Supabase data-exposure lockdown, Facebook Login for Business (`config_id`) connect flow, **Phase 1 Billing System MVP** (manual GCash invoice recording), and **Patient Files Phase 1** (radiographs / photos / documents storage).
**Repo:** github.com/kingppg/finsys-clinics (branch `main`)
**Backend host:** Render — https://finsys-clinics.onrender.com (auto-deploys on push to `main`)
**Frontend:** Vercel. Backend URL is set in Vercel env `REACT_APP_API_URL` (not in the repo).

### Environment variables (Render backend)
| Var | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | DB access (service role; bypasses RLS) |
| `ANTHROPIC_API_KEY` | Claude (Claire) |
| `FB_CLIENT_ID`, `FB_CLIENT_SECRET` | FB OAuth; `FB_CLIENT_SECRET` also used as the webhook signature secret (`FB_APP_SECRET` falls back to it) |
| `BACKEND_URL` | `https://finsys-clinics.onrender.com` — base for the FB OAuth `redirect_uri` (was hardcoded localhost) |
| `FB_LOGIN_CONFIG_ID` | `1735537977881310` — Facebook Login for Business Configuration ID; enables the `config_id` connect flow |
| `FB_VERIFY_TOKEN` | (optional) webhook verify token; falls back to the legacy hardcoded value |

Note: frontend uses the **public anon key** (`frontend/src/supabaseClient.js`) and logs in with **Supabase Auth**.

---

## 1. What this system is

A multi-clinic dental appointment system. Patients chat with a Facebook Messenger bot ("Ate Claire") to book/confirm/cancel appointments. Staff manage appointments and reminders from a React dashboard. Data is in Supabase. Reminders go out via Messenger and/or SMS.

Key backend files (Appointments & Reminders):
| File | Role |
|---|---|
| `backend/webhook.js` | Messenger webhook + booking state machine |
| `backend/ai/claire.js` | Claude (Haiku) intent detection + reply generation |
| `backend/helpers/messengerHelpers.js` | `sendMessage`, clinic context, send helpers |
| `backend/helpers/bookingHelpers.js` | DB helpers (slots, patients, double-booking) |
| `backend/menu/*` | Messenger button/template senders |
| `backend/reminderScheduler.js` | **Automatic** scheduled reminders (cron) |
| `backend/routes/reminders.js` | **Manual** "Send Reminder Now" endpoint |
| `backend/routes/statusNotifications.js` | Status-change messages (Confirmed/Checked-In/etc.) |
| `backend/index.js` | Express app, socket.io, OAuth (`config_id`), SMS test/balance/save |
| `backend/test-webhook.js` | Offline test harness (no FB/DB/LLM needed) |
| `backend/helpers/sessionStore.js` | **Persistent conversation state** (messenger_sessions table; in-memory fallback on DB outage) |
| `backend/db/migrations/002_messenger_sessions.sql` | Sessions table + RLS lockdown (**run in Supabase before/with deploy**) |
| `backend/db/secure-clinics-columns.sql` | Column-level grants locking clinic secrets (run in Supabase) |
| `backend/db/secure-users-table.sql` | RLS locking the users table (run in Supabase) |

Key backend files (Billing):
| File | Role |
|---|---|
| `backend/routes/billing.js` | Invoice management, payments, tax rates, financial reports (25+ endpoints) |
| `backend/db/migrations/001_billing_schema.sql` | Database schema: invoices, invoice_items, payments, payment_plans, tax_rates, audit_log |

Frontend: `frontend/src/components/AppointmentReminderControl.jsx` (reminder settings + manual send), `frontend/src/components/ClinicConfig.js` (FB + SMS config; reads/writes via safe columns + backend endpoints), and **`frontend/src/components/BillsPaymentEnhanced.jsx`** (Phase 1 billing UI: invoice list, manual GCash payment recording, aging analysis, collections metrics).

---

## 2. Work completed this round (with commits)

### a) Webhook hardening + smarter intent — `808e376`
- **Claire conversation history fix** (`ai/claire.js`): history is committed only after a successful API call, and the request is always sliced to start on a `user` turn. Fixes (1) long chats breaking around the 6th message (the API requires the first message to be `user` and roles to alternate) and (2) a failed API turn leaving a dangling `user` turn that corrupted all later calls. History is also bounded to avoid unbounded growth.
- **Confidence gating** (`webhook.js`): book/cancel/confirm transitions only fire when Claire's `confidence >= 0.6`; below that the message is treated as a question and answered, not forced into a flow.
- **Facebook signature verification** (`webhook.js` + `index.js`): verifies `X-Hub-Signature-256` (HMAC of the raw body using the app secret). `index.js` captures `req.rawBody` via `express.json({ verify })`. If no secret is set it logs a warning and allows (dev bypass). **Active in production** (returns 403 to unsigned POSTs).
- **Removed `console.log('ENVIRONMENT:', process.env)`** that dumped all secrets on boot.
- **Booking logic:** patient inserted only on explicit confirm; cancel-at-summary records a Cancelled appointment + captures the contact (customer list / analytics / follow-up) instead of writing junk on unclear input; someone-else booking uses strict phone+name match and asks the guardian to confirm (masked phone) on a name-only match; fixed FOR_ME/FOR_SOMEONE_ELSE postback handling, for-whom ordering, and the greeting heuristic (word-boundary matching).
- Added `backend/test-webhook.js` — offline harness, 25 checks, run `node test-webhook.js`.

### b) Deprecated message tag hotfix — `64bea2e`
- Facebook **deprecated the `CONFIRMED_EVENT_UPDATE` message tag** (Send API error 100 / subcode 1893061 "Deprecated Message Tag Not Allowed"). `sendMessage` set that tag on every text reply, so **every text reply was silently rejected** (templates/menus, which have no tag, still delivered — that's why the intro menu worked but answers didn't).
- Fix: `sendMessage` now uses `messaging_type: "RESPONSE"` (correct for any reply within the 24h window — always true for live conversation). **Verified working in production** (full booking completed end-to-end).

### c) Reminder + status notification delivery fixes — `7bda13d`, `9c2692a`
- `reminderScheduler.js` (automatic): dropped the deprecated tag (now `messaging_type: "UPDATE"`); SMS helpers return whether they actually sent; a reminder is logged as "sent" **only when something truly went out** (previously a clinic with no SMS provider was logged as reminded and dedup blocked retries forever).
- `routes/reminders.js` (manual) and `routes/statusNotifications.js`: these used the shared `sendMessage`, which **swallows its own errors and never throws** — so when the 24h window was closed, the send failed silently but the route reported success and never fell back to SMS. Both now use a local Messenger sender that throws on failure, and only report success when Messenger or SMS truly delivered. The manual button now returns an **honest error** when nothing could be delivered, instead of a fake "success."

### d) Supabase data-exposure lockdown — `05848c9`, `4a7297b` (+ SQL run in Supabase)
- **Problem:** the frontend uses the public anon key (ships in the JS bundle), and the `clinics` and `users` tables were readable by anyone with it — exposing every clinic's `fb_page_access_token` / `sms_api_key` / `sms_api_secret`, and all staff email/name/role. (`patients` was already protected.) Verified by querying the live REST API with the anon key.
- **`clinics` fix** (`05848c9` + `backend/db/secure-clinics-columns.sql`, **run in Supabase ✅**): column-level grants — anon/authenticated can read/write only SAFE columns; the 3 secrets are service-key only. Secret handling moved server-side: FB token via `/api/clinics/:id/facebook/select-page`, SMS creds via new **`PUT /api/clinics/:id/sms`** (blank key = keep existing). Frontend `ClinicConfig.js` now reads only safe columns and shows FB **connection status** instead of the raw token. **Verified:** anon read of secrets → `permission denied`.
- **`users` fix** (`4a7297b` + `backend/db/secure-users-table.sql`, **run in Supabase ✅**): RLS enabled; `authenticated` allowed (app uses Supabase Auth, all `users` reads happen post-login), `anon` denied. **Verified:** anon read → `[]`. Login + Users Config confirmed still working. Rollback if ever needed: `ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;`.

### e) Facebook OAuth: env redirect + Login for Business config_id — `05848c9`, `9ab473c`
- OAuth `redirect_uri` now uses the `BACKEND_URL` env (was hardcoded `http://localhost:5000`, which broke the connect flow in production).
- The connect endpoint now uses **`config_id`** (`FB_LOGIN_CONFIG_ID` env) when set — required by "Facebook Login for Business" apps — and falls back to the classic `scope=` flow otherwise. **Verified** the live endpoint emits `&config_id=1735537977881310`.
- **Current blocker (Meta-side, not code):** "Reconnect Facebook Page" returns *"Feature Unavailable… updating additional details for this app."* This is because the app's **App Review for the use-case permissions is incomplete — Meta asked the owner to resubmit the use-case demo videos.** Until that review passes, Facebook Login stays gated. The existing Palodentcare connection still works (uses its already-issued token); only *new* connections / going public are blocked. Nothing in our code needs to change — reconnect will work once Meta approves.

### f) Claire's intent handling & booking logic hardened (14 fixes) — `9dc7072`
**Goal:** Make Claire smarter to catch off-topic messages within task flow, eliminate loopholes in booking/confirm/cancel, separate guardian/patient identity, and fix timezone + dedup bugs.

**Critical state-machine fixes:**
- **Fix #1:** Handle orphaned `awaiting_unknown_confirm` state (was set but never handled → messages fell to default case)
- **Fix #2:** Apply confidence threshold to ALL intents, including greetings (low-conf greet no longer forces menu)
- **Fix #3:** Greeting + question detected → answer the question, don't just send greeting + menu
- **Fix #4:** At confirmation, let Claire answer off-topic questions (e.g., "What's the dentist's name?") without forcing re-prompt
- **Fix #4b:** Add confidence threshold to confirm/cancel intents at summary screen (prevent accidental confirmations on low-conf input)

**Race conditions & data integrity:**
- **Fix #5:** Re-verify slot is free immediately before insert (two concurrent bookings claimed same slot → now both checked)
- **Fix #9:** Search for existing patient by name before creating duplicate (e.g., patient booked via clinic app, later books via Messenger)
- **Fix #10:** Transaction-like safeguard for patient+appointment insert (already correct; affirmed)

**Identity & timezone:**
- **Fix #6 & #11:** Use clinic timezone consistently in cancellation date checks (was mixing local `Date()` with UTC `appointment_time` → off by ±24 hours depending on user's local time)
- **Fix #7:** **Separate guardian from patient identity:** never link sender's messenger_id to patient record during confirmation; only link self-bookings. During confirmation, if sender is a different patient, mark as `guardian_messenger_id`, not `patient.messenger_id`. Prevents conflating parent/child identities.

**Terminal states:**
- **Fix #13:** Prevent canceling Completed appointments (only Cancelled/No Show were checked)

**Reminder system improvements:**
- **Fix #14 & #17:** Template variables for reminder messages (`[PATIENT_NAME]`, `[DATE]`, `[TIME]`) + default name to "there" instead of empty string
- **Fix #15:** Document dedup logic (single-channel design acknowledged; multi-channel would require dedup key redesign)
- **Fix #16:** Make reminder logging non-fatal (message sent = success, even if audit log fails; prevents false 500 errors)

### g) Billing System: premium upgrade of the ORIGINAL BillsPayment (final state)
**History:** a first attempt (`5e217b2`, `9105307`) replaced the owner's existing `BillsPayment.js` with a new `BillsPaymentEnhanced.jsx` — this stripped working features (Invoice Management modal, SOA printing, payments audit) and was **rolled back** (`c9b76d1`, Enhanced files deleted). The final approach ENHANCES the original component instead of replacing it.

**What the billing module is now (frontend):**
- `frontend/src/components/BillsPayment.js` — the original ledger, untouched in behavior, now with **subtabs**: *Invoices* (original invoice + payments-audit tables, Add Invoice, Manage, SOA, Pay) | *Aging Analysis* | *Collections*.
- `frontend/src/components/billing/billingAnalytics.ts` — pure, read-only analytics (TypeScript). Computes aging buckets and collections KPIs **client-side from the rows the ledger already loads** (no backend calls, no prod-URL coupling). Conventions mirror the SOA exactly: `balance = invoice.total − paid`; statuses compared case-insensitively; missing due_date falls back to invoice_date (never falsely "90+ overdue").
- `frontend/src/components/billing/AgingAnalysis.tsx` — bucket cards (amount + count, click-to-filter), proportional distribution bar, scrollable outstanding-invoices table with days-overdue chips.
- `frontend/src/components/billing/CollectionsOverview.tsx` — KPI cards (Billed / Collected / Outstanding / Collection Rate), collection-rate progress, 6-month billed-vs-collected bars, payment-method donut (hand-rolled SVG — no chart lib).
- `frontend/src/components/AddPaymentForm.js` — restyled to the module's modal system; added **OR # field** and method-aware reference label (GCash Reference No. when GCash selected). Insert payload otherwise unchanged (DB triggers own totals/status).

**Theme architecture (`frontend/src/themes/`):**
- `types.ts` / `darkExecutive.ts` / `index.ts` / `DcThemeProvider.tsx`. One theme object → CSS variables (`--dc-*`) set on a **scoped** wrapper; layout lives in component CSS, cosmetics in theme tokens. Registry + `useDcTheme()` are ready for the future Clinic Config theme picker (selection persists in localStorage `dc-theme-id`). Currently scoped to the Billing module only; rest of app unaffected. The SOA receipt is deliberately NOT themed (paper document — stays white on screen and in print).
- TypeScript enabled: `typescript@5.5` (pinned; TS 6 breaks react-scripts 5 peer deps — install with `--legacy-peer-deps`), `tsconfig.json`, `@fontsource/inter`.

**Database notes (important):**
- `invoices` / `invoice_items` / `payments` **pre-existed** with their own schema; totals & item totals are computed by **DB triggers** (client inserts qty/unit_price only). Statuses are capitalized: `Unpaid` / `Partial` / `Paid`.
- Migration `backend/db/migrations/001_billing_schema.sql` was run in Supabase: it added columns to `invoices` (invoice_number, subtotal, tax_amount, adjusted_amount, gcash_reference…) and `payments` (or_number, payment_date, gcash_reference, reconciled_at), and created `payment_plans`, `payment_plan_installments`, `tax_rates`, `audit_log` (all currently unused scaffolding). Its `CREATE TABLE IF NOT EXISTS invoice_items` was skipped (table existed).
- `backend/routes/billing.js` REST API is mounted at `/api/billing` but **the UI does not depend on it** (frontend reads Supabase directly, same as the rest of the app). Fixed there anyway: case-sensitive status filters (`.neq('status','paid')` never matched `'Paid'`) and null due_date being bucketed as 90+ days overdue.

**Invoices table (shipped):** search (patient/ID), status filter chips with live counts (All/Unpaid/Partial/Overdue/Paid/Voided), sortable columns, 20-per-page pagination, totals footer for the filtered set. **Void action** = soft cancel (status→'Cancelled', kept for audit, hidden from the default view, excluded from analytics); disabled whenever the invoice has recorded payments. Container widened to 1600px max.

**Odontogram (shipped):** rebuilt as `frontend/src/components/odontogram/` (TypeScript, Dark Executive tokens, self-wrapped in DcThemeProvider). Full-mouth anatomical oval chart, per-tooth surface rings anatomically oriented (Buccal outward, Mesial toward midline — the old flat chart had M/D fixed and wrong for half the mouth), live center info panel, condition chips with counts, undo (30 steps), dirty tracking, themed clear-confirm. **Persistence contract unchanged** (odontograms table, tooth_data shape, upsert on patient_id) — legacy `Odontogram.js` kept on disk for one-line rollback. Patients profile modal widened 720→880.

**Deferred / future:** odontogram 3D view toggle (Three.js + GLTF dentition model with 32 separated tooth meshes — asset needs licensing decision; 3D = patient education, 2D stays the data-entry surface); CSV export of filtered view; dentist column; theme picker in Clinic Config; additional themes; prune unused deps (highcharts — commercial license, shadcn-ui npm package, recharts, tailwind); Playwright E2E; backfill formal `invoice_number` sequence (BIR consideration).

**Payment modal (post-deploy addition):** `AddPaymentForm.js` is now POS-style — giant amount readout, on-screen numpad, big method buttons, "Exact" tender button (fills balance due, passed from parent via `balanceDue` prop), live remaining/overpayment readout. Insert payload unchanged.

### h) Patient Files Phase 1 — imaging & document storage + full-page patient profile — `0e0d5dd` (**DEPLOYED 2026-07-03**, owner-tested locally)
Adds storage for dental radiographs (bitewing, periapical, panoramic/OPG, CBCT, occlusal, cephalometric), clinical photos (intraoral, extraoral, smile), and documents (treatment plan, prescription, lab result, referral, consent, other) per patient. Digital files AND phone photos of physical films both supported (plain file input accepts camera captures).

- **Migration `backend/db/migrations/003_patient_files.sql`** (⚠️ **must be run in Supabase before testing**): `patient_files` table (uuid PK, clinic_id, patient_id FK cascade, optional appointment_id FK, category CHECK, FDI tooth_number CHECK, title/notes/taken_date, file_path/file_name/mime_type/file_size, uploaded_by, soft `deleted`, timestamps) + RLS (authenticated allowed / anon denied, same convention as `users`) + **private** Storage bucket `patient-files` (25 MB cap, images+PDF only) + storage policies (authenticated only). Files are served exclusively via 1-hour signed URLs; bucket never public. Idempotent — safe to re-run.
- **`frontend/src/components/patients/PatientFiles.tsx`** (+ `patientFilesData.ts`, `PatientFiles.css`): self-wrapped in `DcThemeProvider` (same pattern as Odontogram); gallery grid with group filter chips (All/Radiographs/Photos/Documents + counts), multi-file drag-drop upload modal (category required, taken date, optional FDI tooth, optional appointment link, notes), viewer modal (full image / open-PDF, details panel, download via blob, edit metadata, soft delete with confirm). Failed metadata insert removes the just-uploaded storage object (no orphans). CSS is layout-only on `--dc-*` tokens; group tones are token references (`--dc-info`/`--dc-accent`/`--dc-warning`), so Light Executive later restyles it for free.
- **Patients integration — FULL-PAGE PROFILE (owner-requested):** clicking a patient's name now opens a **full-viewport profile page** instead of the old 880px modal (owner: "modal is small and hard to visuals"). New `frontend/src/components/patients/PatientProfile.tsx` (+ `.css`) — Dark Executive header (avatar, contact, appointment count), subtabs **📋 Appointment History | 🦷 Odontogram | 🩻 Images & Files**, "← Back to Patients" returns to the list (and refetches). History tab re-rendered in dc-tokens (status tones via token map); Odontogram and PatientFiles drop in unchanged. `Patients.js`: profile-modal branch removed, `openProfile`/`closeProfile` view switch added (same pattern as AppointmentsModern's view switching); Add/Edit/Delete modals untouched.
- **Profile page ergonomics (owner-requested):** `PatientProfile` is a fixed-height workstation (`height: calc(100vh - 44px)`) — header (name/contact) and tab bar stay pinned while `.pp-body` scrolls; the odontogram's condition palette (`.odo-palette`) AND the files toolbar (`.pf-toolbar`, filter chips + Upload) are `position: sticky` within that scroll area, so name → tabs → toolbar chips all stay visible while working. Profile height is `calc(100vh - 62px)` (= `<main>` 8+8 padding + `.dc-page` 10+36 margins) so the page fits the viewport exactly — no outer scrollbar. Root cause of the lingering outer scrollbar was the **global `App.js` footer** ("© 2025 Finsys", `marginTop: 2rem`) rendered below the 100vh dashboard `<main>` on every route — it now renders only on public pages (`showFooter = !pathname.startsWith('/dashboard')`); login/signup/reset/queue keep it. Second offender: Dashboard `<main>` had `minHeight: 100vh` with content-box padding (no `boxSizing`) → always 16px taller than the viewport; fixed with `boxSizing: 'border-box'` in `Dashboard.js`. Odontogram chart downsized for the full page (`.odo-chart-wrap` max-width 1080px, centered) — owner evaluating the size.
- **Shared page layout (`.dc-page`) — NEW STANDING RULE:** `frontend/src/styles/dcPage.css` (loaded globally in `src/index.js`) provides the Billing-style breathing gutters (`max-width: 1600px; margin: 10px auto 36px`) for every full-page module. Owner directive: from now on all full-page views wrap their themed root in `<div className="dc-page">` — no per-module hardcoded widths/margins. First adopter: PatientProfile. (Billing's `.bills-container` predates it and keeps its local copy for now.)

### i) CSS primitives layer — single layout source of truth for repeatable patterns (**BUILT, awaiting owner test**)
Owner directive (mirrors his other project): **one shared layout file** owns every repeatable pattern (buttons, chips, pills, modals, form fields, tabs, banners, empty states); a change there corrects all components in all themes. Component CSS keeps **only** geometry unique to that component. This replaces the copy-paste duplication that had started (chips/buttons/modals were defined 2–3×).
- **`frontend/src/styles/dcPrimitives.css`** (loaded globally in `src/index.js`, after `dcPage.css`): `.dc-btn` (`--primary`/`--ghost`/`--danger`/`--danger-solid`), `.dc-chip` (+ `.dc-chip-dot`, `.dc-chip-count`, `.dc-chip-count--tone` for filled tone counts), `.dc-pill`, `.dc-banner` (`--ok`/`--err`), `.dc-empty` (+ icon/title/hint), `.dc-overlay` + `.dc-modal` (`--sm`/`--wide`, `.dc-modal-title`/`-actions`/`-close`, styles child `p`), `.dc-field` (+ `--wide`, styles child input/select/textarea/`> span`), `.dc-tabs`/`.dc-tab`, `.dc-loading`. All cosmetics via `--dc-*` tokens; tone-aware pieces read inline `--tone`/`--tone-soft`.
- **Migrated:** Odontogram (chips, action buttons, clear-confirm modal, loading), PatientFiles (filter chips, buttons, banner, empty, upload+viewer modals, category pill, form fields, loading), PatientProfile (tab bar, empty state). Each component's own CSS now holds only unique geometry (odontogram arch/surface rings/center panel; files gallery grid/cards/dropzone/viewer split; profile header/history rows). Net CSS bundle got **smaller** despite the added file (dedup). Visual no-op — verified `tsc --noEmit` + `npm run build`.
- **RULE going forward:** any pattern that appears in a 2nd component graduates into `dcPrimitives.css`; component CSS never (re)defines a button/chip/modal/field. Billing (`BillsPayment.css`, live) not yet migrated — planned as a later careful pass.
- **Still ahead (app-wide theming rollout):** see item (j) — rollout has now STARTED (root injection + sidebar + calendar).

### j) App-wide theming rollout — STARTED: root token injection + Sidebar + Calendar View (**BUILT, awaiting owner test**)
Owner directive: theme the whole app one module at a time, **including the side nav so each theme's sidebar is consistent with it**. First module: Calendar View. Chosen approach (owner-approved): full CSS refactor for the calendar; preserve the current navy sidebar look via tokens.
- **Root token injection — `DcThemeRoot`** (`themes/DcThemeProvider.tsx`, mounted in `Dashboard.js` wrapping the shell): writes the active theme's `--dc-*` variables onto `:root` (`document.documentElement`) via new `applyThemeVars()`, **without** forcing global color/background/font — so the sidebar, calendar, and every future module read the same tokens while un-migrated modules stay exactly as-is (variables are inert until referenced). Renders no wrapper div. Same `localStorage` key as `DcThemeProvider`; provides context for the future Clinic Config picker. This is also the groundwork for theming body-mounted portals (SweetAlert2).
- **Nav token group** added to the theme contract (`themes/types.ts` `DcNavTokens`; `darkExecutive.ts` `nav`): `from/to` (gradient), `accent`, `activeBg`, `hoverBg`, `bottomBg`, `border`, `logoutBg` — emitted as `--dc-nav-*`. Dark Executive's nav values are the **exact original sidebar colors** (navy gradient #0d253f→#24406e, cyan #2bc1ff), so the sidebar looks unchanged today and a future light theme flips it for free.
- **`Sidebar.css` tokenized:** every hardcoded color → `var(--dc-nav-*)`/`var(--dc-text*)` with original-value fallbacks; geometry untouched.
- **Calendar full refactor:** `CalendarForCalendarView.jsx` was 100% inline-styled with hardcoded hex + JS hover handlers → now class-based against new **`CalendarView.css`** (layout only). Colors via `--dc-*`; the 6 appointment-status colors map once to `--cal-*` vars on `.cal-root` (confirmed→success, scheduled→info, completed→violet #A78BFA, checked-in→accent, no-show→warning, cancelled→danger). JS hover replaced by CSS `:hover`; cell states (today/stale/has-appointments) are className modifiers. Behavior unchanged. `CalendarView.jsx` root now `.cal-root`.
- **Calendar fluid + centralized table gutter (owner-requested):** calendar was fixed `1150px` (left-aligned, empty right gap) → now `.cal-card { width:100% }` inside `.dc-page` (centered, max 1600) with `.cal-cell { min-width:0 }` so the 7 `1fr` columns grow/shrink with the viewport ("maximize the viewport, adjust all cards in size"). Centralized edge-gap: `dcPage.css` now defines `--dc-gutter: 24px` on `:root` + a `.dc-table` helper (`padding-inline: var(--dc-gutter)`) — the one place to control left/right table gaps in every theme; standalone tables adopt `.dc-table`, full-page modules use `.dc-page`. No more per-table gutter tweaking.
- Verified `tsc --noEmit` + `npm run build`. **Not committed** — owner to eyeball first.
- **Rollout pattern for the next modules:** tokens already on `:root`; per module = swap hardcoded colors → `var(--dc-*)` (+ new token groups only when a surface needs its own, like nav), geometry untouched. Remaining: Appointments, Queue, Patients list, Dentists, Procedures, Clinic Config, Chat, then third-party CSS (SweetAlert2, react-select, react-big-calendar) and the theme picker.
- **Appointments integration:** new folder icon in the appointments table Actions column (`AppointmentsTable.jsx`, rendered only when the `onFiles` prop is passed) opens the same component in the wide modal (`AppointmentsModern.js`) with **`defaultAppointmentId`** — uploads from there are pre-linked to that appointment.
- Verified: `npx tsc --noEmit` clean, `npm run build` succeeds.
- **Deferred (Phase 2):** odontogram per-tooth image badges, before/after photo pairing, CBCT/DICOM support, visit-encounter model (files carry `appointment_id` already, so a future visit model can adopt them).

---

## 3. THE CENTRAL CONSTRAINT: Facebook's 24-hour rule

A Facebook Page can only freely message a person **within 24 hours of that person's last message to the Page** ("standard messaging window"). Outside it, Messenger refuses the message. **This is permanent platform policy — no code change removes it, and it is NOT lifted by App Review/permission approval.**

What that means here:
- **Live conversation** (patient just messaged) → always within 24h → works fine.
- **Reminders** are by nature sent days/weeks after the patient last chatted → almost always **outside** the window → Messenger refuses them. That's why reminders only "worked" right after the user messaged the page.

Sanctioned ways to message outside 24h (all with strings attached):
| Mechanism | Reaches dormant patients? | Catch |
|---|---|---|
| Message Tags (e.g. CONFIRMED_EVENT_UPDATE) | Was the old way | **Deprecated / rejected now** |
| Recurring Notifications | Yes, on a schedule | Patient must tap an **opt-in button** first |
| Human Agent tag | Only within **7 days** of patient's last msg | **Human-sent only**, not automated reminders |
| **SMS** | **Yes, always** | ~₱0.50/text; patient needs a phone number |

App Review approval (`pages_messaging` "message sending", `pages_show_list` "page show display") controls **who** the bot can message (testers-only vs the public) — it does **not** touch the 24-hour timing. You still need that approval to go live publicly.

---

## 4. ACTION REQUIRED (the real fix for reminders): turn on SMS

The code already supports Semaphore/Twilio and falls back to SMS when Messenger can't deliver. SMS has no 24h window. SMS config is saved server-side via `PUT /api/clinics/:id/sms` (a blank key keeps the existing one). As of 2026-06-13, Palodentcare is set to **`sms_provider = "semaphore"` but has 0 credits**, so no SMS sends yet.

Steps (clinic owner):
1. Sign up at https://semaphore.co, **load credits** (currently 0 — the UI shows "0 credits remaining — Low balance").
2. Copy the API key from the Semaphore dashboard.
3. App → Clinic Settings → SMS: Provider = **Semaphore**, paste **API key**, Sender = **Palodentcare** (must be a Semaphore-approved sender name, else use "SEMAPHORE").
4. Use the **Test SMS** button (`/api/clinics/:id/sms/test`) to confirm.
5. Ensure patients have **phone numbers** saved — Messenger-only patients who typed "skip" on the phone question can't receive SMS.

After credits are loaded, both automatic and manual reminders reach anyone with a phone number, regardless of the 24h window. (Messenger is still tried first for free delivery to recently-active patients.)

Note: with 0 credits, the briefly-exposed Semaphore key has no value to an attacker, so rotation isn't urgent — but **rotate it (via Semaphore support) before loading credits for launch.** SMS save runs through the backend now, so the key never touches the public anon client.

---

## 4b. Persistent Messenger sessions (shipped) + webhook/reminder audit backlog

**Shipped:** `userStates` no longer lives only in process memory. The webhook route hydrates each user's session from `messenger_sessions` before handling a message and persists it after (`helpers/sessionStore.js`); idle sessions delete their row, stale ones expire (12h TTL on read, 24h purge). Deploys/restarts no longer orphan mid-booking patients; also fixes the unbounded `userStates` memory growth. DB outage degrades gracefully to in-memory (old behavior). State machine untouched — offline harness still 25/25. **Requires `002_messenger_sessions.sql` run in Supabase** (code is safe either way; without the table it just logs and falls back to memory).

**Auth on send endpoints (SHIPPED):** `middleware/requireAuth.js` verifies the staff Supabase Auth JWT (frontend sends it via `src/api/authHeaders.js`) and resolves the users-table profile by email; `sameClinic(...)` enforces the caller may only act on their own clinic (superadmin exempt). Protected: reminders router (`/appointments/*` settings + send), `/status-notifications/*`, and `/api/clinics/:id/sms` + `/sms/test` + `/sms/balance`. Webhook stays public by design (Facebook calls it, HMAC-verified). Still open: `/api/clinics/:id/facebook/*` (browser OAuth redirects can't carry a JWT header — needs a state-param design, see §5 item 10).

**Audit findings still OPEN (2026-07-03 review, prioritized):**
2. **Phone numbers not E.164-normalized** — `09xx…` stored as-is works for Semaphore (PH) but every Twilio SMS will be rejected. No conversion in any of the 3 sendSMS copies.
3. **Scheduler hot-reload misses fields** — job-refresh comparison omits `sms_api_secret` and `sms_sender`; rotating a Twilio secret keeps the OLD secret until process restart.
4. **Send logic duplicated** — sendSMS ×3, Messenger sender ×4 across scheduler/routes/helpers; should be one `helpers/notify.js` (fix 2–3 there in one pass).
5. **No webhook event dedup** — FB redeliveries can double-process (slot re-check mitigates double-booking, but duplicate patient inserts/messages possible).
6. **Hardcoded clinic hours** — 09:00–18:00, 20-min slots, 12:00–12:40 lunch, closed Sundays are hardcoded in bookingHelpers + Claire's prompt; per-clinic hours impossible.
7. Minor: manual reminder logs `sent_on_date` in UTC while scheduler uses clinic TZ; dead `awaiting_unknown_confirm` inner branch + unused `proceedToSlotSelection`; Graph API v17.0 pinned in ~5 places.

---

## 5. Outstanding / future items

1. **Meta App Review — resubmit use-case demo videos** *(current top blocker)*. Facebook Login is gated ("updating additional details") until the App Review for `pages_messaging` / `pages_show_list` passes. Meta asked the owner to resubmit the use-case screencast videos. This is the thing blocking new-page connections and going public. Meta-side, owner is working on it. (Offer stands to script the demo-video walkthrough.)
2. **Load Semaphore credits** — see §4. The unblock for actually sending reminders. Rotate the key first if loading real credits for launch.
3. **Auth on backend write endpoints** — `/api/clinics/:id/sms`, `/api/clinics/:id/sms/test`, `/api/clinics/:id/facebook/*` have **no login check** (consistent with the rest of the app). An attacker can't *read* anything (tables locked), but could *call* these to vandalize config. Add real login-based auth (the app uses Supabase Auth — verify the JWT) before public launch.
4. **Per-clinic RLS scoping** — current `users`/`clinics` policies are permissive for any authenticated user; a logged-in staffer could read other clinics' rows via the API. UI already scopes by clinic, so it's a refinement, not a leak. Tighten before onboarding many clinics.
5. **`reminderScheduler.js` Messenger path for dormant patients** — impossible without **approved utility templates** or **Recurring Notifications**. SMS is the channel; Messenger only catches recently-active patients.
6. **FUTURE OPTION — Human Agent tag on the manual "Send Reminder Now" button.** Once Meta approves the **Human Agent permission**, `routes/reminders.js` could send with `messaging_type: "MESSAGE_TAG"`, `tag: "HUMAN_AGENT"` to reach patients who messaged **within the last 7 days**. Caveats: recently-active only (7-day cap from patient's last message, not reset by sending); Meta intends it for genuine human support, not reminders → policy gray area / review risk. A "best-effort" enhancement, NOT a reminder solution. Not implemented — flagged on request.
7. **Recurring Notifications opt-in** — Messenger-native free reminders for patients who tap "Get appointment reminders." More involved; optional supplement to SMS.
8. **Phone capture** — encourage collecting patient phone numbers in the booking flow so SMS can reach them.
9. **Token rotation before launch** — FB Page token (auto-rotates on next successful Reconnect, once Meta unblocks) and Semaphore key (via support, before funding credits). Both were briefly anon-exposed before the lockdown.
10. **`state`-param OAuth refactor** — so new clinics don't each need their own FB redirect URI entry (clinic id is currently in the callback path). Pass clinic id in OAuth `state` + one fixed callback.

---

## 6. How to test

- **Offline harness:** `cd backend && node test-webhook.js` — 25 checks covering Claire history (long chats + error recovery), cancel-at-confirm recording, someone-else same-name guardian confirmation, and confidence gating. No Facebook/DB/LLM needed.
- **Backend health:** `GET https://finsys-clinics.onrender.com/` → "Dental Clinic Backend is running!"
- **Signature active check:** `POST` an unsigned body to `/webhook` → expect `403 Forbidden`.
- **Live conversation:** message the clinic page from a tester account; Claire should reply (text replies now deliver via `RESPONSE`).
- **Reminders:** can only be verified end-to-end after SMS credits are loaded (§4), or for a patient currently inside the 24h Messenger window.
- **Data-exposure lockdown:** with the public anon key, `clinics?select=...,fb_page_access_token,sms_api_key` should return `permission denied`, and `users?select=*` should return `[]`. Safe columns (name, sms_provider, etc.) still read fine.
- **FB connect:** `GET /api/clinics/1/facebook/connect` (follow redirect header) should point to `…/dialog/oauth?...&config_id=1735537977881310`.
- **Patient Files:** `003_patient_files.sql` has been **run in Supabase ✅** (2026-07-03). Test: Patients → click a patient's name → **full-page profile** opens → **Images & Files** tab → upload a JPG (any category) → thumbnail appears → click card → viewer shows image + details → download/edit/delete. From Appointments: folder icon on a row → upload → confirm the file shows "Appointment" pre-linked. Security check: the `patient-files` bucket must show **private** in Supabase Storage, and an anon (logged-out) REST read of `patient_files` must be denied.

### Local dev note
A running Node backend holds old code in memory until restarted. After pulling/editing backend files, **restart the backend** (`npm run dev` uses nodemon and auto-restarts; plain `node index.js` does not). The frontend's `API_BASE` falls back to `http://localhost:5000`, so local dev calls the local backend — keep it running and on latest code.

### Emergency rollback
- Webhook signature dropping real events (`Rejected webhook event — invalid signature`): unset `FB_APP_SECRET`/`FB_CLIENT_SECRET` in Render env, or `git revert <commit>`.
- `users` RLS broke login/user-management: `ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;` in Supabase.

---

## 7. Commit log for this work
| Commit | Summary |
|---|---|
| `808e376` | Harden webhook: Claire history, signature verify, intent accuracy, booking logic, test harness |
| `64bea2e` | Hotfix: `messaging_type RESPONSE` instead of deprecated tag (text replies were all being dropped) |
| `7bda13d` | Fix automatic reminders: drop deprecated tag, honest SMS fallback |
| `9c2692a` | Fix manual reminders + status notifications: real delivery detection, honest success/error |
| `bf949e7` | Add HANDOFF.md |
| `05848c9` | Security: lock clinic secrets (backend SMS-save endpoint, env OAuth redirect, frontend reads safe columns, secure-clinics-columns.sql) |
| `9ab473c` | FB: support Facebook Login for Business `config_id` flow |
| `4a7297b` | Security: RLS on `users` table (secure-users-table.sql) |
| `9dc7072` | Fix: strengthen Claire's intent handling & booking logic (14 fixes: state handling, confidence gating, timezone, guardian/patient identity, race conditions, reminders) |
| `0e0d5dd` | Patient Files Phase 1 (private storage, gallery, appointment linking) + full-page patient profile + `.dc-page` layout rule + outer-scrollbar fixes |
| `5e217b2` | BILLING first attempt: schema migration + REST API + BillsPaymentEnhanced UI (**UI later rolled back** — replaced owner's working component) |
| `9105307` | BILLING first-attempt integration (routes + Enhanced component into dashboard) — **UI portion rolled back** |
| `c9b76d1` | Revert dashboard to the original BillsPayment component |

*(Keep this table and the sections above updated after every change — this handoff is the source of truth.)*

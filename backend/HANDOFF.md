# Dental Clinic System — Webhook, Reminders, & Billing Handoff

**Last updated:** 2026-07-05  
**Scope:** Messenger webhook hardening (Ate Claire AI), booking flow fixes, reminder/notification delivery fixes, Supabase data-exposure lockdown, Facebook Login for Business (`config_id`) connect flow, **Phase 1 Billing System MVP** (manual GCash invoice recording), **Patient Files Phase 1** (radiographs / photos / documents storage), and the **app-wide UI theming rollout** (Dark Executive `--dc-*` token system extended across the app — see §k).
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

### i) CSS primitives layer — single layout source of truth for repeatable patterns (**DEPLOYED — see §k for current status**)
Owner directive (mirrors his other project): **one shared layout file** owns every repeatable pattern (buttons, chips, pills, modals, form fields, tabs, banners, empty states); a change there corrects all components in all themes. Component CSS keeps **only** geometry unique to that component. This replaces the copy-paste duplication that had started (chips/buttons/modals were defined 2–3×).
- **`frontend/src/styles/dcPrimitives.css`** (loaded globally in `src/index.js`, after `dcPage.css`): `.dc-btn` (`--primary`/`--ghost`/`--danger`/`--danger-solid`), `.dc-chip` (+ `.dc-chip-dot`, `.dc-chip-count`, `.dc-chip-count--tone` for filled tone counts), `.dc-pill`, `.dc-banner` (`--ok`/`--err`), `.dc-empty` (+ icon/title/hint), `.dc-overlay` + `.dc-modal` (`--sm`/`--wide`, `.dc-modal-title`/`-actions`/`-close`, styles child `p`), `.dc-field` (+ `--wide`, styles child input/select/textarea/`> span`), `.dc-tabs`/`.dc-tab`, `.dc-loading`. All cosmetics via `--dc-*` tokens; tone-aware pieces read inline `--tone`/`--tone-soft`.
- **Migrated:** Odontogram (chips, action buttons, clear-confirm modal, loading), PatientFiles (filter chips, buttons, banner, empty, upload+viewer modals, category pill, form fields, loading), PatientProfile (tab bar, empty state). Each component's own CSS now holds only unique geometry (odontogram arch/surface rings/center panel; files gallery grid/cards/dropzone/viewer split; profile header/history rows). Net CSS bundle got **smaller** despite the added file (dedup). Visual no-op — verified `tsc --noEmit` + `npm run build`.
- **RULE going forward:** any pattern that appears in a 2nd component graduates into `dcPrimitives.css`; component CSS never (re)defines a button/chip/modal/field. Billing (`BillsPayment.css`, live) not yet migrated — planned as a later careful pass.
- **Still ahead (app-wide theming rollout):** see item (j) — rollout has now STARTED (root injection + sidebar + calendar).

### j) App-wide theming rollout — STARTED: root token injection + Sidebar + Calendar View (**DEPLOYED — superseded by §k full status**)
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

### k) App-wide UI theming rollout — IN PROGRESS (all deployed as of 2026-07-04)
The Dark Executive `--dc-*` token system (built for Billing) now extends across the app, one module at a time. **Frontend-only, no logic/flow/DB changes.** Owner directive: as Chief Designer, *challenge & elevate* each module's design (premium SaaS), not just recolour it.

**Infrastructure (the enablers):**
- **`DcThemeRoot`** (`themes/DcThemeProvider.tsx`, mounted in `Dashboard.js`) → `applyThemeVars()` writes `--dc-*` onto `:root` WITHOUT forcing global color/bg/font — vars available app-wide, inert for un-migrated modules. Never wrap the dashboard in the scoped `DcThemeProvider` (it forces `color:text` and breaks light modules). `.dc-viewport` + `body` painted from `--dc-bg`.
- **Standard scaffold** — every module: `.dc-page` (centered 1600 gutters) + `.dc-page-header` (eyebrow + title + actions; font pinned to `--dc-font`). All in `styles/dcPage.css` (+ `--dc-gutter`).
- **Primitives** (`styles/dcPrimitives.css`, single source of truth): `.dc-btn`, `.dc-chip`, `.dc-pill`, `.dc-banner`, `.dc-empty`, `.dc-overlay`+`.dc-modal`, `.dc-field`, `.dc-tabs`, `.dc-loading`, **`.dc-table-wrap`/`.dc-table` + `.dc-icon-btn`** (shared table + row-action standard). `.dc-overlay` offset by `left: var(--dc-sidebar-w)` so modals dim/centre in the content area.
- **Shared status palette** `--dc-status-*` (one status colour language: Calendar, Appointments, StatusSelect).
- **Sidebar** — `--dc-nav-*` token group; redesigned (bundled FS logo + FinSys lockup, clinic workspace header, Feather/Lucide icons, active pill + tick, avatar footer), harmonized to Dark Executive navy + teal. **Collapsible** (click the brand; persisted in localStorage; `--dc-sidebar-w` drives sidebar width + `<main>` margin + modal centering; default collapsed <1024px for tablet).

**Modules done (all deployed):** Calendar View (premium: density heatmap, KPI count-up header, framer-motion), Appointments (list + segmented view toggle + Lucide row actions; booking form with titled sections + live summary bar + Lucide slot grid; reminder modal; wide-modal wrapper), Queue (staff monitor hero cards + realtime chairs picker + cast-to-screen setup; public `/queue-display` TV screen re-themed to teal, glow toned down for all-day viewing), Patients (list on `.dc-table` + sticky headers + Lucide icon actions; add/edit/delete modals on primitives), Dentists (same `.dc-table` + sticky pattern, status toggle pill, availability/edit/delete modals on primitives, helper note under table), **SweetAlert2 global theme** (`styles/swalTheme.css` — every dialog/toast app-wide), **Dentist Availability** (see below), and **Procedures** (see below).

**Dentist Availability — full-page workstation (deployed):** the old "Manage Availability" **modal is now a full-viewport page** (early-return that swaps the Dentists list, same pattern as clicking a patient's name → PatientProfile): `← Back to Dentists` + identity header (avatar/name/contact), fixed-height (`calc(100vh - 62px)`) with a scrolling body. `.dc-back-btn` graduated into `dcPrimitives.css` (2nd user after PatientProfile's `.pp-back`, which is left as-is for a future consolidation). The workstation itself (`DentistAvailabilityManager`) was redesigned premium — all derived/UI-state only, **save/delete DB flow untouched**: day **utilization meter** (segmented bar + % open), colour-coded **stat chips** (Open/Blocked/Booked/Lunch), **Block AM / Block PM** quick presets (+ the previously-dead `handleBlockAll`/`handleUnblockAll` now wired as Block All / Open All), premium slot tiles (state icons), and a redesigned Blocked-Periods list (dropped raw `ID`, `Start`/`End` → a range pill, current date highlighted). **react-calendar was REPLACED** with a purpose-built `AvCalendar` (own 7-col CSS grid → correct day placement + fills height; react-calendar's flex-margin day-offset broke under a grid override, and v6 wraps days in inline-styled divs — not worth fighting). `AvCalendar` disables past dates + Sundays (same rules as the old `tileDisabled`/`minDate`) and calls the same `handleCalendarChange`. Two-column layout: slots (main, left) + calendar (right rail, proportional `flex 1.35 / 1`, stretched to equal height; legend is a footer *inside* the calendar card so the card fills the column). react-calendar dep stays (AppointmentForm still uses it).

**Procedures (`ClinicProcedureManager`) — themed + elevated (deployed):** retired its parallel `--cpm-*` token system + Playfair/DM-Sans `@import`; full CSS rewrite on `--dc-*` (same `.CPM-*` class names + geometry preserved, so drag-drop/accordion/bulk/export logic untouched). Adopted `.dc-page` + `.dc-page-header` (eyebrow "Clinic Configuration" → "Procedures"). Added a **KPI strip** (Categories · Procedures · Avg Price · Price Range) + **per-category price-range chip** + card hover/open-accent polish (all derived, read-only). Design calls: unified font → `--dc-font`; price/KPIs → `--dc-success` (money-green); bulk-edit icon → violet `--dc-status-completed`; confirm/primary → teal accent; internal sticky header dropped (standard header instead). SweetAlert button colors removed from `swalConfig` (global `swalTheme.css` owns them). NOTE: component was already cleanly `.CPM-`-scoped — no global landmines. Bespoke inline `Icon`/`I` SVG system kept (inherits currentColor → themes fine); optional follow-up to swap for Lucide.

**Remaining:** Chat (`chats/ChatBox`); Billing (pilot predates primitives — later careful pass); react-select/react-calendar polish (AppointmentForm still on react-calendar — could adopt `AvCalendar`); then the **theme picker** in Clinic Config + a 2nd theme (Light Executive) to prove the flip. Recipe: copy the Patients/Dentists pattern — `.dc-page` + `.dc-page-header`, `.dc-table`/`.dc-icon-btn`, modals on `dc-overlay`/`dc-modal`/`dc-field`/`dc-btn`, Lucide icons, tokens for all colours; challenge the design. (Clinic Config + AdminUsersRoles now DONE — see §l.)

**Gotchas captured:** the global `section td button` and `section {}` / `section input|button|h2|form` landmines are now FULLY REMOVED (last copies were in Patients.css + Dentists.css). Rule going forward: never write bare element selectors in component CSS; make new interactive elements defensive (`padding`, `box-sizing`, `flex-shrink`). `.dc-field` controls forced `width:100%/min-width:0/box-sizing` so long `<select>` options don't blow out forms. Sticky table headers need a fixed-height flex page (`height: calc(100vh - 62px)`) + `.dc-table-wrap { flex:1; min-height:0; overflow:auto }`.

**SweetAlert stacking + toast gotchas (fixed in `swalTheme.css`):** SweetAlert2's container is `z-index: 1060`, but app modals (`.dc-overlay`, `.CPM-modal-backdrop`) sit at `9999` — so a dialog/toast fired from **inside a modal** rendered *behind* the dim overlay (looked broken/unthemed). Fix: `.swal2-container { z-index: 100000 !important }`. Also, the global backdrop-dim rule was painting the **toast's own container column** dark (a vertical "shadow" band) — SweetAlert marks `<body>` with `.swal2-toast-shown` while a toast is up, so the dim is now scoped `body:not(.swal2-toast-shown) .swal2-container.swal2-backdrop-show`. Toasts also get `align-items:center` + a tighter shadow so the icon/message align. (`showNotification` toasts use `position:'top', toast:true`.)

**react-calendar replaced by custom `AvCalendar`** (in `DentistAvailabilityManager.jsx`): react-calendar v6 wraps weekdays/days in two inline-styled `<div>`s and places the first day via a **flex margin-offset** — forcing `display:grid` on its day container breaks day placement (Saturdays land wrong). Not worth fighting; `AvCalendar` is a ~70-line component with its own 7-col grid (correct placement + `grid-auto-rows:1fr` fills height), same disable rules (past + Sundays) and the same `handleCalendarChange`. react-calendar dep STAYS (AppointmentForm still uses it) — a future task could migrate that too.

### l) Clinic Config themed + Message Templates system — DEPLOYED 2026-07-05
Finished the theming rollout's last big config module AND converted the app's hardcoded patient-facing reminder/notification copy into **per-clinic editable templates**.

**Clinic Config themed (`21f9de7`):** `ClinicConfig.js/.css` rebuilt as a premium "settings workspace" — `.dc-page` + standard header, superadmin clinic-switcher + Add Clinic in header actions, a **LEFT SECTION RAIL** (icon + subtitle + live status dot per section: FB connected, SMS active/low-balance) replacing the old inline pill tabs, right panel card per section. Facebook panel = integration status card (connected badge + page id + reconnect) + titled field groups (Identity/Contact/Messenger IDs); FB page-picker on `dc-overlay/dc-modal`. **AdminUsersRoles** themed to match (`dc-table`, role pills, Lucide row actions, `dc-banner`, add/edit/delete on `dc-overlay/dc-modal/dc-field`) — was its own remaining item, now done. All hardcoded hex gone; geometry-only on `--dc-*`. Rail sections: Facebook · SMS Reminders · **Message Templates** · Users & Roles.

**SMS enhancements (`1eeff4f`):**
- **SMS cost checker** (folded into the template preview): new `frontend/src/utils/smsSegments.js` — a GSM 03.38 segment/encoding estimator (no deps) → chars/segments/credits/**GSM-vs-Unicode** + flags the pricey non-GSM chars (₱, em dash, curly quotes) that force the whole SMS to ~2× cost.
- **Sender-name approval status** — new `GET /api/clinics/:id/sms/sender-status` (Semaphore `account/sendernames` lookup, normalized `approved/pending/rejected/not_found/none/no_key/error`; uses the saved key server-side) + a colored status banner + the "requires an approved sender name (~1–2 business days)" note. **`semaphoreGet()` retry-on-429** wraps BOTH Semaphore GETs (balance + sender-status), frontend staggers the two calls ~900ms — Semaphore throttles bursts (429 "Too Many Attempts"); this also cured the intermittent "Unable to fetch" balance. Verified against the real account: sender `CONQUERORS` → status `Active` → **approved**.
- **Clinic-wide reminder template** — `clinics.reminder_template` (migration `004_clinic_reminder_template.sql`, **run in Supabase ✅**). Precedence in BOTH `reminderScheduler.js` (auto) and `routes/reminders.js` (manual): per-appointment `reminder_message` → clinic template → hardcoded default. Null column = prior behavior.

**Status + reminder templates (`7eaaac5`):**
- **All 6 status-change messages now clinic-editable** — `clinics.status_templates` **jsonb** (migration `005_clinic_status_templates.sql`, **run in Supabase ✅**). `routes/statusNotifications.js`: the 6 defaults are now **emoji-free + plain-ASCII** (🦷/😊/em dash were forcing ~2× Unicode) and **tokenized** (`[PATIENT_NAME] [DATE] [TIME] [CLINIC] [CLINIC_PHONE]`). Precedence: **typed message → clinic `status_templates[status]` → built-in default → generic**. Send endpoints are `requireAuth + sameClinic`-scoped (`app.use('/status-notifications', requireAuth, sameClinic(req=>req.body?.clinic_id), …)`).
- **Dropped the hardcoded `"\n\nSee you soon!"`** suffix from `reminderScheduler.js` so automated and manual reminders end consistently (manual route never appended it).
- **New "Message Templates" rail section** in Clinic Config: the reminder editor (moved out of SMS) + **6 status editors** (status-colored pips via `--dc-status-*`, "Load default", a "using default" flag when blank, live chars/credits/GSM-vs-Unicode per field, shared token legend). One **"Save all templates"** writes `reminder_template` + `status_templates` (blank → NULL). SMS panel is now lean (provider/credentials/balance/sender status).

**Message-source map (current):** `reminderScheduler.js` (auto reminders) ✅ templated · `routes/reminders.js` (manual) ✅ templated · `routes/statusNotifications.js` (6 status) ✅ templated · `index.js` `/sms/test` = hardcoded test blurb · `ai/claire.js` + `menu/*` = **booking bot, NOT templated** (LLM + hardcoded button/menu templates — the remaining frontier if "every message" is ever the goal).

**Precedence cascade (reminders), most-specific wins:** manual one-off `message_override` (AppointmentReminderControl "Custom Message" / StatusUpdateModal `customMessage`) → per-appointment `reminder_message` → clinic template → system default. A manual send always outranks the clinic template — no conflict. Tokens are substituted even in manually-typed messages.

**Honest caveats (do not over-claim):** (1) built-in **defaults are shared** across clinics — overridable, not per-clinic unless a clinic customizes; (2) the **booking bot is still hardcoded/LLM** (not templated); (3) **cross-clinic WRITE isolation is UI/endpoint-enforced only** — template writes go straight to Supabase with the public key and the `clinics` column grants are permissive (the open "per-clinic RLS scoping" item, §5.4), so a crafted authenticated call could edit another clinic's template. Reads/sends do NOT leak (each clinic uses its own row).

**Verification workflow used this round:** owner-approved live drive with Playwright (installed in the session scratchpad), logging in through the real login form and screenshotting `localhost:3000` (dev server on latest source via hot-reload). Migrations 004 + 005 must be run in Supabase **before** deploy — adding a column to `SAFE_CLINIC_COLUMNS` makes the Clinic Config load query error until the column exists.

### m) Billing polish + complete invoice creation + accounting reflection — DEPLOYED 2026-07-05 (`5a1523e`, `7d8ad71`)
Brought the Billing module (the theming pilot, predating the primitives/`.dc-page` standard) up to the app-wide premium bar AND finished the manual invoice-creation flow.

**Premium theming pass (`5a1523e`):** dropped the boxed `.bills-container` outer panel → module now sits on the app canvas via `.dc-page` + the standard `.dc-page-header` (eyebrow **CLINIC FINANCE** → title **Billing & Payments**). Tabs → shared `.dc-tabs`; status filter chips → tone-aware `.dc-chip` (tones mirror the table status badges); added a **KPI strip** on the Invoices tab (Outstanding / Collected / Overdue / Collection Rate, tone cards computed from the active ledger); section-card headers gained right-aligned meta; Add Invoice button → `.dc-btn`; removed the navy SweetAlert overrides (global teal theme owns them). Dead CSS removed.

**Complete staged invoice creation (`5a1523e`):** the old **+ Add Invoice** only created a ₱0 shell (patient-only; a dead `addInvoiceTotal` field). Replaced with a real **staged Create Invoice modal**: Patient (autocomplete) · **Link Appointment** · **Attending Dentist** · Invoice Date · **line items** (shared builder) · Discount · Due Date · Notes · **live totals** · **Create Invoice** / **Create & Record Payment**. Line items are staged in memory and the invoice + items are committed **atomically** on Create (DB triggers own totals) — **cancel writes nothing, so no more ₱0 orphan shells**. Linking an appointment auto-fills dentist + date AND **prefills the booked procedure as a line item** (reads `appointments.procedure_id` / `procedure_price` / `reason`), mirroring the Completed-status auto invoice.

**Shared builder extraction (`5a1523e`):** the line-item builder (procedure-catalog search + custom item + qty/price + items table) was extracted from `InvoiceManagementModal` into **`billing/InvoiceLineItems.jsx`** (controlled: parent owns items + persistence). **Manage** modal consumes it in *persisted* mode (writes each item to the DB immediately — behavior verified identical); **Create** modal consumes it in *staged* mode (in-memory). So the two flows can't drift.

**Accounting reflection — VERIFIED, not a bug (`7d8ad71`):** confirmed against live data that the existing totals trigger stores **`invoices.total` = Σ(line_items) − discount = NET** (e.g. #124: items 2000 − disc 250 = total 1750 = paid 1750 → balance 0 ✓; #140: 2200 − 200 = 2000 ✓). Discounts ARE reflected; payments settle the net; balances are correct. The **`subtotal` column was NULL on every invoice** (gross only recoverable as total + discount). Two upgrades:
- **Collections "Charges & Discounts" strip** — Gross Charged − Discounts Given = Net Billed, from `invoice.total + invoice.discount` (no dependency on `subtotal`). Added to `billingAnalytics.computeCollections` + `CollectionsOverview`.
- **Migration `006_invoice_subtotal.sql`** (⚠️ **RUN IN SUPABASE**): additive `set_invoice_subtotal()` trigger on `invoice_items` + one-time backfill → populates `invoices.subtotal` with the gross. **Does NOT touch the existing net-total trigger.** Idempotent.

**Tally guide (standard):** day's income = actual cash = Σ`payments.amount` (Collections "Total Collected"); net revenue billed = Σ`invoice.total`; gross = Σ(total + discount); discounts given = Σ`discount`.

**Period picker (`5c12e60`):** `billing/period.ts` (All time / Annual / Monthly / Weekly / Daily + prev/next navigator) scopes the header, Invoices tab (table + KPIs + chips + totals), Payments audit, and Collections KPIs/mix/charges — **client-side date filtering, no backend**. Invoices scoped by `invoice_date`; **Collected = cash received in the period** (by `payment_date`, owner decision) so it's true period income even when settling older invoices; Outstanding/Overdue = unpaid balance of invoices billed in the period (balances still use ALL payments). Header no longer counts voided. **Aging stays "as of today"** (period bar hidden on that tab, owner decision). Collections monthly trend stays a fixed trailing-6-month view. `computeCollections` takes optional `periodStart`/`periodEnd`. **Clarity fix (`ce938c0`):** the period **Collection Rate is COHORT-based** — `(billed − outstanding) / billed` = "% of this period's invoices paid" (not period-cash ÷ period-billed, which read a misleading 100% when the cash settled older invoices); all-time value unchanged. "Collected" KPI renamed **"Cash Collected"** (period cash, any invoice). Payments audit has an **Invoice Date** column + amber **"earlier"** tag when a payment settled an invoice billed before the selected period — makes cross-period cash obvious.

**Invoice numbering (`5e629ab`) — DONE:** `INV-YYYY-####` per clinic, yearly reset. **Migration `007_invoice_numbering.sql`** (⚠️ **RUN IN SUPABASE**): `invoice_number_counters` table + `BEFORE INSERT` trigger `assign_invoice_number()` on `invoices` (respects an explicit number; numbers BOTH manual and auto/Completed invoices) + one-time backfill + counter seed. Frontend shows `invoice_number` in the invoices table, payments audit, Manage header, SOA + PDF filename, and searches it; falls back to `#id` when absent (safe pre-migration).

**VAT + statutory Senior/PWD (`3a83794`) — DONE:** **Migration `008_vat_config.sql`** (RUN IN SUPABASE ✅): `clinics.vat_registered` (default **false** = Non-VAT), `clinics.vat_rate` (12), `invoices.discount_type` + column grants. **Clinic Config → Billing & Tax** rail section: per-clinic VAT toggle + rate. **Invoice Create + Manage** now have a **Discount Type** selector (None / Senior 20% / PWD 20% / Custom % / Custom ₱) storing `discount` + `discount_type`; pure engine in `billing/discount.ts`. Senior/PWD is the **PH statutory** computation — VAT-exempt (strip VAT) then 20% when VAT-registered, else flat 20%. SOA + modal totals show a VAT breakdown (VATable Sales + VAT) on regular VAT invoices and "VAT-Exempt Sale" for SC/PWD; SOA subtotal reads the stored gross. **Billing reads VAT config FRESH on each mount** (own `clinics` fetch) so a toggle takes effect on next open — the app clinic-context is cached at login. Verified live: Non-VAT senior 1000→800; VAT senior 1000→821.43 (−178.57); VAT regular → VATable 892.86 + VAT 107.14.

**VAT model correction — VAT-EXCLUSIVE (`7db0e58` + migration 009) — Phase 1 DONE.** Owner decision: stored line prices are **VAT-exclusive base amounts**. So (validated against a shared ChatGPT/BIR thread): **Senior/PWD = 20% of base, NO ÷1.12** (a senior is VAT-exempt; VAT is never charged, not "backed out"); **regular VAT = base + 12% (additive)**; **Senior/PWD = VAT-exempt**. Fixed the earlier bug where VAT+Senior wrongly left VAT in (₱821.43 → correct **₱800**) and VAT+regular backed VAT out (₱1,000 → correct **₱1,120**). `billing/discount.ts`: `computeDiscount` dropped VAT params; new `computeVat()` ADDS VAT to the taxable base. Frontend (Create/Manage/SOA) correct. **Migration `009_vat_totals.sql` (RUN IN SUPABASE ✅)** made the DB total triggers (`update_invoice_total_from_items` + `update_invoice_total_on_discount`) VAT-aware: `total = taxable + vat`, `tax_amount = vat` (vat=0 for Non-VAT or SC/PWD-exempt). Verified: Non-VAT senior 800, VAT senior 800, Non-VAT regular 1000, VAT regular 1120; existing Non-VAT totals unchanged.

**Phase 2 — mixed invoices (`5805a13` + migration 010) — DONE.** Per-line SC/PWD eligibility: **`procedures.sc_pwd_eligible`** (catalog default true) + **`invoice_items.sc_pwd_eligible`** (per-line snapshot). The 20% discount + VAT-exemption apply **only to eligible lines**; non-eligible (cosmetic) lines are charged full and are VATable for VAT clinics. **`billing/discount.ts` `computeInvoiceTotals()`** is now the single engine (mirrors the DB triggers exactly); replaced `computeDiscount`/`computeVat`. `InvoiceLineItems` has a per-line "SC/PWD" pill toggle + add-form checkbox (inherits the procedure's catalog flag). **Migration 010** made the total triggers eligibility-aware AND **DB-owns the SC/PWD discount** (= 20% of the eligible base) so it stays correct as lines change; SOA reads the stored DB totals. Procedures config has a per-procedure SC/PWD toggle + "Cosmetic" badge. Verified: mixed Senior invoice (eligible 1000 + cosmetic 1000) → discount 200, total 1800. **Eligibility is a per-line SNAPSHOT** (existing invoices don't change when the catalog flag changes — audit integrity). Manage modal has a **"Re-apply eligibility"** button (`5d48dd0`) — refreshes all catalog-linked lines to current Procedures settings then the DB recomputes; **guarded to unpaid invoices** (drafts) so paid/finalized records stay immutable.

**Phase 3 — finalized/immutable invoices (`75662f7`, `42b6488` + migration 011) — DONE.** `invoices.finalized_at` (lock) + `invoices.sc_pwd_id` (OSCA/PWD ID). **DB-enforced immutability:** `prevent_finalized_item_change` trigger blocks invoice_items writes; the total triggers reject amount changes / skip recompute on a finalized invoice. **Auto-lock:** `autolock_on_full_payment` trigger finalizes an invoice the moment it's fully paid (verified: #148 paid in full → finalized_at set). Manual **Finalize** button in Manage (confirm-only lock); when locked → 🔒 badge + lock banner + all edit controls disabled (InvoiceLineItems `readOnly`, discount Edit hidden, re-apply hidden), Void disabled in the list. **Senior/PWD ID** captured in the invoice form (Create + Manage Details→Edit — NOT the SweetAlert finalize dialog, because swal2 inputs render display:none in this build) and printed on the SOA (BIR name + OSCA/PWD ID + signature block). Existing invoices unaffected (all draft). **Reopen (`983f2d4` + migration 012):** a finalized invoice with **zero payments** can be reopened (unlock) to fix a premature manual lock — button in Manage, DB-enforced (migration 012: `update_invoice_total_on_discount` rejects un-finalizing when payments exist). Paid/partially-paid invoices can never be reopened. Verified: finalize→reopen cycle on an unpaid invoice (finalized_at → null, edit controls return); Reopen hidden on all paid invoices. **Applying a senior discount mid-payment IS supported** (partial-paid invoices aren't locked until finalized/fully-paid — Edit the discount, total recomputes, balance = total − paid). Correcting a paid invoice needs a payment reversal/refund (NOT built — Phase 4 candidate).

**Still deferred (billing):** persisting an `appointment_id` FK on invoices (column existence unconfirmed); Manage modal still on `.bills-modal-overlay` (not `.dc-overlay`); optional per-invoice VAT-rate snapshot (currently the lock freezes tax_amount, and the SOA can derive the rate from stored values). The VAT/discount/finalize work (Phases 1–3) is otherwise complete.

### n) BILLING — accounting system state (end of 2026-07-06 session) ⭐ read this first for billing
The Billing module is now a complete, BIR-aware, audit-grade invoicing system. **All migrations 007–012 were RUN in Supabase and verified ✅** this session (frontend + DB in sync). Summary of the money model and the non-obvious rules:

**Pricing/tax model — VAT-EXCLUSIVE (permanent, owner decision):** stored line prices are base amounts (no VAT baked in). `billing/discount.ts` **`computeInvoiceTotals()` is the ONE engine** and mirrors the DB total triggers exactly. Per invoice:
- `subtotal` = Σ line items (gross, DB-owned via 006 trigger); `discount`; `tax_amount` (VAT); `total = (subtotal − discount) + vat`.
- **Senior/PWD = 20% of the ELIGIBLE base only** (mixed invoices; per-line `invoice_items.sc_pwd_eligible`, catalog default `procedures.sc_pwd_eligible`). Eligible lines are VAT-exempt; non-eligible lines are VATable. **DB owns the SC/PWD discount** (recomputes as lines change).
- **Regular VAT invoice = base + 12%** (additive). VAT only for `clinics.vat_registered` clinics. All clinics currently Non-VAT.
- DB total triggers: `update_invoice_total_from_items` (AFTER on invoice_items) + `update_invoice_total_on_discount` (BEFORE UPDATE on invoices). VAT-aware, eligibility-aware, finalize-aware.

**Finalize / lock rules (Phase 3):**
- `invoices.finalized_at` = lock; `invoices.sc_pwd_id` = OSCA/PWD ID (captured in the invoice FORM, not a swal — swal2 inputs render display:none here).
- **Fully paid → auto-finalizes** (payments trigger `autolock_on_full_payment`). **Manual Finalize button = zero-payment invoices only.** **Partial-paid is NEVER auto/manually locked → stays editable** (so a mid-payment senior discount recomputes from the ORIGINAL amount; the paid amount stands, balance = total − paid).
- **Reopen** (unlock) = finalized invoices with **zero NET payments** (DB-enforced by 012/013). Guards key off **net paid (Σ amount)**, not row count. Finalized = DB-blocks item + amount changes.
- **Phase 4 — reverse/refund a payment (migration 013 + `813dd1e`):** Payment History "Reverse" opens an **amount modal** (default full, editable, capped at net collected → supports **partial refunds** e.g. a ₱200 overpayment in one step). Records an OFFSETTING negative `Reversal` payment (original kept; `payments.reversed_at` set only on a FULL refund) — audit-safe, `SUM(amount)` nets. Correction workflow for a paid invoice: **Reverse payment(s) → net 0 → Reopen → edit → re-finalize → re-collect**. Refunds shown red/parens. NOTE: reversing a payment does NOT auto-unlock a finalized invoice (status recomputes to Unpaid but finalized_at stays until you Reopen).
- The consistent principle: **net payment commits the amounts** for destructive actions (Void, Re-apply, Reopen, manual Finalize); **discount Edit stays open until finalization**; **full payment = hard lock**.

**Also this session:** premium theming pass (`.dc-page`/header/tabs/chips/KPIs), complete staged invoice creation (appointment link prefills procedure), period picker (All/Annual/Monthly/Weekly/Daily, cohort collection rate), `INV-YYYY-####` numbering (007), configurable VAT (008, "VAT Registration" page — BIR wording), SOA VAT + Senior/PWD legal block, Procedures SC/PWD eligibility guide.

**Overpayment display + POS modal (`2072c0f`, `0757d86`):**
- **Overpaid invoices** no longer clamp to ₱0. List / Manage modal / SOA show **"Overpayment (credit)"** with the excess (info-blue; parens in the list Balance col) + a render-only **"Overpaid" pill** (`bills-status--overpaid`) that still counts/filters under Paid.
- **POS payment modal (`AddPaymentForm.js`):** **Cash = real tender** — input is "Cash Received", auto-computes **Change Due**, records only `min(tendered, balance)` so cash never makes an accidental credit; denomination chips (+₱1000…+₱20) stack bills. **Electronic methods** record as-is, over-balance = intentional **advance credit** (labeled). Optional **back-dated Payment Date** (defaults today, capped today, amber when back-dated) sent as **local-noon ISO** so `payment_date` (TIMESTAMPTZ) period filters don't slip a day. Header shows formal `invoice_number`.

**Migrations 007–013 ALL RUN ✅. Billing VAT/discount/finalize/refund work is COMPLETE — nothing deferred.** Only minor cosmetic follow-ups remain: persist `appointment_id` FK on invoices (column unconfirmed); Manage modal still on `.bills-modal-overlay` (not `.dc-overlay`); optional per-invoice VAT-rate snapshot.

### o) BILLING — security hardening + integrity audit (2026-07-06, `d30a1de` — DEPLOYED) ⭐ read this too for billing
Deep adversarial audit of the whole Billing surface, then fixed the findings. **Migrations 014–018 ALL RUN in Supabase ✅ and code DEPLOYED** (push to main → Render + Vercel). DB and frontend are in sync in prod.

**THE headline (was CRITICAL, now closed):** the billing tables had **NO RLS**. The public anon key (shipped in the JS bundle) could — with **no login** — read every invoice/payment, insert payments, UPDATE payment amounts, and DELETE invoices for **any** clinic. Verified live with the anon key (GET returned real rows; POST/PATCH/DELETE succeeded), then re-verified CLOSED after the fix (GET → `[]`, INSERT → 401, DELETE of real rows → deleted nothing).

**Migrations (all idempotent, rollback blocks in each file):**
- **014_billing_rls.sql** — RLS on `invoices` / `invoice_items` / `payments` / `procedures`: `authenticated` full access, `anon` denied. Same pattern as `secure-users-table.sql`. (`patients`/`appointments` were already RLS-protected.) NOTE: this closed the urgent PUBLIC hole but left cross-clinic isolation permissive for authenticated — **now DONE in migration 020 (§p): per-clinic scoping via a JWT-email→clinic helper.**
- **015_payments_immutable.sql** — payments are **append-only**: `payments_append_only()` trigger blocks DELETE and blocks UPDATE of every financial field (only `reversed_at`/`updated_at` may change). Plus **`reverse_payment(p_payment_id, p_clinic_id, p_amount, p_note)`** SECURITY DEFINER RPC = one atomic reversal (caps at net collected server-side, blocks double-reversal, inserts offsetting entry + marks `reversed_at` in one tx). Replaces the old two-write refund race. `InvoiceManagementModal.confirmRefund` now calls the RPC (note formatting preserved).
- **016_or_number_atomic.sql** — **OR numbers were race-prone** (`generate_or_number` used COUNT(*)+1 — the same flaw 007 fixed for invoices → two concurrent payments could mint the SAME BIR receipt #). Now a per-clinic+year atomic counter (`or_number_counters`) + `UNIQUE (clinic_id, or_number)` index, and reversals **skip** OR assignment (money-out ≠ receipt). Self-checks for existing dupes before adding the index.
- **017_percent_discount_dbowned.sql** — **`percent` discounts were freezing** (stored as pesos once, never rescaled when items changed → "10%" silently drifted). Added `invoices.discount_value` (raw %), and `update_invoice_total_from_items` now recomputes `percent` from it (like senior/PWD). Frontend (Create + Manage) saves `discount_value`; `amount`/none/senior/pwd paths unchanged. `amount` intentionally does NOT rescale.
- **018_audit_created_by_and_void_guard.sql** — `invoices.created_by` + `payments.created_by` = `uuid DEFAULT auth.uid()` (auto-captures WHO on every insert incl. auto-invoice + refund; NULL = system; existing rows NULL). Plus `prevent_invalid_void()` trigger = DB-enforces the UI's rule (can't void a finalized or paid invoice).

**Frontend (deployed):**
- **C1:** `/api/billing` route **unmounted** in `index.js` (service-key router with NO auth = a public RLS bypass; the UI never used it — reads Supabase directly). Re-enable form is in the code comment.
- **H2 double-billing (confirmed real):** the auto-invoice trigger dedups on `appointment_id` ONLY, and the manual Create path never stamped it → manual-invoice-then-Completed = 2 invoices. Fixed: `handleCreateInvoice` now stamps `appointment_id` + warns if the linked visit is already invoiced.
- **H5 overdue:** one shared `isInvoiceOverdue()` in `billingAnalytics.ts` (local-day, "due today" is NOT overdue) used by BOTH the invoices table and Aging — they used to disagree (table used a UTC parse vs instant).
- **Donut:** `computeCollections` excludes `Reversal`/negative rows from the method mix (was drawing a negative slice); they still net into Total Collected.

**H3 — hidden DB logic captured to repo:** these load-bearing triggers existed ONLY in the live DB, never in git — now in **`backend/db/billing-schema-baseline.sql`** (authoritative snapshot; `capture-billing-schema.sql` = the read-only introspection queries used):
- `create_invoice_on_appointment_completed()` (trigger `trg_create_invoice_on_completed`, AFTER UPDATE on appointments) — auto-invoice on Completed; dedups on `appointment_id`.
- `update_invoice_status_on_payment()` (`trigger_update_invoice_status`) — Unpaid/Partial/Paid state machine, net-aware (`SUM(amount)`).
- `assign_or_number_on_payment()` + `generate_or_number()` — OR # assignment (now atomic via 016).
Baseline is a REBUILD snapshot — do NOT run against the existing prod DB. **Keep it updated when any billing function changes** (the trap: 010→013 each redefine `update_invoice_total_on_discount`; re-running an OLDER numbered migration silently regresses it — treat the baseline as canonical).

**Two audit corrections (I was wrong the first pass):** (1) OR numbers are NOT free-text/optional — they're auto-assigned by a trigger (retracted that finding). (2) `appointment_id` DOES exist and is populated (134/149 live) — the bug is the manual path not stamping it, not a missing column.

**Deliberately NOT fixed (with reasons):** H6 stale-balance multi-terminal = BY DESIGN (electronic over-payment is intentional advance credit; refund RPC already re-validates server-side) — not a bug. Per-invoice **VAT-rate snapshot** = latent (no VAT-registered clinics exist yet; do it when one registers). **1000-row cap** (`BillsPayment` loads all invoices/payments, PostgREST caps at 1000) = latent at 42 payments / 149 invoices, but a real forward risk — do the server-side-aggregate refactor deliberately before a clinic gets busy. Orphan `frontend/src/components/InvoiceConfirmationModal.js` (exports unused `confirmInvoice`) = confirmed dead but left in place (owner caution on removals).

### p) APP-WIDE security audit — Appointments surface + scale + multi-tenant isolation (2026-07-07) ⭐ read for security posture
Second deep-audit session (after Billing §o). Audited the Appointments surface (components, modals, messaging, manual reminders, scheduler, status/notifications) AND swept security app-wide. Commits `b124f5e`, `37f4185`, `948441e` — all DEPLOYED; migrations 019–020 RUN in Supabase.

**Anchor fact — Supabase RLS model here:** the frontend uses the anon key; logged-in staff carry the `authenticated` role (Supabase Auth). RLS = the whole trust boundary. `anon` = denied; `authenticated` = allowed (now clinic-scoped, see below). The backend/webhook use the SERVICE key (bypass RLS). `clinics` is NOT RLS — it's column-grant protected (must stay anon-readable for Queue/login).

**AC1 — 9 more UNRESTRICTED tables (migration 019, `b124f5e`):** a `pg_class.relrowsecurity` catalog check found 10 tables with NO RLS (my anon read-probe had missed the EMPTY ones — it can't tell "RLS-protected" from "no rows"). Live-verified `appointment_reminders` was fully readable AND writable by anon (patient Messenger IDs = PII, message text, appt times, cross-clinic; could delete/forge the audit trail). Also `invoice_number_counters`/`or_number_counters` (tamper → numbering-collision DoS) and `dentist_availability`. Fixed: RLS authenticated-only on all 9 (`clinics` excluded). Re-probed CLOSED (read `[]`, write 401).

**Per-clinic ISOLATION (migration 020, `948441e`) — the big multi-tenant fix:** 014/019 policies were "any authenticated = full access", so a logged-in staffer from Clinic A could query Clinic B. Now every policy is `superadmin OR clinic_id = caller's clinic`. Caller's clinic is resolved from the **JWT email** (`auth.jwt()->>'email'`) → `public.users.clinic_id`, exactly like `requireAuth.js`. Two **SECURITY DEFINER** helpers `current_staff_clinic_id()` / `current_staff_is_superadmin()` (definer-rights = read `users` without tripping its RLS → no recursion/lockout). **Scoped 17 data tables** (020) + **`public.users` (migration 021, `870c358`)** = 18 tables now per-clinic isolated. Works with existing sessions; NO app code change (frontend already filters by clinic_id). Verified live: own-clinic data loads, anon still denied, login + AdminUsersRoles add/edit/delete all work under the users policy (email-confirmation keeps the admin session on Add User). **STILL EXCLUDED:** `payment_plan_installments` (no clinic_id — scope via parent plan when the feature ships), `messenger_sessions` (service-only), `clinics` (column-grant). Reversible via each migration's in-file ROLLBACK. **Per-clinic isolation is now COMPLETE for all patient/financial/staff data.**

**AH2 — reminder scheduler stale config (`b124f5e`):** the cron job closure held a stale `clinic` snapshot; `rescheduleJobs` only rebuilds on a few tracked fields, so edits to `reminder_template`/`sms_sender`/Twilio `sms_api_secret` never reached the running job. Fixed: `sendRemindersForClinic` re-fetches the clinic FRESH each run (falls back to cached on failure).

**AM1 — cron timezone (`37f4185`):** was converting clinic-local time → a UTC cron and relying on the host being UTC + no DST (true on Render/PH, latent otherwise). Now hands clinic-local `HH:MM` to node-cron with `{ timezone }` (v4.2.1 supports it) — handles DST, no host-TZ dependency. Removed `getCronStringUTC`.

**AM2 — manual send ignored soft-delete (`b124f5e`):** `/appointments/:id/send-reminder` now filters `deleted=false` (can't remind a cancelled appointment).

**AH1 — the 1000-row silent-truncation cap (`37f4185`):** PostgREST caps a response at 1000 rows; components that load a whole table client-side silently lost the oldest rows past 1000 (appointments hit first; also the deferred billing cap). Fixed with reusable **`frontend/src/api/fetchAllRows.ts`** (pages via `.range()` until exhausted; requires a stable `.order()`; loop-guarded). Applied to `AppointmentsTable` (view + year list), `Patients`, `Dentists`, `BillsPayment` (invoices+payments). `CalendarView` was already date-scoped (untouched).

**Queue Display — public TV broke under RLS (`37f4185`):** the token `/queue` page has no login, so it couldn't read the now-protected patients/appointments with the anon key (empty queue). New **PUBLIC** endpoint `GET /api/queue/:token` (inline in `index.js`, SERVICE key, scoped by `queue_token`) serves the minimal queue (**first names only** — no PII/table exposure). `QueueDisplay.jsx` now loads from it + polls 20s + re-fetches on socket events. Uses the existing CORS allowlist.

**Dismissed after scrutiny (not bugs):** `checked_in_at`-null socket emit (benign); in-memory `userStates` (actually persisted to `messenger_sessions`); OR#s "free-text" (auto-assigned by trigger). **Dead code (left, owner caution):** `backend/appointments.js` (unmounted raw-pg router, PATCH allowlist missing 'Checked-In'); `InvoiceConfirmationModal.js` (unused `confirmInvoice`).

**Security posture now (honest):** the DB trust boundary is closed app-wide — no public exposure anywhere, append-only ledger, per-clinic isolation. LOGIC-audited: Billing (full), and Appointments **plumbing only** (messaging/reminders/scheduler/status) — NOT the Appointments booking FORM or calendar UI (see below). The rest (booking bot/Claire, Patients/Dentists/Odontogram/PatientFiles/ClinicConfig/auth flows) got the security sweep but NOT a logic audit. **Per-clinic isolation is COMPLETE (020 + 021).** Remaining work is all lower-severity LOGIC audits, one module at a time.
- **⚠️ Booking bot / Claire (`webhook.js` + `helpers/` + `ai/claire.js`): already LOGIC-audited multiple times in prior chat sessions that were NEVER captured here** — which is why it kept resurfacing as "unaudited". Next session should RE-VERIFY the current code against that history (a confirmation pass, not a from-scratch dig) and then **record the outcome in this handoff** so it's settled and stops resurfacing. Treat as "audited, pending documentation," not greenfield.
- **Appointments component — LOGIC audit is INCOMPLETE (honest correction).** This session deeply logic-audited the *plumbing* (messaging/reminders/scheduler/status-notifications → AH2/AM1/AM2 fixes) and the table's structure at a high level, but did NOT audit: **`AppointmentForm.js` (710 lines — never opened; the create/edit form: validation, double-booking/conflict detection, time-slot + date/timezone-on-save logic — highest logic density in the module)**, `AppointmentsCalendar.jsx`, and the deep logic of `AppointmentsTable.jsx` (calendar math `getWeeksOfMonth`, filter/sort pipeline, socket-reconciliation edges, and whether local-time date filtering on `appointment_time` has timezone-boundary bugs). Do these as a genuine first-time logic audit.
- Then the modules that only got the security sweep (Patients/Dentists/Odontogram/PatientFiles/ClinicConfig/auth) — good hygiene, no known fires.

### Local dev note
A running Node backend holds old code in memory until restarted. After pulling/editing backend files, **restart the backend** (`npm run dev` uses nodemon and auto-restarts; plain `node index.js` does not). The frontend's `API_BASE` falls back to `http://localhost:5000`, so local dev calls the local backend — keep it running and on latest code.

### Emergency rollback
- Webhook signature dropping real events (`Rejected webhook event — invalid signature`): unset `FB_APP_SECRET`/`FB_CLIENT_SECRET` in Render env, or `git revert <commit>`.
- `users` RLS broke login/user-management: `ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;` in Supabase.
- **Billing RLS (014) broke the Billing tab** (e.g. an un-authenticated read path surfaced): re-open per table — `ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;` (and `invoice_items`/`payments`/`procedures`). Verified working post-deploy, but this is the escape hatch.
- **Billing code (`d30a1de`)**: `git revert d30a1de` reverts the frontend + route unmount. Each migration 014–018 has its own rollback block in-file (drop the trigger/RPC/index/column). The append-only guard (015) is the one most likely to surprise a future dev who tries to hand-edit a payment — that's intended; reverse it instead.

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
| `472c94a` | CSS primitives layer + app-wide theming rollout start (nav tokens, viewport, Calendar) |
| `0e0d5dd`… | (theming) full-page patient profile + Patient Files (earlier in the sequence) |
| `001e87d` | Appointments list view themed + unified `--dc-status-*` colors |
| `42cd246` | Appointments booking form + reminder modal + wide-modal wrapper themed |
| `a6bff77` | Premium booking-form redesign (sections, live summary bar, Lucide slots) |
| `70028f1` | Global SweetAlert2 theme (`swalTheme.css`) |
| `49f7fd0` | Collapsible sidebar (persisted) + consistent content-area modals |
| `a3475c4` | Standard `.dc-page-header` (eyebrow+title) + consistent gutters |
| `a0b6d7c` | Queue premium redesign — staff monitor + public TV display |
| `c601684` | Patients themed + shared table standard (`.dc-table`/`.dc-icon-btn`) |
| `196378a` | Patients fixed-height page + sticky table headers |
| `9565f17` | Dentists themed on the shared standard + defuse last `section {}` landmine |
| `ef9acc8` | Dentists: helper note under table (status-toggle tip) |
| `b3148a0` | Dentists: full-page availability workstation + custom `AvCalendar` (replaces react-calendar) + `.dc-back-btn` primitive |
| `ea9d3e8` | Procedures: theme on `--dc-*` + premium elevation (KPI strip, per-category price range) |
| `748baf6` | Fix: SweetAlert dialogs/toasts render above app modals (z-index) |
| `c7f29b1` | Fix: no backdrop band on toasts + center toast content |
| `21f9de7` | Clinic Config themed (settings-rail workspace) + AdminUsersRoles themed on primitives |
| `1eeff4f` | SMS: clinic reminder template + sender-approval status (`/sms/sender-status`) + cost checker (`smsSegments.js`) + 429 retry; migration 004 |
| `7eaaac5` | Templates: 6 clinic-editable status messages (`status_templates` jsonb) + emoji-free defaults + drop "See you soon!"; migration 005 |
| `5a1523e` | Billing: premium theming pass (.dc-page/header/tabs/chips/KPIs) + complete staged invoice creation (appt link prefills procedure) + shared `<InvoiceLineItems>` builder |
| `7d8ad71` | Billing: Collections "Charges & Discounts" (gross/net) + migration 006 populates `invoices.subtotal` (RUN IN SUPABASE) |
| `5c12e60` | Billing: period picker (All time/Annual/Monthly/Weekly/Daily) scoping header + Invoices + Payments + Collections; Aging stays as-of-today |
| `ce938c0` | Billing: cohort-based period Collection Rate (fixes misleading 100%) + "Cash Collected" rename + Invoice Date column ("earlier" tag) in payments audit |
| `a3aca32` | Billing: actionable empty-invoices state (Show all) + reset filter on period-granularity change |
| `5e629ab` | Billing: formal invoice numbers `INV-YYYY-####` (migration 007 trigger+backfill; frontend display+search) |
| `e6398a0` | Fix migration 007: invoice numbers unique PER CLINIC (drop global unique → composite) |
| `20b66c5` | Migration 008: per-clinic VAT config + invoice discount_type (schema) |
| `3a83794` | Billing: configurable VAT + statutory Senior/PWD discounts (Clinic Config toggle, discount-type selector, VAT SOA breakdown) |
| `7db0e58` | Fix: VAT-EXCLUSIVE model — Senior/PWD = 20% of base (no ÷1.12), regular VAT = base+12% (Phase 1a) |
| `f1ddb39` | Migration 009: VAT-aware total triggers (total = taxable + VAT, tax_amount stored) — Phase 1b |
| `f4e9a55` | Migration 010: per-line SC/PWD eligibility columns + eligibility-aware total triggers (DB-owned SC/PWD discount) |
| `5805a13` | Billing Phase 2: mixed invoices — per-line eligibility engine + toggles (invoice builder + Procedures config) |
| `5d48dd0` | Billing: "Re-apply catalog eligibility" button (Manage, unpaid only) |
| `b7fee4a` | Migration 011: invoice finalize/lock + Senior/PWD ID + DB immutability + auto-lock on full payment |
| `75662f7`,`42b6488` | Billing Phase 3: finalize/lock UI + Senior/PWD ID capture + SOA legal block |
| `95259a5` / `983f2d4` | Migration 012 + Reopen button (unlock finalized draft with zero payments; DB-enforced) |
| `495e8a5` | Fix: manual Finalize allowed only on zero-payment invoices (partial-paid stays editable, locks via full payment) |
| `5f2d9ee` | Polish: BIR-accurate "VAT Registration" page wording + Procedures SC/PWD guide callout |
| `9486fdf` / `138bc47` | Migration 013 + Phase 4: reverse/refund a payment (offsetting entry, net-aware guards) |
| `813dd1e` | Billing: partial refund amount (reverse-payment amount modal — overpayment in one step) |
| `2072c0f` | Billing: show overpayment credit instead of clamped ₱0 balance (+ "Overpaid" pill) |
| `0757d86` | Billing: POS modal — cash tender/change, denomination chips, back-dated date, formal invoice # |
| `d30a1de` | **security(billing): close public data exposure (RLS 014) + append-only ledger & atomic refund (015) + race-safe OR #s (016) + DB-owned % discount (017) + created_by/void-guard (018) + H2 double-bill guard + shared overdue + donut fix + trigger baseline capture** |
| `b124f5e` | **security+fix(appointments): RLS on 9 more unrestricted tables (019, incl. appointment_reminders PII) + scheduler fresh-config (AH2) + manual-send soft-delete guard (AM2)** |
| `37f4185` | **fix(scale+queue): page past 1000-row cap (fetchAllRows on Appointments/Patients/Dentists/Billing) + public token queue endpoint (AH1) + cron timezone via node-cron `{timezone}` (AM1)** |
| `948441e` | **security(rls): per-clinic isolation on 17 data tables — `superadmin OR clinic_id=caller` via JWT-email→clinic SECURITY DEFINER helpers (020); users deferred** |
| `870c358` | **security(rls): per-clinic isolation on `public.users` (021) — completes multi-tenant isolation (login/AdminUsersRoles verified)** |
| `0f55934` | feat(users-roles): "You" badge on the signed-in user's own row (themed accent pill) |

*(Keep this table and the sections above updated after every change — this handoff is the source of truth.)*

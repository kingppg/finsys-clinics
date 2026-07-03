# Dental Clinic System — Webhook, Reminders, & Billing Handoff

**Last updated:** 2026-07-03  
**Scope:** Messenger webhook hardening (Ate Claire AI), booking flow fixes, reminder/notification delivery fixes, Supabase data-exposure lockdown, Facebook Login for Business (`config_id`) connect flow, and **Phase 1 Billing System MVP** (manual GCash invoice recording).
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

**Deferred / future:** invoices table search + status filters + sortable columns + pagination + totals footer (**agreed next iteration** — significant at scale); void/cancel invoice action (₱0.00 junk rows exist: #139/#132/#127); theme picker in Clinic Config; additional themes; prune unused deps (highcharts — commercial license, shadcn-ui npm package, recharts, tailwind); Playwright E2E.

**Payment modal (post-deploy addition):** `AddPaymentForm.js` is now POS-style — giant amount readout, on-screen numpad, big method buttons, "Exact" tender button (fills balance due, passed from parent via `balanceDue` prop), live remaining/overpayment readout. Insert payload unchanged.

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
| `5e217b2` | BILLING first attempt: schema migration + REST API + BillsPaymentEnhanced UI (**UI later rolled back** — replaced owner's working component) |
| `9105307` | BILLING first-attempt integration (routes + Enhanced component into dashboard) — **UI portion rolled back** |
| `c9b76d1` | Revert dashboard to the original BillsPayment component |

*(Keep this table and the sections above updated after every change — this handoff is the source of truth.)*

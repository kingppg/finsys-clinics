# Dental Clinic System — Webhook & Reminders Handoff

**Last updated:** 2026-06-13
**Scope:** Messenger webhook hardening (Ate Claire AI), booking flow fixes, and reminder/notification delivery fixes.
**Repo:** github.com/kingppg/finsys-clinics (branch `main`)
**Backend host:** Render — https://finsys-clinics.onrender.com (auto-deploys on push to `main`)
**Frontend:** Vercel. Backend URL is set in Vercel env `REACT_APP_API_URL` (not in the repo).

---

## 1. What this system is

A multi-clinic dental appointment system. Patients chat with a Facebook Messenger bot ("Ate Claire") to book/confirm/cancel appointments. Staff manage appointments and reminders from a React dashboard. Data is in Supabase. Reminders go out via Messenger and/or SMS.

Key backend files:
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
| `backend/index.js` | Express app, socket.io, OAuth, SMS test/balance |
| `backend/test-webhook.js` | Offline test harness (no FB/DB/LLM needed) |

Frontend: `frontend/src/components/AppointmentReminderControl.jsx` is the reminder settings + manual-send UI.

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

The code already supports Semaphore/Twilio and falls back to SMS when Messenger can't deliver. SMS has no 24h window. As of 2026-06-13, **all clinics have `sms_provider = "none"`**, so reminders cannot reach dormant patients yet.

Steps (clinic owner):
1. Sign up at https://semaphore.co, load credits.
2. Copy the API key from the Semaphore dashboard.
3. App → Clinic Settings → SMS: Provider = **Semaphore**, paste **API key**, Sender = **Palodentcare** (or "SEMAPHORE" if no custom sender approved).
4. Use the **Test SMS** button (`/api/clinics/:id/sms/test`) to confirm.
5. Ensure patients have **phone numbers** saved — Messenger-only patients who typed "skip" on the phone question can't receive SMS.

After this, both automatic and manual reminders reach anyone with a phone number, regardless of the 24h window. (Messenger is still tried first for free delivery to recently-active patients.)

---

## 5. Outstanding / future items

1. **Configure SMS (Semaphore)** — see §4. This is the unblock for reminders. *Highest priority, on the clinic side.*
2. **Facebook App Review** — get `pages_messaging` (and `pages_show_list`) approved to Advanced Access so the bot serves real patients, not just app testers. Required to go fully public. Does not affect the 24h rule.
3. **`reminderScheduler.js` Messenger path for dormant patients** — Messenger reminders to out-of-window patients are impossible without **approved utility message templates** (the official replacement for tags) or **Recurring Notifications**. Until then, SMS is the channel; Messenger only catches recently-active patients.
4. **FUTURE OPTION — Human Agent tag on the manual "Send Reminder Now" button.** Once Meta approves the **Human Agent permission**, the manual route (`routes/reminders.js`) could send with `messaging_type: "MESSAGE_TAG"`, `tag: "HUMAN_AGENT"` to reach patients who messaged **within the last 7 days** (vs 24h). Caveats: only helps recently-active patients (7-day cap from the patient's last message, not reset by sending); Meta intends this tag for genuine human support replies, not reminders, so it's a policy gray area and a review risk. Treat as a "best-effort for recently-active patients" enhancement, NOT a reminder solution. Not yet implemented — flagged here on request.
5. **Recurring Notifications opt-in** — a Messenger-native way to send free reminders to patients who tap "Get appointment reminders." More involved build; optional alternative/supplement to SMS.
6. **Phone capture** — encourage/normalize collecting patient phone numbers in the booking flow so SMS can reach them.

---

## 6. How to test

- **Offline harness:** `cd backend && node test-webhook.js` — 25 checks covering Claire history (long chats + error recovery), cancel-at-confirm recording, someone-else same-name guardian confirmation, and confidence gating. No Facebook/DB/LLM needed.
- **Backend health:** `GET https://finsys-clinics.onrender.com/` → "Dental Clinic Backend is running!"
- **Signature active check:** `POST` an unsigned body to `/webhook` → expect `403 Forbidden`.
- **Live conversation:** message the clinic page from a tester account; Claire should reply (text replies now deliver via `RESPONSE`).
- **Reminders:** can only be verified end-to-end after SMS is configured (§4), or for a patient currently inside the 24h Messenger window.

### Emergency rollback
- If real Messenger events get dropped with `Rejected webhook event — invalid signature`: unset `FB_APP_SECRET`/`FB_CLIENT_SECRET` in Render env (drops to accept-with-warning), or `git revert <commit>`.

---

## 7. Commit log for this work
| Commit | Summary |
|---|---|
| `808e376` | Harden webhook: Claire history, signature verify, intent accuracy, booking logic, test harness |
| `64bea2e` | Hotfix: `messaging_type RESPONSE` instead of deprecated tag (text replies were all being dropped) |
| `7bda13d` | Fix automatic reminders: drop deprecated tag, honest SMS fallback |
| `9c2692a` | Fix manual reminders + status notifications: real delivery detection, honest success/error |

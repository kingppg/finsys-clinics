// webhook.js — Full AI-powered version (Claude Haiku handles intent + human-like responses)
// NOW with context object pattern for clinic-level data (timezone, tokens, etc.)
// AI Brain (Ate Claire) → ./ai/claire.js
// Messenger helpers → ./helpers/messengerHelpers.js
// Booking helpers → ./helpers/bookingHelpers.js

console.log("webhook.js loaded");
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// --- IMPORT MENU COMPONENTS ---
const sendIntroMenu = require('./menu/sendIntroMenu');
const sendAppointmentForButtonTemplate = require('./menu/sendAppointmentForButtonTemplate');
const sendTimeSlotButtonTemplate = require('./menu/sendTimeSlotButtonTemplate');
const sendConfirmationButtonTemplate = require('./menu/sendConfirmationButtonTemplate');
const sendBookingPromptButtonTemplate = require('./menu/sendBookingPromptButtonTemplate');
const sendUnknownInputCard = require('./menu/sendUnknownInputCard');

// ✅ Claire AI Brain
const { getClaudeResponse } = require('./ai/claire');

// ✅ Messenger helpers
const {
  sendMessage,
  emitAppointmentUpdate,
  getClinicByMessengerPageId,
  buildContext,
  getUtcOffset
} = require('./helpers/messengerHelpers');

// ✅ Booking helpers
const {
  normalize,
  toTitleCase,
  to12HourFormat,
  to24HourFormat,
  isClinicOpen,
  findPatientByMessengerId,
  findPatientByNameAndPhone,
  getAvailableSlots,
  hasDoubleBookingOnDate,
  proceedToSlotSelection
} = require('./helpers/bookingHelpers');

const router = express.Router();

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "palodentcare_secret_token";

// Facebook signs every webhook POST with HMAC-SHA256 of the raw body using the
// app secret. We verify it so only genuine Facebook events are processed —
// otherwise anyone who learns the URL could spam fake events and burn API spend.
const FB_APP_SECRET = process.env.FB_APP_SECRET || process.env.FB_CLIENT_SECRET;

function verifyFbSignature(req) {
  // Allow local dev when no secret is configured, but make it loud.
  if (!FB_APP_SECRET) {
    console.warn("[WARN] FB_APP_SECRET/FB_CLIENT_SECRET not set — skipping webhook signature verification (dev only).");
    return true;
  }
  const signature = req.get("x-hub-signature-256");
  if (!signature || !req.rawBody) {
    console.warn("[WARN] Missing X-Hub-Signature-256 or raw body on webhook request.");
    return false;
  }
  const expected = "sha256=" + crypto
    .createHmac("sha256", FB_APP_SECRET)
    .update(req.rawBody)
    .digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  try {
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// --- Supabase Client ---
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Minimum confidence before we ACT on a state-changing AI intent (book / cancel /
// confirm). Below this we treat the message as a question and let Claire answer
// instead of yanking the user into a flow on a shaky classification. (Bug #7)
const CONFIDENCE_THRESHOLD = 0.6;

// --- Conversation state ---
let userStates = {};

// --- WEBHOOK VERIFY ---
router.get("/", (req, res) => {
  console.log("HIT: /webhook route");
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified by Facebook");
      res.status(200).send(challenge);
    } else { res.sendStatus(403); }
  } else { res.sendStatus(400); }
});

// --- WEBHOOK EVENT HANDLER ---
router.post("/", async (req, res) => {
  if (!verifyFbSignature(req)) {
    console.warn("[WARN] Rejected webhook event — invalid signature.");
    return res.sendStatus(403);
  }
  const body = req.body;
  if (body.object === "page") {
    res.status(200).send("EVENT_RECEIVED");

    for (const entry of body.entry) {
      const pageIdFromEntry = entry.id;
      for (const webhook_event of entry.messaging) {
        const sender_psid = webhook_event.sender?.id;
        if (webhook_event.delivery || webhook_event.read) continue;
        if (webhook_event.message?.is_echo) continue;
        const page_id = pageIdFromEntry || webhook_event.recipient?.id || webhook_event.sender?.id;
        const clinic = await getClinicByMessengerPageId(page_id);
        if (!clinic) { console.warn('[WARN] No clinic linked to page_id:', page_id); continue; }

        const context = buildContext(clinic);

        try {
          if (webhook_event.message?.text) {
            await handleMessage(sender_psid, webhook_event.message.text.trim(), webhook_event, req, context);
          } else if (webhook_event.postback?.payload) {
            await handleMessage(sender_psid, webhook_event.postback.payload, webhook_event, req, context);
          }
        } catch (err) {
          console.error('❌ Error in webhook handler:', err);
          await sendMessage(sender_psid, "Sorry po, may nangyari. Pakisubukan ulit. 😊", context);
        }
      }
    }
    return;
  }
  res.sendStatus(404);
});

// ---------------------------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------------------------
async function handleMessage(sender_psid, message, webhook_event, req, context) {
  console.log(`[DEBUG] state=${userStates[sender_psid]?.state} | message=${message} | clinic=${context.clinicName}`);

  if (!userStates[sender_psid]) {
    userStates[sender_psid] = { state: "default", data: {} };
  }
  let userState = userStates[sender_psid];
  let normalizedMsg = normalize(message);

  // --- Postback buttons — handle directly, no Claude needed ---
  if (message === 'UNKNOWN_INPUT_YES') {
    userStates[sender_psid] = { state: "default", data: {} };
    await sendIntroMenu(sender_psid, context.pageAccessToken);
    return;
  }
  if (message === 'UNKNOWN_INPUT_NO') {
    await sendMessage(sender_psid, "Sige po! Kung kailangan ninyo ng tulong, nandito lang kami. God bless! 😊", context);
    userStates[sender_psid] = { state: "default", data: {} };
    return;
  }
  // ✅ Fix #1: Handle awaiting_unknown_confirm state
  if (userState.state === "awaiting_unknown_confirm") {
    if (message === 'UNKNOWN_INPUT_YES') {
      userStates[sender_psid] = { state: "default", data: {} };
      await sendIntroMenu(sender_psid, context.pageAccessToken);
      return;
    }
    if (message === 'UNKNOWN_INPUT_NO') {
      await sendMessage(sender_psid, "Sige po! Kung kailangan ninyo ng tulong, nandito lang kami. God bless! 😊", context);
      userStates[sender_psid] = { state: "default", data: {} };
      return;
    }
  }
  if (message === 'MENU_BOOK_APPOINTMENT') {
    userState.state = "awaiting_date";
    await sendMessage(sender_psid, "Sige po! Paki-type ang inyong preferred na petsa sa format: YYYY-MM-DD (halimbawa: 2025-12-20) 😊", context);
    return;
  }
  if (message === 'MENU_CONFIRM_BOOKING') {
    userState.state = "awaiting_confirm_code";
    await sendMessage(sender_psid, "Paki-type po ang inyong appointment code (ID number) para ma-confirm namin. 😊", context);
    return;
  }
  if (message === 'MENU_CANCEL_APPOINTMENT') {
    userState.state = "awaiting_cancel_code";
    await sendMessage(sender_psid, "Paki-type po ang inyong appointment code (ID number) na gusto ninyong i-cancel.", context);
    return;
  }
  if (message === 'BOOK_ANOTHER_APPOINTMENT') {
    userStates[sender_psid] = { state: "awaiting_date", data: {} };
    await sendMessage(sender_psid, "Sige po! Paki-type ang bagong petsa sa format: YYYY-MM-DD 😊", context);
    return;
  }
  if (message === 'DECLINE_BOOKING') {
    await sendMessage(sender_psid, "Okay lang po! Kung kailangan ninyo ng appointment sa susunod, nandito lang kami. Ingat! 😊", context);
    userStates[sender_psid] = { state: "default", data: {} };
    return;
  }
  if (message === 'CONFIRM_BOOKING') normalizedMsg = 'confirm_booking';
  if (message === 'CANCEL_BOOKING') normalizedMsg = 'cancel_booking';

  // ✅ The "Who is this for?" buttons send uppercase payloads (FOR_ME /
  // FOR_SOMEONE_ELSE). Match both cases so these deterministic taps skip Claude
  // entirely — no wasted API call and no chance of a misfired intent. (Bug #8)
  const isPostback = ['for_me', 'for_someone_else', 'FOR_ME', 'FOR_SOMEONE_ELSE'].includes(message) ||
    message.startsWith('SLOT_') || message.startsWith('slot_');

  let claudeResult = { intent: "unknown", confidence: 0, reply: null };

  if (!isPostback && message !== 'CONFIRM_BOOKING' && message !== 'CANCEL_BOOKING') {
    try {
      claudeResult = await getClaudeResponse(message, sender_psid, userState.state, context);
      if (!claudeResult || typeof claudeResult !== 'object') {
        claudeResult = { intent: "unknown", confidence: 0, reply: null };
      }
    } catch (e) {
      console.error('[DEBUG] Claude error:', e);
      claudeResult = { intent: "unknown", confidence: 0, reply: null };
    }
  }

  const topIntent = claudeResult.intent || "unknown";
  const aiReply = claudeResult.reply || null;
  const confidence = typeof claudeResult.confidence === 'number' ? claudeResult.confidence : 0;
  const confidentIntent = confidence >= CONFIDENCE_THRESHOLD;

  console.log(`[DEBUG] topIntent="${topIntent}" confidence=${confidence} aiReply="${aiReply?.substring(0, 60)}"`);

  try {
    switch (userState.state) {

      case "default": {
        // ✅ Fix #2 & #3: Apply confidence threshold to greetings; if greeting + question, answer question not greeting
        if (topIntent === 'greet' && confidence >= CONFIDENCE_THRESHOLD) {
          const greetTokens = message.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean);
          const questionWords = ['ba', 'ano', 'pano', 'paano', 'ai', 'bot', 'ask',
            'magkano', 'pwede', 'kailan', 'saan', 'bakit', 'sino'];
          const hasQuestion = message.includes('?') ||
            greetTokens.some(t => questionWords.includes(t)) ||
            greetTokens.length > 6;

          // ✅ If greeting has a tacked-on question, DON'T just send greeting reply
          // Fall through to send the full AI reply which should address the question
          if (!hasQuestion) {
            if (aiReply) await sendMessage(sender_psid, aiReply, context);
            await sendIntroMenu(sender_psid, context.pageAccessToken);
            return;
          }
          // Greeting + question: send AI reply (which should answer the Q, not just greet)
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'book_appointment' && confidentIntent) {
          userState.state = "awaiting_date";
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'cancel_appointment' && confidentIntent) {
          userState.state = "awaiting_cancel_code";
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'confirm_appointment' && confidentIntent) {
          userState.state = "awaiting_confirm_code";
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'gratitude') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (aiReply) {
          await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        userStates[sender_psid].state = "awaiting_unknown_confirm";
        await sendUnknownInputCard(sender_psid, context.pageAccessToken);
        return;
      }

      case "awaiting_confirm_code": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        const code = message.trim();
        if (!/^\d+$/.test(code)) {
          const reply = aiReply || "Hmm, parang hindi numero ang nitype ninyo. Paki-type po ang inyong appointment code (numbers only). 😊";
          await sendMessage(sender_psid, reply, context);
          return;
        }
        const { data: appointment, error: apptErr } = await supabase
          .from('appointments').select('*').eq('id', code).eq('clinic_id', context.clinicId).maybeSingle();
        if (apptErr || !appointment) {
          await sendMessage(sender_psid, "Ay, wala po kaming nahanap na appointment sa code na iyon. Pakicheck ulit ang inyong code. 😊", context);
          return;
        }
        // ✅ Fix #7: Separate guardian from patient identity
        // During confirmation, NEVER link sender to patient.messenger_id (that's for booking)
        // Only use guardian_messenger_id if sender is not the patient
        const { data: patientRow } = await supabase.from('patients').select('messenger_id')
          .eq('id', appointment.patient_id).eq('clinic_id', context.clinicId).maybeSingle();

        // Only link if sender IS the actual patient (patient has no messenger_id yet)
        if (!patientRow?.messenger_id) {
          // Check: is sender a different patient? If so, they're a guardian
          const { data: existingPatient } = await supabase.from('patients').select('id')
            .eq('messenger_id', sender_psid).eq('clinic_id', context.clinicId).maybeSingle();
          if (existingPatient && existingPatient.id !== appointment.patient_id) {
            // Sender is a different patient → they're confirming for someone else (guardian)
            await supabase.from('appointments').update({ guardian_messenger_id: sender_psid })
              .eq('id', appointment.id).eq('clinic_id', context.clinicId);
          } else if (!existingPatient) {
            // Sender has no patient record at all
            // Conservative: only link if they're confirming their OWN appointment (booking_for === "me")
            // For now, assume they're the patient since they have the code
            // But DON'T set guardian_messenger_id unless we're sure they're a guardian
            // In future, could ask "Is this your appointment or someone else's?"
            await supabase.from('patients').update({ messenger_id: sender_psid })
              .eq('id', appointment.patient_id).eq('clinic_id', context.clinicId);
          }
        }
        if (["Completed", "Cancelled", "No Show"].includes(appointment.status)) {
          let statusMsg = "";
          if (appointment.status === "Completed") statusMsg = "Natapos na po ang appointment na ito. Gusto po ba ninyong mag-book ng bago? 😊";
          if (appointment.status === "Cancelled") statusMsg = "Na-cancel na po ang appointment na ito. Gusto po ba ninyong mag-book ng bago? 😊";
          if (appointment.status === "No Show") statusMsg = "Ang appointment na ito ay minarkahan bilang 'No Show'. Gusto po ba ninyong mag-book ng bago? 😊";
          await sendBookingPromptButtonTemplate(sender_psid, statusMsg, context.pageAccessToken);
          userStates[sender_psid] = { state: "awaiting_booking_prompt_response", data: {} };
          return;
        }
        if (["Scheduled", "Confirmed"].includes(appointment.status)) {
          const { data: patientRow2 } = await supabase.from('patients').select('messenger_id')
            .eq('id', appointment.patient_id).eq('clinic_id', context.clinicId).maybeSingle();
          if (!patientRow2?.messenger_id) {
            await supabase.from('appointments').update({ status: 'Confirmed' })
              .eq('id', appointment.id).eq('clinic_id', context.clinicId);
            if (req?.io) await emitAppointmentUpdate(req.io, context.clinicId, appointment.id);
            await sendMessage(sender_psid, "✅ Na-link na po ang inyong Messenger at nakumpirma na ang inyong appointment! Makakatanggap na kayo ng reminder bago ang inyong schedule. 🦷😊", context);
          } else {
            await sendMessage(sender_psid, "✅ Confirmed na po ang inyong appointment! Makakatanggap kayo ng reminder. Ingat po! 🦷", context);
          }
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        await sendMessage(sender_psid, "May nangyari po sa pagproseso ng inyong code. Paki-contact ang clinic para sa assistance. 😊", context);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }

      case "awaiting_cancel_code": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        const code = message.trim();
        if (!/^\d+$/.test(code)) {
          await sendMessage(sender_psid, "Hmm, paki-type po ang inyong appointment code (numbers only). 😊", context);
          return;
        }
        const { data: apptData, error: apptErr } = await supabase
          .from('appointments').select('*, patient:patient_id (messenger_id)')
          .eq('id', code).eq('clinic_id', context.clinicId).maybeSingle();
        if (apptErr || !apptData) {
          await sendMessage(sender_psid, "Wala po kaming nahanap na appointment sa code na iyan. Type po ng 'Cancel' para lumabas, o 'Try Again' para subukan ulit.", context);
          userStates[sender_psid].state = "awaiting_cancel_code_retry";
          return;
        }
        const appointment = apptData;
        const isPatient = appointment.patient?.messenger_id === sender_psid;
        const isGuardian = appointment.guardian_messenger_id === sender_psid;
        if (!isPatient && !isGuardian) {
          await sendMessage(sender_psid, "Wala po kayong appointment sa code na iyan. Type po ng 'Cancel' para lumabas, o 'Try Again' para subukan ulit.", context);
          userStates[sender_psid].state = "awaiting_cancel_code_retry";
          return;
        }
        // ✅ Fix #6 & #11: Use clinic timezone consistently for date/time checks
        const timeZone = context.timeZone || 'Asia/Manila';
        const apptTime = new Date(appointment.appointment_time);

        // Get today's date in clinic timezone
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
        const today = new Date(todayStr);

        // Get appointment date in clinic timezone
        const apptDateStr = new Intl.DateTimeFormat('en-CA', { timeZone }).format(apptTime);
        const apptDate = new Date(apptDateStr);

        if (apptDate < today) {
          await sendMessage(sender_psid, "Hindi na po pwedeng i-cancel ang nakaraang appointment. Ang mga kasalukuyan at hinaharap na appointment lang po ang pwedeng i-cancel. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        // Check 1-hour cutoff using clinic time
        const now = new Date();
        const oneHourMs = 60 * 60 * 1000;
        const msDiff = apptTime.getTime() - now.getTime();
        if (msDiff <= oneHourMs) {
          await sendMessage(sender_psid, "Pasensya na po, hindi na pwedeng i-cancel ang appointment na less than 1 hour na lang. Pakicontact na lang po ang clinic directly. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        // ✅ Fix #13: Prevent cancellation of Completed appointments too
        if (["Cancelled", "No Show", "Completed"].includes(appointment.status)) {
          let statusMsg = "Na-cancel na po o minarkahan ng No Show ang appointment na ito. 😊";
          if (appointment.status === "Completed") statusMsg = "Natapos na po ang appointment na ito, hindi na pwedeng i-cancel. 😊";
          await sendMessage(sender_psid, statusMsg, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        await supabase.from('appointments').update({ status: 'Cancelled', reason: 'Cancelled via Messenger' })
          .eq('id', appointment.id).eq('clinic_id', context.clinicId);
        if (req?.io) await emitAppointmentUpdate(req.io, context.clinicId, appointment.id);
        await sendMessage(sender_psid, "Na-cancel na po ang inyong appointment. Kung kailangan ninyong mag-book ulit, message lang po kayo anytime. Ingat! 😊", context);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }

      case "awaiting_cancel_code_retry": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (normalize(message) === "try again" || normalize(message) === "tryagain") {
          userStates[sender_psid].state = "awaiting_cancel_code";
          await sendMessage(sender_psid, "Sige po! Paki-type ulit ang inyong appointment code. 😊", context);
          return;
        }
        await sendMessage(sender_psid, "Type po ng 'Cancel' para lumabas, o 'Try Again' para subukan ulit. 😊", context);
        return;
      }

      case "awaiting_booking_prompt_response": {
        if (message === "DECLINE_BOOKING" || topIntent === 'no' || topIntent === 'cancel_flow') {
          const reply = aiReply || "Okay lang po! Kung kailangan ninyo ng appointment sa susunod, nandito lang kami. Ingat! 😊";
          await sendMessage(sender_psid, reply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (message === "BOOK_ANOTHER_APPOINTMENT" || topIntent === 'yes' || topIntent === 'book_appointment') {
          userStates[sender_psid] = { state: "awaiting_date", data: {} };
          const reply = aiReply || "Sige po! Paki-type ang inyong preferred na petsa sa format: YYYY-MM-DD 😊";
          await sendMessage(sender_psid, reply, context);
          return;
        }
        await sendMessage(sender_psid, "Gusto po ba ninyong mag-book ng bagong appointment? Sagutin lang po ng Yes o No. 😊", context);
        return;
      }

      case "awaiting_date": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(message.trim())) {
          const looksLikeDateAttempt = /\d/.test(message.trim());
          if (looksLikeDateAttempt) {
            await sendMessage(sender_psid, "Hmm, parang hindi tama ang format ng petsa. 😊 Paki-type po sa format na YYYY-MM-DD, halimbawa: 2026-05-05.", context);
          } else {
            if (aiReply) await sendMessage(sender_psid, aiReply, context);
            else await sendMessage(sender_psid, "Sige po! Paki-type lang ng petsa sa format na YYYY-MM-DD, halimbawa: 2026-05-05. 😊", context);
          }
          return;
        }

        if (!isClinicOpen(message.trim())) {
          await sendMessage(sender_psid, "Pasensya na po, sarado kami tuwing Linggo! 😊 Pwede po kayong pumili ng ibang araw — Lunes hanggang Sabado lang po kami bukas.", context);
          return;
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (new Date(message.trim()) < today) {
          await sendMessage(sender_psid, "Ay, nakaraan na po ang petsang iyon! 😅 Paki-type ng petsa na hindi pa nakaraan po.", context);
          return;
        }

        userState.data.date = message.trim();

        const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
        userState.data.slots = slots;
        userState.data.activeDentists = activeDentists;

        if (!activeDentists.length) {
          await sendMessage(sender_psid, "Pasensya na po, wala pang available na dentist ngayon. Pakisubukan mamaya. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (slots.length === 0) {
          await sendMessage(sender_psid, "Pasensya na po, wala nang available na slots para sa araw na iyon. 😔 Pwede po kayong pumili ng ibang petsa?", context);
          userState.data = {};
          return;
        }

        // ✅ If already booking for someone else with known name, skip patient collection
        if (userState.data.booking_for === "someone else" && userState.data.patient_name) {
          const patient = await findPatientByNameAndPhone(userState.data.patient_name, userState.data.patient_phone || null, context, false);
          if (patient) {
            const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, context);
            if (doubleBooked) {
              const savedPatientName = userState.data.patient_name;
              const savedPatientPhone = userState.data.patient_phone;
              await sendMessage(sender_psid, `Mayroon na pong appointment si ${userState.data.patient_name} sa ${userState.data.date}. 😔 Paki-type ng ibang petsa (YYYY-MM-DD).`, context);
              userStates[sender_psid].state = "awaiting_date";
              userStates[sender_psid].data = {
                booking_for: "someone else",
                patient_name: savedPatientName,
                patient_phone: savedPatientPhone
              };
              return;
            }
            userState.data.patient_id = patient.id;
          } else {
          userState.data.patient_id = null;
          }
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, `Narito po ang mga available na slots para sa ${userState.data.date}. Pumili lang po! 😊`, context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
          return;
        }

        const patient = await findPatientByMessengerId(sender_psid, context);

        if (patient) {
          const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, context);
          if (doubleBooked) {
            userState.data.booking_for = null;
            userState.state = "awaiting_for_whom";
            await sendMessage(sender_psid, "Mukhang may appointment na kayo sa petsang iyon! 😊 Para kanino po ito — para sa inyo o para sa ibang tao?", context);
            await sendAppointmentForButtonTemplate(sender_psid, context.pageAccessToken);
            return;
          }
          userState.data.booking_for = "me";
          userState.data.patient_id = patient.id;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, `Narito po ang mga available na time slots para sa ${userState.data.date}. Pumili lang po kayo! 😊`, context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
        } else {
          userState.data.booking_for = "me";
          userState.state = "awaiting_my_name";
          await sendMessage(sender_psid, "Paki-type lang po ang inyong buong pangalan para sa appointment. 😊", context);
        }
        return;
      }

      case "awaiting_my_name": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        userState.data.patient_name = toTitleCase(message.trim());
        userState.state = "awaiting_my_phone";
        await sendMessage(sender_psid, "Salamat po! May contact number po ba kayo? Pwede ring mag-type ng 'skip' kung ayaw ninyong ibigay. 📱", context);
        return;
      }

      case "awaiting_my_phone": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        let phone = null;
        const skipPhrases = ['wala', 'walang', 'wala po', 'wala siya', 'no number',
          'no contact', 'none', 'nothing', 'di ko alam', 'hindi ko alam', 'not sure',
          'di ko sure', 'wag na', 'skip', 'priv', 'private'];
        const msgLower = message.toLowerCase().trim();
        const isSkip = skipPhrases.some(p => msgLower.includes(p)) ||
          normalize(message) === 'skip' ||
          topIntent === 'no';
        if (!isSkip) {
          phone = message.trim();
          if (!/^\d{10,}$/.test(phone)) {
            await sendMessage(sender_psid, "Hmm, parang hindi tama ang format ng number. Numbers lang po, o mag-type ng 'skip' kung wala pong contact number. 😊", context);
            return;
          }
        }
        userState.data.patient_phone = phone;

        const patient = await findPatientByNameAndPhone(userState.data.patient_name, phone, context);

        if (patient) {
          const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, context);
          if (doubleBooked) {
            userState.data.found_patient_id = patient.id;
            userState.data.found_patient_name = patient.name;
            userState.data.found_patient_phone = patient.phone;
            userState.state = "awaiting_for_whom";
            await sendMessage(
              sender_psid,
              `Mukhang may appointment na si ${patient.name} sa petsang iyon! 😊 Para kanino po ito — para sa inyo o para sa ibang tao?`,
              context
            );
            await sendAppointmentForButtonTemplate(sender_psid, context.pageAccessToken);
            return;
          }
          userState.data.found_patient_id = patient.id;
          userState.data.found_patient_name = patient.name;
          userState.data.found_patient_phone = patient.phone;
          userState.state = "awaiting_my_confirm_match";
          let msg = `Nakakita kami ng existing record:\nPangalan: ${patient.name}\n`;
          if (patient.phone) msg += `Mobile: ${patient.phone}\n`;
          msg += "\nKayo po ba ito? I-reply ng YES para i-link ang inyong Messenger, o NO para gumawa ng bagong record. 😊";
          await sendMessage(sender_psid, msg, context);
        } else {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Narito po ang mga available na slots! Pumili lang po. 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
        }
        return;
      }

      case "awaiting_my_confirm_match": {
        if (topIntent === 'yes') {
          await supabase.from('patients').update({ messenger_id: sender_psid })
            .eq('id', userState.data.found_patient_id).eq('clinic_id', context.clinicId);
          userState.data.patient_id = userState.data.found_patient_id;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Na-link na po kayo! Narito ang mga available na slots. Pumili lang po! 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
        } else if (topIntent === 'no') {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Sige po! Gawa na kami ng bagong record para sa inyo. Narito ang mga available na slots! 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
        } else {
          await sendMessage(sender_psid, "I-reply lang po ng YES o NO. 😊", context);
        }
        return;
      }

      case "awaiting_for_whom": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        // ✅ Tokenize once for word-boundary matching, so short words like 'ako'
        // or 'iba' don't match inside unrelated words/names. (Bug #9, #10)
        const whomTokens = normalizedMsg.split(/\s+/).filter(Boolean);
        const hasToken = (list) => list.some(w => whomTokens.includes(w));
        const hasPhrase = (list) => list.some(p => normalizedMsg.includes(p));

        // Relationship / third-party words → booking for someone else.
        const elseTokens = ['anak', 'asawa', 'magulang', 'kapatid', 'lolo', 'lola',
          'nanay', 'tatay', 'mama', 'papa', 'kaibigan', 'friend', 'pamilya',
          'pinsan', 'someone', 'iba', 'ibang'];
        const elsePhrases = ['ibang tao', 'para kay', 'para sa anak', 'para sa asawa',
          'para sa kapatid', 'para sa magulang', 'para sa kaibigan', 'para sa iba'];

        // First-person words → booking for self.
        const meTokens = ['ako', 'akin', 'sakin', 'sarili'];
        const mePhrases = ['para sa akin', 'para sa sarili', 'para sa aking', 'para ako'];

        const explicitForMe = ['1', 'for me', 'for_me'].includes(normalizedMsg);
        const explicitForElse = ['2', 'for someone else', 'for_someone_else'].includes(normalizedMsg);

        const isForSomeoneElse =
          explicitForElse || topIntent === 'yes' || hasToken(elseTokens) || hasPhrase(elsePhrases);
        const isForMe =
          explicitForMe || topIntent === 'no' || hasToken(meTokens) || hasPhrase(mePhrases);

        // ✅ Evaluate "someone else" FIRST: an explicit relationship word is a
        // stronger signal than a stray first-person token, so a message like
        // "para sa anak, hindi sa akin" resolves to someone else. (Bug #9)
        if (isForSomeoneElse) {
          userState.data.booking_for = "someone else";

          // ✅ If we already have patient name and slots from a previous attempt
          // (e.g. redirected back after double-booking on same date),
          // skip straight to slot selection instead of asking for name again
          if (userState.data.patient_name && userState.data.slots && userState.data.slots.length > 0) {
            userState.state = "awaiting_slot";
            await sendMessage(
              sender_psid,
              `Narito po ang mga available na slots para sa ${userState.data.date}. Pumili lang po! 😊`,
              context
            );
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
            return;
          }

          // Fresh booking for someone else — ask for name
          userState.state = "awaiting_patient_name";
          const reply = aiReply || "Paki-type po ang buong pangalan ng taong gusto ninyong i-book. 😊";
          await sendMessage(sender_psid, reply, context);
          return;
        }

        if (isForMe) {
          await sendMessage(sender_psid, "Mayroon na po kayong appointment sa petsang iyon. Paki-type ng ibang petsa (YYYY-MM-DD). 😊", context);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
          return;
        }

        // Truly unclear — ask politely once more with buttons
        await sendMessage(sender_psid, "Pasensya na po, hindi ko po naintindihan. Para kanino po ito? 😊", context);
        await sendAppointmentForButtonTemplate(sender_psid, context.pageAccessToken);
        return;
      }

      case "awaiting_patient_name": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        userState.data.patient_name = toTitleCase(message.trim());
        userState.state = "awaiting_patient_phone";
        await sendMessage(sender_psid, `Salamat po! May contact number po ba si ${userState.data.patient_name}? Pwede ring mag-type ng 'skip'. 📱`, context);
        return;
      }

      case "awaiting_patient_phone": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        let phone = null;
        const skipPhrasesP = ['wala', 'walang', 'wala po', 'wala siya', 'no number',
          'no contact', 'none', 'nothing', 'di ko alam', 'hindi ko alam', 'not sure',
          'di ko sure', 'wag na', 'skip', 'priv', 'private'];
        const msgLowerP = message.toLowerCase().trim();
        const isSkipP = skipPhrasesP.some(p => msgLowerP.includes(p)) ||
          normalize(message) === 'skip' ||
          topIntent === 'no';
        if (!isSkipP) {
          phone = message.trim();
          if (!/^\d{10,}$/.test(phone)) {
            await sendMessage(sender_psid, "Hmm, parang hindi tama ang format ng number. Numbers lang po, o mag-type ng 'skip' kung wala pong contact number. 😊", context);
            return;
          }
        }
        userState.data.patient_phone = phone;

        // ✅ Strong match: same phone AND name → confident it's the same person. (Bug #6)
        const strictMatch = await findPatientByNameAndPhone(userState.data.patient_name, phone, context, false);
        if (strictMatch) {
          const doubleBooked = await hasDoubleBookingOnDate(strictMatch.id, userState.data.date, context);
          if (doubleBooked) {
            // ✅ Keep patient_name so we don't ask again if they pick a new date
            const savedPatientName = userState.data.patient_name;
            const savedPatientPhone = userState.data.patient_phone;
            await sendMessage(sender_psid, `Mayroon na pong appointment si ${userState.data.patient_name} sa ${userState.data.date}. 😔 Paki-type ng ibang petsa (YYYY-MM-DD).`, context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {
              booking_for: "someone else",
              patient_name: savedPatientName,
              patient_phone: savedPatientPhone
            };
            return;
          }
          userState.data.patient_id = strictMatch.id;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Narito po ang mga available na slots! Pumili lang po. 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
          return;
        }

        // ✅ No strong match, but a record with the SAME NAME exists. Don't guess —
        // ask the guardian to confirm it's the same person before reusing it,
        // otherwise we'd risk booking onto a stranger's record. (Bug #6 + confirmation)
        const nameOnlyMatch = await findPatientByNameAndPhone(userState.data.patient_name, null, context, true);
        if (nameOnlyMatch) {
          userState.data.found_patient_id = nameOnlyMatch.id;
          userState.data.found_patient_name = nameOnlyMatch.name;
          userState.state = "awaiting_guardian_confirm_match";
          let gMsg = `May nakita po kaming record na pareho ng pangalan:\nPangalan: ${nameOnlyMatch.name}\n`;
          if (nameOnlyMatch.phone) gMsg += `Mobile: ••••${String(nameOnlyMatch.phone).slice(-4)}\n`;
          gMsg += `\nIto po ba ang taong gusto ninyong i-book? I-reply ng YES kung siya, o NO para gumawa ng bagong record. 😊`;
          await sendMessage(sender_psid, gMsg, context);
          return;
        }

        // Truly new person — a fresh record will be created at confirmation.
        userState.data.patient_id = null;
        userState.state = "awaiting_slot";
        await sendMessage(sender_psid, "Narito po ang mga available na slots! Pumili lang po. 😊", context);
        await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
        return;
      }

      case "awaiting_guardian_confirm_match": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (topIntent === 'yes') {
          const foundId = userState.data.found_patient_id;
          const doubleBooked = await hasDoubleBookingOnDate(foundId, userState.data.date, context);
          if (doubleBooked) {
            const savedPatientName = userState.data.patient_name;
            const savedPatientPhone = userState.data.patient_phone;
            await sendMessage(sender_psid, `Mayroon na pong appointment si ${userState.data.found_patient_name} sa ${userState.data.date}. 😔 Paki-type ng ibang petsa (YYYY-MM-DD).`, context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {
              booking_for: "someone else",
              patient_name: savedPatientName,
              patient_phone: savedPatientPhone
            };
            return;
          }
          userState.data.patient_id = foundId;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Sige po! Narito ang mga available na slots. Pumili lang po! 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
          return;
        }
        if (topIntent === 'no') {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          await sendMessage(sender_psid, "Sige po! Gagawa kami ng bagong record. Narito ang mga available na slots! 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, userState.data.slots, context.pageAccessToken);
          return;
        }
        await sendMessage(sender_psid, "I-reply lang po ng YES o NO. 😊", context);
        return;
      }

      case "awaiting_slot": {
        if (topIntent === 'cancel_flow') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        const availableSlots = userState.data.slots;
        let slot = null;
        if (normalizedMsg.startsWith("slot_")) {
          slot = message.substring(5);
        } else {
          const idx = parseInt(normalizedMsg, 10) - 1;
          if (!availableSlots || isNaN(idx) || idx < 0 || idx >= availableSlots.length) {
            await sendMessage(sender_psid, "Pakitap lang po ang isa sa mga button para pumili ng time slot. 😊", context);
            return;
          }
          slot = availableSlots[idx];
        }
        if (!availableSlots.includes(slot)) {
          await sendMessage(sender_psid, "Hindi valid ang piniling slot. Pakipili ng isa pa. 😊", context);
          return;
        }
        userState.data.slot = slot;
        userState.state = "confirming";
        let summary = `📋 Booking Summary:\n📅 Petsa: ${userState.data.date}\n⏰ Oras: ${slot}\n`;
        if (userState.data.booking_for === "me") {
          const patient = await findPatientByMessengerId(sender_psid, context);
          summary += `👤 Pangalan: ${patient ? patient.name : userState.data.patient_name}\n`;
          if (patient?.phone) summary += `📱 Mobile: ${patient.phone}\n`;
          else if (userState.data.patient_phone) summary += `📱 Mobile: ${userState.data.patient_phone}\n`;
        } else {
          summary += `👤 Pangalan: ${userState.data.patient_name}\n`;
          if (userState.data.patient_phone) summary += `📱 Mobile: ${userState.data.patient_phone}\n`;
        }
        summary += "\nTama po ba ito? I-confirm o i-cancel lang po. 😊";
        await sendConfirmationButtonTemplate(sender_psid, summary, context.pageAccessToken);
        return;
      }

      case "confirming": {
        // ✅ Fix #4: Check confidence on confirm/cancel intents
        const wantsCancel = (topIntent === 'cancel_flow' && confidence >= CONFIDENCE_THRESHOLD) ||
          normalizedMsg === 'cancel_booking';
        const wantsConfirm = (topIntent === 'yes' && confidence >= CONFIDENCE_THRESHOLD) ||
          normalizedMsg === 'confirm_booking' || ['ok', 'confirm'].includes(normalizedMsg);

        // ✅ Cancel at the summary screen. We DO record this — on an EXPLICIT
        // cancel only — to capture the contact for the customer list, feed
        // analytics, and let staff follow up with people who backed out.
        // Unclear input (handled below) still writes nothing. (Bug #5, revised)
        if (wantsCancel) {
          try {
            // Resolve the patient so the contact is captured. Reuse a known id,
            // else find an existing record by messenger (for "me"), else insert
            // a lightweight record.
            let cancelPatientId = userState.data.patient_id;
            if (!cancelPatientId && userState.data.booking_for === "me") {
              const existing = await findPatientByMessengerId(sender_psid, context);
              if (existing) cancelPatientId = existing.id;
            }
            if (!cancelPatientId && userState.data.patient_name) {
              const cancelPayload = {
                name: String(userState.data.patient_name),
                phone: userState.data.patient_phone || null,
                clinic_id: context.clinicId
              };
              if (userState.data.booking_for === "me") cancelPayload.messenger_id = sender_psid;
              const { data: newPatient, error: cancelInsErr } = await supabase.from('patients')
                .insert(cancelPayload).select('id').single();
              if (!cancelInsErr && newPatient) cancelPatientId = newPatient.id;
            }

            // Record a Cancelled appointment for analytics / follow-up. Status
            // 'Cancelled' means getAvailableSlots ignores it, so it never blocks
            // a real slot. The sender's messenger id is captured via guardian id.
            if (cancelPatientId && userState.data.date && userState.data.slot) {
              const cancelDentistId = userState.data.activeDentists?.[0]?.id || null;
              if (cancelDentistId) {
                const slot24c = to24HourFormat(userState.data.slot);
                const offsetc = getUtcOffset(context.timeZone);
                const datetimec = `${userState.data.date}T${slot24c}:00${offsetc}`;
                const { data: cancelAppt } = await supabase.from('appointments').insert({
                  dentist_id: cancelDentistId, patient_id: cancelPatientId, appointment_time: datetimec,
                  booking_origin: 'Messenger Booking', status: 'Cancelled',
                  reason: 'Cancelled at confirmation (Messenger)',
                  guardian_messenger_id: sender_psid, clinic_id: context.clinicId
                }).select('id').single();
                if (req?.io && cancelAppt?.id) await emitAppointmentUpdate(req.io, context.clinicId, cancelAppt.id);
              }
            }
          } catch (err) {
            // Recording is best-effort — never let it break the user's exit.
            console.error("Error recording cancellation:", err);
          }
          const reply = aiReply || "Na-cancel po ang inyong booking. Kung gusto ninyong mag-book ulit, sabihin lang po! 😊";
          await sendMessage(sender_psid, reply, context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        // ✅ Fix #4: If not confirm/cancel but Claire has a reply, send it and let them continue
        // (e.g., user asks "What's the dentist's name?" at confirmation)
        if (!wantsConfirm) {
          if (aiReply) {
            await sendMessage(sender_psid, aiReply, context);
            // Stay in confirming state so they can still confirm or cancel
          } else {
            await sendMessage(sender_psid, "Pakitap lang po ang Confirm o Cancel button para matuloy. 😊", context);
          }
          return;
        }

        // --- From here on the user has CONFIRMED. Resolve the dentist, then write. ---
        const slot24 = to24HourFormat(userState.data.slot);
        const offset = getUtcOffset(context.timeZone);
        const datetime = `${userState.data.date}T${slot24}:00${offset}`;
        const activeDentists = userState.data.activeDentists;
        let assignedDentist = null;

        for (const dentist of activeDentists) {
          const dayOfWeek = new Date(userState.data.date).getDay();
          const { data: blocks } = await supabase.from('dentist_availability')
            .select('start_time,end_time,is_available').eq('dentist_id', dentist.id)
            .or(`specific_date.eq.${userState.data.date},day_of_week.eq.${dayOfWeek}`)
            .eq('is_available', false).eq('clinic_id', context.clinicId);
          let isBlocked = false;
          for (const block of (blocks || [])) {
            const [sh, sm] = block.start_time.split(':').map(Number);
            const [eh, em] = block.end_time.split(':').map(Number);
            const [h, m] = slot24.split(':').map(Number);
            const slotMin = h * 60 + m;
            if (slotMin >= sh * 60 + sm && slotMin < eh * 60 + em) { isBlocked = true; break; }
          }
          if (isBlocked) continue;
          const { data: bookings } = await supabase.from('appointments').select('id,status')
            .eq('dentist_id', dentist.id).eq('appointment_time', datetime).eq('clinic_id', context.clinicId);
          if ((bookings || []).some(b => b.status !== 'Cancelled')) continue;
          assignedDentist = dentist;
          break;
        }

        if (!assignedDentist) {
          await sendMessage(sender_psid, "Pasensya na po, walang available na dentist para sa slot na iyon. Pakisubukan ng ibang slot. 😊", context);
          userStates[sender_psid].state = "awaiting_slot";
          return;
        }

        // ✅ Fix #5: Re-verify slot is still free (race condition mitigation)
        // If another booking claimed it between our check and now, reject and retry
        const { data: finalCheck } = await supabase.from('appointments')
          .select('id,status')
          .eq('dentist_id', assignedDentist.id)
          .eq('appointment_time', datetime)
          .eq('clinic_id', context.clinicId);
        if ((finalCheck || []).some(b => b.status !== 'Cancelled')) {
          await sendMessage(sender_psid, "Pasensya na po, kunin na ng iba ang slot na iyon. Pakisubukan ng ibang slot. 😊", context);
          userStates[sender_psid].state = "awaiting_slot";
          return;
        }

        // ✅ Fix #9: Search for existing patient by name to avoid duplicates
        // Even if we don't have patient_id yet, check if they already exist by name/phone
        let patient_id = userState.data.patient_id;
        if (!patient_id && userState.data.patient_name) {
          const existingByName = await findPatientByNameAndPhone(
            userState.data.patient_name,
            userState.data.patient_phone || null,
            context,
            false
          );
          if (existingByName) {
            patient_id = existingByName.id;
            // ✅ Fix #7: Only link messenger_id if booking for self
            if (userState.data.booking_for === "me" && !existingByName.messenger_id) {
              await supabase.from('patients')
                .update({ messenger_id: sender_psid })
                .eq('id', patient_id).eq('clinic_id', context.clinicId);
            }
          }
        }

        // Insert new patient only if truly new
        if (!patient_id) {
          const insertPayload = {
            name: String(userState.data.patient_name),
            phone: userState.data.patient_phone || null,
            clinic_id: context.clinicId
          };
          if (userState.data.booking_for === "me") insertPayload.messenger_id = sender_psid;
          const { data: insertedPatient, error: insErr } = await supabase.from('patients')
            .insert(insertPayload).select().single();
          if (insErr) {
            console.error("Error inserting patient:", insErr);
            await sendMessage(sender_psid, "May nangyari po sa pagproseso. Pakisubukan ulit. 😊", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          patient_id = insertedPatient.id;
        }

        const { data: existingAppointments } = await supabase.from('appointments').select('id,status')
          .eq('dentist_id', assignedDentist.id).eq('appointment_time', datetime).eq('clinic_id', context.clinicId);

        // Confirm booking
        {
          let appointmentId;
          try {
            if (existingAppointments?.length > 0) {
              const existingId = existingAppointments[0].id;
              const { data: updated, error: updErr } = await supabase.from('appointments')
                .update({ patient_id, status: 'Confirmed', reason: 'Messenger Booking', guardian_messenger_id: sender_psid })
                .eq('id', existingId).eq('clinic_id', context.clinicId).select('id').single();
              appointmentId = updErr ? existingId : updated.id;
            } else {
              const { data: ins } = await supabase.from('appointments').insert({
                dentist_id: assignedDentist.id, patient_id, appointment_time: datetime,
                booking_origin: 'Messenger Booking', status: 'Confirmed', reason: 'Messenger Booking',
                guardian_messenger_id: sender_psid, clinic_id: context.clinicId
              }).select('id').single();
              if (ins) appointmentId = ins.id;
            }

            let bookedName = userState.data.patient_name;
            if (appointmentId) {
              const { data: apptDetail } = await supabase.from('appointments')
                .select('id, patient_id, dentist_id').eq('id', appointmentId).eq('clinic_id', context.clinicId).maybeSingle();
              if (apptDetail) {
                const { data: p } = await supabase.from('patients').select('name, phone')
                  .eq('id', apptDetail.patient_id).eq('clinic_id', context.clinicId).maybeSingle();
                if (p) bookedName = p.name;
              }
            }

            if (req?.io && appointmentId) await emitAppointmentUpdate(req.io, context.clinicId, appointmentId);

            await sendMessage(sender_psid,
              `✅ Na-book na po ang inyong appointment!\n\n📅 Petsa: ${userState.data.date}\n⏰ Oras: ${userState.data.slot}\n👤 Pangalan: ${bookedName}\n🔖 Appointment Code: ${appointmentId || ''}\n\nSalamat po sa pagpili ng ${context.clinicName}! Ingat at God bless! 🦷😊`,
              context
            );
          } catch (err) {
            console.error("Error booking:", err);
            await sendMessage(sender_psid, "May nangyari po sa pag-book. Pakisubukan ulit. 😊", context);
          }
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
      }

      default: {
        await sendMessage(sender_psid, "Pasensya na po, may nangyari. Magsimula ulit tayo. I-type lang po ang 'appointment' o 'book' para magsimula. 😊", context);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }
    }
  } catch (err) {
    console.error('❌ Error in handleMessage:', err);
    await sendMessage(sender_psid, "Pasensya na po, may nangyari sa aking sistema. Pakisubukan ulit. 😊", context);
    if (!userStates[sender_psid]) {
      userStates[sender_psid] = { state: "default", data: {} };
    }
  }
}

// handleMessage and userStates are exported for the local test harness
// (test-webhook.js) so flows can be driven without Facebook. They are not
// used by the production server, which only consumes `router`.
module.exports = { router, sendMessage, handleMessage, userStates };
// webhook.js — Full AI-powered version (Claude Haiku handles intent + human-like responses)
// NOW with context object pattern for clinic-level data (timezone, tokens, etc.)

console.log("webhook.js loaded");
const express = require("express");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// --- IMPORT MENU COMPONENTS (unchanged) ---
const sendIntroMenu = require('./menu/sendIntroMenu');
const sendAppointmentForButtonTemplate = require('./menu/sendAppointmentForButtonTemplate');
const sendTimeSlotButtonTemplate = require('./menu/sendTimeSlotButtonTemplate');
const sendConfirmationButtonTemplate = require('./menu/sendConfirmationButtonTemplate');
const sendBookingPromptButtonTemplate = require('./menu/sendBookingPromptButtonTemplate');
const sendUnknownInputCard = require('./menu/sendUnknownInputCard');

const router = express.Router();

const VERIFY_TOKEN = "palodentcare_secret_token";

// --- Supabase Client ---
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ---------------------------------------------------------------------------
// CONTEXT OBJECT PATTERN
// ---------------------------------------------------------------------------
// Single object passed through all functions containing clinic-level data
// Structure: { clinicId, pageAccessToken, timeZone, clinicName, fb_page_id, ... }
// This eliminates parameter drilling and makes adding new clinic data trivial

// ---------------------------------------------------------------------------
// CLAUDE — FULL AI RECEPTIONIST
// Handles BOTH intent detection AND generating human-like responses
// ---------------------------------------------------------------------------

const userConversationHistory = {};
const intentHistoryTimestamps = {};

const CLAUDE_SYSTEM_PROMPT = `Ikaw si "Ate Claire", ang friendly, mainit, at HONEST na virtual receptionist ng Palo Dentcare dental clinic sa Pilipinas.
Nagsasalita ka ng natural na Taglish (mixed Tagalog at English), at minsan Bisaya kung naririnig mo ito sa patient.

Ang trabaho mo:
1. Intindihin ang mensahe ng patient
2. I-detect ang kanyang intent
3. Mag-generate ng natural, warm, HONEST na reply

CLINIC INFO (ang TANGING facts na alam mo):
- Pangalan: Palo Dentcare
- Bukas: Lunes hanggang Sabado, 9:00 AM - 6:00 PM
- Sarado: Linggo at holidays
- Lunch break: 12:00 PM - 1:00 PM (walang booking sa oras na ito)
- Appointment slots: bawat 20 minuto
- Bookings: pwede mag-book, mag-confirm, o mag-cancel ng appointment

BOOKING RULES (IMPORTANTENG PATAKARAN — HUWAG KALIMUTAN):
- ISANG APPOINTMENT LANG PER PERSON PER DATE — hindi pwedeng mag-book ng dalawa o higit pa ang iisang tao sa iisang araw
- Kung may appointment na ang isang tao sa isang petsa, HINDI siya pwedeng mag-book ulit sa SAME DATE para sa kanilang sarili
- PERO pwede siyang mag-book ng appointment para sa IBANG TAO (anak, asawa, magulang, etc.) sa same date
- Hindi pwedeng mag-cancel ng appointment na less than 1 hour bago ang schedule
- Hindi pwedeng mag-cancel ng nakaraang appointments
- Ang cancellation ay valid lang para sa appointments na may hawak na appointment code

KAPAG TINANONG KUNG PWEDENG MAG-BOOK ULIT SA SAME DATE:
- HUWAG sabihing "Oo, pwede!" — MALI ITO
- Itama: "Pasensya na po, isang appointment lang po ang pwede per person per date. 
  Pero pwede po kayong mag-book para sa ibang tao (anak, asawa, etc.) sa same date, 
  o pumili ng ibang petsa para sa inyo. 😊"

TUNGKOL SA PETSA, ARAW, AT ORAS NGAYON:
- Ang REAL-TIME date at oras ay laging kasama sa bawat mensahe ng patient sa format na: [REAL-TIME: <date> (Philippine Time)]
- GAMITIN ito para sagutin ang mga tanong tungkol sa petsa, araw, at oras ngayon
- Halimbawa kung tinanong "anong araw ngayon?" — tingnan ang REAL-TIME field at sagutin accurately
- Halimbawa kung tinanong "anong oras na?" — tingnan ang REAL-TIME field at sagutin accurately
- HUWAG sabihing "hindi ko alam ang petsa" — ALAM mo na dahil nasa REAL-TIME field ito
- HUWAG mag-claim ng "system limitations" — wala naman talagang limitasyon, alam mo ang oras!

HINDI KO ALAM — HUWAG MAG-INVENT NG SAGOT:
- Sino ang dentist on duty (wala akong access sa schedule ng dentists)
- Exact pricing ng kahit anong service (cleaning, extraction, braces, etc.)
- Exact address o location ng clinic
- Current promos o discounts
- Patient records o history
- Insurance coverage
- Availability ng specific dentist

KAPAG TINANONG ANG HINDI KO ALAM:
- HUWAG KAILANMAN mag-invent, mag-assume, o mag-hallucinate ng sagot
- Maging honest na wala akong access sa impormasyong iyon
- I-redirect palagi sa clinic para sa tamang sagot
- Gamitin ang template na ito: "Hindi ko po alam ang [topic]. Para sa tamang info, mas better po kung tumawag directly sa clinic. 😊"

TUNGKOL SA PAGIGING AI:
- Kung tinanong kung AI ka — maging honest at charming
- "Opo, AI virtual receptionist po ako ng Palo Dentcare! Nandito po ako para tumulong sa inyo nang mabilis at madali. 😊"
- HUWAG magpanggap na tao kung direktang tinanong

INTENTS na kailangan mong i-detect:
- "greet"               → nagbabati ang patient
- "book_appointment"    → gusto mag-book ng appointment
- "cancel_appointment"  → gusto i-cancel ang appointment
- "confirm_appointment" → gusto i-confirm ang appointment gamit ang code
- "cancel_flow"         → gusto huminto / mag-exit sa kasalukuyang proseso
- "gratitude"           → nagpapasalamat ang patient
- "yes"                 → pumapayag / nagko-confirm
- "no"                  → tumututol / nagde-decline
- "unknown"             → nagtatanong ng ibang bagay o hindi malinaw ang mensahe

PERSONALITY:
- Warm, maalalahanin, propesyonal, at HONEST
- Gumagamit ng "po" at "opo" nang natural
- Gumagamit ng emojis nang paminsan-minsan 😊🦷
- Maikli at malinaw ang mga sagot — hindi masyadong mahaba
- Parang tunay na receptionist — hindi robot, hindi nagsisinungaling
- HINDI nagki-claim ng bagay na hindi niya alam

STATES at kung paano ka dapat mag-respond:
- "default"                    → Tanggapin ang kanyang mensahe at tulungan siya
- "awaiting_date"              → Hintayin ang date sa format YYYY-MM-DD
- "awaiting_slot"              → Pinipili ng patient ang time slot
- "awaiting_my_name"           → Hihingin ang pangalan ng patient
- "awaiting_my_phone"          → Hihingin ang phone number (o skip)
- "awaiting_patient_name"      → Hihingin ang pangalan ng taong ibo-book
- "awaiting_patient_phone"     → Hihingin ang phone number ng taong ibo-book
- "awaiting_my_confirm_match"  → Nag-ask kung siya ba yung nakitang record (YES/NO)
- "awaiting_for_whom"          → Nag-ask kung para kanino ang booking
- "awaiting_confirm_code"      → Hintayin ang appointment code para i-confirm
- "awaiting_cancel_code"       → Hintayin ang appointment code para i-cancel
- "awaiting_cancel_code_retry" → Nagkamali ng code, try again o cancel
- "awaiting_booking_prompt_response" → Nag-ask kung gusto pang mag-book
- "confirming"                 → Nag-show ng booking summary, waiting for confirm/cancel
- "awaiting_unknown_confirm"   → Hindi naintindihan ang mensahe

RULES:
- Laging mag-return ng PURE JSON — walang markdown, walang backticks, walang extra text
- Ang "reply" field ay ang mensahe na makikita ng patient sa Messenger
- Huwag mag-include ng booking details sa reply — hawak ng code ang structured data
- Kung may state na "awaiting_date", palaging i-remind ang format: YYYY-MM-DD
- Kung may state na "awaiting_slot", sabihin na mag-tap ng button
- Kung may state na "confirming", hintayin ang kanilang confirmation
- HUWAG mag-invent ng facts na wala sa CLINIC INFO section

JSON FORMAT — return ONLY this, nothing else:
{"intent":"<intent>","confidence":<0.0-1.0>,"reply":"<natural Taglish reply>"}

EXAMPLES ng magandang HONEST replies:
- Greeting: "Magandang araw po! 😊 Welcome sa Palo Dentcare! Paano kita matutulungan ngayon? Pwede kayong mag-book ng appointment, i-confirm, o i-cancel. 🦷"
- AI question: "Opo, AI virtual receptionist po ako ng Palo Dentcare! Nandito po ako para tumulong sa inyo with appointments. Paano kita matutulungan? 😊"
- Sunday closed: "Pasensya na po, sarado kami tuwing Linggo. 😊 Bukas po kami Lunes hanggang Sabado, 9AM-6PM lang po!"
- Pricing: "Hindi ko po alam ang exact pricing ng aming services. Para sa tamang rates, mas better po kung tumawag directly sa clinic. 😊 Gusto ninyo pong mag-book?"
- Dentist on duty: "Hindi ko po access ang schedule ng aming mga dentist. Para malaman kung sino ang on duty, tumawag na lang po sa clinic. 😊"
- Location: "Hindi ko po alam ang exact address ng clinic. Pwede po kayong makipag-ugnayan sa clinic directly para sa directions. 😊"
- Promo: "Hindi po ako updated sa mga current promos. Para sa latest offers, tumawag na lang po sa clinic. 😊"
- Book: "Sige po! Paki-type lang po ang inyong preferred na petsa sa format na YYYY-MM-DD (halimbawa: 2026-05-20). 😊"
- Gratitude: "Salamat din po! God bless kayo! 🙏 Kung may katanungan pa kayo, nandito lang kami. 😊"
- Cancel flow: "Okay lang po! Kung kailangan ninyo ng tulong sa ibang pagkakataon, nandito lang kami. Ingat po! 😊"`;

async function getClaudeResponse(message, sender_psid, currentState, context, extraContext = "") {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    return { intent: "unknown", confidence: 0, reply: "Sorry, may technical issue kami ngayon. Pakisubukan ulit mamaya." };
  }

  if (!userConversationHistory[sender_psid]) {
    userConversationHistory[sender_psid] = [];
  }

  // ✅ Inject real-time date and time in the CLINIC'S timezone (not hardcoded)
  const timeZone = context.timeZone || 'Asia/Manila';
  const now = new Date();
  const phTime = new Intl.DateTimeFormat('en-PH', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(now);

  const contextualMessage = "[CURRENT STATE: " + currentState + (extraContext ? " | CONTEXT: " + extraContext : "") + " | REAL-TIME: " + phTime + " (Clinic Timezone)]\nPatient message: " + message;

  userConversationHistory[sender_psid].push({
    role: "user",
    content: contextualMessage
  });

  const history = userConversationHistory[sender_psid].slice(-10);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: history
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error("Claude API error:", data.error);
      return { intent: "unknown", confidence: 0, reply: "Sorry po, may technical issue kami. Pakisubukan ulit." };
    }

    const raw = data.content && data.content[0] ? data.content[0].text.trim() : "{}";

    let parsed = { intent: "unknown", confidence: 0, reply: null };
    try {
      let clean = raw.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) clean = jsonMatch[0];
      clean = clean.replace(/[\r\n]+/g, " ");
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error("JSON parse failed, using regex fallback:", parseErr.message);
      const intentMatch = raw.match(/"intent"\s*:\s*"([^"]+)"/);
      const replyMatch = raw.match(/"reply"\s*:\s*"([\s\S]*?)(?:"|$)/);
      const confidenceMatch = raw.match(/"confidence"\s*:\s*([\d.]+)/);
      parsed = {
        intent: intentMatch ? intentMatch[1] : "unknown",
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        reply: replyMatch ? replyMatch[1].replace(/\\n/g, "\n") : null
      };
      console.log("[CLAUDE FALLBACK] intent=" + parsed.intent);
      if (!parsed.reply) {
        parsed.reply = "Pasensya na po! Hindi ko po maunawaan ang inyong mensahe. Pwede po ba ninyong ulitin? 😊";
      }
    }

    userConversationHistory[sender_psid].push({
      role: "assistant",
      content: raw
    });

    console.log("[CLAUDE] state=" + currentState + " intent=" + parsed.intent);
    return parsed;

  } catch (err) {
    console.error("getClaudeResponse error:", err.message);
    return { intent: "unknown", confidence: 0, reply: "Sorry po, may nangyari. Pakisubukan ulit." };
  }
}

// Cleanup old histories every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const psid of Object.keys(intentHistoryTimestamps)) {
    if (now - intentHistoryTimestamps[psid] > 60 * 60 * 1000) {
      delete userConversationHistory[psid];
      delete intentHistoryTimestamps[psid];
      console.log(`[CLEANUP] Removed history for ${psid}`);
    }
  }
}, 30 * 60 * 1000);

// ---------------------------------------------------------------------------
// END CLAUDE AI RECEPTIONIST
// ---------------------------------------------------------------------------

// --- Helper: emit full appointment row ---
async function emitAppointmentUpdate(io, clinicId, appointmentId) {
  try {
    if (!io || !clinicId || !appointmentId) return;
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      .maybeSingle();
    if (error || !appt) return;
    io.emit("appointment-updated", appt);
  } catch (err) {
    console.error("emitAppointmentUpdate error:", err);
  }
}

// --- ✅ Clinic lookup by Messenger Page ID — now returns full clinic record ---
async function getClinicByMessengerPageId(pageId) {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('messenger_page_id', pageId)
    .maybeSingle();
  if (error) {
    console.error("Supabase clinic lookup error:", error);
    return null;
  }
  return data || null;
}

// --- ✅ Build context object from clinic record ---
function buildContext(clinic) {
  return {
    clinicId: clinic.id,
    pageAccessToken: clinic.fb_page_access_token,
    timeZone: clinic.time_zone || 'Asia/Manila',
    clinicName: clinic.name,
    fb_page_id: clinic.messenger_page_id
  };
}

// --- Conversation state ---
let userStates = {};
let justCancelled = {};

function normalize(str) {
  return str.toLowerCase().replace(/[^\w ]/g, '').trim();
}

function toTitleCase(str) {
  return str.replace(/\b\w+/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function to12HourFormat(time24) {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${minStr} ${ampm}`;
}

function to24HourFormat(time12) {
  let [time, ampm] = time12.split(' ');
  let [h, m] = time.split(':');
  h = parseInt(h, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}

// ✅ Get UTC offset for a timezone dynamically
function getUtcOffset(timeZone) {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
  const diff = tzDate - utcDate;
  const hours = Math.floor(Math.abs(diff) / 3600000).toString().padStart(2, '0');
  const minutes = ((Math.abs(diff) % 3600000) / 60000).toString().padStart(2, '0');
  return `${diff >= 0 ? '+' : '-'}${hours}:${minutes}`;
}

// Messenger send
async function sendMessage(sender_psid, response, context) {
  if (!context.pageAccessToken) {
    console.error("❌ Missing pageAccessToken.");
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${context.pageAccessToken}`,
      { recipient: { id: sender_psid }, message: { text: response } }
    );
  } catch (err) {
    console.error("❌ Error sending message:", err.response?.data || err.message);
  }
}

// --- Active dentists ---
async function getActiveDentists(context) {
  let query = supabase
    .from('dentists')
    .select('id,name')
    .eq('is_active', true)
    .eq('clinic_id', context.clinicId)
    .order('name', { ascending: true });
  const { data, error } = await query;
  if (error) { console.error("getActiveDentists error:", error); return []; }
  return data || [];
}

// --- Find patient by messenger_id ---
async function findPatientByMessengerId(messenger_id, context) {
  let query = supabase.from('patients').select('*').eq('messenger_id', messenger_id).eq('clinic_id', context.clinicId);
  const { data, error } = await query.maybeSingle();
  if (error) { console.error("findPatientByMessengerId error:", error); return null; }
  return data || null;
}

// --- Find patient by name & phone ---
async function findPatientByNameAndPhone(name, phone, context) {
  if (phone) {
    let q = supabase.from('patients').select('*').eq('phone', phone).ilike('name', name).eq('clinic_id', context.clinicId).limit(1);
    const { data, error } = await q;
    if (!error && data && data.length > 0) return data[0];
  }
  let q2 = supabase.from('patients').select('*').ilike('name', name).eq('clinic_id', context.clinicId).limit(1);
  const { data: data2, error: error2 } = await q2;
  if (error2) { console.error("findPatientByNameAndPhone error:", error2); return null; }
  return (data2 && data2.length > 0) ? data2[0] : null;
}

function generateTimeSlots(start = "09:00", end = "18:00", interval = 20) {
  const slots = [];
  let [hour, minute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  while (hour < endHour || (hour === endHour && minute < endMinute)) {
    const slot = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    slots.push(slot);
    minute += interval;
    if (minute >= 60) { hour += 1; minute = minute % 60; }
  }
  return slots.filter(slot => !["12:00", "12:20", "12:40"].includes(slot));
}

function isClinicOpen(dateStr) {
  return new Date(dateStr).getDay() !== 0;
}

async function getAvailableSlots(dateStr, context) {
  const activeDentists = await getActiveDentists(context);
  if (!activeDentists.length) return { slots: [], activeDentists };

  const baseSlots = generateTimeSlots("09:00", "18:00", 20);
  const availableSlots = [];
  const dayOfWeek = new Date(dateStr).getDay();
  const offset = getUtcOffset(context.timeZone); // ✅ dynamic offset

  for (const slot of baseSlots) {
    let slotAvailable = false;

    for (const dentist of activeDentists) {
      // 1. Check if dentist is BLOCKED at this slot
      const { data: blocks } = await supabase
        .from('dentist_availability')
        .select('start_time,end_time,is_available')
        .eq('dentist_id', dentist.id)
        .or(`specific_date.eq.${dateStr},day_of_week.eq.${dayOfWeek}`)
        .eq('is_available', false)
        .eq('clinic_id', context.clinicId);

      let isBlocked = false;
      for (const block of (blocks || [])) {
        const [blockStartH, blockStartM] = block.start_time.split(':').map(Number);
        const [blockEndH, blockEndM] = block.end_time.split(':').map(Number);
        const [slotH, slotM] = slot.split(':').map(Number);
        const slotMin = slotH * 60 + slotM;
        const blockStartMin = blockStartH * 60 + blockStartM;
        const blockEndMin = blockEndH * 60 + blockEndM;
        if (slotMin >= blockStartMin && slotMin < blockEndMin) {
          isBlocked = true;
          break;
        }
      }
      if (isBlocked) continue;

      // 2. Check if dentist is already BOOKED at this slot
      const slotDateTime = `${dateStr}T${slot}:00${offset}`; // ✅ dynamic offset
      const { data: bookings } = await supabase
        .from('appointments')
        .select('id,status')
        .eq('dentist_id', dentist.id)
        .eq('appointment_time', slotDateTime)
        .eq('clinic_id', context.clinicId);

      if ((bookings || []).some(b => (b.status || '').toLowerCase() !== 'cancelled')) continue;

      slotAvailable = true;
      break;
    }

    if (slotAvailable) {
      availableSlots.push(to12HourFormat(slot));
    }
  }

  // For bookings on today: remove past slots (timezone-aware)
  const timeZone = context.timeZone || 'Asia/Manila';

  // Get current date string in clinic timezone (e.g. "2026-05-13")
  const todayStrInTZ = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  let filteredSlots = availableSlots;
  if (dateStr === todayStrInTZ) {
    // Get current time as minutes since midnight IN the clinic's timezone
    const nowInTZ = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
    const [nowH, nowM] = nowInTZ.split(':').map(Number);
    const nowMinutes = nowH * 60 + nowM;

    filteredSlots = availableSlots.filter(slot => {
      const slot24 = to24HourFormat(slot);
      const [h, m] = slot24.split(':').map(Number);
      const slotMinutes = h * 60 + m;
      return slotMinutes > nowMinutes;
    });
  }

  return { slots: filteredSlots, activeDentists };
}

async function hasDoubleBookingOnDate(patient_id, dateStr, context) {
  const offset = getUtcOffset(context.timeZone); // ✅ dynamic offset
  const startISO = `${dateStr}T00:00:00${offset}`;
  const endISO = `${dateStr}T23:59:59${offset}`;
  let query = supabase.from('appointments').select('id,status')
    .eq('patient_id', patient_id).gte('appointment_time', startISO).lte('appointment_time', endISO).eq('clinic_id', context.clinicId);
  const { data, error } = await query;
  if (error) { console.error("hasDoubleBookingOnDate error:", error); return false; }
  return (data || []).filter(a => a.status !== 'Cancelled').length > 0;
}

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
        
        // ✅ BUILD CONTEXT ONCE from clinic record
        const context = buildContext(clinic);
        intentHistoryTimestamps[sender_psid] = Date.now();
        
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

  // --- For all free-text messages, ask Claude for intent + reply ---
  const isPostback = ['for_me', 'for_someone_else'].includes(message) ||
    message.startsWith('SLOT_') || message.startsWith('slot_');

  let claudeResult = { intent: "unknown", confidence: 0, reply: null };

  if (!isPostback && message !== 'CONFIRM_BOOKING' && message !== 'CANCEL_BOOKING') {
    try {
      claudeResult = await getClaudeResponse(message, sender_psid, userState.state, context); // ✅ pass context to Claude
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

  console.log(`[DEBUG] topIntent="${topIntent}" aiReply="${aiReply?.substring(0, 60)}"`);

  try {
    switch (userState.state) {

      case "default": {
        if (topIntent === 'greet') {
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          const hasQuestion = message.includes('?') ||
            message.toLowerCase().includes('ba') ||
            message.toLowerCase().includes('ask') ||
            message.toLowerCase().includes('ano') ||
            message.toLowerCase().includes('pano') ||
            message.toLowerCase().includes('paano') ||
            message.toLowerCase().includes('ai') ||
            message.toLowerCase().includes('bot') ||
            message.split(' ').length > 6;
          if (!hasQuestion) {
            await sendIntroMenu(sender_psid, context.pageAccessToken);
          }
          return;
        }
        if (topIntent === 'book_appointment') {
          userState.state = "awaiting_date";
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'cancel_appointment') {
          userState.state = "awaiting_cancel_code";
          if (aiReply) await sendMessage(sender_psid, aiReply, context);
          return;
        }
        if (topIntent === 'confirm_appointment') {
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
        const { data: patientRow } = await supabase.from('patients').select('messenger_id')
          .eq('id', appointment.patient_id).eq('clinic_id', context.clinicId).maybeSingle();
        if (!patientRow?.messenger_id) {
          const { data: existingPatient } = await supabase.from('patients').select('id')
            .eq('messenger_id', sender_psid).eq('clinic_id', context.clinicId).maybeSingle();
          if (existingPatient && existingPatient.id !== appointment.patient_id) {
            await supabase.from('appointments').update({ guardian_messenger_id: sender_psid })
              .eq('id', appointment.id).eq('clinic_id', context.clinicId);
          } else {
            await supabase.from('patients').update({ messenger_id: sender_psid })
              .eq('id', appointment.patient_id).eq('clinic_id', context.clinicId);
            await supabase.from('appointments').update({ guardian_messenger_id: null })
              .eq('id', appointment.id).eq('clinic_id', context.clinicId);
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
        const apptDate = new Date(appointment.appointment_time);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        apptDate.setHours(0, 0, 0, 0);
        if (apptDate < now) {
          await sendMessage(sender_psid, "Hindi na po pwedeng i-cancel ang nakaraang appointment. Ang mga kasalukuyan at hinaharap na appointment lang po ang pwedeng i-cancel. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        const msDiff = new Date(appointment.appointment_time).getTime() - new Date().getTime();
        if (msDiff <= 60 * 60 * 1000) {
          await sendMessage(sender_psid, "Pasensya na po, hindi na pwedeng i-cancel ang appointment na less than 1 hour na lang. Pakicontact na lang po ang clinic directly. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (["Cancelled", "No Show"].includes(appointment.status)) {
          await sendMessage(sender_psid, "Na-cancel na po o minarkahan ng No Show ang appointment na ito. 😊", context);
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
        const patient = await findPatientByMessengerId(sender_psid, context);
        if (patient) {
          const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, context);
          if (doubleBooked) {
            userState.state = "awaiting_for_whom";
            await sendMessage(sender_psid, "Mukhang may appointment na kayo sa petsang iyon! 😊 Para kanino po ito — para sa inyo o para sa ibang tao?", context);
            await sendAppointmentForButtonTemplate(sender_psid, context.pageAccessToken);
            return;
          }
          userState.data.booking_for = "me";
          userState.data.patient_id = patient.id;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;
          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Pasensya na po, wala pang available na dentist ngayon. Pakisubukan mamaya. 😊", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Pasensya na po, puno na ang slots para sa araw na iyon. 😔 Pwede po kayong pumili ng ibang petsa?", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          await sendMessage(sender_psid, "Narito po ang mga available na time slots para sa " + userState.data.date + ". Pumili lang po kayo! 😊", context);
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
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;
          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Pasensya na po, wala pong available na dentist. Pakisubukan mamaya. 😊", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Pasensya na po, puno na ang slots para sa araw na iyon. Pumili po ng ibang petsa. 😊", context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendMessage(sender_psid, "Narito po ang mga available na slots! Pumili lang po. 😊", context);
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
          }
        }
        return;
      }

      case "awaiting_my_confirm_match": {
        if (topIntent === 'yes') {
          await supabase.from('patients').update({ messenger_id: sender_psid })
            .eq('id', userState.data.found_patient_id).eq('clinic_id', context.clinicId);
          userState.data.patient_id = userState.data.found_patient_id;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;
          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Pasensya na po, wala pong available na dentist. Pakisubukan mamaya. 😊", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Puno na po ang slots para sa araw na iyon. Pumili po ng ibang petsa. 😊", context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendMessage(sender_psid, "Na-link na po kayo! Narito ang mga available na slots. Pumili lang po! 😊", context);
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
          }
        } else if (topIntent === 'no') {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;
          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Pasensya na po, wala pong available na dentist. Pakisubukan mamaya. 😊", context);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Puno na po ang slots para sa araw na iyon. Pumili po ng ibang petsa. 😊", context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendMessage(sender_psid, "Sige po! Gawa na kami ng bagong record para sa inyo. Narito ang mga available na slots! 😊", context);
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
          }
        } else {
          await sendMessage(sender_psid, "I-reply lang po ng YES o NO. 😊", context);
        }
        return;
      }

      case "awaiting_for_whom": {
        if (normalizedMsg === "1" || normalizedMsg === "for me" || normalizedMsg === "for_me") {
          await sendMessage(sender_psid, "Mayroon na po kayong appointment sa petsang iyon. Paki-type ng ibang petsa (YYYY-MM-DD). 😊", context);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
          return;
        }
        if (normalizedMsg === "2" || normalizedMsg === "for someone else" || normalizedMsg === "for_someone_else") {
          userState.data.booking_for = "someone else";
          userState.state = "awaiting_patient_name";
          await sendMessage(sender_psid, "Paki-type po ang buong pangalan ng taong gusto ninyong i-book (halimbawa: inyong anak). 😊", context);
          return;
        }
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
        const patient = await findPatientByNameAndPhone(userState.data.patient_name, phone, context);
        if (patient) {
          const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, context);
          if (doubleBooked) {
            await sendMessage(sender_psid, `Mayroon na pong appointment si ${userState.data.patient_name} sa ${userState.data.date}. Paki-type ng ibang petsa. 😊`, context);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
            return;
          }
          userState.data.patient_id = patient.id;
        } else {
          userState.data.patient_id = null;
        }
        userState.state = "awaiting_slot";
        const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
        userState.data.slots = slots;
        userState.data.activeDentists = activeDentists;
        if (!activeDentists.length) {
          await sendMessage(sender_psid, "Pasensya na po, wala pong available na dentist. Pakisubukan mamaya. 😊", context);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (slots.length === 0) {
          await sendMessage(sender_psid, "Puno na po ang slots para sa araw na iyon. Pumili po ng ibang petsa. 😊", context);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
        } else {
          await sendMessage(sender_psid, "Narito po ang mga available na slots! Pumili lang po. 😊", context);
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, context.pageAccessToken);
        }
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
        const slot24 = to24HourFormat(userState.data.slot);
        const offset = getUtcOffset(context.timeZone); // ✅ dynamic offset from context
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

        let patient_id = userState.data.patient_id;
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

        // Cancel booking
        if (topIntent === 'cancel_flow' || normalizedMsg === 'cancel_booking') {
          let targetId = null;
          try {
            if (existingAppointments?.length > 0) {
              targetId = existingAppointments[0].id;
              await supabase.from('appointments').update({ status: 'Cancelled', reason: 'Messenger Booking', guardian_messenger_id: sender_psid })
                .eq('id', targetId).eq('clinic_id', context.clinicId);
            } else {
              const { data: ins } = await supabase.from('appointments').insert({
                dentist_id: assignedDentist.id, patient_id, appointment_time: datetime,
                booking_origin: 'Messenger Booking', status: 'Cancelled', reason: 'Messenger Booking',
                guardian_messenger_id: sender_psid, clinic_id: context.clinicId
              }).select('id').single();
              if (ins) targetId = ins.id;
            }
          } catch (err) { console.error("Error saving cancelled:", err); }
          if (req?.io && targetId) await emitAppointmentUpdate(req.io, context.clinicId, targetId);
          const reply = aiReply || "Na-cancel po ang inyong booking. Kung gusto ninyong mag-book ulit, sabihin lang po! 😊";
          await sendMessage(sender_psid, reply, context);
          justCancelled[sender_psid] = true;
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        // Confirm booking
        if (topIntent === 'yes' || normalizedMsg === 'confirm_booking' || ['ok', 'confirm'].includes(normalizedMsg)) {
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
              `✅ Na-book na po ang inyong appointment!\n\n📅 Petsa: ${userState.data.date}\n⏰ Oras: ${userState.data.slot}\n👤 Pangalan: ${bookedName}\n🔖 Appointment Code: ${appointmentId || ''}\n\nSalamat po sa pagpili ng Palo Dentcare! Ingat at God bless! 🦷😊`,
              context
            );
          } catch (err) {
            console.error("Error booking:", err);
            await sendMessage(sender_psid, "May nangyari po sa pag-book. Pakisubukan ulit. 😊", context);
          }
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        await sendMessage(sender_psid, "Pakitap lang po ang Confirm o Cancel button para matuloy. 😊", context);
        return;
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

module.exports = { router, sendMessage };
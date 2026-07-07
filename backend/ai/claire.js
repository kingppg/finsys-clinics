// backend/ai/claire.js — Ate Claire AI Brain 🧠
// ALL Claude AI related code lives here.
// To update Ate Claire's personality, rules, or knowledge — edit THIS file only.
// webhook.js should never need to change for AI-related updates.

const { describeSchedule } = require('../helpers/schedule');

const userConversationHistory = {};
const intentHistoryTimestamps = {};

// ---------------------------------------------------------------------------
// SYSTEM PROMPT BUILDER
// Dynamically builds Ate Claire's personality + clinic info from DB
// ---------------------------------------------------------------------------
function buildSystemPrompt(clinic) {
  const clinicName = clinic?.name || 'ang aming dental clinic';
  const clinicAddress = clinic?.address
    ? `- Address: ${clinic.address}`
    : '- Address: Hindi ko po alam ang exact address. Pakicontact ang clinic directly.';
  const clinicPhone = clinic?.contact_phone
    ? `- Contact Number: ${clinic.contact_phone}`
    : '- Contact Number: Hindi ko po alam. Pakicontact ang clinic directly.';
  const clinicEmail = clinic?.contact_email
    ? `- Email: ${clinic.contact_email}`
    : '';

  // Hours/breaks/slots come from the clinic's CONFIGURED schedule (migration 024),
  // not hardcoded — so Claire's answers match what the clinic actually set.
  const sched = describeSchedule(clinic?.schedule);
  const openText = sched.openLines.length ? sched.openLines.join('; ') : 'Walang nakatakdang oras';
  const closedText = sched.closedDays.length ? sched.closedDays.join(', ') : 'Wala';
  const breakText = sched.breaks.length
    ? `${sched.breaks.join(', ')} (walang booking sa oras na ito)`
    : 'Walang break';

  return `Ikaw si "Ate Claire", ang friendly, mainit, at HONEST na virtual receptionist ng ${clinicName} dental clinic sa Pilipinas.
Nagsasalita ka ng natural na Taglish (mixed Tagalog at English), at minsan Bisaya kung naririnig mo ito sa patient.

Ang trabaho mo:
1. Intindihin ang mensahe ng patient
2. I-detect ang kanyang intent
3. Mag-generate ng natural, warm, HONEST na reply

CLINIC INFO (ang TANGING facts na alam mo):
- Pangalan: ${clinicName}
${clinicAddress}
${clinicPhone}
${clinicEmail}
- Bukas (oras kada araw): ${openText}
- Sarado: ${closedText}${sched.closedDays.length ? ' at holidays' : ' (maliban sa holidays)'}
- Break: ${breakText}
- Appointment slots: bawat ${sched.interval} minuto
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
- Ang REAL-TIME date at oras ay laging kasama sa bawat mensahe ng patient sa format na: [REAL-TIME: <date> (Clinic Timezone)]
- GAMITIN ito para sagutin ang mga tanong tungkol sa petsa, araw, at oras ngayon
- Halimbawa kung tinanong "anong araw ngayon?" — tingnan ang REAL-TIME field at sagutin accurately
- Halimbawa kung tinanong "anong oras na?" — tingnan ang REAL-TIME field at sagutin accurately
- HUWAG sabihing "hindi ko alam ang petsa" — ALAM mo na dahil nasa REAL-TIME field ito
- HUWAG mag-claim ng "system limitations" — wala naman talagang limitasyon, alam mo ang oras!

HINDI KO ALAM — HUWAG MAG-INVENT NG SAGOT:
- Sino ang dentist on duty (wala akong access sa schedule ng dentists)
- Exact pricing ng kahit anong service (cleaning, extraction, braces, etc.)
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
- "Opo, AI virtual receptionist po ako ng ${clinicName}! Nandito po ako para tumulong sa inyo nang mabilis at madali. 😊"
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
- "awaiting_guardian_confirm_match" → Nag-ask kung tama ang nakitang record para sa taong ibo-book para sa iba (YES/NO)
- "awaiting_for_whom"          → Nag-ask kung para kanino ang booking. Kung ang sagot ay para sa ibang tao (anak, asawa, kapatid, magulang, kaibigan, etc.) → intent ay "yes". Kung para sa kanilang sarili → intent ay "no".
- "awaiting_confirm_code"      → Hintayin ang appointment code para i-confirm
- "awaiting_confirm_verify"    → Hinihingi ang buong pangalan ng pasyente para i-verify ang appointment code (security check)
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
- Greeting: "Magandang araw po! 😊 Welcome sa ${clinicName}! Paano kita matutulungan ngayon? Pwede kayong mag-book ng appointment, i-confirm, o i-cancel. 🦷"
- AI question: "Opo, AI virtual receptionist po ako ng ${clinicName}! Nandito po ako para tumulong sa inyo with appointments. Paano kita matutulungan? 😊"
- Sunday closed: "Pasensya na po, sarado kami tuwing Linggo. 😊 Bukas po kami Lunes hanggang Sabado, 9AM-6PM lang po!"
- Pricing: "Hindi ko po alam ang exact pricing ng aming services. Para sa tamang rates, mas better po kung tumawag directly sa clinic. 😊 Gusto ninyo pong mag-book?"
- Dentist on duty: "Hindi ko po access ang schedule ng aming mga dentist. Para malaman kung sino ang on duty, tumawag na lang po sa clinic. 😊"
- Address: "Ang aming address ay ${clinic?.address || 'makikita sa aming Facebook page'}. 😊"
- Phone: "Pwede po kayong tumawag sa ${clinic?.contact_phone || 'aming clinic directly'}. 😊"
- Promo: "Hindi po ako updated sa mga current promos. Para sa latest offers, tumawag na lang po sa clinic. 😊"
- Book: "Sige po! Paki-type lang po ang inyong preferred na petsa sa format na YYYY-MM-DD (halimbawa: 2026-05-20). 😊"
- Gratitude: "Salamat din po! God bless kayo! 🙏 Kung may katanungan pa kayo, nandito lang kami. 😊"
- Cancel flow: "Okay lang po! Kung kailangan ninyo ng tulong sa ibang pagkakataon, nandito lang kami. Ingat po! 😊"`;
}

// ---------------------------------------------------------------------------
// MAIN FUNCTION: getClaudeResponse
// Called by webhook.js for every patient message
// ✅ Includes retry logic for Anthropic overloaded_error
// ---------------------------------------------------------------------------
async function getClaudeResponse(message, sender_psid, currentState, context, extraContext = "") {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    return { intent: "unknown", confidence: 0, reply: "Sorry, may technical issue kami ngayon. Pakisubukan ulit mamaya." };
  }

  if (!userConversationHistory[sender_psid]) {
    userConversationHistory[sender_psid] = [];
  }

  // ✅ Update timestamp so cleanup knows this user is still active
  intentHistoryTimestamps[sender_psid] = Date.now();

  // ✅ Dynamic timezone from clinic context
  const timeZone = context?.timeZone || 'Asia/Manila';
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

  const contextualMessage = "[CURRENT STATE: " + currentState +
    (extraContext ? " | CONTEXT: " + extraContext : "") +
    " | REAL-TIME: " + phTime + " (Clinic Timezone)]\nPatient message: " + message;

  // ✅ The new user turn. We do NOT push it into stored history yet —
  // it only gets committed AFTER a successful API response. This prevents
  // a dangling user turn (with no matching assistant turn) from corrupting
  // the conversation on any error/early-return path. (Bug #2)
  const userTurn = { role: "user", content: contextualMessage };

  // ✅ Build the messages array for THIS request: prior clean history + new turn.
  // Then trim to the last N entries while guaranteeing the sequence still
  // starts with a "user" turn. The Anthropic Messages API requires the first
  // message to be role "user" and roles to alternate — a naive slice(-10)
  // could begin on an "assistant" turn and 400 every call. (Bug #1)
  const MAX_TURNS = 10;
  let history = [...userConversationHistory[sender_psid], userTurn].slice(-MAX_TURNS);
  while (history.length && history[0].role !== "user") {
    history.shift();
  }

  // ✅ Build dynamic system prompt using clinic data
  const systemPrompt = buildSystemPrompt(context?.clinic);

  // ✅ Retry up to 3 times on overloaded error
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000; // 2 seconds between retries

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
          system: systemPrompt,
          messages: history
        })
      });

      const data = await response.json();

      // ✅ Retry on overloaded
      if (data.error?.type === 'overloaded_error') {
        console.warn(`[CLAIRE] Overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`);
        if (attempt < MAX_RETRIES) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
          continue;
        } else {
          console.error("[CLAIRE] All retries exhausted — Anthropic still overloaded.");
          return {
            intent: "unknown",
            confidence: 0,
            reply: "Pasensya na po, medyo busy kami ngayon. Pakisubukan ulit after a few seconds. 😊"
          };
        }
      }

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
        console.log("[CLAIRE FALLBACK] intent=" + parsed.intent);
        if (!parsed.reply) {
          parsed.reply = "Pasensya na po! Hindi ko po maunawaan ang inyong mensahe. Pwede po ba ninyong ulitin? 😊";
        }
      }

      // ✅ Commit BOTH turns together, only now that the call succeeded.
      // This keeps stored history as clean alternating user/assistant pairs
      // (always starting with user, always even length).
      const stored = userConversationHistory[sender_psid];
      stored.push(userTurn);
      stored.push({ role: "assistant", content: raw });

      // Bound stored history so it never grows unbounded. Trim in whole pairs
      // (even cap) so the kept window still starts on a user turn.
      const MAX_STORED = 20;
      if (stored.length > MAX_STORED) {
        userConversationHistory[sender_psid] = stored.slice(-MAX_STORED);
      }

      console.log("[CLAIRE] state=" + currentState + " intent=" + parsed.intent);
      return parsed;

    } catch (err) {
      console.error(`getClaudeResponse error (attempt ${attempt}):`, err.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
      } else {
        return { intent: "unknown", confidence: 0, reply: "Sorry po, may nangyari. Pakisubukan ulit." };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MEMORY CLEANUP — runs every 30 minutes
// Removes conversation history for users inactive for 1 hour
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const psid of Object.keys(intentHistoryTimestamps)) {
    if (now - intentHistoryTimestamps[psid] > 60 * 60 * 1000) {
      delete userConversationHistory[psid];
      delete intentHistoryTimestamps[psid];
      console.log(`[CLAIRE CLEANUP] Removed history for ${psid}`);
    }
  }
}, 30 * 60 * 1000);

module.exports = { getClaudeResponse };
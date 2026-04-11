// Supabase Refactored Version (with stability + granular realtime emits)
// Business logic / conversation flow preserved. Added:
// 1. emitAppointmentUpdate helper -> emits FULL appointment row
// 2. Replaced previous minimal req.io.emit calls with granular full-row emits
// 3. Added emits also for Messenger-side booking cancellation inside "confirming" flow
// 4. (PATCH) Adjusted availability logic: per-slot capacity (not union blocking) so slots remain
//    visible if at least one active dentist can take them.

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

// --- Helper: emit full appointment row for realtime front-end patch ---
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

// --- WIT.AI INTENT DETECTION (unchanged) ---
async function getWitIntent(message) {
  const WIT_TOKEN = process.env.WIT_TOKEN;
  try {
    const resp = await axios.get(
      `https://api.wit.ai/message?v=20210927&q=${encodeURIComponent(message)}`,
      { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
    );
    return resp.data;
  } catch (err) {
    console.error("❌ Error calling Wit.ai:", err.response?.data || err.message);
    return {};
  }
}

// --- Clinic lookup by Messenger Page ID (maybeSingle) ---
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

// --- Conversation state (unchanged) ---
let userStates = {};
let justCancelled = {};

function normalize(str) {
  return str.toLowerCase().replace(/[^\w ]/g, '').trim();
}
const greetKeywords = [
  "gandang umaga", "Gandang umaga", "menu", "gandang araw", "gandang gabi", "hello", "hi", "hey", "good morning", "magandang umaga", "good am", "good afternoon",
  "magandang hapon", "good pm", "gud pm", "magandang araw", "greetings", "gud am", "good day"
];
const appointmentKeywords = [
  'appointment', 'book', 'booking', 'pa book', 'schedule', 'gusto ko ng appointment',
  'pa-appointment', 'pa schedule', 'pabook', 'pabook', 'magpaappointment', 'mag pa appointment', 'magpaschedule'
];
const cancelKeywords = [
  'cancel', "exit", 'no', 'never mind', 'next time', 'next time na lang', 'ayaw', 'wag na lang', 'wag na', 'hindi na lang', 'hindi', 'i-cancel', 'icancel', 'cancel po', 'huwag na', 'no thanks', 'not now'
];
const gratitudeMessages = [
  "thanks", "ok", "okay", "okey", "k", "k", "tnx", "salamt", "slamat", "slamat din", "maraming salamat", "maraming salamat po",  "thank you", "salamat",
  "thankyou", "ty", "Slmat", "daghang salamat", "God bless", "god bless", "thx", "tenkyu", "salamat"
];

function toTitleCase(str) {
  return str.replace(/\b\w+/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function to12HourFormat(time24) {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const min = minStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${min} ${ampm}`;
}

function to24HourFormat(time12) {
  let [time, ampm] = time12.split(' ');
  let [h, m] = time.split(':');
  h = parseInt(h, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}

// Messenger send
async function sendMessage(sender_psid, response, pageAccessToken) {
  if (!pageAccessToken) {
    console.error("❌ Missing pageAccessToken while sending message.");
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
      {
        recipient: { id: sender_psid },
        message: { text: response },
      }
    );
  } catch (err) {
    console.error("❌ Error sending message:", err.response?.data || err.message);
  }
}

// --- Active dentists lookup (Supabase) ---
async function getActiveDentists(clinicId) {
  let query = supabase
    .from('dentists')
    .select('id,name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (clinicId) query = query.eq('clinic_id', clinicId);

  const { data, error } = await query;
  if (error) {
    console.error("Supabase getActiveDentists error:", error);
    return [];
  }
  return data || [];
}

// --- Find or create patient ---
async function findOrCreatePatient(name, messenger_id, clinicId) {
  let query = supabase
    .from('patients')
    .select('*')
    .eq('messenger_id', messenger_id)
    .limit(1);

  if (clinicId) query = query.eq('clinic_id', clinicId);

  let { data, error } = await query;
  if (error) console.error("findOrCreatePatient select error:", error);
  if (data && data.length > 0) return data[0];

  const insertPayload = { name, messenger_id };
  if (clinicId) insertPayload.clinic_id = clinicId;

  const { data: inserted, error: insertErr } = await supabase
    .from('patients')
    .insert(insertPayload)
    .select()
    .single();
  if (insertErr) {
    console.error("findOrCreatePatient insert error:", insertErr);
    return null;
  }
  return inserted;
}

// --- Find patient by messenger_id ---
async function findPatientByMessengerId(messenger_id, clinicId) {
  let query = supabase
    .from('patients')
    .select('*')
    .eq('messenger_id', messenger_id);

  if (clinicId) query = query.eq('clinic_id', clinicId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("findPatientByMessengerId error:", error);
    return null;
  }
  return data || null;
}

// --- Find patient by name & phone ---
async function findPatientByNameAndPhone(name, phone, clinicId) {
  if (phone) {
    let q = supabase
      .from('patients')
      .select('*')
      .eq('phone', phone)
      .ilike('name', name)
      .limit(1);
    if (clinicId) q = q.eq('clinic_id', clinicId);
    const { data, error } = await q;
    if (!error && data && data.length > 0) return data[0];
  }

  let q2 = supabase
    .from('patients')
    .select('*')
    .ilike('name', name)
    .limit(1);
  if (clinicId) q2 = q2.eq('clinic_id', clinicId);
  const { data: data2, error: error2 } = await q2;
  if (error2) {
    console.error("findPatientByNameAndPhone error:", error2);
    return null;
  }
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
    if (minute >= 60) {
      hour += 1;
      minute = minute % 60;
    }
  }
  return slots.filter(slot => !["12:00", "12:20", "12:40"].includes(slot));
}

function isClinicOpen(dateStr) {
  const date = new Date(dateStr);
  return date.getDay() !== 0;
}

// Booked slot counts (UNCHANGED)
async function getBookedSlotCountsForActiveDentists(activeDentists, dateStr, clinicId) {
  const slotCounts = {};
  if (!activeDentists.length) return slotCounts;
  const dentistIds = activeDentists.map(d => d.id);

  const startISO = `${dateStr}T00:00:00+08:00`;
  const endISO = `${dateStr}T23:59:59+08:00`;

  let query = supabase
    .from('appointments')
    .select('dentist_id, appointment_time, status')
    .in('dentist_id', dentistIds)
    .gte('appointment_time', startISO)
    .lte('appointment_time', endISO);

  if (clinicId) query = query.eq('clinic_id', clinicId);

  const { data, error } = await query;
  if (error) {
    console.error("getBookedSlotCountsForActiveDentists error:", error);
    return slotCounts;
  }
  (data || []).forEach(appt => {
    if (appt.status === 'Cancelled') return;
    const time = new Date(appt.appointment_time);
    const slot = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    slotCounts[slot] = (slotCounts[slot] || 0) + 1;
  });
  return slotCounts;
}

/* ------------------------------------------------------------------
   PATCHED AVAILABILITY LOGIC (replaces old union-based blocked logic)
   ------------------------------------------------------------------ */

/**
 * Compute per-slot capacity = how many active dentists are NOT blocked
 * Returns { baseSlots: [...], capacity: { '09:00': <int>, ... } }
 */
async function computeSlotCapacities(activeDentists, dateStr, clinicId) {
  const baseSlots = generateTimeSlots("09:00", "18:00", 20);
  if (!activeDentists.length) return { baseSlots, capacity: {} };

  // start with full capacity (all dentists) for every slot
  const capacity = {};
  baseSlots.forEach(s => { capacity[s] = activeDentists.length; });

  const dayOfWeek = new Date(dateStr).getDay();

  for (const dentist of activeDentists) {
    let q = supabase
      .from('dentist_availability')
      .select('start_time,end_time,is_available')
      .eq('dentist_id', dentist.id)
      .eq('is_available', false)
      .or(`specific_date.eq.${dateStr},day_of_week.eq.${dayOfWeek}`);

    if (clinicId) q = q.eq('clinic_id', clinicId);

    const { data, error } = await q;
    if (error) {
      console.error("computeSlotCapacities availability error:", error);
      continue;
    }

    (data || []).forEach(block => {
      const [startHour, startMin] = block.start_time.split(':').map(Number);
      const [endHour, endMin] = block.end_time.split(':').map(Number);
      baseSlots.forEach(slot => {
        const [h, m] = slot.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
          if (capacity[slot] > 0) capacity[slot] -= 1; // reduce capacity for this slot
        }
      });
    });
  }

  return { baseSlots, capacity };
}

/**
 * Revised getAvailableSlots:
 * A slot is available if capacity[slot] > 0 AND bookedCount < capacity[slot]
 */
async function getAvailableSlots(dateStr, clinicId) {
  const activeDentists = await getActiveDentists(clinicId);
  if (!activeDentists.length) return { slots: [], activeDentists };

  const { baseSlots, capacity } = await computeSlotCapacities(activeDentists, dateStr, clinicId);
  const bookedSlotCounts = await getBookedSlotCountsForActiveDentists(activeDentists, dateStr, clinicId);

  let availableSlots = baseSlots.filter(slot => {
    const cap = capacity[slot] || 0;
    if (cap <= 0) return false;
    const booked = bookedSlotCounts[slot] || 0;
    return booked < cap;
  }).map(to12HourFormat);

  // Filter out past slots if booking for today
  const now = new Date();
  const bookingDate = new Date(dateStr);
  if (
    bookingDate.getFullYear() === now.getFullYear() &&
    bookingDate.getMonth() === now.getMonth() &&
    bookingDate.getDate() === now.getDate()
  ) {
    availableSlots = availableSlots.filter(slot => {
      const slot24 = to24HourFormat(slot);
      const [h, m] = slot24.split(':').map(Number);
      const slotDate = new Date(dateStr);
      slotDate.setHours(h, m, 0, 0);
      return slotDate > now;
    });
  }

  return { slots: availableSlots, activeDentists };
}

// (END PATCH)

// Double booking check
async function hasDoubleBookingOnDate(patient_id, dateStr, clinicId) {
  const startISO = `${dateStr}T00:00:00+08:00`;
  const endISO = `${dateStr}T23:59:59+08:00`;

  let query = supabase
    .from('appointments')
    .select('id,status')
    .eq('patient_id', patient_id)
    .gte('appointment_time', startISO)
    .lte('appointment_time', endISO);

  if (clinicId) query = query.eq('clinic_id', clinicId);

  const { data, error } = await query;
  if (error) {
    console.error("hasDoubleBookingOnDate error:", error);
    return false;
  }
  return (data || []).filter(a => a.status !== 'Cancelled').length > 0;
}

// --- WEBHOOK VERIFY (unchanged) ---
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified by Facebook");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// --- WEBHOOK EVENT HANDLER ---
router.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageIdFromEntry = entry.id;
      for (const webhook_event of entry.messaging) {
        const sender_psid = webhook_event.sender?.id;

        if (webhook_event.delivery || webhook_event.read) continue;
        if (webhook_event.message?.is_echo) continue;

        const page_id =
          pageIdFromEntry ||
          webhook_event.recipient?.id ||
          webhook_event.sender?.id;

        const clinic = await getClinicByMessengerPageId(page_id);
        if (!clinic) {
          console.warn('[WARN] No clinic linked to page_id:', page_id);
            continue;
        }
        const clinicId = clinic.id;
        const pageAccessToken = clinic.fb_page_access_token;

        try {
          if (webhook_event.message && webhook_event.message.text) {
            const userMessage = webhook_event.message.text.trim();
            await handleMessage(sender_psid, userMessage, webhook_event, req, clinicId, pageAccessToken);
          } else if (webhook_event.postback?.payload) {
            await handleMessage(sender_psid, webhook_event.postback.payload, webhook_event, req, clinicId, pageAccessToken);
          }
        } catch (err) {
          console.error('❌ Error in webhook handler:', err);
          await sendMessage(sender_psid, "Sorry, something went wrong. Please try again.", pageAccessToken);
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }
  res.sendStatus(404);
});

// --- MAIN LOGIC ---
async function handleMessage(sender_psid, message, webhook_event, req, clinicId, pageAccessToken) {
  console.log(`[DEBUG] handleMessage called: state=${userStates[sender_psid]?.state} | message=${message}`);
  console.log(`[DEBUG] sender_psid: ${sender_psid}, clinicId: ${clinicId}`);

  // NLP
  let witResp = {};
  let topIntent = undefined;
  try {
    witResp = await getWitIntent(message);
    topIntent = witResp.intents?.[0]?.name;
    console.log(`[DEBUG] Wit.ai topIntent: ${topIntent}, entities:`, witResp.entities);
  } catch (e) {
    console.error('[DEBUG] Wit.ai error:', e);
  }

  if (webhook_event) {
    console.log('[DEBUG] webhook_event.sender.id:', webhook_event.sender?.id);
    console.log('[DEBUG] webhook_event.recipient.id:', webhook_event.recipient?.id);
    if (webhook_event.message) {
      console.log('[DEBUG] webhook_event.message:', JSON.stringify(webhook_event.message));
    }
    if (webhook_event.postback) {
      console.log('[DEBUG] webhook_event.postback:', JSON.stringify(webhook_event.postback));
    }
  }

  try {
    if (!userStates[sender_psid]) {
      userStates[sender_psid] = { state: "default", data: {} };
      console.log('[DEBUG] userStates initialized for sender_psid');
    }
    let userState = userStates[sender_psid];

    let normalizedMsg = normalize(message);
    if (message === 'CONFIRM_BOOKING') normalizedMsg = 'confirm_booking';
    if (message === 'CANCEL_BOOKING') normalizedMsg = 'cancel_booking';

    // Unknown input decision card
    if (message === 'UNKNOWN_INPUT_YES') {
      userStates[sender_psid] = { state: "default", data: {} };
      await sendIntroMenu(sender_psid, pageAccessToken);
      return;
    }
    if (message === 'UNKNOWN_INPUT_NO') {
      await sendMessage(sender_psid, "Thank you! If you need anything, just message anytime. God bless!", pageAccessToken);
      userStates[sender_psid] = { state: "default", data: {} };
      return;
    }

    // Menu postbacks
    if (message === 'MENU_BOOK_APPOINTMENT') {
      userState.state = "awaiting_date";
      await sendMessage(sender_psid, "Please enter your preferred date (YYYY-MM-DD):", pageAccessToken);
      return;
    }
    if (message === 'MENU_CONFIRM_BOOKING') {
      userState.state = "awaiting_confirm_code";
      await sendMessage(sender_psid, "Please enter your appointment code (ID):", pageAccessToken);
      return;
    }
    if (message === 'MENU_CANCEL_APPOINTMENT') {
      userState.state = "awaiting_cancel_code";
      await sendMessage(sender_psid, "Please enter your appointment code (ID) to cancel:", pageAccessToken);
      return;
    }

    if (justCancelled[sender_psid] && cancelKeywords.some(k => normalizedMsg === k || normalizedMsg.includes(k))) {
      await sendMessage(sender_psid, "Okay po, feel free to message anytime if you need an appointment. Ingat po!", pageAccessToken);
      justCancelled[sender_psid] = false;
      userStates[sender_psid] = { state: "default", data: {} };
      return;
    } else if (justCancelled[sender_psid]) {
      justCancelled[sender_psid] = false;
    }

    const normalizedWords = normalizedMsg.split(/\s+/);
    if (userState.state !== "awaiting_booking_prompt_response") {
      if (cancelKeywords.some(k => normalizedWords.includes(k))) {
        await sendMessage(sender_psid, "Thank you! If you need anything, just message anytime. God bless!", pageAccessToken);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }
    }

    switch (userState.state) {
      case "default": {
        if (topIntent === 'greet') {
          await sendIntroMenu(sender_psid, pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (topIntent === 'book_appointment') {
          userState.state = "awaiting_date";
          await sendMessage(sender_psid, "Please enter your preferred date (YYYY-MM-DD):", pageAccessToken);
          return;
        }
        if (topIntent === 'cancel_appointment') {
          userState.state = "awaiting_cancel_code";
          await sendMessage(sender_psid, "Please enter your appointment code (ID) to cancel:", pageAccessToken);
          return;
        }

        if (appointmentKeywords.some(k => normalizedMsg.includes(k))) {
          userState.state = "awaiting_date";
          await sendMessage(sender_psid, "Please enter your preferred date (YYYY-MM-DD):", pageAccessToken);
          return;
        }
        if (gratitudeMessages.some(g => normalizedMsg.includes(g))) {
          await sendMessage(sender_psid, "Maraming Salamat, Jesus ❤️ you!", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (greetKeywords.some(g => normalizedMsg.includes(g))) {
          await sendIntroMenu(sender_psid, pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        userStates[sender_psid].state = "awaiting_unknown_confirm";
        await sendUnknownInputCard(sender_psid, pageAccessToken);
        return;
      }

      case "awaiting_confirm_code": {
        const code = message.trim();
        if (!/^\d+$/.test(code)) {
          await sendMessage(sender_psid, "Invalid code format. Please enter your numeric appointment code (ID).", pageAccessToken);
          return;
        }
        const { data: appointment, error: apptErr } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', code)
          .eq('clinic_id', clinicId)
          .maybeSingle();

        if (apptErr || !appointment) {
          await sendMessage(sender_psid, "No appointment found with that code. Please check and try again.", pageAccessToken);
          return;
        }

        const { data: patientRow } = await supabase
          .from('patients')
          .select('messenger_id')
          .eq('id', appointment.patient_id)
          .eq('clinic_id', clinicId)
          .maybeSingle();

        const patientMessengerId = patientRow?.messenger_id;

        if (!patientMessengerId) {
          const { data: existingPatient } = await supabase
            .from('patients')
            .select('id')
            .eq('messenger_id', sender_psid)
            .eq('clinic_id', clinicId)
            .maybeSingle();

          if (existingPatient && existingPatient.id !== appointment.patient_id) {
            await supabase
              .from('appointments')
              .update({ guardian_messenger_id: sender_psid })
              .eq('id', appointment.id)
              .eq('clinic_id', clinicId);
          } else {
            await supabase
              .from('patients')
              .update({ messenger_id: sender_psid })
              .eq('id', appointment.patient_id)
              .eq('clinic_id', clinicId);
            await supabase
              .from('appointments')
              .update({ guardian_messenger_id: null })
              .eq('id', appointment.id)
              .eq('clinic_id', clinicId);
          }
        }

        if (["Completed", "Cancelled", "No Show"].includes(appointment.status)) {
          let statusMsg = "";
          switch (appointment.status) {
            case "Completed":
              statusMsg = "This appointment is already completed. Would you like to book another appointment?";
              break;
            case "Cancelled":
              statusMsg = "This appointment has been cancelled. Would you like to book a new appointment?";
              break;
            case "No Show":
              statusMsg = "This appointment was marked as 'No Show'. Would you like to book a new appointment?";
              break;
          }
          await sendBookingPromptButtonTemplate(sender_psid, statusMsg, pageAccessToken);
          userStates[sender_psid] = { state: "awaiting_booking_prompt_response", data: {} };
          return;
        }

        if (["Scheduled", "Confirmed"].includes(appointment.status)) {
          const { data: patientRow2 } = await supabase
            .from('patients')
            .select('messenger_id')
            .eq('id', appointment.patient_id)
            .eq('clinic_id', clinicId)
            .maybeSingle();

          const patientMessengerId2 = patientRow2?.messenger_id;

          if (!patientMessengerId2) {
            await supabase
              .from('appointments')
              .update({ status: 'Confirmed' })
              .eq('id', appointment.id)
              .eq('clinic_id', clinicId);

            if (req && req.io) {
              await emitAppointmentUpdate(req.io, clinicId, appointment.id);
            }
            await sendMessage(sender_psid, "✅ Your Messenger ID is now linked and your appointment is confirmed! You will receive reminders for this appointment.", pageAccessToken);
          } else {
            await sendMessage(sender_psid, "✅ Your Messenger ID is already linked and your appointment is confirmed! You will receive reminders for this appointment.", pageAccessToken);
          }
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        await sendMessage(sender_psid, "Something went wrong while processing your appointment code. Please contact the clinic if you need help.", pageAccessToken);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }

      case "awaiting_cancel_code": {
        const code = message.trim();
        if (!/^\d+$/.test(code)) {
          await sendMessage(sender_psid, "Invalid code format. Please enter your numeric appointment code (ID).", pageAccessToken);
          return;
        }
        const { data: apptData, error: apptErr } = await supabase
          .from('appointments')
          .select('*, patient:patient_id (messenger_id)')
          .eq('id', code)
          .eq('clinic_id', clinicId)
          .maybeSingle();

        if (apptErr || !apptData) {
          await sendMessage(sender_psid, "No appointment found with that code. Type 'Cancel' to exit, or 'Try Again' to enter a different code.", pageAccessToken);
          userStates[sender_psid].state = "awaiting_cancel_code_retry";
          return;
        }
        const appointment = apptData;
        const patient_messenger_id = appointment.patient?.messenger_id;
        const isPatient = patient_messenger_id === sender_psid;
        const isGuardian = appointment.guardian_messenger_id === sender_psid;

        if (!isPatient && !isGuardian) {
          await sendMessage(sender_psid, "You have no appointment with that code. Type 'Cancel' to exit, or 'Try Again' to enter a different code.", pageAccessToken);
          userStates[sender_psid].state = "awaiting_cancel_code_retry";
          return;
        }

        const apptDate = new Date(appointment.appointment_time);
        const now = new Date();
        now.setHours(0,0,0,0);
        apptDate.setHours(0,0,0,0);

        if (apptDate < now) {
          await sendMessage(sender_psid, "You cannot cancel past appointments. Only today's and future appointments can be cancelled.", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        const apptTime = new Date(appointment.appointment_time);
        const nowTime = new Date();
        const msDiff = apptTime.getTime() - nowTime.getTime();
        if (msDiff <= 60 * 60 * 1000) {
          await sendMessage(sender_psid, "Sorry, you cannot cancel your appointment less than 1 hour before the scheduled time. Please contact the clinic directly.", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        if (["Cancelled", "No Show"].includes(appointment.status)) {
          await sendMessage(sender_psid, "This appointment is already cancelled or marked as No Show.", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        await supabase
          .from('appointments')
          .update({ status: 'Cancelled', reason: 'Cancelled via Messenger' })
          .eq('id', appointment.id)
          .eq('clinic_id', clinicId);

        if (req && req.io) {
          await emitAppointmentUpdate(req.io, clinicId, appointment.id);
        }
        await sendMessage(sender_psid, "Your appointment has been cancelled. If you need a new appointment, just message anytime.", pageAccessToken);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }

      case "awaiting_cancel_code_retry": {
        const norm = normalize(message);
        if (cancelKeywords.includes(norm)) {
          await sendMessage(sender_psid, "Thank you! If you need anything, just message anytime. God bless!", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }
        if (norm === "try again" || norm === "tryagain") {
          userStates[sender_psid].state = "awaiting_cancel_code";
          await sendMessage(sender_psid, "Please enter your appointment code (ID) to cancel:", pageAccessToken);
          return;
        }
        await sendMessage(sender_psid, "Type 'Cancel' to exit, or 'Try Again' to enter a different code.", pageAccessToken);
        return;
      }

      case "awaiting_booking_prompt_response": {
        const norm = normalize(message);
        if (
          message === "DECLINE_BOOKING" ||
          norm === "decline_booking" ||
          norm === "no" ||
          norm === "ayaw" ||
          norm === "hindi" ||
          norm === "no thanks" ||
          norm === "not now"
        ) {
          await sendMessage(sender_psid, "Thank you! If you need a new appointment, just message anytime. Have a blessed day!", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        if (
          message === "BOOK_ANOTHER_APPOINTMENT" ||
          norm === "book_another_appointment" ||
          norm === "yes" ||
          norm === "oo" ||
          norm === "sige" ||
          norm === "book" ||
          norm === "appointment"
        ) {
          userStates[sender_psid] = { state: "awaiting_date", data: {} };
          await sendMessage(sender_psid, "Great! Let's book a new appointment. Please enter your preferred date (YYYY-MM-DD):", pageAccessToken);
          return;
        }

        await sendMessage(sender_psid, "Would you like to book a new appointment? Please type Yes or No.", pageAccessToken);
        return;
      }

      case "awaiting_date": {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(message.trim())) {
          await sendMessage(sender_psid, "Please enter the date in YYYY-MM-DD format (e.g., 2025-09-20).", pageAccessToken);
          return;
        }
        if (!isClinicOpen(message.trim())) {
          await sendMessage(sender_psid, "Clinic is closed on Sundays. Please select another day.", pageAccessToken);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
          return;
        }
        const today = new Date();
        today.setHours(0,0,0,0);
        const selectedDate = new Date(message.trim());
        if (selectedDate < today) {
          await sendMessage(sender_psid, "Date must not be in the past. Please select another date.", pageAccessToken);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
          return;
        }
        userState.data.date = message.trim();

        const patient = await findPatientByMessengerId(sender_psid, clinicId);
        let doubleBooked = false;
        if (patient) {
          doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, clinicId);
        }

        if (patient) {
          if (doubleBooked) {
            userState.state = "awaiting_for_whom";
            await sendAppointmentForButtonTemplate(sender_psid, pageAccessToken);
            return;
          } else {
            userState.data.booking_for = "me";
            userState.data.patient_id = patient.id;
            userState.state = "awaiting_slot";
            const { slots, activeDentists } = await getAvailableSlots(userState.data.date, clinicId);
            userState.data.slots = slots;
            userState.data.activeDentists = activeDentists;

            if (!activeDentists.length) {
              await sendMessage(sender_psid, "Sorry, no dentists are available for booking at the moment.", pageAccessToken);
              userStates[sender_psid] = { state: "default", data: {} };
              return;
            }
            if (slots.length === 0) {
              await sendMessage(sender_psid, "Sorry, no available slots for that day. Please enter another date (YYYY-MM-DD):", pageAccessToken);
              userStates[sender_psid].state = "awaiting_date";
              userStates[sender_psid].data = {};
            } else {
              await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, pageAccessToken);
            }
            return;
          }
        } else {
          userState.data.booking_for = "me";
          userState.state = "awaiting_my_name";
          await sendMessage(sender_psid, "Please enter your full name:", pageAccessToken);
          return;
        }
      }

      case "awaiting_my_name": {
        userState.data.patient_name = toTitleCase(message.trim());
        userState.state = "awaiting_my_phone";
        await sendMessage(sender_psid, "If you want, enter your mobile number (or reply 'skip').", pageAccessToken);
        return;
      }

      case "awaiting_my_phone": {
        let phone = null;
        if (normalize(message) !== "skip") {
          phone = message.trim();
          if (!/^\d{10,}$/.test(phone)) {
            await sendMessage(sender_psid, "Invalid phone number format. Please enter numbers only, or reply 'skip'.", pageAccessToken);
            return;
          }
        }
        userState.data.patient_phone = phone;

        const patient = await findPatientByNameAndPhone(userState.data.patient_name, phone, clinicId);
        if (patient) {
          userState.data.found_patient_id = patient.id;
          userState.data.found_patient_name = patient.name;
          userState.data.found_patient_phone = patient.phone;
          userState.state = "awaiting_my_confirm_match";
          let msg = `We found an existing record:\nName: ${patient.name}\n`;
          if (patient.phone) msg += `Mobile: ${patient.phone}\n`;
          msg += "\nIs this you? Reply YES to link your Messenger, or NO to create a new record.";
          await sendMessage(sender_psid, msg, pageAccessToken);
          return;
        } else {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, clinicId);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;

          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Sorry, no dentists are available for booking at the moment.", pageAccessToken);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Sorry, no available slots for that day. Please enter another date (YYYY-MM-DD):", pageAccessToken);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, pageAccessToken);
          }
          return;
        }
      }

      case "awaiting_my_confirm_match": {
        if (["yes", "y", "oo", "opo"].includes(normalize(message))) {
          await supabase
            .from('patients')
            .update({ messenger_id: sender_psid })
            .eq('id', userState.data.found_patient_id)
            .eq('clinic_id', clinicId);

          userState.data.patient_id = userState.data.found_patient_id;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, clinicId);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;

          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Sorry, no dentists are available for booking at the moment.", pageAccessToken);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Sorry, no available slots for that day. Please enter another date (YYYY-MM-DD):", pageAccessToken);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, pageAccessToken);
          }
          return;
        } else if (["no", "n", "hindi"].includes(normalize(message))) {
          userState.data.patient_id = null;
          userState.state = "awaiting_slot";
          const { slots, activeDentists } = await getAvailableSlots(userState.data.date, clinicId);
          userState.data.slots = slots;
          userState.data.activeDentists = activeDentists;

          if (!activeDentists.length) {
            await sendMessage(sender_psid, "Sorry, no dentists are available for booking at the moment.", pageAccessToken);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          if (slots.length === 0) {
            await sendMessage(sender_psid, "Sorry, no available slots for that day. Please enter another date (YYYY-MM-DD):", pageAccessToken);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          } else {
            await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, pageAccessToken);
          }
          return;
        } else {
          await sendMessage(sender_psid, "Please reply YES to link, or NO to create a new record.", pageAccessToken);
          return;
        }
      }

      case "awaiting_for_whom": {
        if (
          normalizedMsg === "1" ||
          normalize(normalizedMsg) === "for me" ||
          normalizedMsg === "for_me"
        ) {
          await sendMessage(sender_psid, "You already have an appointment on this date. Please enter another date (YYYY-MM-DD):", pageAccessToken);
          userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
          return;
        } else if (
          normalizedMsg === "2" ||
          normalize(normalizedMsg) === "for someone else" ||
          normalizedMsg === "for_someone_else"
        ) {
          userState.data.booking_for = "someone else";
          userState.state = "awaiting_patient_name";
          await sendMessage(sender_psid, "Please enter the full name of the person (e.g., your child) you want to book for:", pageAccessToken);
          return;
        }
        await sendAppointmentForButtonTemplate(sender_psid, pageAccessToken);
        return;
      }

      case "awaiting_patient_name": {
        userState.data.patient_name = toTitleCase(message.trim());
        userState.state = "awaiting_patient_phone";
        await sendMessage(sender_psid, "If you want, enter their mobile number (or reply 'skip').", pageAccessToken);
        return;
      }

      case "awaiting_patient_phone": {
        let phone = null;
        if (normalize(message) !== "skip") {
          phone = message.trim();
          if (!/^\d{10,}$/.test(phone)) {
            await sendMessage(sender_psid, "Invalid phone number format. Please enter numbers only, or reply 'skip'.", pageAccessToken);
            return;
          }
        }
        userState.data.patient_phone = phone;

        const patient = await findPatientByNameAndPhone(userState.data.patient_name, phone, clinicId);
        if (patient) {
          const doubleBooked = await hasDoubleBookingOnDate(patient.id, userState.data.date, clinicId);
          if (doubleBooked) {
            await sendMessage(sender_psid, `This person already has an appointment on ${userState.data.date}. Please enter another date (YYYY-MM-DD):`, pageAccessToken);
            userStates[sender_psid].state = "awaiting_date";
            userStates[sender_psid].data = {};
            return;
          }
          userState.data.patient_id = patient.id;
        } else {
          userState.data.patient_id = null;
        }

        userState.state = "awaiting_slot";
        const { slots, activeDentists } = await getAvailableSlots(userState.data.date, clinicId);
        userState.data.slots = slots;
        userState.data.activeDentists = activeDentists;

        if (!activeDentists.length) {
          await sendMessage(sender_psid, "Sorry, no dentists are available for booking at the moment.", pageAccessToken);
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        if (slots.length === 0) {
          await sendMessage(sender_psid, "Sorry, no available slots for that day. Please enter another date (YYYY-MM-DD):", pageAccessToken);
          userStates[sender_psid].state = "awaiting_date";
          userStates[sender_psid].data = {};
        } else {
          await sendTimeSlotButtonTemplate(sender_psid, userState.data.date, slots, pageAccessToken);
        }
        return;
      }

      case "awaiting_slot": {
        const availableSlots = userState.data.slots;
        let slot = null;
        if (normalizedMsg.startsWith("slot_")) {
          slot = message.substring(5);
        } else {
          const idx = parseInt(normalizedMsg, 10) - 1;
          if (!availableSlots || isNaN(idx) || idx < 0 || idx >= availableSlots.length) {
            await sendMessage(sender_psid, "Invalid choice. Please reply or tap a slot button.", pageAccessToken);
            return;
          }
          slot = availableSlots[idx];
        }
        if (!availableSlots.includes(slot)) {
          await sendMessage(sender_psid, "Selected slot is invalid. Please choose another slot.", pageAccessToken);
          return;
        }
        userState.data.slot = slot;
        userState.state = "confirming";
        let summary = `Booking summary:\nDate: ${userState.data.date}\nTime: ${slot}\n`;
        if (userState.data.booking_for === "me") {
          const patient = await findPatientByMessengerId(sender_psid, clinicId);
          summary += `Name: ${patient ? patient.name : userState.data.patient_name}\n`;
          if (patient && patient.phone) summary += `Mobile: ${patient.phone}\n`;
          else if (userState.data.patient_phone) summary += `Mobile: ${userState.data.patient_phone}\n`;
        } else {
          summary += `Name: ${userState.data.patient_name}\n`;
          if (userState.data.patient_phone) summary += `Mobile: ${userState.data.patient_phone}\n`;
        }
        await sendConfirmationButtonTemplate(sender_psid, summary, pageAccessToken);
        return;
      }

      case "confirming": {
        const slot24 = to24HourFormat(userState.data.slot);
        const datetime = `${userState.data.date}T${slot24}:00+08:00`;
        const activeDentists = userState.data.activeDentists;
        let assignedDentist = null;

        for (const dentist of activeDentists) {
          const dayOfWeek = new Date(userState.data.date).getDay();
          let qBlocks = supabase
            .from('dentist_availability')
            .select('start_time,end_time,is_available')
            .eq('dentist_id', dentist.id)
            .or(`specific_date.eq.${userState.data.date},day_of_week.eq.${dayOfWeek}`)
            .eq('is_available', false)
            .eq('clinic_id', clinicId);

          const { data: blocks, error: blocksErr } = await qBlocks;
          if (blocksErr) {
            console.error("confirming availability blocks error:", blocksErr);
            continue;
          }
          let isBlocked = false;
          for (const block of (blocks || [])) {
            const [startHour, startMin] = block.start_time.split(':').map(Number);
            const [endHour, endMin] = block.end_time.split(':').map(Number);
            const [h, m] = slot24.split(':').map(Number);
            const slotMinutes = h * 60 + m;
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
              isBlocked = true;
              break;
            }
          }
          if (isBlocked) continue;

          const { data: bookings, error: bookingsErr } = await supabase
            .from('appointments')
            .select('id,status')
            .eq('dentist_id', dentist.id)
            .eq('appointment_time', datetime)
            .eq('clinic_id', clinicId);

          if (bookingsErr) continue;
          if ((bookings || []).some(b => b.status !== 'Cancelled')) continue;

          assignedDentist = dentist;
          break;
        }

        if (!assignedDentist) {
          await sendMessage(sender_psid, "Sorry, no dentist is available for that slot. Please try another slot.", pageAccessToken);
          userStates[sender_psid].state = "awaiting_slot";
          return;
        }

        let patient_id = userState.data.patient_id;
        let patient_name = userState.data.patient_name;
        let patient_phone = userState.data.patient_phone;

        if (!patient_id) {
          const insertPayload = {
            name: typeof patient_name === 'string' ? patient_name : String(patient_name),
            phone: patient_phone || null,
            clinic_id: clinicId
          };
          if (userState.data.booking_for === "me") {
            insertPayload.messenger_id = sender_psid;
          }
          const { data: insertedPatient, error: insErr } = await supabase
            .from('patients')
            .insert(insertPayload)
            .select()
            .single();
          if (insErr) {
            console.error("Error inserting patient:", insErr);
            await sendMessage(sender_psid, "Sorry, something went wrong while booking your appointment.", pageAccessToken);
            userStates[sender_psid] = { state: "default", data: {} };
            return;
          }
          patient_id = insertedPatient.id;
        }

        const { data: existingAppointments, error: existingErr } = await supabase
          .from('appointments')
          .select('id,status')
          .eq('dentist_id', assignedDentist.id)
          .eq('appointment_time', datetime)
          .eq('clinic_id', clinicId);

        if (existingErr) {
          console.error("Existing appointment lookup error:", existingErr);
        }

        // Cancel logic
        if (
          cancelKeywords.some(k => normalizedMsg === k || normalizedMsg.includes(k)) ||
          normalizedMsg === 'cancel_booking'
        ) {
          let targetId = null;
          try {
            if (existingAppointments && existingAppointments.length > 0) {
              targetId = existingAppointments[0].id;
              await supabase
                .from('appointments')
                .update({
                  status: 'Cancelled',
                  reason: 'Messenger Booking',
                  guardian_messenger_id: sender_psid
                })
                .eq('id', targetId)
                .eq('clinic_id', clinicId);
            } else {
              const { data: insertedCancelled, error: insCancelErr } = await supabase
                .from('appointments')
                .insert({
                  dentist_id: assignedDentist.id,
                  patient_id,
                  appointment_time: datetime,
                  booking_origin: 'Messenger Booking',
                  status: 'Cancelled',
                  reason: 'Messenger Booking',
                  guardian_messenger_id: sender_psid,
                  clinic_id: clinicId
                })
                .select('id')
                .single();
              if (!insCancelErr) targetId = insertedCancelled.id;
            }
          } catch (err) {
            console.error("Error saving cancelled appointment:", err);
          }
          if (req && req.io && targetId) {
            await emitAppointmentUpdate(req.io, clinicId, targetId);
          }
          await sendMessage(
            sender_psid,
            "Your booking was cancelled. Would you like to book another appointment? Type 'appointment' or 'book' to start a new booking.",
            pageAccessToken
          );
          justCancelled[sender_psid] = true;
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        // Confirm logic
        if (
          normalizedMsg === 'yes' || normalizedMsg === 'y' || normalizedMsg === 'ok' || normalizedMsg === 'confirm' ||
          normalizedMsg === 'confirm_booking'
        ) {
          let appointmentId;
          try {
            if (existingAppointments && existingAppointments.length > 0) {
              const existingId = existingAppointments[0].id;
              const { data: updated, error: updErr } = await supabase
                .from('appointments')
                .update({
                  patient_id,
                  status: 'Confirmed',
                  reason: 'Messenger Booking',
                  guardian_messenger_id: sender_psid
                })
                .eq('id', existingId)
                .eq('clinic_id', clinicId)
                .select('id')
                .single();
              appointmentId = updErr ? existingId : updated.id;
            } else {
              const { data: insertedAppt, error: insApptErr } = await supabase
                .from('appointments')
                .insert({
                  dentist_id: assignedDentist.id,
                  patient_id,
                  appointment_time: datetime,
                  booking_origin: 'Messenger Booking',
                  status: 'Confirmed',
                  reason: 'Messenger Booking',
                  guardian_messenger_id: sender_psid,
                  clinic_id: clinicId
                })
                .select('id')
                .single();
              if (!insApptErr) appointmentId = insertedAppt.id;
            }

            let bookedSummary = {
              patient_name: userState.data.patient_name,
              patient_phone: userState.data.patient_phone,
              id: appointmentId
            };
            if (appointmentId) {
              const { data: apptDetail } = await supabase
                .from('appointments')
                .select('id, patient_id, dentist_id')
                .eq('id', appointmentId)
                .eq('clinic_id', clinicId)
                .maybeSingle();

              if (apptDetail) {
                const { data: p } = await supabase
                  .from('patients')
                  .select('name, phone')
                  .eq('id', apptDetail.patient_id)
                  .eq('clinic_id', clinicId)
                  .maybeSingle();
                const { data: d } = await supabase
                  .from('dentists')
                  .select('name')
                  .eq('id', apptDetail.dentist_id)
                  .eq('clinic_id', clinicId)
                  .maybeSingle();
                if (p) {
                  bookedSummary.patient_name = p.name;
                  bookedSummary.patient_phone = p.phone;
                }
                if (d) {
                  bookedSummary.dentist_name = d.name;
                }
              }
            }

            if (req && req.io && appointmentId) {
              await emitAppointmentUpdate(req.io, clinicId, appointmentId);
            }

            await sendMessage(
              sender_psid,
              `Booking summary:\nDate: ${userState.data.date}\nTime: ${userState.data.slot}\nName: ${bookedSummary.patient_name}\nAppointment Code: ${appointmentId || ''}\n\n✅ Your appointment has been booked!`,
              pageAccessToken
            );
          } catch (err) {
            console.error("Error booking appointment:", err);
            await sendMessage(
              sender_psid,
              "Sorry, something went wrong while booking your appointment.",
              pageAccessToken
            );
          }
          userStates[sender_psid] = { state: "default", data: {} };
          return;
        }

        await sendMessage(
          sender_psid,
          "Sorry, I didn't understand. Please tap a button to confirm or cancel your booking.",
          pageAccessToken
        );
        return;
      }

      default: {
        await sendMessage(sender_psid, "Sorry, something went wrong. Let's start over. Type 'appointment' or 'book' to begin.", pageAccessToken);
        userStates[sender_psid] = { state: "default", data: {} };
        return;
      }
    }
  } catch (err) {
    console.error('❌ Error in handleMessage:', err);
    await sendMessage(sender_psid, "Sorry, something went wrong. Please try again.", pageAccessToken);
    userStates[sender_psid] = { state: "default", data: {} };
  }
}

// Export both router and sendMessage
module.exports = {
  router,
  sendMessage
};
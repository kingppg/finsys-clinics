// backend/helpers/messengerHelpers.js
// Messenger and clinic context utilities
// Contains: sendMessage, emitAppointmentUpdate, getClinicByMessengerPageId, buildContext, getUtcOffset

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get UTC offset for a timezone dynamically
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
      {
        recipient: { id: sender_psid },
        message: { text: response },
        // RESPONSE = a normal reply within the 24-hour messaging window, which is
        // always the case for webhook conversation. The old MESSAGE_TAG /
        // CONFIRMED_EVENT_UPDATE tag is deprecated and now rejected by Facebook
        // (error 1893061 "Deprecated Message Tag Not Allowed"), which was
        // silently dropping every text reply.
        messaging_type: "RESPONSE"
      }
    );
  } catch (err) {
    console.error("❌ Error sending message:", err.response?.data || err.message);
  }
}

// Helper: emit full appointment row via socket
async function emitAppointmentUpdate(io, clinicId, appointmentId) {
  try {
    if (!io || !clinicId || !appointmentId) return;
    // Whitelisted columns only: io.emit is a GLOBAL broadcast (no socket auth,
    // no rooms), so this payload is receivable beyond the owning clinic's
    // dashboards. It carries everything the frontend listeners read
    // (QueueMonitor/QueueDisplay/AppointmentsTable/AppointmentForm) and
    // nothing else — no `reason` free-text, no messenger/guardian ids.
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('id, clinic_id, dentist_id, patient_id, status, appointment_time, checked_in_at, deleted, booking_origin')
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      .maybeSingle();
    if (error || !appt) return;
    io.emit("appointment-updated", appt);
  } catch (err) {
    console.error("emitAppointmentUpdate error:", err);
  }
}

// Clinic lookup by Messenger Page ID
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

// Build context object from clinic record
function buildContext(clinic) {
  return {
    clinicId: clinic.id,
    pageAccessToken: clinic.fb_page_access_token,
    timeZone: clinic.time_zone || 'Asia/Manila',
    clinicName: clinic.name,
    fb_page_id: clinic.messenger_page_id,
    clinic: clinic  // full clinic object so Claire can read name/address/phone
  };
}

module.exports = {
  getUtcOffset,
  sendMessage,
  emitAppointmentUpdate,
  getClinicByMessengerPageId,
  buildContext
};
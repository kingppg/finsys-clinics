// backend/routes/statusNotifications.js
// API routes for sending Messenger notifications when appointment status is updated (Supabase version, robust)

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Safety: Check env before creating client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase env vars are missing!');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Utility: get appointment & patient info by ID, clinic-scoped
async function getAppointmentWithPatient(id, clinicId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (
        messenger_id,
        name
      )
    `)
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .single();

  if (error) {
    console.error('[status-notifications] Supabase error fetching appointment with patient:', error);
    return null;
  }
  if (!data) {
    console.error('[status-notifications] No appointment data found for id:', id, 'clinicId:', clinicId);
    return null;
  }
  return {
    ...data,
    messenger_id: data.patient?.messenger_id,
    patient_name: data.patient?.name,
  };
}

// POST /status-notifications/:appointmentId
router.post('/:appointmentId', async (req, res) => {
  const appointmentId = req.params.appointmentId;
  const { status, message, recipient, clinic_id } = req.body;

  console.log('[status-notifications] Incoming:', { appointmentId, status, message, recipient, clinic_id });

  // Fetch appointment info
  const appt = await getAppointmentWithPatient(appointmentId, clinic_id);

  if (!appt) {
    console.error('[status-notifications] Appointment not found');
    return res.status(404).json({ error: 'Appointment not found' });
  }

  let messenger_id = recipient || appt.messenger_id || appt.guardian_messenger_id;

  // Get clinic info (name, phone, and Messenger Page token) in one query
  const { data: clinicRow, error: clinicError } = await supabase
    .from('clinics')
    .select('fb_page_access_token, name, contact_phone')
    .eq('id', clinic_id)
    .single();

  const pageToken = clinicRow?.fb_page_access_token;
  const clinicName = clinicRow?.name || 'your clinic';
  const clinicPhone = clinicRow?.contact_phone || null;

  if (clinicError || !pageToken) {
    console.error('[status-notifications] No Messenger Page token found for this clinic.');
    return res.status(400).json({ error: 'No Messenger Page token found for this clinic.' });
  }

  // Format appointment date & time (Asia/Manila timezone)
  const apptDate = new Date(appt.appointment_time);
  const dateStr = apptDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila'
  });
  const timeStr = apptDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });

  const contactLine = clinicPhone
    ? `You may reach us at ${clinicPhone}.`
    : `Please contact us to get assistance.`;

  const defaultMessages = {
    "Checked-In": `Hi ${appt.patient_name}! 😊 You're now checked in at ${clinicName}. Please have a seat and relax — we'll be with you shortly. Thank you for your patience! 🦷`,
    "Confirmed":  `Hello ${appt.patient_name}, this is ${clinicName}. Your appointment on ${dateStr} at ${timeStr} has been confirmed. We look forward to seeing you! 🦷`,
    "Scheduled":  `Hello ${appt.patient_name}, this is ${clinicName}. Your appointment has been scheduled for ${dateStr} at ${timeStr}. See you then! 🦷`,
    "Completed":  `Hello ${appt.patient_name}, this is ${clinicName}. Thank you for coming to your appointment on ${dateStr}. We hope to see you again soon! 🦷`,
    "No Show":    `Hello ${appt.patient_name}, this is ${clinicName}. We noticed you missed your appointment on ${dateStr} at ${timeStr}. ${contactLine}`,
    "Cancelled":  `Hello ${appt.patient_name}, this is ${clinicName}. Your appointment on ${dateStr} at ${timeStr} has been cancelled. ${contactLine}`,
  };

  const finalMsg = message || defaultMessages[status] || `Hello ${appt.patient_name}, this is ${clinicName}. Your appointment status has been updated to "${status}" as of ${dateStr} at ${timeStr}.`;

  // Send Messenger message (don't block status update if it fails)
  let messengerSent = false;
  if (messenger_id) {
    try {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/messages?access_token=${pageToken}`,
        {
          recipient: { id: messenger_id },
          message: { text: finalMsg },
          messaging_type: "MESSAGE_TAG",
          tag: "APPOINTMENT_UPDATE"
        }
      );
      messengerSent = true;
      console.log('[status-notifications] ✅ Messenger notification sent successfully');
    } catch (err) {
      console.error("[status-notifications] ❌ Error sending Messenger notification:", err.response?.data || err.message);
      // Don't return error — status update should still complete
    }
  } else {
    console.log('[status-notifications] No messenger_id — skipping Messenger notification');
  }

  // Log in DB for audit (do not fail response if logging fails)
  const sent_on_date = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from('appointment_reminders').insert({
      appointment_id: appointmentId,
      sent_on: new Date().toISOString(),
      days_ahead: null,
      messenger_id: messenger_id || null,
      message: finalMsg,
      sent_on_date,
      is_manual: true,
      clinic_id,
    });
  } catch (dbErr) {
    console.error("[status-notifications] Supabase log error after Messenger send:", dbErr);
  }

  // Emit socket event so queue display updates in real-time
  if (req.io) {
    req.io.emit('appointment-updated', {
      ...appt,
      status,
      checked_in_at: status === 'Checked-In' ? new Date().toISOString() : null,
    });
  }

  res.json({ 
    success: true, 
    sent: messengerSent,
    message: messengerSent ? 'Status updated and notification sent' : 'Status updated (notification send skipped or failed)'
  });
});

module.exports = router;
// backend/routes/statusNotifications.js
// API routes for sending Messenger notifications when appointment status is updated (Supabase version, robust)

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendMessage } = require('../webhook'); // Your Messenger send logic

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
  console.log('[status-notifications] Fetched appointment:', appt);

  if (!appt) {
    console.error('[status-notifications] Appointment not found');
    return res.status(404).json({ error: 'Appointment not found' });
  }

  let messenger_id = recipient || appt.messenger_id || appt.guardian_messenger_id;
  console.log('[status-notifications] Messenger ID to notify:', messenger_id);

  if (!messenger_id) {
    // Status is already updated in Supabase by the frontend before calling this endpoint.
    // Log the missing Messenger ID for audit, but return 200 so the frontend
    // knows the status save succeeded — only the notification was skipped.
    const sent_on_date = new Date().toISOString().slice(0, 10);
    try {
      await supabase.from('appointment_reminders').insert({
        appointment_id: appointmentId,
        sent_on: new Date().toISOString(),
        days_ahead: null,
        messenger_id: null,
        message: `Status updated to "${status}" but no Messenger notification was sent — no Messenger ID on file for this patient or guardian.`,
        sent_on_date,
        is_manual: true,
        clinic_id,
      });
    } catch (dbErr) {
      console.error("[status-notifications] Supabase log error for missing Messenger ID:", dbErr);
    }
    return res.status(200).json({
      success: true,
      sent: false,
      warning: 'No Messenger ID on file for this patient or guardian. Status was updated but the patient was not notified.'
    });
  }

  // Get Messenger Page token for clinic
  const { data: clinicRow, error: clinicError } = await supabase
    .from('clinics')
    .select('fb_page_access_token')
    .eq('id', clinic_id)
    .single();
  console.log('[status-notifications] Clinic row:', clinicRow);
  const pageToken = clinicRow?.fb_page_access_token;

  if (clinicError || !pageToken) {
    console.error('[status-notifications] No Messenger Page token found for this clinic.');
    return res.status(400).json({ error: 'No Messenger Page token found for this clinic.' });
  }

  let defaultMessages = {
    "Checked-In": `Hi ${appt.patient_name}! 😊 You're now checked in at Palo Dentcare. Please have a seat and relax — we'll be with you shortly. Thank you for your patience! 🦷`,
    Completed: `Hello ${appt.patient_name}, thank you for coming to your appointment!`,
    "No Show": `Hello ${appt.patient_name}, we noticed you missed your appointment. Please contact us to reschedule.`,
    Cancelled: `Hello ${appt.patient_name}, your appointment has been cancelled. Contact us if you'd like to rebook.`,
  };
  let finalMsg = message || defaultMessages[status] || `Hello ${appt.patient_name}, your appointment status was updated to "${status}".`;

  console.log('[status-notifications] Final message:', finalMsg);

  // Send Messenger message
  try {
    const sendResult = await sendMessage(messenger_id, finalMsg, { pageAccessToken: pageToken });
    console.log('[status-notifications] sendMessage result:', sendResult);
  } catch (err) {
    console.error("[status-notifications] ❌ Error sending Messenger status notification:", err);
    return res.status(500).json({ error: 'Failed to send Messenger notification.' });
  }

  // Log in DB for audit (do not fail response if logging fails)
  const sent_on_date = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from('appointment_reminders').insert({
      appointment_id: appointmentId,
      sent_on: new Date().toISOString(),
      days_ahead: null,
      messenger_id,
      message: finalMsg,
      sent_on_date,
      is_manual: true,
      clinic_id,
    });
  } catch (dbErr) {
    console.error("[status-notifications] Supabase log error after Messenger send:", dbErr);
  }

  res.json({ success: true, sent: true });
});

module.exports = router;
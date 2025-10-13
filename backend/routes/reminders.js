// Express.js API routes for full reminder control, now clinic-scoped (Supabase version)

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendMessage } = require('../webhook'); // Import sendMessage from webhook.js

// Supabase client setup (env vars must be set)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for backend access
);

// Utility: get appointment by id and clinic
async function getAppointment(id, clinicId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .single();
  if (error) {
    console.error('Supabase error fetching appointment:', error);
    return null;
  }
  return data;
}

// GET: Fetch reminder settings & status for an appointment (clinic-scoped)
router.get('/:id/reminder-settings', async (req, res) => {
  const appointmentId = req.params.id;
  const clinicId = req.query.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

  const appt = await getAppointment(appointmentId, clinicId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });

  // Fetch sent reminders and status update logs (clinic-scoped)
  const { data: sentRemindersRaw, error: logError } = await supabase
    .from('appointment_reminders')
    .select('id, days_ahead, sent_on, messenger_id, is_manual, message')
    .eq('appointment_id', appointmentId)
    .eq('clinic_id', clinicId)
    .order('sent_on', { ascending: false });

  if (logError) {
    return res.status(500).json({ error: 'Failed to fetch sent reminders' });
  }

  // Add a derived "type" to each log entry for easier frontend display
  const sentReminders = (sentRemindersRaw || []).map(rem => {
    let type = "Automated Reminder";
    if (rem.is_manual && rem.days_ahead == null) type = "Status Update";
    else if (rem.is_manual) type = "Manual Reminder";
    return { ...rem, type };
  });

  res.json({
    reminder_enabled: appt.reminder_enabled,
    reminder_days: appt.reminder_days,
    reminder_message: appt.reminder_message,
    reminder_recipient_type: appt.reminder_recipient_type,
    appointment_date: appt.appointment_time,
    sent_reminders: sentReminders
  });
});

// PUT: Update reminder settings for an appointment (clinic-scoped)
router.put('/:id/reminder-settings', async (req, res) => {
  const appointmentId = req.params.id;
  const clinicId = req.query.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

  // Validate appointment ownership
  const appt = await getAppointment(appointmentId, clinicId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });

  const { reminder_enabled, reminder_days, reminder_message, reminder_recipient_type } = req.body;

  // Update appointment
  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      reminder_enabled,
      reminder_days,
      reminder_message,
      reminder_recipient_type
    })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update reminder settings' });
  }
  res.json({ success: true });
});

// POST: Send reminder manually for an appointment (clinic-scoped)
router.post('/:id/send-reminder', async (req, res) => {
  const appointmentId = req.params.id;
  const clinicId = req.query.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

  // Fetch appointment & patient info (clinic-scoped)
  const { data: apptRows, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (
        messenger_id,
        name
      )
    `)
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .single();
  const appt = apptRows;
  if (apptErr) {
    return res.status(500).json({ error: 'Failed to fetch appointment' });
  }
  if (!appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });
  if (!appt.reminder_enabled) return res.status(400).json({ error: 'Reminders for this appointment are disabled.' });

  // Determine recipient, prefer override, else guardian if patient has no Messenger ID, else patient
  let messenger_id = req.body.recipient_override ||
    (appt.patient?.messenger_id ? appt.patient.messenger_id : appt.guardian_messenger_id);

  if (!messenger_id) {
    return res.status(400).json({ error: 'No Messenger ID found for patient or guardian.' });
  }

  // Format reminder message
  const apptDate = new Date(appt.appointment_time);
  const dateStr = apptDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = apptDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  let reminderText = req.body.message_override ||
    appt.reminder_message ||
    `Hello ${appt.patient?.name}, this is a reminder for your dental clinic appointment on ${dateStr} at ${timeStr}.`;

  // --- Get Messenger Page token for clinic ---
  const { data: clinicRow, error: clinicError } = await supabase
    .from('clinics')
    .select('fb_page_access_token')
    .eq('id', clinicId)
    .single();
  const pageToken = clinicRow?.fb_page_access_token;
  if (clinicError || !pageToken) {
    return res.status(400).json({ error: 'No Messenger Page token found for this clinic.' });
  }

  // Messenger Send
  try {
    await sendMessage(messenger_id, reminderText, pageToken); // <-- Pass the token here!

    // Log sent reminder, using the new uniqueness logic (with sent_on_date)
    const sent_on_date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      await supabase.from('appointment_reminders').insert({
        appointment_id: appointmentId,
        sent_on: new Date().toISOString(),
        days_ahead: req.body.days_ahead || null,
        messenger_id,
        message: reminderText,
        sent_on_date,
        is_manual: true,
        clinic_id: clinicId
      });
      // No unique constraint will block manual reminders!
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Reminder already sent for this recipient/appointment/day.' });
      }
      throw err;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error sending Messenger reminder:", err);
    res.status(500).json({ error: 'Failed to send Messenger reminder.' });
  }
});

module.exports = router;
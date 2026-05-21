// Express.js API routes for full reminder control, now clinic-scoped (Supabase version)

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendMessage } = require('../webhook');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getAppointment(id, clinicId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .eq('deleted', false)
    .single();
  if (error) {
    console.error('Supabase error fetching appointment:', error);
    return null;
  }
  return data;
}

// --- Send SMS based on clinic provider ---
async function sendSMS(phone, text, clinic) {
  if (!phone) {
    console.log(`[SMS] Skipped — no phone number.`);
    return;
  }
  if (!clinic.sms_provider || clinic.sms_provider === 'none') {
    console.log(`[SMS] Skipped — no SMS provider configured for clinic "${clinic.name}".`);
    return;
  }
  if (clinic.sms_provider === 'semaphore') {
    await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: clinic.sms_api_key,
      number: phone,
      message: text,
      sendername: clinic.sms_sender || 'SEMAPHORE'
    });
    console.log(`✅ Sent Semaphore SMS to ${phone}`);
  } else if (clinic.sms_provider === 'twilio') {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${clinic.sms_api_key}/Messages.json`,
      new URLSearchParams({ To: phone, From: clinic.sms_sender, Body: text }),
      { auth: { username: clinic.sms_api_key, password: clinic.sms_api_secret } }
    );
    console.log(`✅ Sent Twilio SMS to ${phone}`);
  }
}

// GET: Fetch reminder settings & status for an appointment (clinic-scoped)
router.get('/:id/reminder-settings', async (req, res) => {
  const appointmentId = req.params.id;
  const clinicId = req.query.clinic_id;
  if (!clinicId) return res.status(400).json({ error: 'Missing clinic_id' });

  const appt = await getAppointment(appointmentId, clinicId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });

  const { data: sentRemindersRaw, error: logError } = await supabase
    .from('appointment_reminders')
    .select('id, days_ahead, sent_on, messenger_id, is_manual, message')
    .eq('appointment_id', appointmentId)
    .eq('clinic_id', clinicId)
    .order('sent_on', { ascending: false });

  if (logError) {
    return res.status(500).json({ error: 'Failed to fetch sent reminders' });
  }

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

  const appt = await getAppointment(appointmentId, clinicId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });

  const { reminder_enabled, reminder_days, reminder_message, reminder_recipient_type } = req.body;

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

  // ✅ Fetch clinic token, timezone, AND SMS config
  const { data: clinicRow, error: clinicError } = await supabase
    .from('clinics')
    .select('fb_page_access_token, time_zone, name, sms_provider, sms_api_key, sms_api_secret, sms_sender')
    .eq('id', clinicId)
    .single();

  if (clinicError || !clinicRow) {
    return res.status(400).json({ error: 'Clinic not found.' });
  }

  const pageToken = clinicRow?.fb_page_access_token;

  // Fetch appointment & patient info
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (
        messenger_id,
        name,
        phone
      )
    `)
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .single();

  if (apptErr || !appt) return res.status(404).json({ error: 'Appointment not found for this clinic' });
  if (!appt.reminder_enabled) return res.status(400).json({ error: 'Reminders for this appointment are disabled.' });

  const messenger_id = req.body.recipient_override ||
    (appt.patient?.messenger_id ? appt.patient.messenger_id : appt.guardian_messenger_id);
  const phone = appt.patient?.phone || null;

  if (!messenger_id && !phone) {
    return res.status(400).json({ error: 'No Messenger ID or phone number found for patient.' });
  }

  // ✅ Use clinic timezone
  const clinicTZ = clinicRow?.time_zone || 'Asia/Manila';
  const apptDate = new Date(appt.appointment_time);
  const dateStr = apptDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: clinicTZ
  });
  const timeStr = apptDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: clinicTZ
  });

  let reminderText = req.body.message_override ||
    appt.reminder_message ||
    `Hello ${appt.patient?.name}, this is a reminder for your dental clinic appointment on ${dateStr} at ${timeStr}.`;

  // ✅ Try Messenger first, fall back to SMS
  let sent = false;
  let channelUsed = null;

  if (messenger_id && pageToken) {
    try {
      await sendMessage(messenger_id, reminderText, { pageAccessToken: pageToken });
      sent = true;
      channelUsed = 'messenger';
    } catch (err) {
      const fbErrCode = err?.response?.data?.error?.code;
      if (fbErrCode === 10) {
        console.log(`[reminders.js] Messenger window closed for ${messenger_id} — falling back to SMS.`);
      } else {
        console.error(`[reminders.js] Messenger error:`, err?.response?.data || err.message);
      }
    }
  }

  if (!sent && phone) {
    try {
      await sendSMS(phone, reminderText, clinicRow);
      sent = true;
      channelUsed = 'sms';
    } catch (err) {
      console.error(`[reminders.js] SMS error:`, err?.response?.data || err.message);
    }
  }

  if (!sent) {
    return res.status(500).json({ error: 'Failed to send reminder via Messenger or SMS.' });
  }

  // Log sent reminder
  const sent_on_date = new Date().toISOString().slice(0, 10);
  const logId = messenger_id || phone;
  try {
    await supabase.from('appointment_reminders').insert({
      appointment_id: appointmentId,
      sent_on: new Date().toISOString(),
      days_ahead: req.body.days_ahead || null,
      messenger_id: logId,
      message: reminderText,
      sent_on_date,
      is_manual: true,
      clinic_id: clinicId
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Reminder already sent for this recipient/appointment/day.' });
    }
    throw err;
  }

  res.json({ success: true, channel: channelUsed });
});

module.exports = router;
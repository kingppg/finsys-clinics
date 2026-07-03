// Express.js API routes for full reminder control, now clinic-scoped (Supabase version)

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Direct Messenger send so we can DETECT failure (e.g. 24h window closed) and
// fall back to SMS. We do NOT use the shared sendMessage from webhook here: it
// swallows its own errors and never throws, so this route would always think
// the send succeeded and never fall back. Throws on failure by design.
async function sendMessengerMessage(messenger_id, text, page_access_token) {
  await axios.post(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${page_access_token}`,
    {
      recipient: { id: messenger_id },
      message: { text },
      // UPDATE = proactive message within the 24h window (the old MESSAGE_TAG /
      // CONFIRMED_EVENT_UPDATE tag is deprecated and rejected by Facebook).
      messaging_type: "UPDATE"
    }
  );
}

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
// Returns true only if an SMS was actually sent.
async function sendSMS(phone, text, clinic) {
  if (!phone) {
    console.log(`[SMS] Skipped — no phone number.`);
    return false;
  }
  if (!clinic.sms_provider || clinic.sms_provider === 'none') {
    console.log(`[SMS] Skipped — no SMS provider configured for clinic "${clinic.name}".`);
    return false;
  }
  if (clinic.sms_provider === 'semaphore') {
    await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: clinic.sms_api_key,
      number: phone,
      message: text,
      sendername: clinic.sms_sender || 'SEMAPHORE'
    });
    console.log(`✅ Sent Semaphore SMS to ${phone}`);
    return true;
  } else if (clinic.sms_provider === 'twilio') {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${clinic.sms_api_key}/Messages.json`,
      new URLSearchParams({ To: phone, From: clinic.sms_sender, Body: text }),
      { auth: { username: clinic.sms_api_key, password: clinic.sms_api_secret } }
    );
    console.log(`✅ Sent Twilio SMS to ${phone}`);
    return true;
  }
  return false;
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

  // ✅ Fix #14 & #17: Support template variables and ensure patient name exists
  let reminderText = req.body.message_override ||
    appt.reminder_message ||
    `Hello ${appt.patient?.name || 'there'}, this is a reminder for your dental clinic appointment on ${dateStr} at ${timeStr}.`;

  // Support template variables for customization
  reminderText = reminderText
    .replace(/\[PATIENT_NAME\]/g, appt.patient?.name || 'there')
    .replace(/\[DATE\]/g, dateStr)
    .replace(/\[TIME\]/g, timeStr);

  // ✅ Try Messenger first, fall back to SMS
  let sent = false;
  let channelUsed = null;

  if (messenger_id && pageToken) {
    try {
      await sendMessengerMessage(messenger_id, reminderText, pageToken);
      sent = true;
      channelUsed = 'messenger';
    } catch (err) {
      const fbErrCode = err?.response?.data?.error?.code;
      // 10 = outside 24h window; 100/1893061 = deprecated tag / not allowed.
      if (fbErrCode === 10 || fbErrCode === 100) {
        console.log(`[reminders.js] Messenger not deliverable to ${messenger_id} (out of window) — falling back to SMS.`);
      } else {
        console.error(`[reminders.js] Messenger error:`, err?.response?.data || err.message);
      }
    }
  }

  // Only mark sent if an SMS truly went out (no provider / no phone => false).
  if (!sent && phone) {
    try {
      const smsSent = await sendSMS(phone, reminderText, clinicRow);
      if (smsSent) {
        sent = true;
        channelUsed = 'sms';
      }
    } catch (err) {
      console.error(`[reminders.js] SMS error:`, err?.response?.data || err.message);
    }
  }

  if (!sent) {
    return res.status(500).json({
      error: 'Reminder not delivered. The patient is outside the 24-hour Messenger window (they must message the page first), and no SMS was sent — configure an SMS provider in clinic settings and make sure the patient has a phone number.'
    });
  }

  // ✅ Fix #16: Log sent reminder, but don't fail response if logging fails
  // (Message was already sent successfully; logging is best-effort audit trail)
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
      console.log('[reminders.js] Duplicate reminder log detected (already sent):', appointmentId);
    } else {
      console.error('[reminders.js] Error logging reminder (non-fatal):', err.message);
    }
  }

  res.json({ success: true, channel: channelUsed });
});

module.exports = router;
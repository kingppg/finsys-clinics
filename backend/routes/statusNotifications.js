// backend/routes/statusNotifications.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase env vars are missing!');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Direct Messenger send that THROWS on failure, so we can detect a closed 24h
// window and fall back to SMS. The shared sendMessage swallows errors, so it
// would always look successful and never fall back.
async function sendMessengerMessage(messenger_id, text, page_access_token) {
  await axios.post(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${page_access_token}`,
    {
      recipient: { id: messenger_id },
      message: { text },
      // UPDATE = proactive in-window message (deprecated CONFIRMED_EVENT_UPDATE
      // tag is rejected by Facebook).
      messaging_type: "UPDATE"
    }
  );
}

async function getAppointmentWithPatient(id, clinicId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (
        messenger_id,
        name,
        phone
      )
    `)
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .single();

  if (error) {
    console.error('[status-notifications] Supabase error:', error);
    return null;
  }
  if (!data) {
    console.error('[status-notifications] No appointment found for id:', id);
    return null;
  }
  return {
    ...data,
    messenger_id: data.patient?.messenger_id,
    patient_name: data.patient?.name,
    patient_phone: data.patient?.phone,
  };
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

// POST /status-notifications/:appointmentId
router.post('/:appointmentId', async (req, res) => {
  const appointmentId = req.params.appointmentId;
  const { status, message, recipient, clinic_id } = req.body;

  console.log('[status-notifications] Incoming:', { appointmentId, status, message, recipient, clinic_id });

  const appt = await getAppointmentWithPatient(appointmentId, clinic_id);
  if (!appt) {
    console.error('[status-notifications] Appointment not found');
    return res.status(404).json({ error: 'Appointment not found' });
  }

  // ✅ Fetch clinic with SMS config AND timezone
  const { data: clinicRow, error: clinicError } = await supabase
    .from('clinics')
    .select('fb_page_access_token, name, contact_phone, time_zone, sms_provider, sms_api_key, sms_api_secret, sms_sender, status_templates')
    .eq('id', clinic_id)
    .single();

  if (clinicError || !clinicRow) {
    return res.status(400).json({ error: 'Clinic not found.' });
  }

  const pageToken = clinicRow?.fb_page_access_token;
  const clinicName = clinicRow?.name || 'your clinic';
  const clinicPhone = clinicRow?.contact_phone || null;

  // ✅ Use clinic timezone instead of hardcoded Asia/Manila
  const clinicTZ = clinicRow?.time_zone || 'Asia/Manila';
  const apptDate = new Date(appt.appointment_time);
  const dateStr = apptDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: clinicTZ
  });
  const timeStr = apptDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: clinicTZ
  });

  // Token substitution for status messages. Clinic-editable templates AND the
  // built-in defaults use [TOKENS]; this fills them with the real values.
  const fillTokens = (tpl) => String(tpl)
    .replace(/\[PATIENT_NAME\]/g, appt.patient_name || 'there')
    .replace(/\[DATE\]/g, dateStr)
    .replace(/\[TIME\]/g, timeStr)
    .replace(/\[CLINIC\]/g, clinicName)
    .replace(/\[CLINIC_PHONE\]/g, clinicPhone || 'the clinic');

  // Built-in defaults — emoji-free and plain-ASCII so they send as cheap GSM
  // (an emoji or em dash would force the whole SMS to ~2x-cost Unicode). Used
  // when the clinic hasn't set its own template for that status.
  const STATUS_DEFAULTS = {
    "Scheduled":  "Hello [PATIENT_NAME], this is [CLINIC]. Your appointment has been scheduled for [DATE] at [TIME]. See you then!",
    "Confirmed":  "Hello [PATIENT_NAME], this is [CLINIC]. Your appointment on [DATE] at [TIME] has been confirmed. We look forward to seeing you!",
    "Checked-In": "Hi [PATIENT_NAME]! You're now checked in at [CLINIC]. Please have a seat and relax, we'll be with you shortly. Thank you for your patience!",
    "Completed":  "Hello [PATIENT_NAME], this is [CLINIC]. Thank you for coming to your appointment on [DATE]. We hope to see you again soon!",
    "No Show":    "Hello [PATIENT_NAME], this is [CLINIC]. We noticed you missed your appointment on [DATE] at [TIME]. You may reach us at [CLINIC_PHONE].",
    "Cancelled":  "Hello [PATIENT_NAME], this is [CLINIC]. Your appointment on [DATE] at [TIME] has been cancelled. You may reach us at [CLINIC_PHONE].",
  };

  // Precedence: explicit typed message → clinic status template → built-in default → generic.
  const clinicStatusTpl = clinicRow.status_templates && clinicRow.status_templates[status];
  const finalMsg =
    (message && message.trim() ? message : null) ||
    (clinicStatusTpl && String(clinicStatusTpl).trim() ? fillTokens(clinicStatusTpl) : null) ||
    (STATUS_DEFAULTS[status] ? fillTokens(STATUS_DEFAULTS[status]) : null) ||
    `Hello ${appt.patient_name}, this is ${clinicName}. Your appointment status has been updated to "${status}" as of ${dateStr} at ${timeStr}.`;

  const messenger_id = recipient || appt.messenger_id || appt.guardian_messenger_id;
  const phone = appt.patient_phone || null;

  // ✅ If no way to reach patient at all
  if (!messenger_id && !phone) {
    if (req.io) {
      req.io.emit('appointment-updated', {
        ...appt,
        status,
        checked_in_at: status === 'Checked-In' ? new Date().toISOString() : null,
      });
    }
    const sent_on_date = new Date().toISOString().slice(0, 10);
    try {
      await supabase.from('appointment_reminders').insert({
        appointment_id: appointmentId,
        sent_on: new Date().toISOString(),
        days_ahead: null,
        messenger_id: null,
        message: `Status updated to "${status}" but no notification sent — no Messenger ID or phone on file.`,
        sent_on_date,
        is_manual: true,
        clinic_id,
      });
    } catch (dbErr) {
      console.error("[status-notifications] Log error:", dbErr);
    }
    return res.status(200).json({
      success: true,
      sent: false,
      warning: 'No Messenger ID or phone number on file. Status was updated but patient was not notified.'
    });
  }

  // ✅ Try Messenger first, fall back to SMS
  let sent = false;
  let channelUsed = null;

  if (messenger_id && pageToken) {
    try {
      await sendMessengerMessage(messenger_id, finalMsg, pageToken);
      sent = true;
      channelUsed = 'messenger';
    } catch (err) {
      const fbErrCode = err?.response?.data?.error?.code;
      // 10 = outside 24h window; 100/1893061 = deprecated tag / not allowed.
      if (fbErrCode === 10 || fbErrCode === 100) {
        console.log(`[status-notifications] Messenger not deliverable to ${messenger_id} (out of window) — falling back to SMS.`);
      } else {
        console.error(`[status-notifications] Messenger error:`, err?.response?.data || err.message);
      }
    }
  }

  // Only mark sent if an SMS truly went out (no provider / no phone => false).
  if (!sent && phone) {
    try {
      const smsSent = await sendSMS(phone, finalMsg, clinicRow);
      if (smsSent) {
        sent = true;
        channelUsed = 'sms';
      }
    } catch (err) {
      console.error(`[status-notifications] SMS error:`, err?.response?.data || err.message);
    }
  }

  // ✅ FIX: If all notification channels failed, still return 200 with sent: false
  // so the frontend shows a warning instead of an error modal.
  // The status was already saved in Supabase before this route was called.
  if (!sent) {
    if (req.io) {
      req.io.emit('appointment-updated', {
        ...appt,
        status,
        checked_in_at: status === 'Checked-In' ? new Date().toISOString() : appt.checked_in_at,
      });
    }
    const sent_on_date = new Date().toISOString().slice(0, 10);
    try {
      await supabase.from('appointment_reminders').insert({
        appointment_id: appointmentId,
        sent_on: new Date().toISOString(),
        days_ahead: null,
        messenger_id: messenger_id || phone,
        message: `Status updated to "${status}" but notification failed — Messenger and SMS both unsuccessful.`,
        sent_on_date,
        is_manual: true,
        clinic_id,
      });
    } catch (dbErr) {
      console.error("[status-notifications] Log error:", dbErr);
    }
    return res.status(200).json({
      success: true,
      sent: false,
      warning: 'Status saved but notification could not be sent via Messenger or SMS.'
    });
  }

  // Log in DB
  const sent_on_date = new Date().toISOString().slice(0, 10);
  const logId = messenger_id || phone;
  try {
    await supabase.from('appointment_reminders').insert({
      appointment_id: appointmentId,
      sent_on: new Date().toISOString(),
      days_ahead: null,
      messenger_id: logId,
      message: finalMsg,
      sent_on_date,
      is_manual: true,
      clinic_id,
    });
  } catch (dbErr) {
    console.error("[status-notifications] Supabase log error:", dbErr);
  }

  // Emit socket event
  if (req.io) {
    req.io.emit('appointment-updated', {
      ...appt,
      status,
      checked_in_at: status === 'Checked-In' ? new Date().toISOString() : null,
    });
  }

  res.json({ success: true, sent: true, channel: channelUsed });
});

module.exports = router;
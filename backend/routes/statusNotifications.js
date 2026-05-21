// backend/routes/statusNotifications.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendMessage } = require('../webhook');
const axios = require('axios');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase env vars are missing!');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    .select('fb_page_access_token, name, contact_phone, time_zone, sms_provider, sms_api_key, sms_api_secret, sms_sender')
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

  const finalMsg = message || defaultMessages[status] ||
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
      await sendMessage(messenger_id, finalMsg, { pageAccessToken: pageToken });
      sent = true;
      channelUsed = 'messenger';
    } catch (err) {
      const fbErrCode = err?.response?.data?.error?.code;
      if (fbErrCode === 10) {
        console.log(`[status-notifications] Messenger window closed for ${messenger_id} — falling back to SMS.`);
      } else {
        console.error(`[status-notifications] Messenger error:`, err?.response?.data || err.message);
      }
    }
  }

  if (!sent && phone) {
    try {
      await sendSMS(phone, finalMsg, clinicRow);
      sent = true;
      channelUsed = 'sms';
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
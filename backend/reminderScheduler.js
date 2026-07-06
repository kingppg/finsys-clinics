require('dotenv').config();

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// --- Supabase Client ---
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
  process.exit(1);
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --- Send Messenger message ---
async function sendMessengerMessage(messenger_id, text, page_access_token) {
  if (!messenger_id || !page_access_token) return;
  await axios.post(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${page_access_token}`,
    {
      recipient: { id: messenger_id },
      message: { text },
      // UPDATE = proactive message within the 24h window. The old MESSAGE_TAG /
      // CONFIRMED_EVENT_UPDATE tag is deprecated (FB error 1893061) and always
      // rejected now. Out-of-window patients can't be reached via Messenger at
      // all without approved templates — those fall through to SMS below.
      messaging_type: "UPDATE",
    }
  );
  console.log(`✅ Sent Messenger reminder to ${messenger_id}`);
}

// --- Send SMS via Semaphore ---
async function sendSemaphoreSMS(phone, text, apiKey, senderName) {
  if (!phone || !apiKey) return false;
  await axios.post('https://api.semaphore.co/api/v4/messages', {
    apikey: apiKey,
    number: phone,
    message: text,
    sendername: senderName || 'SEMAPHORE'
  });
  console.log(`✅ Sent Semaphore SMS to ${phone}`);
  return true;
}

// --- Send SMS via Twilio ---
async function sendTwilioSMS(phone, text, accountSid, authToken, fromNumber) {
  if (!phone || !accountSid || !authToken || !fromNumber) return false;
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    new URLSearchParams({
      To: phone,
      From: fromNumber,
      Body: text
    }),
    {
      auth: { username: accountSid, password: authToken }
    }
  );
  console.log(`✅ Sent Twilio SMS to ${phone}`);
  return true;
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
    return await sendSemaphoreSMS(phone, text, clinic.sms_api_key, clinic.sms_sender);
  } else if (clinic.sms_provider === 'twilio') {
    return await sendTwilioSMS(phone, text, clinic.sms_api_key, clinic.sms_api_secret, clinic.sms_sender);
  }
  return false;
}

// --- Get all clinics ---
async function getAllClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select('id, name, fb_page_access_token, reminder_time, time_zone, sms_provider, sms_api_key, sms_api_secret, sms_sender, reminder_template')
    .not('reminder_time', 'is', null);

  if (error) {
    console.error("❌ Supabase error fetching clinics:", error);
    return [];
  }
  return data || [];
}

// --- Get appointments with reminders enabled for a clinic ---
async function getAppointmentsWithReminders(clinic_id) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (messenger_id, name, phone)
    `)
    .eq('clinic_id', clinic_id)
    .eq('deleted', false)
    .neq('status', 'Cancelled')
    .eq('reminder_enabled', true)
    .gt('appointment_time', new Date().toISOString());

  if (error) {
    console.error("❌ Supabase error fetching appointments:", error);
    return [];
  }

  return (data || []).filter(appt =>
    (appt.patient && appt.patient.messenger_id && appt.patient.messenger_id !== '') ||
    (appt.guardian_messenger_id && appt.guardian_messenger_id !== '') ||
    (appt.patient && appt.patient.phone && appt.patient.phone !== '')
  );
}

function getTodayInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function isDaysBefore(appointment_time, daysAhead, timeZone) {
  const appointmentDate = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(appointment_time))
  );
  const todayStr = getTodayInTimezone(timeZone);
  const today = new Date(todayStr);
  const timeDiff = appointmentDate.getTime() - today.getTime();
  const days = Math.round(timeDiff / (1000 * 60 * 60 * 24));
  return days === daysAhead;
}

function parseReminderDays(reminder_days) {
  if (!reminder_days || (Array.isArray(reminder_days) && reminder_days.length === 0)) return [];
  if (Array.isArray(reminder_days)) {
    return reminder_days.map(d => Number(d)).filter(d => !isNaN(d));
  }
  if (typeof reminder_days === 'string') {
    try {
      const arr = JSON.parse(reminder_days);
      if (Array.isArray(arr)) return arr.map(d => Number(d)).filter(d => !isNaN(d));
    } catch { /* ignore */ }
    return reminder_days.split(',').map(d => Number(d.trim())).filter(d => !isNaN(d));
  }
  return [];
}

async function alreadySentReminder(appointment_id, daysAhead, messenger_id, todayStr) {
  const { data, error } = await supabase
    .from('appointment_reminders')
    .select('id')
    .eq('appointment_id', appointment_id)
    .eq('days_ahead', daysAhead)
    .eq('messenger_id', messenger_id)
    .eq('sent_on_date', todayStr)
    .eq('is_manual', false)
    .maybeSingle();
  return !!(data && data.id);
}

async function logReminder({ appointment_id, daysAhead, messenger_id, reminderText, todayStr, clinic_id }) {
  const { error } = await supabase
    .from('appointment_reminders')
    .insert([{
      appointment_id,
      sent_on: new Date().toISOString(),
      days_ahead: daysAhead,
      messenger_id,
      message: reminderText,
      sent_on_date: todayStr,
      is_manual: false,
      clinic_id
    }]);
  if (error) {
    if (!String(error.message).toLowerCase().includes('duplicate')) {
      console.error("❌ Error logging reminder:", error);
    }
  }
}

async function sendRemindersForClinic(clinicArg) {
  // Re-fetch the clinic FRESH each run so config edits (reminder_template,
  // sms_sender, sms_api_secret, token, etc.) take effect on the next send. The
  // scheduled job closure can hold a STALE snapshot: rescheduleJobs only rebuilds
  // a job when reminder_time / token / time_zone / sms_provider / sms_api_key
  // change, so any OTHER field would never refresh until a process restart.
  // Falls back to the captured snapshot if the refetch fails. (Fires ~once/day
  // per clinic, so the extra read is negligible.)
  let clinic = clinicArg;
  const { data: freshClinic } = await supabase
    .from('clinics')
    .select('id, name, fb_page_access_token, reminder_time, time_zone, sms_provider, sms_api_key, sms_api_secret, sms_sender, reminder_template')
    .eq('id', clinicArg.id)
    .single();
  if (freshClinic) clinic = freshClinic;

  const clinic_id = clinic.id;
  const page_access_token = clinic.fb_page_access_token;
  const clinic_name = clinic.name;
  const timeZone = clinic.time_zone || 'Asia/Manila';
  // Clinic-wide default reminder template (used when an appointment has no
  // per-appointment message). Blank/null → fall through to the system default.
  const clinicTemplate =
    clinic.reminder_template && clinic.reminder_template.trim().length > 0
      ? clinic.reminder_template
      : null;

  console.log(`[ReminderScheduler][${clinic_name}] sendRemindersForClinic started (timezone: ${timeZone})`);
  const appointments = await getAppointmentsWithReminders(clinic_id);
  console.log(`[${clinic_name}] Found ${appointments.length} appointments with reminders enabled.`);

  const todayStr = getTodayInTimezone(timeZone);

  for (const appt of appointments) {
    const reminderDays = parseReminderDays(appt.reminder_days);
    if (!reminderDays || reminderDays.length === 0) continue;

    for (const daysAhead of reminderDays) {
      if (!isDaysBefore(appt.appointment_time, daysAhead, timeZone)) continue;

      const recipientMessengerId =
        (appt.patient && appt.patient.messenger_id) || appt.guardian_messenger_id;
      const recipientPhone = appt.patient?.phone || null;

      // Skip if no way to reach patient at all
      if (!recipientMessengerId && !recipientPhone) continue;

      // ✅ Fix #15: Dedup by (appointment, days_ahead, recipient, date)
      // Use messenger_id as the unique key for dedup; fall back to phone
      // Note: Current design sends via ONE channel (messenger → SMS fallback), not both.
      // If sending via both channels is needed in future, dedup logic must change.
      const dedupId = recipientMessengerId || recipientPhone;

      const alreadySent = await alreadySentReminder(appt.id, daysAhead, dedupId, todayStr);
      if (alreadySent) continue;

      // Format appointment date/time
      const apptDate = new Date(appt.appointment_time);
      const dateStr = apptDate.toLocaleDateString('en-US', {
        timeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const timeStr = apptDate.toLocaleTimeString('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      // ✅ Fix #14 & #17: Use template variables and ensure patient name exists
      // Precedence: per-appointment message → clinic default template → system default.
      let reminderText = appt.reminder_message && appt.reminder_message.trim().length > 0
        ? appt.reminder_message
        : (clinicTemplate
          || `Hello ${appt.patient?.name || 'there'}, this is a reminder for your dental clinic appointment on ${dateStr} at ${timeStr}.`);

      // Support template variables for customization
      reminderText = reminderText
        .replace(/\[PATIENT_NAME\]/g, appt.patient?.name || 'there')
        .replace(/\[DATE\]/g, dateStr)
        .replace(/\[TIME\]/g, timeStr);

      // --- Try Messenger first, fall back to SMS ---
      let sent = false;

      if (recipientMessengerId && page_access_token) {
        try {
          await sendMessengerMessage(recipientMessengerId, reminderText, page_access_token);
          sent = true;
        } catch (err) {
          const fbErrCode = err?.response?.data?.error?.code;
          // 10 = outside 24h window; 100/1893061 = deprecated tag / not allowed.
          if (fbErrCode === 10 || fbErrCode === 100) {
            console.log(`[${clinic_name}] Messenger not deliverable to ${recipientMessengerId} (out of window) — falling back to SMS.`);
          } else {
            console.error(`[${clinic_name}] Messenger error for appt ${appt.id}:`, err?.response?.data || err.message);
          }
        }
      }

      // Fall back to SMS. Only mark as sent if an SMS actually went out — a
      // clinic with no SMS provider (or a patient with no phone) must NOT be
      // logged as "reminded", or dedup would block it forever. (false-sent bug)
      if (!sent && recipientPhone) {
        try {
          const smsSent = await sendSMS(recipientPhone, reminderText, clinic);
          if (smsSent) sent = true;
        } catch (err) {
          console.error(`[${clinic_name}] SMS error for appt ${appt.id}:`, err?.response?.data || err.message);
        }
      }

      if (!sent) {
        console.log(`[${clinic_name}] Could not send reminder for appt ${appt.id} — Messenger out of window and no SMS sent (check SMS provider / patient phone).`);
        continue;
      }

      await logReminder({
        appointment_id: appt.id,
        daysAhead,
        messenger_id: dedupId,
        reminderText,
        todayStr,
        clinic_id
      });

      console.log(`[${clinic_name}] Logged reminder for appointment ${appt.id}, ${daysAhead} days ahead.`);
    }
  }
}

// --- HOT-RELOAD SCHEDULER ---
const scheduledJobs = new Map();

async function rescheduleJobs() {
  const clinics = await getAllClinics();

  for (const [clinicId, jobMeta] of scheduledJobs) {
    const clinic = clinics.find(c => c.id === clinicId);
    if (
      !clinic ||
      jobMeta.reminder_time !== clinic.reminder_time ||
      jobMeta.fb_page_access_token !== clinic.fb_page_access_token ||
      jobMeta.time_zone !== clinic.time_zone ||
      jobMeta.sms_provider !== clinic.sms_provider ||
      jobMeta.sms_api_key !== clinic.sms_api_key
    ) {
      jobMeta.job.stop();
      scheduledJobs.delete(clinicId);
      console.log(`[ReminderScheduler] Removed job for clinic "${jobMeta.name}" (ID ${clinicId})`);
    }
  }

  for (const clinic of clinics) {
    if (!scheduledJobs.has(clinic.id)) {
      const timeZone = clinic.time_zone || 'Asia/Manila';
      // Let node-cron own the timezone: it fires the CLINIC-LOCAL "HH:MM" in the
      // clinic's zone, handling DST and removing any dependency on the server
      // clock being UTC. (Replaces the old manual local→UTC conversion.)
      const [rh, rm] = String(clinic.reminder_time || '9:00').split(':');
      const cronStr = `${parseInt(rm || '0', 10)} ${parseInt(rh, 10)} * * *`;
      const job = cron.schedule(cronStr, async () => {
        try {
          await sendRemindersForClinic(clinic);
        } catch (err) {
          console.error(`[ReminderScheduler][${clinic.name}] Error in scheduled reminder:`, err.stack || err);
        }
      }, { timezone: timeZone });
      scheduledJobs.set(clinic.id, {
        job,
        reminder_time: clinic.reminder_time,
        fb_page_access_token: clinic.fb_page_access_token,
        time_zone: timeZone,
        sms_provider: clinic.sms_provider,
        sms_api_key: clinic.sms_api_key,
        name: clinic.name
      });
      console.log(`[ReminderScheduler] Scheduled reminders for clinic "${clinic.name}" (ID ${clinic.id}) at ${clinic.reminder_time} local (cron "${cronStr}" in ${timeZone})`);
    }
  }
}

rescheduleJobs();
setInterval(rescheduleJobs, 1 * 60000);

process.on('SIGINT', () => {
  for (const [_, jobMeta] of scheduledJobs) jobMeta.job.stop();
  console.log('Gracefully stopped all scheduled jobs.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  for (const [_, jobMeta] of scheduledJobs) jobMeta.job.stop();
  console.log('Gracefully stopped all scheduled jobs.');
  process.exit(0);
});

if (require.main === module) {
  (async () => {
    const clinics = await getAllClinics();
    for (const clinic of clinics) {
      await sendRemindersForClinic(clinic);
    }
    process.exit(0);
  })();
}
// Automated appointment reminders for Messenger bookings, dynamic cron per clinic with hot-reload
// NOW FULLY SUPABASE (no direct pg Pool/SQL)

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

// --- Clinic-aware functions ---

// Send Messenger message using clinic's page token
async function sendMessengerMessage(messenger_id, text, page_access_token) {
  if (!messenger_id || !page_access_token) return;
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${page_access_token}`,
      {
        recipient: { id: messenger_id },
        message: { text },
        messaging_type: "MESSAGE_TAG",        // ← ADD
        tag: "CONFIRMED_EVENT_UPDATE",         // ← ADD
      }
    );
    console.log(`✅ Sent Messenger reminder to ${messenger_id}: ${text}`);
  } catch (err) {
    console.error("❌ Error sending Messenger reminder:", err.response?.data || err.message, err.stack || '');
  }
}

// Get all clinics with Messenger token and reminder time
async function getAllClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select('id, name, fb_page_access_token, reminder_time, time_zone') // ✅ fetch time_zone
    .not('fb_page_access_token', 'is', null)
    .not('reminder_time', 'is', null);

  if (error) {
    console.error("❌ Supabase error fetching clinics:", error);
    return [];
  }
  return data || [];
}

// Get all upcoming appointments with reminders enabled for a specific clinic
async function getAppointmentsWithReminders(clinic_id) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patient_id (messenger_id, name)
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

  // Filter: must have patient.messenger_id or guardian_messenger_id
  return (data || []).filter(appt =>
    (appt.patient && appt.patient.messenger_id && appt.patient.messenger_id !== '') ||
    (appt.guardian_messenger_id && appt.guardian_messenger_id !== '')
  );
}

// ✅ Get "today" date string in the clinic's own timezone (e.g. 'Asia/Manila', 'Europe/Moscow')
function getTodayInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); // returns YYYY-MM-DD
}

// ✅ Check if appointment is exactly daysAhead from today in the clinic's timezone
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
    const vals = reminder_days.map(d => Number(d)).filter(d => !isNaN(d));
    return vals;
  }
  if (typeof reminder_days === 'string') {
    try {
      const arr = JSON.parse(reminder_days);
      if (Array.isArray(arr)) {
        const vals = arr.map(d => Number(d)).filter(d => !isNaN(d));
        return vals;
      }
    } catch { /* Ignore error */ }
    const vals = reminder_days.split(',').map(d => Number(d.trim())).filter(d => !isNaN(d));
    return vals;
  }
  return [];
}

// --- Supabase: get sent reminders (prevent duplicate) ---
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

// --- Supabase: log sent reminder ---
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

async function sendRemindersForClinic(clinic) {
  const clinic_id = clinic.id;
  const page_access_token = clinic.fb_page_access_token;
  const clinic_name = clinic.name;
  const timeZone = clinic.time_zone || 'Asia/Manila'; // ✅ use clinic's timezone, fallback to PH

  console.log(`[ReminderScheduler][${clinic_name}] sendRemindersForClinic started (timezone: ${timeZone})`);
  const appointments = await getAppointmentsWithReminders(clinic_id);
  console.log(`[${clinic_name}] Found ${appointments.length} appointments with reminders enabled.`);

  // ✅ Get today's date string in the clinic's own timezone
  const todayStr = getTodayInTimezone(timeZone);

  for (const appt of appointments) {
    const reminderDays = parseReminderDays(appt.reminder_days);
    if (!reminderDays || reminderDays.length === 0) continue;

    for (const daysAhead of reminderDays) {
      // ✅ Pass clinic timezone so "today" is computed correctly
      if (isDaysBefore(appt.appointment_time, daysAhead, timeZone)) {
        let recipientMessengerId = (appt.patient && appt.patient.messenger_id) || appt.guardian_messenger_id;
        if (!recipientMessengerId) continue;

        // Prevent duplicate reminders
        const alreadySent = await alreadySentReminder(appt.id, daysAhead, recipientMessengerId, todayStr);
        if (alreadySent) continue;

        // ✅ Format appointment date/time in the clinic's timezone
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

        let reminderText = appt.reminder_message && appt.reminder_message.trim().length > 0
          ? appt.reminder_message
          : `Hello ${appt.patient?.name || ''}, this is a reminder for your dental clinic appointment on ${dateStr} at ${timeStr}.`;

        reminderText += `\n\nSee you soon!`;

        await sendMessengerMessage(recipientMessengerId, reminderText, page_access_token);

        await logReminder({
          appointment_id: appt.id,
          daysAhead,
          messenger_id: recipientMessengerId,
          reminderText,
          todayStr,
          clinic_id
        });

        console.log(`[${clinic_name}] Logged reminder for appointment ${appt.id}, ${daysAhead} days ahead.`);
      }
    }
  }
}

// ✅ FIXED: Convert reminder_time (HH:MM:SS stored in clinic's local time) to UTC cron string
// Uses reliable Intl.DateTimeFormat.formatToParts instead of toLocaleString arithmetic
function getCronStringUTC(reminderTime, timeZone) {
  const parts = reminderTime.split(':');
  const localHour = parseInt(parts[0], 10);
  const localMinute = parseInt(parts[1] || '0', 10);

  // Get today's date string in the clinic's timezone (YYYY-MM-DD)
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);

  // Create a Date by treating the local time as UTC first (placeholder),
  // then find the actual UTC equivalent using the offset at that moment
  const naiveUTC = new Date(`${todayStr}T${String(localHour).padStart(2,'0')}:${String(localMinute).padStart(2,'0')}:00Z`);

  // Get what the clinic's timezone thinks this UTC moment is
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const localParts = formatter.formatToParts(naiveUTC);
  const displayedHour = parseInt(localParts.find(p => p.type === 'hour').value, 10);
  const displayedMinute = parseInt(localParts.find(p => p.type === 'minute').value, 10);

  // The difference between what we want and what naiveUTC displays in local TZ
  const diffMinutes = (localHour * 60 + localMinute) - (displayedHour * 60 + displayedMinute);

  // Adjust naiveUTC by the difference to land on the correct UTC time
  const correctUTC = new Date(naiveUTC.getTime() + diffMinutes * 60 * 1000);
  const utcHour = correctUTC.getUTCHours();
  const utcMinute = correctUTC.getUTCMinutes();

  console.log(`[ReminderScheduler] Clinic TZ: ${timeZone} | Local reminder time: ${reminderTime} | UTC cron: ${utcMinute} ${utcHour} * * *`);
  return `${utcMinute} ${utcHour} * * *`;
}

// --- HOT-RELOAD SCHEDULER LOGIC ---
const scheduledJobs = new Map();

async function rescheduleJobs() {
  const clinics = await getAllClinics();

  // Remove jobs for clinics that no longer exist or have changed time/token/timezone
  for (const [clinicId, jobMeta] of scheduledJobs) {
    const clinic = clinics.find(c => c.id === clinicId);
    if (
      !clinic ||
      jobMeta.reminder_time !== clinic.reminder_time ||
      jobMeta.fb_page_access_token !== clinic.fb_page_access_token ||
      jobMeta.time_zone !== clinic.time_zone // ✅ also re-schedule if timezone changed
    ) {
      jobMeta.job.stop();
      scheduledJobs.delete(clinicId);
      console.log(`[ReminderScheduler] Removed job for clinic "${jobMeta.name}" (ID ${clinicId})`);
    }
  }

  // Add jobs for new clinics or changed schedule
  for (const clinic of clinics) {
    if (!scheduledJobs.has(clinic.id)) {
      const timeZone = clinic.time_zone || 'Asia/Manila';
      // ✅ Convert clinic's local reminder_time to UTC cron string
      const cronStr = getCronStringUTC(clinic.reminder_time, timeZone);
      const job = cron.schedule(cronStr, async () => {
        try {
          await sendRemindersForClinic(clinic);
        } catch (err) {
          console.error(`[ReminderScheduler][${clinic.name}] Error in scheduled reminder:`, err.stack || err);
        }
      });
      scheduledJobs.set(clinic.id, {
        job,
        reminder_time: clinic.reminder_time,
        fb_page_access_token: clinic.fb_page_access_token,
        time_zone: timeZone, // ✅ store for change detection
        name: clinic.name
      });
      console.log(`[ReminderScheduler] Scheduled reminders for clinic "${clinic.name}" (ID ${clinic.id}) at ${clinic.reminder_time} ${timeZone} (UTC cron: ${cronStr})`);
    }
  }
}

// Initial scheduling
rescheduleJobs();

// Poll for changes every 1 minute
setInterval(rescheduleJobs, 1 * 60000);

// Graceful shutdown
process.on('SIGINT', () => {
  for (const [_, jobMeta] of scheduledJobs) {
    jobMeta.job.stop();
  }
  console.log('Gracefully stopped all scheduled jobs.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  for (const [_, jobMeta] of scheduledJobs) {
    jobMeta.job.stop();
  }
  console.log('Gracefully stopped all scheduled jobs.');
  process.exit(0);
});

// For manual running/testing (single clinic)
if (require.main === module) {
  (async () => {
    const clinics = await getAllClinics();
    for (const clinic of clinics) {
      await sendRemindersForClinic(clinic);
    }
    process.exit(0);
  })();
}
// backend/helpers/bookingHelpers.js
// All booking-related utility functions
// Contains: normalize, toTitleCase, to12HourFormat, to24HourFormat,
//           generateTimeSlots, isClinicOpen, getActiveDentists,
//           findPatientByMessengerId, findPatientByNameAndPhone,
//           getAvailableSlots, hasDoubleBookingOnDate, proceedToSlotSelection

const { createClient } = require('@supabase/supabase-js');
const { getUtcOffset, sendMessage } = require('./messengerHelpers');
const { normalizePHMobile } = require('./phone');
const { closedReasonFor, bookableSlots, normalizeSchedule, toMin } = require('./schedule');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function normalize(str) {
  return str.toLowerCase().replace(/[^\w ]/g, '').trim();
}

function toTitleCase(str) {
  return str.replace(/\b\w+/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function to12HourFormat(time24) {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${minStr} ${ampm}`;
}

function to24HourFormat(time12) {
  let [time, ampm] = time12.split(' ');
  let [h, m] = time.split(':');
  h = parseInt(h, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}

function generateTimeSlots(start = "09:00", end = "18:00", interval = 20) {
  const slots = [];
  let [hour, minute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  while (hour < endHour || (hour === endHour && minute < endMinute)) {
    const slot = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    slots.push(slot);
    minute += interval;
    if (minute >= 60) { hour += 1; minute = minute % 60; }
  }
  return slots.filter(slot => !["12:00", "12:20", "12:40"].includes(slot));
}

// Weekday of a YYYY-MM-DD string, independent of the server's timezone.
// new Date(dateStr).getDay() is UTC-midnight parsed but read in HOST-local
// time — correct only while the host runs UTC (true on Render today).
function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isClinicOpen(dateStr) {
  return getDayOfWeek(dateStr) !== 0;
}

// PH mobile validation now lives in ./phone (shared with the SMS send paths).
// Phone is REQUIRED at booking because SMS is the reminder fallback whenever
// Facebook's 24-hour messaging window has closed (always, days before an appt).
// Re-exported here so existing callers (webhook.js) keep importing it.

async function getActiveDentists(context) {
  const { data, error } = await supabase
    .from('dentists')
    .select('id,name')
    .eq('is_active', true)
    .eq('clinic_id', context.clinicId)
    .order('name', { ascending: true });
  if (error) { console.error("getActiveDentists error:", error); return []; }
  return data || [];
}

async function findPatientByMessengerId(messenger_id, context) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('messenger_id', messenger_id)
    .eq('clinic_id', context.clinicId)
    .maybeSingle();
  if (error) { console.error("findPatientByMessengerId error:", error); return null; }
  return data || null;
}

// allowNameOnly: when false, a match REQUIRES phone+name (no name-only fallback).
// Use strict matching when booking for someone else, so we never silently
// attach the appointment to a different person who happens to share the name.
async function findPatientByNameAndPhone(name, phone, context, allowNameOnly = true) {
  if (phone) {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('phone', phone)
      .ilike('name', name)
      .eq('clinic_id', context.clinicId)
      .limit(1);
    if (!error && data && data.length > 0) return data[0];
  }
  if (!allowNameOnly) return null;
  const { data: data2, error: error2 } = await supabase
    .from('patients')
    .select('*')
    .ilike('name', name)
    .eq('clinic_id', context.clinicId)
    .limit(1);
  if (error2) { console.error("findPatientByNameAndPhone error:", error2); return null; }
  return (data2 && data2.length > 0) ? data2[0] : null;
}

// Clinic holidays (service key → RLS bypassed). Small table, loaded per date-check.
async function getClinicHolidays(clinicId) {
  const { data, error } = await supabase
    .from('clinic_holidays')
    .select('holiday_date, is_recurring, is_blocked')
    .eq('clinic_id', clinicId);
  if (error) { console.error("getClinicHolidays error:", error); return []; }
  return data || [];
}

// Clinic-local start minutes (minutes past midnight) of an appointment instant.
function apptLocalMinutes(ts, timeZone) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ts));
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// Slots now come from the clinic's configured schedule (migration 024) via the
// shared engine (./schedule), not the old hardcoded 9–18/20-min/Sunday. Returns
// closedReason ('day' | 'holiday' | null) so the caller can explain a closure.
async function getAvailableSlots(dateStr, context) {
  const schedule = context.clinic?.schedule;
  const holidays = await getClinicHolidays(context.clinicId);
  const activeDentists = await getActiveDentists(context);

  const closedReason = closedReasonFor(schedule, holidays, dateStr);
  if (closedReason) return { slots: [], activeDentists, closedReason };
  if (!activeDentists.length) return { slots: [], activeDentists, closedReason: null };

  const interval = normalizeSchedule(schedule).slot_interval_minutes;
  const grid = bookableSlots(schedule, dateStr); // "HH:MM" starts, breaks removed
  const timeZone = context.timeZone || 'Asia/Manila';
  const offset = getUtcOffset(timeZone);
  const dayOfWeek = getDayOfWeek(dateStr);

  // Preload per dentist ONCE (not per slot): availability blocks + the day's
  // appointments. Booked detection is RANGE-MATCH — a slot [start, start+interval)
  // is taken if any active appointment STARTS within it — so appointments left
  // off-grid by an interval change still correctly block their slot.
  const startISO = `${dateStr}T00:00:00${offset}`;
  const endISO = `${dateStr}T23:59:59${offset}`;
  const perDentist = {};
  for (const dentist of activeDentists) {
    const { data: blocks, error: blocksErr } = await supabase
      .from('dentist_availability')
      .select('start_time,end_time,is_available')
      .eq('dentist_id', dentist.id)
      .or(`specific_date.eq.${dateStr},day_of_week.eq.${dayOfWeek}`)
      .eq('is_available', false)
      .eq('clinic_id', context.clinicId);
    if (blocksErr) { console.error("getAvailableSlots blocks error:", blocksErr); perDentist[dentist.id] = null; continue; }

    const { data: appts, error: apptErr } = await supabase
      .from('appointments')
      .select('appointment_time,status')
      .eq('dentist_id', dentist.id)
      .eq('clinic_id', context.clinicId)
      .gte('appointment_time', startISO)
      .lte('appointment_time', endISO);
    if (apptErr) { console.error("getAvailableSlots bookings error:", apptErr); perDentist[dentist.id] = null; continue; }

    perDentist[dentist.id] = {
      blocks: blocks || [],
      busyMins: (appts || [])
        .filter(a => (a.status || '').toLowerCase() !== 'cancelled')
        .map(a => apptLocalMinutes(a.appointment_time, timeZone)),
    };
  }

  const availableSlots = [];
  for (const slot of grid) {
    const [sh, sm] = slot.split(':').map(Number);
    const slotMin = sh * 60 + sm;
    let slotAvailable = false;
    for (const dentist of activeDentists) {
      const dd = perDentist[dentist.id];
      if (!dd) continue; // query error for this dentist → fail closed
      const blocked = dd.blocks.some(b => {
        const bs = toMin(b.start_time), be = toMin(b.end_time);
        return slotMin >= bs && slotMin < be;
      });
      if (blocked) continue;
      const busy = dd.busyMins.some(m => m >= slotMin && m < slotMin + interval);
      if (busy) continue;
      slotAvailable = true;
      break;
    }
    if (slotAvailable) availableSlots.push(to12HourFormat(slot));
  }

  // Today: hide slots already past (clinic-local now).
  const todayStrInTZ = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  let filteredSlots = availableSlots;
  if (dateStr === todayStrInTZ) {
    const nowInTZ = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
    const [nowH, nowM] = nowInTZ.split(':').map(Number);
    const nowMinutes = nowH * 60 + nowM;
    filteredSlots = availableSlots.filter(slot => {
      const [h, m] = to24HourFormat(slot).split(':').map(Number);
      return (h * 60 + m) > nowMinutes;
    });
  }

  return { slots: filteredSlots, activeDentists, closedReason: null };
}

// Is a specific dentist free at a specific slot? Blocks check + RANGE-MATCH
// booking check (same semantics as getAvailableSlots), used by the confirming
// path so its final re-verification matches how the slot was offered.
async function isDentistSlotFree(dentistId, dateStr, slot24, context) {
  const timeZone = context.timeZone || 'Asia/Manila';
  const offset = getUtcOffset(timeZone);
  const dayOfWeek = getDayOfWeek(dateStr);
  const interval = normalizeSchedule(context.clinic?.schedule).slot_interval_minutes;
  const [h, m] = slot24.split(':').map(Number);
  const slotMin = h * 60 + m;

  const { data: blocks, error: blocksErr } = await supabase.from('dentist_availability')
    .select('start_time,end_time,is_available').eq('dentist_id', dentistId)
    .or(`specific_date.eq.${dateStr},day_of_week.eq.${dayOfWeek}`)
    .eq('is_available', false).eq('clinic_id', context.clinicId);
  if (blocksErr) { console.error("isDentistSlotFree blocks error:", blocksErr); return false; }
  const blocked = (blocks || []).some(b => {
    const bs = toMin(b.start_time), be = toMin(b.end_time);
    return slotMin >= bs && slotMin < be;
  });
  if (blocked) return false;

  const startISO = `${dateStr}T00:00:00${offset}`;
  const endISO = `${dateStr}T23:59:59${offset}`;
  const { data: appts, error: apptErr } = await supabase.from('appointments')
    .select('appointment_time,status').eq('dentist_id', dentistId).eq('clinic_id', context.clinicId)
    .gte('appointment_time', startISO).lte('appointment_time', endISO);
  if (apptErr) { console.error("isDentistSlotFree appts error:", apptErr); return false; }
  const taken = (appts || [])
    .filter(a => (a.status || '').toLowerCase() !== 'cancelled')
    .some(a => { const mm = apptLocalMinutes(a.appointment_time, timeZone); return mm >= slotMin && mm < slotMin + interval; });
  return !taken;
}

async function hasDoubleBookingOnDate(patient_id, dateStr, context) {
  const offset = getUtcOffset(context.timeZone);
  const startISO = `${dateStr}T00:00:00${offset}`;
  const endISO = `${dateStr}T23:59:59${offset}`;
  const { data, error } = await supabase
    .from('appointments')
    .select('id,status')
    .eq('patient_id', patient_id)
    .gte('appointment_time', startISO)
    .lte('appointment_time', endISO)
    .eq('clinic_id', context.clinicId);
  if (error) { console.error("hasDoubleBookingOnDate error:", error); return false; }
  return (data || []).filter(a => a.status !== 'Cancelled').length > 0;
}

async function proceedToSlotSelection(sender_psid, userState, context, userStates) {
  const { slots, activeDentists } = await getAvailableSlots(userState.data.date, context);
  userState.data.slots = slots;
  userState.data.activeDentists = activeDentists;

  if (!activeDentists.length) {
    await sendMessage(sender_psid, "Pasensya na po, wala pang available na dentist ngayon. Pakisubukan mamaya. 😊", context);
    userStates[sender_psid] = { state: "default", data: {} };
    return false;
  }
  if (slots.length === 0) {
    await sendMessage(sender_psid, "Pasensya na po, puno na ang slots para sa araw na iyon. 😔 Pwede po kayong pumili ng ibang petsa?", context);
    userStates[sender_psid] = { state: "awaiting_date", data: {} };
    return false;
  }
  return true;
}

module.exports = {
  normalize,
  toTitleCase,
  to12HourFormat,
  to24HourFormat,
  getDayOfWeek,
  isClinicOpen,
  normalizePHMobile,
  getActiveDentists,
  getClinicHolidays,
  findPatientByMessengerId,
  findPatientByNameAndPhone,
  getAvailableSlots,
  isDentistSlotFree,
  hasDoubleBookingOnDate,
  proceedToSlotSelection
};
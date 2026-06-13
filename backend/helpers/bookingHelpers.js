// backend/helpers/bookingHelpers.js
// All booking-related utility functions
// Contains: normalize, toTitleCase, to12HourFormat, to24HourFormat,
//           generateTimeSlots, isClinicOpen, getActiveDentists,
//           findPatientByMessengerId, findPatientByNameAndPhone,
//           getAvailableSlots, hasDoubleBookingOnDate, proceedToSlotSelection

const { createClient } = require('@supabase/supabase-js');
const { getUtcOffset, sendMessage } = require('./messengerHelpers');

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

function isClinicOpen(dateStr) {
  return new Date(dateStr).getDay() !== 0;
}

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

async function getAvailableSlots(dateStr, context) {
  const activeDentists = await getActiveDentists(context);
  if (!activeDentists.length) return { slots: [], activeDentists };

  const baseSlots = generateTimeSlots("09:00", "18:00", 20);
  const availableSlots = [];
  const dayOfWeek = new Date(dateStr).getDay();
  const offset = getUtcOffset(context.timeZone);

  for (const slot of baseSlots) {
    let slotAvailable = false;

    for (const dentist of activeDentists) {
      const { data: blocks } = await supabase
        .from('dentist_availability')
        .select('start_time,end_time,is_available')
        .eq('dentist_id', dentist.id)
        .or(`specific_date.eq.${dateStr},day_of_week.eq.${dayOfWeek}`)
        .eq('is_available', false)
        .eq('clinic_id', context.clinicId);

      let isBlocked = false;
      for (const block of (blocks || [])) {
        const [blockStartH, blockStartM] = block.start_time.split(':').map(Number);
        const [blockEndH, blockEndM] = block.end_time.split(':').map(Number);
        const [slotH, slotM] = slot.split(':').map(Number);
        const slotMin = slotH * 60 + slotM;
        const blockStartMin = blockStartH * 60 + blockStartM;
        const blockEndMin = blockEndH * 60 + blockEndM;
        if (slotMin >= blockStartMin && slotMin < blockEndMin) {
          isBlocked = true;
          break;
        }
      }
      if (isBlocked) continue;

      const slotDateTime = `${dateStr}T${slot}:00${offset}`;
      const { data: bookings } = await supabase
        .from('appointments')
        .select('id,status')
        .eq('dentist_id', dentist.id)
        .eq('appointment_time', slotDateTime)
        .eq('clinic_id', context.clinicId);

      if ((bookings || []).some(b => (b.status || '').toLowerCase() !== 'cancelled')) continue;

      slotAvailable = true;
      break;
    }

    if (slotAvailable) {
      availableSlots.push(to12HourFormat(slot));
    }
  }

  const timeZone = context.timeZone || 'Asia/Manila';
  const todayStrInTZ = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  let filteredSlots = availableSlots;
  if (dateStr === todayStrInTZ) {
    const nowInTZ = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
    const [nowH, nowM] = nowInTZ.split(':').map(Number);
    const nowMinutes = nowH * 60 + nowM;

    filteredSlots = availableSlots.filter(slot => {
      const slot24 = to24HourFormat(slot);
      const [h, m] = slot24.split(':').map(Number);
      const slotMinutes = h * 60 + m;
      return slotMinutes > nowMinutes;
    });
  }

  return { slots: filteredSlots, activeDentists };
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
  isClinicOpen,
  getActiveDentists,
  findPatientByMessengerId,
  findPatientByNameAndPhone,
  getAvailableSlots,
  hasDoubleBookingOnDate,
  proceedToSlotSelection
};
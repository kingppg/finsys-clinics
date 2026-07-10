// backend/helpers/schedule.js
// The ONE canonical clinic-schedule engine (pure functions, no DB). Mirrored on
// the frontend as utils/schedule.ts — keep the two in lockstep (same pattern as
// phone.js/phone.ts). Both the booking bot and the staff form derive their slot
// grids, closed-days, breaks, and holiday closures from here, so they can never
// drift apart.
//
// Config shape (clinics.schedule JSONB, migration 024):
//   { days: { "0".."6": { is_closed, open "HH:MM", close "HH:MM" } },
//     breaks: [{ start, end, label }],
//     slot_interval_minutes: number }
// Holidays (clinic_holidays rows): { holiday_date "YYYY-MM-DD", is_recurring, is_blocked }

const DEFAULT_SCHEDULE = {
  days: {
    '0': { is_closed: true, open: '09:00', close: '18:00' },
    '1': { is_closed: false, open: '09:00', close: '18:00' },
    '2': { is_closed: false, open: '09:00', close: '18:00' },
    '3': { is_closed: false, open: '09:00', close: '18:00' },
    '4': { is_closed: false, open: '09:00', close: '18:00' },
    '5': { is_closed: false, open: '09:00', close: '18:00' },
    '6': { is_closed: false, open: '09:00', close: '18:00' },
  },
  breaks: [{ start: '12:00', end: '13:00', label: 'Lunch' }],
  slot_interval_minutes: 20,
};

// Weekday 0-6 (Sun=0) of a YYYY-MM-DD string, timezone-independent.
function dowOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Normalize a possibly-partial/absent schedule blob to a complete one.
function normalizeSchedule(schedule) {
  const s = schedule && typeof schedule === 'object' ? schedule : {};
  return {
    days: { ...DEFAULT_SCHEDULE.days, ...(s.days || {}) },
    breaks: Array.isArray(s.breaks) ? s.breaks : DEFAULT_SCHEDULE.breaks,
    slot_interval_minutes: Number(s.slot_interval_minutes) || DEFAULT_SCHEDULE.slot_interval_minutes,
  };
}

// The blocked holiday (if any) that closes this date — recurring = same
// month/day any year. Returns the holiday row (for UI labels) or null.
function blockedHolidayFor(holidays, dateStr) {
  const [, mm, dd] = String(dateStr).split('-');
  return (holidays || []).find(h => {
    if (!h || h.is_blocked === false) return false;
    if (h.is_recurring) {
      const [, hm, hd] = String(h.holiday_date).split('-');
      return hm === mm && hd === dd;
    }
    return h.holiday_date === dateStr;
  }) || null;
}

// Does a blocked holiday fall on this date?
function matchesBlockedHoliday(holidays, dateStr) {
  return blockedHolidayFor(holidays, dateStr) !== null;
}

// Why (if at all) the clinic is closed on this date: 'day' | 'holiday' | null.
function closedReasonFor(schedule, holidays, dateStr) {
  const s = normalizeSchedule(schedule);
  const day = s.days[String(dowOf(dateStr))];
  if (!day || day.is_closed) return 'day';
  if (matchesBlockedHoliday(holidays, dateStr)) return 'holiday';
  return null;
}

function isClinicOpenOn(schedule, holidays, dateStr) {
  return closedReasonFor(schedule, holidays, dateStr) === null;
}

// The full slot grid for a date: [{ time:"HH:MM", isBreak:bool }].
// Only whole slots that fit inside the open→close window are produced (a slot
// never runs past closing). A slot is a break slot if it overlaps any break.
// Returns [] if the day is closed by day-config (holiday closure is handled by
// the caller via closedReasonFor, so the two concerns stay separable).
function daySlots(schedule, dateStr) {
  const s = normalizeSchedule(schedule);
  const day = s.days[String(dowOf(dateStr))];
  if (!day || day.is_closed) return [];
  const interval = s.slot_interval_minutes;
  if (!interval || interval <= 0) return [];
  const startMin = toMin(day.open), endMin = toMin(day.close);
  const breaks = (s.breaks || []).map(b => ({ s: toMin(b.start), e: toMin(b.end) }));
  const out = [];
  for (let m = startMin; m + interval <= endMin; m += interval) {
    const isBreak = breaks.some(b => m < b.e && (m + interval) > b.s);
    out.push({ time: toHHMM(m), isBreak });
  }
  return out;
}

// Bookable slot start-times for a date (breaks removed) — what the bot offers.
function bookableSlots(schedule, dateStr) {
  return daySlots(schedule, dateStr).filter(x => !x.isBreak).map(x => x.time);
}

const DAY_TL = ['Linggo', 'Lunes', 'Martes', 'Miyerkoles', 'Huwebes', 'Biyernes', 'Sabado'];

function to12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Human-readable schedule summary for Claire's system prompt, so she answers
// "anong oras kayo bukas?" from the clinic's ACTUAL configured hours, not the
// old hardcoded Mon–Sat 9–6.
function describeSchedule(schedule) {
  const s = normalizeSchedule(schedule);
  const openLines = [];
  const closedDays = [];
  for (let d = 0; d <= 6; d++) {
    const day = s.days[String(d)];
    if (!day || day.is_closed) { closedDays.push(DAY_TL[d]); continue; }
    openLines.push(`${DAY_TL[d]}: ${to12(day.open)} - ${to12(day.close)}`);
  }
  const breaks = (s.breaks || []).map(b => `${to12(b.start)} - ${to12(b.end)}${b.label ? ` (${b.label})` : ''}`);
  return { openLines, closedDays, breaks, interval: s.slot_interval_minutes };
}

module.exports = {
  DEFAULT_SCHEDULE,
  dowOf,
  toMin,
  toHHMM,
  to12,
  normalizeSchedule,
  blockedHolidayFor,
  matchesBlockedHoliday,
  closedReasonFor,
  isClinicOpenOn,
  daySlots,
  bookableSlots,
  describeSchedule,
};

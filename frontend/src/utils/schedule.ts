// frontend/src/utils/schedule.ts
// Mirror of backend/helpers/schedule.js — keep the two in lockstep so the staff
// AppointmentForm and the booking bot derive identical slot grids, closed days,
// breaks, and holiday closures from the clinic's configured schedule
// (clinics.schedule + clinic_holidays, migration 024).

export type DayCfg = { is_closed: boolean; open: string; close: string };
export type BreakCfg = { start: string; end: string; label?: string };
export type Schedule = {
  days: Record<string, DayCfg>;
  breaks: BreakCfg[];
  slot_interval_minutes: number;
};
export type Holiday = {
  holiday_date: string;
  is_recurring?: boolean;
  is_blocked?: boolean;
};
export type ClosedReason = 'day' | 'holiday' | null;

export const DEFAULT_SCHEDULE: Schedule = {
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
export function dowOf(dateStr: string): number {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function toMin(hhmm: string): number {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeSchedule(schedule?: Schedule | null): Schedule {
  const s = (schedule && typeof schedule === 'object' ? schedule : {}) as Partial<Schedule>;
  return {
    days: { ...DEFAULT_SCHEDULE.days, ...(s.days || {}) },
    breaks: Array.isArray(s.breaks) ? s.breaks : DEFAULT_SCHEDULE.breaks,
    slot_interval_minutes: Number(s.slot_interval_minutes) || DEFAULT_SCHEDULE.slot_interval_minutes,
  };
}

export function matchesBlockedHoliday(holidays: Holiday[] | undefined, dateStr: string): boolean {
  const [, mm, dd] = String(dateStr).split('-');
  return (holidays || []).some(h => {
    if (!h || h.is_blocked === false) return false;
    if (h.is_recurring) {
      const [, hm, hd] = String(h.holiday_date).split('-');
      return hm === mm && hd === dd;
    }
    return h.holiday_date === dateStr;
  });
}

export function closedReasonFor(schedule: Schedule | null | undefined, holidays: Holiday[] | undefined, dateStr: string): ClosedReason {
  const s = normalizeSchedule(schedule);
  const day = s.days[String(dowOf(dateStr))];
  if (!day || day.is_closed) return 'day';
  if (matchesBlockedHoliday(holidays, dateStr)) return 'holiday';
  return null;
}

export function isClinicOpenOn(schedule: Schedule | null | undefined, holidays: Holiday[] | undefined, dateStr: string): boolean {
  return closedReasonFor(schedule, holidays, dateStr) === null;
}

export type Slot = { time: string; isBreak: boolean };

// Full slot grid for a date: only whole slots inside open→close; a slot is a
// break slot if it overlaps any break. [] if the day is closed by day-config.
export function daySlots(schedule: Schedule | null | undefined, dateStr: string): Slot[] {
  const s = normalizeSchedule(schedule);
  const day = s.days[String(dowOf(dateStr))];
  if (!day || day.is_closed) return [];
  const interval = s.slot_interval_minutes;
  if (!interval || interval <= 0) return [];
  const startMin = toMin(day.open), endMin = toMin(day.close);
  const breaks = (s.breaks || []).map(b => ({ s: toMin(b.start), e: toMin(b.end) }));
  const out: Slot[] = [];
  for (let m = startMin; m + interval <= endMin; m += interval) {
    const isBreak = breaks.some(b => m < b.e && (m + interval) > b.s);
    out.push({ time: toHHMM(m), isBreak });
  }
  return out;
}

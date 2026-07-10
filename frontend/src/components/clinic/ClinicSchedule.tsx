// frontend/src/components/clinic/ClinicSchedule.tsx
// Phase 1 of configurable clinic scheduling: the Clinic Config "Schedule" rail.
// STORAGE + UI ONLY — this reads/writes clinics.schedule and clinic_holidays,
// but NOTHING in the booking path (bot / AppointmentForm / availability) reads
// them yet. So editing here changes stored config, not booking behavior, until
// the Phase 2–3 rewire. Self-contained: it owns its own load/save and never
// touches ClinicConfig's formData/save path.
//
// Theme is PER-USER (owner decision): it persists to localStorage (dc-theme-id),
// not to the clinic — so each staff member's choice is their own.

import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../../supabaseClient';
import { THEMES, getTheme } from '../../themes';
import { applyThemeVars } from '../../themes/DcThemeProvider';

type DayCfg = { is_closed: boolean; open: string; close: string };
type BreakCfg = { start: string; end: string; label: string };
type Schedule = {
  days: Record<string, DayCfg>;
  breaks: BreakCfg[];
  slot_interval_minutes: number;
};
type Holiday = {
  id?: string;
  clinic_id: number;
  holiday_date: string;
  label: string;
  is_recurring: boolean;
  is_blocked: boolean;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INTERVAL_OPTIONS = [15, 20, 25, 30, 35, 40, 45, 60];
const THEME_KEY = 'dc-theme-id';

// Mirrors migration 024's default — used only if a clinic row somehow has no
// schedule yet (the migration backfills, so this is a belt-and-suspenders).
const DEFAULT_SCHEDULE: Schedule = {
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

function ClinicSchedule({ clinicId }: { clinicId: number | string }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [validationError, setValidationError] = useState('');

  // New-holiday draft
  const [newHoliday, setNewHoliday] = useState({ holiday_date: '', label: '', is_recurring: false });

  // Theme is per-user (localStorage), independent of the clinic.
  const [themeId, setThemeId] = useState<string>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved && THEMES[saved] ? saved : Object.keys(THEMES)[0];
  });

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setLoadError('');
    try {
      const { data: clinic, error: cErr } = await supabase
        .from('clinics').select('schedule').eq('id', clinicId).single();
      if (cErr) throw cErr;
      const s = (clinic?.schedule as Schedule) || DEFAULT_SCHEDULE;
      // Guard against partial blobs.
      setSchedule({
        days: { ...DEFAULT_SCHEDULE.days, ...(s.days || {}) },
        breaks: Array.isArray(s.breaks) ? s.breaks : DEFAULT_SCHEDULE.breaks,
        slot_interval_minutes: s.slot_interval_minutes || 20,
      });

      const { data: hols, error: hErr } = await supabase
        .from('clinic_holidays').select('*')
        .eq('clinic_id', clinicId).order('holiday_date', { ascending: true });
      if (hErr) throw hErr;
      setHolidays((hols as Holiday[]) || []);
    } catch (err: any) {
      console.error('ClinicSchedule load failed:', err);
      setLoadError(
        'Could not load schedule settings. If this is the first time, make sure migration 024 has been run in Supabase.'
      );
      setSchedule(DEFAULT_SCHEDULE);
      setHolidays([]);
    }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  // ── Hours / breaks / interval editing (staged; committed via Save) ──────────
  const setDay = (idx: string, patch: Partial<DayCfg>) => {
    setSchedule(prev => prev ? { ...prev, days: { ...prev.days, [idx]: { ...prev.days[idx], ...patch } } } : prev);
  };
  const setBreak = (i: number, patch: Partial<BreakCfg>) => {
    setSchedule(prev => {
      if (!prev) return prev;
      const breaks = prev.breaks.map((b, j) => j === i ? { ...b, ...patch } : b);
      return { ...prev, breaks };
    });
  };
  const addBreak = () => setSchedule(prev => prev ? { ...prev, breaks: [...prev.breaks, { start: '12:00', end: '13:00', label: 'Break' }] } : prev);
  const removeBreak = (i: number) => setSchedule(prev => prev ? { ...prev, breaks: prev.breaks.filter((_, j) => j !== i) } : prev);

  const validate = (s: Schedule): string => {
    for (let d = 0; d <= 6; d++) {
      const day = s.days[String(d)];
      if (!day || day.is_closed) continue;
      if (day.open >= day.close) return `${DAY_NAMES[d]}: closing time must be after opening time.`;
    }
    for (const b of s.breaks) {
      if (b.start >= b.end) return `Break "${b.label || ''}": end time must be after start time.`;
    }
    return '';
  };

  const saveSchedule = async () => {
    if (!schedule) return;
    const err = validate(schedule);
    if (err) { setValidationError(err); return; }
    setValidationError('');
    setSaving(true);
    try {
      const { error } = await supabase.from('clinics').update({ schedule }).eq('id', clinicId);
      if (error) throw error;
      Swal.fire({ icon: 'success', title: 'Schedule saved', timer: 1200, showConfirmButton: false });
    } catch (e: any) {
      console.error('saveSchedule failed:', e);
      Swal.fire({ icon: 'error', title: 'Save failed', text: 'Could not save the schedule. Please try again.' });
    }
    setSaving(false);
  };

  // ── Holidays (immediate per-row DB actions, like a list) ────────────────────
  const addHoliday = async () => {
    if (!newHoliday.holiday_date) { setValidationError('Pick a date for the holiday.'); return; }
    setValidationError('');
    try {
      const payload = {
        clinic_id: Number(clinicId),
        holiday_date: newHoliday.holiday_date,
        label: newHoliday.label || null,
        is_recurring: newHoliday.is_recurring,
        is_blocked: true,
      };
      const { data, error } = await supabase.from('clinic_holidays').insert(payload).select().single();
      if (error) throw error;
      setHolidays(prev => [...prev, data as Holiday].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
      setNewHoliday({ holiday_date: '', label: '', is_recurring: false });
    } catch (e: any) {
      console.error('addHoliday failed:', e);
      Swal.fire({ icon: 'error', title: 'Could not add holiday', text: 'Please try again.' });
    }
  };

  const patchHoliday = async (id: string | undefined, patch: Partial<Holiday>) => {
    if (!id) return;
    const prev = holidays;
    setHolidays(hs => hs.map(h => h.id === id ? { ...h, ...patch } : h)); // optimistic
    try {
      const { error } = await supabase.from('clinic_holidays').update(patch).eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error('patchHoliday failed:', e);
      setHolidays(prev); // revert
      Swal.fire({ icon: 'error', title: 'Could not update holiday', text: 'Please try again.' });
    }
  };

  const removeHoliday = async (id: string | undefined) => {
    if (!id) return;
    const prev = holidays;
    setHolidays(hs => hs.filter(h => h.id !== id)); // optimistic
    try {
      const { error } = await supabase.from('clinic_holidays').delete().eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error('removeHoliday failed:', e);
      setHolidays(prev); // revert
      Swal.fire({ icon: 'error', title: 'Could not remove holiday', text: 'Please try again.' });
    }
  };

  // ── Theme (per-user, applies live + persists to localStorage) ───────────────
  const onThemeChange = (id: string) => {
    setThemeId(id);
    localStorage.setItem(THEME_KEY, id);
    applyThemeVars(getTheme(id));
  };

  if (loading || !schedule) {
    return <div className="dc-loading">Loading schedule…</div>;
  }

  const availableThemes = Object.values(THEMES);

  return (
    <div className="cc-schedule">
      <div className="cc-panel-head">
        <div className="cc-panel-eyebrow">Scheduling</div>
        <h2 className="cc-panel-title">Clinic Schedule</h2>
      </div>

      {loadError && <div className="dc-banner dc-banner--err">{loadError}</div>}
      <p className="cc-hint">
        These settings drive booking hours across the whole app — the <b>booking bot</b>, the <b>appointment form</b>, and <b>dentist availability</b> all read them. Changes take effect immediately.
      </p>

      {/* ── Operating hours ── */}
      <fieldset className="cc-group">
        <legend>Operating Hours</legend>
        <div className="cc-sched-days">
          {DAY_NAMES.map((name, d) => {
            const day = schedule.days[String(d)];
            return (
              <div key={d} className="cc-sched-dayrow">
                <span className="cc-sched-dayname">{name}</span>
                <label className="cc-toggle-row cc-sched-closed">
                  <input
                    type="checkbox"
                    checked={!day.is_closed}
                    onChange={e => setDay(String(d), { is_closed: !e.target.checked })}
                  />
                  <span>{day.is_closed ? 'Closed' : 'Open'}</span>
                </label>
                <input
                  type="time" className="cc-sched-time"
                  value={day.open} disabled={day.is_closed}
                  onChange={e => setDay(String(d), { open: e.target.value })}
                />
                <span className="cc-sched-dash">–</span>
                <input
                  type="time" className="cc-sched-time"
                  value={day.close} disabled={day.is_closed}
                  onChange={e => setDay(String(d), { close: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ── Breaks ── */}
      <fieldset className="cc-group">
        <legend>Breaks</legend>
        {schedule.breaks.length === 0 && <p className="cc-hint">No breaks — the clinic runs straight through.</p>}
        {schedule.breaks.map((b, i) => (
          <div key={i} className="cc-sched-breakrow">
            <input
              type="text" className="cc-sched-breaklabel" placeholder="Label (e.g. Lunch)"
              value={b.label} onChange={e => setBreak(i, { label: e.target.value })}
            />
            <input type="time" className="cc-sched-time" value={b.start} onChange={e => setBreak(i, { start: e.target.value })} />
            <span className="cc-sched-dash">–</span>
            <input type="time" className="cc-sched-time" value={b.end} onChange={e => setBreak(i, { end: e.target.value })} />
            <button type="button" className="dc-btn dc-btn--ghost dc-btn--danger" onClick={() => removeBreak(i)}>Remove</button>
          </div>
        ))}
        <button type="button" className="dc-btn dc-btn--ghost" onClick={addBreak} style={{ marginTop: 8 }}>+ Add break</button>
      </fieldset>

      {/* ── Slot interval ── */}
      <fieldset className="cc-group">
        <legend>Appointment Slot Length</legend>
        <label className="dc-field" style={{ maxWidth: 260 }}>
          <span>Minutes per slot</span>
          <select
            value={schedule.slot_interval_minutes}
            onChange={e => setSchedule(prev => prev ? { ...prev, slot_interval_minutes: Number(e.target.value) } : prev)}
          >
            {INTERVAL_OPTIONS.map(n => <option key={n} value={n}>{n} minutes</option>)}
          </select>
        </label>
        <p className="cc-hint">Changing this later re-shapes the time grid. Existing appointments are always kept and blocked, even if they fall off the new grid.</p>
      </fieldset>

      {validationError && <div className="dc-banner dc-banner--err">{validationError}</div>}
      <div className="cc-form-actions">
        <button type="button" className="dc-btn dc-btn--primary" onClick={saveSchedule} disabled={saving}>
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>

      {/* ── Holidays (each change saves immediately) ── */}
      <fieldset className="cc-group">
        <legend>Holidays &amp; Closures</legend>
        <p className="cc-hint">Each change here saves immediately. Recurring holidays repeat on the same month/day every year. Toggle "Blocked" off to keep a date in the list without closing the clinic.</p>

        <div className="cc-sched-addholiday">
          <input type="date" className="cc-sched-time" value={newHoliday.holiday_date}
            onChange={e => setNewHoliday(h => ({ ...h, holiday_date: e.target.value }))} />
          <input type="text" placeholder="Label (e.g. Christmas Day)" value={newHoliday.label}
            onChange={e => setNewHoliday(h => ({ ...h, label: e.target.value }))} />
          <label className="cc-toggle-row">
            <input type="checkbox" checked={newHoliday.is_recurring}
              onChange={e => setNewHoliday(h => ({ ...h, is_recurring: e.target.checked }))} />
            <span>Recurring yearly</span>
          </label>
          <button type="button" className="dc-btn dc-btn--primary" onClick={addHoliday}>+ Add</button>
        </div>

        {holidays.length === 0 ? (
          <p className="cc-hint">No holidays configured.</p>
        ) : (
          <div className="cc-sched-holidays">
            {holidays.map(h => (
              <div key={h.id} className={`cc-sched-holrow${h.is_blocked ? '' : ' is-unblocked'}`}>
                <span className="cc-sched-holdate">{h.holiday_date}</span>
                <span className="cc-sched-hollabel">{h.label || <em>(no label)</em>}</span>
                <label className="cc-toggle-row">
                  <input type="checkbox" checked={h.is_recurring}
                    onChange={e => patchHoliday(h.id, { is_recurring: e.target.checked })} />
                  <span>Yearly</span>
                </label>
                <label className="cc-toggle-row">
                  <input type="checkbox" checked={h.is_blocked}
                    onChange={e => patchHoliday(h.id, { is_blocked: e.target.checked })} />
                  <span>Blocked</span>
                </label>
                <button type="button" className="dc-btn dc-btn--ghost dc-btn--danger" onClick={() => removeHoliday(h.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* ── Theme (per-user) ── */}
      <fieldset className="cc-group">
        <legend>Appearance</legend>
        <label className="dc-field" style={{ maxWidth: 320 }}>
          <span>Theme (applies to your account on this device)</span>
          <select value={themeId} onChange={e => onThemeChange(e.target.value)}>
            {availableThemes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <p className="cc-hint">Your theme choice is personal — it doesn't change what other staff see.</p>
      </fieldset>
    </div>
  );
}

export default ClinicSchedule;

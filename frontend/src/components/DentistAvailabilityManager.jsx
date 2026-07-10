import './DentistAvailabilityManager.css';
import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { LuTrash2, LuBan, LuLock, LuCoffee, LuSunrise, LuSunset, LuCircleCheck, LuCalendarClock, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext';
import { daySlots, closedReasonFor, blockedHolidayFor, normalizeSchedule, toMin, toHHMM } from '../utils/schedule';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Grid slots + breaks + closed days now come from the clinic's configured
// schedule (migration 024) via the shared utils/schedule — the SAME engine the
// booking bot and AppointmentForm use — so a block always lands on a real
// bookable slot boundary at any interval (incl. 25/35/40/45-min).

function parseLocalDate(dateStr) {
  return dateStr ? new Date(dateStr) : null;
}

function formatHourTo12Hr(hourStr) {
  const [hour, minute] = hourStr.split(':');
  let h = parseInt(hour, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h.toString().padStart(2,'0')}:${minute} ${suffix}`;
}

function stripSeconds(timeStr) {
  return timeStr ? timeStr.slice(0, 5) : "";
}

function formatRange(startStr, endStr) {
  const s = stripSeconds(startStr);
  const e = stripSeconds(endStr);
  if (!s && !e) return "";
  if (!e) return formatHourTo12Hr(s);
  return `${formatHourTo12Hr(s)} – ${formatHourTo12Hr(e)}`;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Purpose-built month calendar (replaces react-calendar) ──
// Full control over grid/sizing/theming; disables past dates + days the clinic
// is CLOSED (per schedule / blocked holiday, via the isDateClosed predicate) and
// marks days that have blocks. Emits a native Date via onPick.
function AvCalendar({ valueStr, onPick, hasBlocks, isDateClosed, dateTitle }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const selected = valueStr ? parseLocalDate(valueStr) : null;
  const seed = selected || today;
  const [view, setView] = useState({ y: seed.getFullYear(), m: seed.getMonth() });

  const firstOfMonth = new Date(view.y, view.m, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canPrev = firstOfMonth > new Date(today.getFullYear(), today.getMonth(), 1);

  const sameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const step = (delta) => setView(v => {
    const d = new Date(v.y, v.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="av-cal">
      <div className="av-cal-nav">
        <button type="button" className="av-cal-navbtn" onClick={() => step(-1)} disabled={!canPrev} aria-label="Previous month">
          <LuChevronLeft />
        </button>
        <div className="av-cal-title">{monthLabel}</div>
        <button type="button" className="av-cal-navbtn" onClick={() => step(1)} aria-label="Next month">
          <LuChevronRight />
        </button>
      </div>
      <div className="av-cal-grid av-cal-weekdays">
        {WEEKDAY_LABELS.map(w => <div key={w} className="av-cal-wd">{w}</div>)}
      </div>
      <div className="av-cal-grid av-cal-days">
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="av-cal-empty" />;
          const disabled = date < today || (isDateClosed ? isDateClosed(date) : false);
          const isSel = sameDay(date, selected);
          const isToday = sameDay(date, today);
          const cls = ['av-cal-day'];
          if (disabled) cls.push('is-disabled');
          if (isSel) cls.push('is-selected');
          else if (isToday) cls.push('is-today');
          return (
            <button
              type="button"
              key={date.toISOString()}
              className={cls.join(' ')}
              aria-disabled={disabled}
              title={dateTitle ? dateTitle(date, date < today) : undefined}
              onClick={() => !disabled && onPick(date)}
            >
              {date.getDate()}
              {hasBlocks(date) && !isSel && <span className="av-cal-daydot" />}
            </button>
          );
        })}
      </div>
      <div className="av-cal-foot">
        <span className="av-cal-daydot av-cal-daydot--legend" /> Day has blocked periods
      </div>
    </div>
  );
}

function DentistAvailabilityManager({ clinicId, dentistId }) {
  const { clinicTimeZone } = useClinic();
  // Appointment date/time in CLINIC-local terms (matches the bot + the slot
  // grid), so a cross-timezone staffer maps appointments to the right slot/day.
  const apptClinicDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: clinicTimeZone || 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  const apptClinicMins = (ts) => {
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: clinicTimeZone || 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const [dentists, setDentists] = useState([]);
  const [selectedDentist, setSelectedDentist] = useState(dentistId || '');
  const [selectedDate, setSelectedDate] = useState('');
  const [availability, setAvailability] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [slotStatus, setSlotStatus] = useState({});
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [holidays, setHolidays] = useState([]);

  // Load the clinic's schedule + holidays (drives grid, breaks, closed days).
  useEffect(() => {
    if (!clinicId) return;
    supabase.from('clinics').select('schedule').eq('id', clinicId).single()
      .then(res => setSchedule(res.data?.schedule || null));
    supabase.from('clinic_holidays').select('holiday_date, label, is_recurring, is_blocked').eq('clinic_id', clinicId)
      .then(res => setHolidays(res.data || []));
  }, [clinicId]);

  // Derived, schedule-driven values for the selected date.
  const interval = normalizeSchedule(schedule).slot_interval_minutes;
  const daySlotList = selectedDate ? daySlots(schedule, selectedDate) : [];
  const bookableSlots = daySlotList.filter(s => !s.isBreak).map(s => s.time);
  const selectedClosed = selectedDate ? closedReasonFor(schedule, holidays, selectedDate) : null;
  const isDateClosed = (dateObj) => closedReasonFor(schedule, holidays, dateObj.toLocaleDateString('sv-SE')) !== null;
  // Tooltip explaining WHY a calendar date is unavailable (no user confusion).
  const dateTitle = (dateObj, isPast) => {
    if (isPast) return 'Past date';
    const ds = dateObj.toLocaleDateString('sv-SE');
    const reason = closedReasonFor(schedule, holidays, ds);
    if (!reason) return undefined;
    if (reason === 'holiday') {
      const hol = blockedHolidayFor(holidays, ds);
      return hol?.label ? `Closed — ${hol.label} (holiday)` : 'Closed — holiday';
    }
    return 'Closed — clinic is not open on this day';
  };

  useEffect(() => {
    if (dentistId) {
      setDentists([]);
      setSelectedDentist(dentistId);
      return;
    }
    if (!clinicId) {
      setDentists([]);
      return;
    }
    supabase
      .from('dentists')
      .select('*')
      .eq('clinic_id', clinicId)
      .then(res => setDentists(res.data || []))
      .catch(() => setDentists([]));
  }, [clinicId, dentistId]);

  useEffect(() => {
    if (!selectedDentist) {
      setSelectedDate('');
      setSlotStatus({});
      setAvailability([]);
      setAppointments([]);
      return;
    }
    const todayStr = apptClinicDate(new Date()); // clinic-local today (matches appt mapping)
    setSelectedDate(todayStr);
    setLoading(true);

    Promise.all([
      supabase
        .from('dentist_availability')
        .select('*')
        .eq('dentist_id', selectedDentist)
        .eq('clinic_id', clinicId)
        .then(res => res.data || []),
      supabase
        .from('appointments')
        .select('*')
        .eq('dentist_id', selectedDentist)
        .eq('clinic_id', clinicId)
        .eq('deleted', false)
        .then(res => (res.data || []).filter(
          appt => {
            const apptDate = apptClinicDate(appt.appointment_time);
            return apptDate === todayStr;
          }
        )),
    ]).then(([avail, appts]) => {
      setAvailability(avail);
      setAppointments(appts);
      setLoading(false);
    }).catch(() => {
      setAvailability([]);
      setAppointments([]);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDentist, clinicId]);

  useEffect(() => {
    if (!selectedDentist || !selectedDate || selectedClosed) {
      setSlotStatus({});
      return;
    }
    // Every bookable (non-break) slot starts open.
    const status = {};
    bookableSlots.forEach(t => { status[t] = true; });

    // Staff blocks for this date: mark a slot blocked if its [start, start+interval)
    // overlaps the stored block range — so ranges saved at any interval, or old
    // hourly ranges, map onto the grid correctly.
    availability.forEach(a => {
      const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
      if (dbDate !== selectedDate || a.is_available) return;
      const bStart = toMin(stripSeconds(a.start_time));
      const bEnd = toMin(stripSeconds(a.end_time));
      bookableSlots.forEach(t => {
        const s = toMin(t);
        if (s < bEnd && s + interval > bStart) status[t] = false;
      });
    });

    // Appointments → booked: mark the slot whose [start, start+interval) contains
    // the appointment start (range-match; catches off-grid appointments too).
    appointments.forEach(appt => {
      const mins = apptClinicMins(appt.appointment_time);
      const t = bookableSlots.find(x => { const s = toMin(x); return mins >= s && mins < s + interval; });
      if (t) status[t] = 'booked';
    });

    setSlotStatus(status);
    // eslint-disable-next-line
  }, [selectedDate, availability, appointments, selectedDentist, schedule, holidays]);

  function handleCalendarChange(dateObj) {
    const dateStr = dateObj.toLocaleDateString('sv-SE');
    setSelectedDate(dateStr);

    if (!selectedDentist) return;
    setLoading(true);

    Promise.all([
      supabase
        .from('dentist_availability')
        .select('*')
        .eq('dentist_id', selectedDentist)
        .eq('clinic_id', clinicId)
        .then(res => res.data || []),
      supabase
        .from('appointments')
        .select('*')
        .eq('dentist_id', selectedDentist)
        .eq('clinic_id', clinicId)
        .eq('deleted', false)
        .then(res => (res.data || []).filter(
          appt => {
            const apptDate = apptClinicDate(appt.appointment_time);
            return apptDate === dateStr;
          }
        )),
    ]).then(([avail, appts]) => {
      setAvailability(avail);
      setAppointments(appts);
      setLoading(false);
    }).catch(() => {
      setAvailability([]);
      setAppointments([]);
      setLoading(false);
    });
  }

  function handleSlotClick(time) {
    if (slotStatus[time] === 'booked') return; // break slots aren't rendered clickable
    setSlotStatus(prev => ({
      ...prev,
      [time]: prev[time] === true ? false : true
    }));
  }

  function handleBlockAll() {
    setSlotStatus(prev => {
      const next = {};
      bookableSlots.forEach(t => { next[t] = prev[t] === 'booked' ? 'booked' : false; });
      return next;
    });
  }

  function handleUnblockAll() {
    setSlotStatus(prev => {
      const next = {};
      bookableSlots.forEach(t => { next[t] = prev[t] === 'booked' ? 'booked' : true; });
      return next;
    });
  }

  // Block a half-day range (UI-state only). Booked slots are preserved; break
  // slots aren't in bookableSlots so they're untouched.
  function blockPeriod(times) {
    setSlotStatus(prev => {
      const next = { ...prev };
      times.forEach(t => { if (next[t] !== 'booked') next[t] = false; });
      return next;
    });
  }
  const AM_SLOTS = bookableSlots.filter(t => toMin(t) < 720);  // before 12:00
  const PM_SLOTS = bookableSlots.filter(t => toMin(t) >= 720); // 12:00 onward

  // Does a calendar date already have blocked periods? (drives the tile dot)
  function dateHasBlocks(dateObj) {
    const key = dateObj.toLocaleDateString('sv-SE');
    return availability.some(a =>
      !a.is_available && parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE') === key
    );
  }

  function showNotification(msg, type = 'info', timeout = 1800) {
    Swal.fire({
      text: msg,
      icon: type,
      timer: timeout,
      showConfirmButton: false,
      position: 'top',
      toast: true,
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!selectedDentist || !selectedDate) {
      showNotification('Dentist and date required!', 'warning');
      return;
    }
    setSaving(true);

    try {
      // supabase-js returns { error } rather than throwing — check every write
      // so a failed delete/insert never shows a false "Saved!".
      const blocksForDate = availability.filter(a => {
        const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
        return dbDate === selectedDate;
      });
      for (let block of blocksForDate) {
        const { error } = await supabase
          .from('dentist_availability')
          .delete()
          .eq('id', block.id)
          .eq('clinic_id', clinicId);
        if (error) throw error;
      }

      // Merge contiguous blocked slots into time-aligned ranges. A run continues
      // only while the next blocked slot starts exactly where the previous one
      // ends (start + interval) — so a break naturally splits runs, and each
      // stored range lines up with real slot boundaries.
      const blockedTimes = bookableSlots.filter(t => slotStatus[t] === false);
      const runs = [];
      for (const t of blockedTimes) {
        const s = toMin(t);
        const last = runs[runs.length - 1];
        if (last && s === last.endMin) {
          last.endMin = s + interval;
        } else {
          runs.push({ start: t, endMin: s + interval });
        }
      }
      for (const run of runs) {
        const { error } = await supabase
          .from('dentist_availability')
          .insert([{
            dentist_id: selectedDentist,
            specific_date: selectedDate,
            start_time: run.start,
            end_time: toHHMM(run.endMin),
            is_available: false,
            clinic_id: clinicId
          }]);
        if (error) throw error;
      }
      Promise.all([
        supabase
          .from('dentist_availability')
          .select('*')
          .eq('dentist_id', selectedDentist)
          .eq('clinic_id', clinicId)
          .then(res => res.data || []),
        supabase
          .from('appointments')
          .select('*')
          .eq('dentist_id', selectedDentist)
          .eq('clinic_id', clinicId)
          .eq('deleted', false)
          .then(res => (res.data || []).filter(
            appt => {
              const apptDate = apptClinicDate(appt.appointment_time);
              return apptDate === selectedDate;
            }
          )),
      ]).then(([avail, appts]) => {
        setAvailability(avail);
        setAppointments(appts);
      });
      showNotification('Saved!', 'success');
    } catch (err) {
      console.error('availability save failed:', err);
      showNotification('Error saving — nothing was changed. Please try again.', 'error');
    }
    setSaving(false);
  }

  async function handleDeleteDate(e) {
    e.preventDefault();
    if (!selectedDentist || !selectedDate) {
      showNotification('Dentist and date required!', 'warning');
      return;
    }
    const confirm = await Swal.fire({
      title: 'Delete blocks?',
      text: `Delete ALL blocks for ${selectedDate}? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel'
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    try {
      const blocksForDate = availability.filter(a => {
        const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
        return dbDate === selectedDate;
      });
      for (let block of blocksForDate) {
        const { error } = await supabase
          .from('dentist_availability')
          .delete()
          .eq('id', block.id)
          .eq('clinic_id', clinicId);
        if (error) throw error;
      }

      const [avail, appts] = await Promise.all([
        supabase
          .from('dentist_availability')
          .select('*')
          .eq('dentist_id', selectedDentist)
          .eq('clinic_id', clinicId)
          .then(res => res.data || []),
        supabase
          .from('appointments')
          .select('*')
          .eq('dentist_id', selectedDentist)
          .eq('clinic_id', clinicId)
          .eq('deleted', false)
          .then(res => (res.data || []).filter(
            appt => apptClinicDate(appt.appointment_time) === selectedDate
          )),
      ]);
      setAvailability(avail);
      setAppointments(appts);
      showNotification('All blocks deleted!', 'success');
    } catch (err) {
      console.error('availability delete-date failed:', err);
      showNotification('Error deleting — please try again.', 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    const confirm = await Swal.fire({
      title: 'Delete block?',
      text: 'Delete this block?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel'
    });
    if (!confirm.isConfirmed) return;
    const { error } = await supabase
      .from('dentist_availability')
      .delete()
      .eq('id', id)
      .eq('clinic_id', clinicId);
    if (error) {
      console.error('availability delete-block failed:', error);
      showNotification('Failed to delete — please try again.', 'error');
      return;
    }
    setAvailability(avail => avail.filter(a => a.id !== id));
    showNotification('Deleted!', 'success');
  }

  const renderAvailabilityTable = () => (
    <table className="dc-table av-blocks-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Day</th>
          <th>Time Range</th>
          <th>Status</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {availability.length === 0 && (
          <tr>
            <td colSpan={5} className="av-empty-cell">
              <LuCalendarClock /> No blocks yet — this dentist is fully available.
            </td>
          </tr>
        )}
        {availability.map(block => {
          const d = parseLocalDate(block.specific_date);
          const dateKey = d ? d.toLocaleDateString('sv-SE') : '';
          const isCurrent = dateKey && dateKey === selectedDate;
          return (
            <tr key={block.id} className={isCurrent ? 'av-row--current' : ''}>
              <td>
                <span className="av-date-cell">
                  {isCurrent && <span className="av-current-dot" title="Selected date" />}
                  {dateKey}
                </span>
              </td>
              <td className="av-day-col">{d ? WEEKDAYS[d.getDay()] : ''}</td>
              <td>
                <span className="av-range-pill">{formatRange(block.start_time, block.end_time)}</span>
              </td>
              <td>
                <span className={`dc-pill ${block.is_available ? 'av-pill--ok' : 'av-pill--blocked'}`}>
                  {block.is_available ? 'Available' : 'Blocked'}
                </span>
              </td>
              <td className="av-blocks-action">
                <button
                  className="dc-icon-btn dc-icon-btn--danger"
                  onClick={() => handleDelete(block.id)}
                  disabled={saving}
                  title="Delete this block"
                  aria-label="Delete block"
                >
                  <LuTrash2 />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const availableCount = bookableSlots.filter(t => slotStatus[t] === true).length;
  const bookedCount = bookableSlots.filter(t => slotStatus[t] === 'booked').length;
  const blockedCount = bookableSlots.filter(t => slotStatus[t] === false).length;
  const breakCount = daySlotList.filter(s => s.isBreak).length; // breaks (may be 0, 1, or many)
  const workable = bookableSlots.length;                        // bookable slots (excludes breaks)
  const openPct = workable ? Math.round((availableCount / workable) * 100) : 0;
  const dayObj = parseLocalDate(selectedDate);
  const prettyDate = dayObj
    ? dayObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="availability-manager-container">
      {/* Only show header/dropdown if NOT launched in modal for a specific dentist */}
      {!dentistId && (
        <div className="av-standalone-head">
          <h2 className="av-title">Dentist Availability Manager</h2>
          <label className="dc-field av-picker">
            <span>Dentist</span>
            <select value={selectedDentist} onChange={e => setSelectedDentist(e.target.value)} required>
              <option value="">Select Dentist</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selectedDentist && (
        <div className="av-workspace">
          <div className="av-day-head">
            <div className="av-day-date">{prettyDate}</div>
            <div className="av-day-hint">Tap a slot to block or open it</div>
          </div>

          <div className="av-cols">
            <form onSubmit={handleSave} className="av-slots-col">

            {/* Day utilization meter — derived from the slot counts */}
            <div className="av-meter">
              <div className="av-meter-top">
                <div className="av-meter-pct">{openPct}<span>%</span></div>
                <div className="av-meter-cap">
                  <div className="av-meter-cap-lead">Day Open</div>
                  <div className="av-meter-cap-sub">{availableCount} of {workable} slots available</div>
                </div>
              </div>
              <div className="av-meter-bar" role="img" aria-label={`${openPct}% of the day open`}>
                <span className="av-seg av-seg--available" style={{ flexGrow: availableCount }} />
                <span className="av-seg av-seg--blocked" style={{ flexGrow: blockedCount }} />
                <span className="av-seg av-seg--booked" style={{ flexGrow: bookedCount }} />
                <span className="av-seg av-seg--lunch" style={{ flexGrow: breakCount }} />
              </div>
            </div>

            {/* Stat chips (double as the legend) */}
            <div className="av-stats">
              <div className="av-stat av-stat--available"><b>{availableCount}</b><span>Open</span></div>
              <div className="av-stat av-stat--blocked"><b>{blockedCount}</b><span>Blocked</span></div>
              <div className="av-stat av-stat--booked"><b>{bookedCount}</b><span>Booked</span></div>
              <div className="av-stat av-stat--lunch"><b>{breakCount}</b><span>Break</span></div>
            </div>

            {/* Quick presets */}
            <div className="av-quick">
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={handleBlockAll} disabled={saving || !!selectedClosed}><LuBan /> Block All</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={handleUnblockAll} disabled={saving || !!selectedClosed}><LuCircleCheck /> Open All</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={() => blockPeriod(AM_SLOTS)} disabled={saving || !!selectedClosed}><LuSunrise /> Block AM</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={() => blockPeriod(PM_SLOTS)} disabled={saving || !!selectedClosed}><LuSunset /> Block PM</button>
            </div>

            {selectedClosed ? (
              <div className="av-closed-note">
                <LuBan /> The clinic is closed on this day
                {selectedClosed === 'holiday' ? ' (holiday)' : ' (per the clinic schedule)'}.
                {' '}No availability to set — pick another day.
              </div>
            ) : (
            <div className="av-hour-grid">
              {daySlotList.map(({ time, isBreak }) => {
                const slotType = slotStatus[time];
                let mod = 'available';
                let label = 'Open';
                let disabled = false;
                let SlotIcon = null;

                if (isBreak) {
                  mod = 'lunch'; label = 'Break'; disabled = true; SlotIcon = LuCoffee;
                } else if (slotType === false) {
                  mod = 'blocked'; label = 'Blocked'; SlotIcon = LuBan;
                } else if (slotType === 'booked') {
                  mod = 'booked'; label = 'Booked'; disabled = true; SlotIcon = LuLock;
                }

                return (
                  <button
                    type="button"
                    key={time}
                    className={`av-slot av-slot--${mod}`}
                    onClick={() => !disabled && handleSlotClick(time)}
                    title={label}
                    disabled={saving || disabled}
                  >
                    {SlotIcon && <SlotIcon className="av-slot-ico" />}
                    <span className="av-slot-time">{formatHourTo12Hr(time)}</span>
                    <span className="av-slot-label">{label}</span>
                  </button>
                );
              })}
            </div>
            )}

            <div className="av-actions">
              <button type="submit" className="dc-btn dc-btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                className="dc-btn dc-btn--danger"
                disabled={saving}
                onClick={handleDeleteDate}
                title="Delete all blocks for this date"
              >
                Clear Day
              </button>
            </div>
            </form>

            <div className="av-cal-col">
              <AvCalendar
                valueStr={selectedDate}
                onPick={handleCalendarChange}
                hasBlocks={dateHasBlocks}
                isDateClosed={isDateClosed}
                dateTitle={dateTitle}
              />
            </div>
          </div>
        </div>
      )}

      <div className="av-table-section">
        <h3 className="av-section-title">Blocked Periods {availability.length > 0 && <span className="av-count">{availability.length}</span>}</h3>
        {loading ? (
          <div className="dc-loading">Loading availability…</div>
        ) : (
          <div className="dc-table-wrap av-table-wrap">
            {renderAvailabilityTable()}
          </div>
        )}
      </div>
    </div>
  );
}

export default DentistAvailabilityManager;
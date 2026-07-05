import './DentistAvailabilityManager.css';
import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { LuTrash2, LuBan, LuLock, LuCoffee, LuSunrise, LuSunset, LuCircleCheck, LuCalendarClock, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { supabase } from '../supabaseClient';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({length: 9}, (_, i) => `${(9 + i).toString().padStart(2,'0')}:00`);
const LUNCH_HOUR = '12:00';

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
// Full control over grid/sizing/theming; disables past dates + Sundays (same
// rules the old tileDisabled/minDate enforced) and marks days that have blocks.
// Emits a native Date via onPick → the existing handleCalendarChange handler.
function AvCalendar({ valueStr, onPick, hasBlocks }) {
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
          const isSun = date.getDay() === 0;
          const disabled = isSun || date < today;
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
              disabled={disabled}
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
  const [dentists, setDentists] = useState([]);
  const [selectedDentist, setSelectedDentist] = useState(dentistId || '');
  const [selectedDate, setSelectedDate] = useState('');
  const [availability, setAvailability] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [slotStatus, setSlotStatus] = useState({});
  const [saving, setSaving] = useState(false);

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
    const todayStr = new Date().toLocaleDateString('sv-SE');
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
            const apptDate = new Date(appt.appointment_time).toLocaleDateString('sv-SE');
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
  }, [selectedDentist, clinicId]);

  useEffect(() => {
    if (!selectedDentist || !selectedDate) {
      setSlotStatus({});
      return;
    }
    let status = Object.fromEntries(HOURS.map(h => [h, true]));
    status[LUNCH_HOUR] = false;
    const blocks = availability.filter(a => {
      const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
      return dbDate === selectedDate && !a.is_available;
    });
    blocks.forEach(block => {
      const startTime = stripSeconds(block.start_time);
      const endTime = stripSeconds(block.end_time);
      let startIdx = HOURS.indexOf(startTime);
      let endIdx = HOURS.indexOf(endTime);
      if (startIdx === -1) return;
      if (endIdx === -1) endIdx = HOURS.length;
      for (let i = startIdx; i < endIdx; i++) {
        if (HOURS[i] !== LUNCH_HOUR) {
          status[HOURS[i]] = false;
        }
      }
    });
    appointments.forEach(appt => {
      const d = new Date(appt.appointment_time);
      const hourSlot = `${d.getHours().toString().padStart(2, '0')}:00`;
      if (HOURS.includes(hourSlot)) {
        status[hourSlot] = 'booked';
      }
    });
    setSlotStatus(status);
  }, [selectedDate, availability, appointments, selectedDentist]);

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
            const apptDate = new Date(appt.appointment_time).toLocaleDateString('sv-SE');
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

  function handleSlotClick(hour) {
    if (slotStatus[hour] === 'booked' || hour === LUNCH_HOUR) return;

    setSlotStatus(prev => ({
      ...prev,
      [hour]: prev[hour] === true ? false : true
    }));
  }

  function handleBlockAll() {
    let newStatus = {};
    for (let h of HOURS) {
      newStatus[h] = h === LUNCH_HOUR ? false : (slotStatus[h] === 'booked' ? 'booked' : false);
    }
    setSlotStatus(newStatus);
  }

  function handleUnblockAll() {
    let newStatus = {};
    for (let h of HOURS) {
      newStatus[h] = h === LUNCH_HOUR ? false : (slotStatus[h] === 'booked' ? 'booked' : true);
    }
    setSlotStatus(newStatus);
  }

  // Block a half-day range (UI-state only — same category as Block All; the
  // save/delete DB flow is untouched). Booked slots and lunch are preserved.
  function blockPeriod(hoursSubset) {
    setSlotStatus(prev => {
      const next = { ...prev };
      for (let h of hoursSubset) {
        if (h === LUNCH_HOUR) continue;
        if (next[h] === 'booked') continue;
        next[h] = false;
      }
      return next;
    });
  }
  const AM_HOURS = HOURS.filter(h => h < LUNCH_HOUR);
  const PM_HOURS = HOURS.filter(h => h > LUNCH_HOUR);

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

    const blocksForDate = availability.filter(a => {
      const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
      return dbDate === selectedDate;
    });
    for (let block of blocksForDate) {
      await supabase
        .from('dentist_availability')
        .delete()
        .eq('id', block.id)
        .eq('clinic_id', clinicId);
    }

    try {
      let i = 0;
      while (i < HOURS.length) {
        if (slotStatus[HOURS[i]] === false && HOURS[i] !== LUNCH_HOUR) {
          let startHour = HOURS[i];
          let endIdx = i + 1;
          while (
            endIdx < HOURS.length &&
            slotStatus[HOURS[endIdx]] === false &&
            HOURS[endIdx] !== LUNCH_HOUR
          ) {
            endIdx++;
          }
          let endHour = HOURS[endIdx] || "18:00";
          await supabase
            .from('dentist_availability')
            .insert([{
              dentist_id: selectedDentist,
              specific_date: selectedDate,
              start_time: startHour,
              end_time: endHour,
              is_available: false,
              clinic_id: clinicId
            }]);
          i = endIdx;
        } else {
          i++;
        }
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
              const apptDate = new Date(appt.appointment_time).toLocaleDateString('sv-SE');
              return apptDate === selectedDate;
            }
          )),
      ]).then(([avail, appts]) => {
        setAvailability(avail);
        setAppointments(appts);
      });
      showNotification('Saved!', 'success');
    } catch (err) {
      showNotification('Error saving!', 'error');
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
    const blocksForDate = availability.filter(a => {
      const dbDate = parseLocalDate(a.specific_date)?.toLocaleDateString('sv-SE');
      return dbDate === selectedDate;
    });
    for (let block of blocksForDate) {
      await supabase
        .from('dentist_availability')
        .delete()
        .eq('id', block.id)
        .eq('clinic_id', clinicId);
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
            const apptDate = new Date(appt.appointment_time).toLocaleDateString('sv-SE');
            return apptDate === selectedDate;
          }
        )),
    ]).then(([avail, appts]) => {
      setAvailability(avail);
      setAppointments(appts);
    });
    showNotification('All blocks deleted!', 'success');
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
    await supabase
      .from('dentist_availability')
      .delete()
      .eq('id', id)
      .eq('clinic_id', clinicId);
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

  const availableCount = Object.values(slotStatus).filter(v => v === true).length;
  const bookedCount = Object.values(slotStatus).filter(v => v === 'booked').length;
  const hasLunch = slotStatus[LUNCH_HOUR] === false;           // lunch stored as false
  const lunchCount = hasLunch ? 1 : 0;
  // exclude the lunch slot from "blocked" so the meter/stats read true
  const blockedCount = Math.max(0, Object.values(slotStatus).filter(v => v === false).length - lunchCount);
  const workable = HOURS.length - 1;                            // bookable slots (minus lunch)
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
                <span className="av-seg av-seg--lunch" style={{ flexGrow: lunchCount }} />
              </div>
            </div>

            {/* Stat chips (double as the legend) */}
            <div className="av-stats">
              <div className="av-stat av-stat--available"><b>{availableCount}</b><span>Open</span></div>
              <div className="av-stat av-stat--blocked"><b>{blockedCount}</b><span>Blocked</span></div>
              <div className="av-stat av-stat--booked"><b>{bookedCount}</b><span>Booked</span></div>
              <div className="av-stat av-stat--lunch"><b>{lunchCount}</b><span>Lunch</span></div>
            </div>

            {/* Quick presets */}
            <div className="av-quick">
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={handleBlockAll} disabled={saving}><LuBan /> Block All</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={handleUnblockAll} disabled={saving}><LuCircleCheck /> Open All</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={() => blockPeriod(AM_HOURS)} disabled={saving}><LuSunrise /> Block AM</button>
              <button type="button" className="dc-btn dc-btn--ghost av-quick-btn" onClick={() => blockPeriod(PM_HOURS)} disabled={saving}><LuSunset /> Block PM</button>
            </div>

            <div className="av-hour-grid">
              {HOURS.map(hour => {
                const slotType = slotStatus[hour];
                const isLunch = hour === LUNCH_HOUR;
                let mod = 'available';
                let label = 'Open';
                let disabled = false;
                let SlotIcon = null;

                if (isLunch) {
                  mod = 'lunch'; label = 'Lunch'; disabled = true; SlotIcon = LuCoffee;
                } else if (slotType === false) {
                  mod = 'blocked'; label = 'Blocked'; SlotIcon = LuBan;
                } else if (slotType === 'booked') {
                  mod = 'booked'; label = 'Booked'; disabled = true; SlotIcon = LuLock;
                }

                return (
                  <button
                    type="button"
                    key={hour}
                    className={`av-slot av-slot--${mod}`}
                    onClick={() => !disabled && handleSlotClick(hour)}
                    title={label}
                    disabled={saving || disabled}
                  >
                    {SlotIcon && <SlotIcon className="av-slot-ico" />}
                    <span className="av-slot-time">{formatHourTo12Hr(hour)}</span>
                    <span className="av-slot-label">{label}</span>
                  </button>
                );
              })}
            </div>

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
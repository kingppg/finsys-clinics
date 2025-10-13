import './DentistAvailabilityManager.css';
import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Swal from 'sweetalert2';
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

  function tileDisabled({ date }) {
    return date.getDay() === 0;
  }

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
    <table className="availability-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Day</th>
          <th>Start</th>
          <th>End</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {availability.length === 0 && (
          <tr>
            <td colSpan={7} style={{ textAlign: 'center' }}>No blocks found</td>
          </tr>
        )}
        {availability.map(block => {
          const d = parseLocalDate(block.specific_date);
          return (
            <tr key={block.id}>
              <td>{block.id}</td>
              <td>{d ? d.toLocaleDateString('sv-SE') : ''}</td>
              <td>{d ? WEEKDAYS[d.getDay()] : ''}</td>
              <td>{block.start_time}</td>
              <td>{block.end_time}</td>
              <td style={{color: block.is_available ? "blue":"red", fontWeight:600}}>
                {block.is_available ? 'Available' : 'Blocked'}
              </td>
              <td>
                <button
                  className="availability-action-btn"
                  style={{
                    background:'#e53935',
                    color:'#fff',
                    border:'none',
                    borderRadius:4,
                    padding:'4px 12px',
                    cursor:'pointer'
                  }}
                  onClick={() => handleDelete(block.id)}
                  disabled={saving}
                  title="Delete this block"
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const availableCount = Object.values(slotStatus).filter(v => v === true).length;
  const blockedCount = Object.values(slotStatus).filter(v => v === false).length;
  const bookedCount = Object.values(slotStatus).filter(v => v === 'booked').length;

  return (
    <div className="availability-manager-container" style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
      {/* Only show header/dropdown if NOT launched in modal for a specific dentist */}
      {!dentistId && (
        <>
          <h2 style={{textAlign: 'center'}}>Dentist Availability Manager</h2>
          <label>
            Dentist:&nbsp;
            <select value={selectedDentist} onChange={e => setSelectedDentist(e.target.value)} required>
              <option value="">Select Dentist</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {selectedDentist && (
        <div style={{
          display:'flex',
          gap:'32px',
          alignItems:'flex-start',
          marginBottom:'24px'
        }}>
          <div>
            <Calendar
              selectRange={false}
              value={selectedDate ? parseLocalDate(selectedDate) : new Date()}
              onChange={handleCalendarChange}
              tileDisabled={tileDisabled}
              locale="en-US"
              minDate={new Date()}
              allowPartialRange={false}
              showNeighboringMonth={false}
              showFixedNumberOfWeeks={false}
              maxDetail="month"
            />
          </div>
          <form onSubmit={handleSave} style={{minWidth:'320px'}}>
            <div style={{fontWeight:600,marginBottom:'10px'}}>
              Time Slots for {selectedDate} ({WEEKDAYS[parseLocalDate(selectedDate)?.getDay()]})
            </div>
            <div className="hour-grid" style={{
              display:'grid',
              gridTemplateColumns:'repeat(3,1fr)',
              gap:'10px',
              marginBottom:'16px',
            }}>
              {HOURS.map(hour => {
                const slotType = slotStatus[hour];
                let color = '#1976d2'; // available
                let label = 'Available';
                let disabled = false;

                if (hour === LUNCH_HOUR) {
                  color = '#FF9800'; // orange for lunch
                  label = 'Lunch Break';
                  disabled = true;
                } else if (slotType === false) {
                  color = '#e53935'; // blocked
                  label = 'Blocked';
                  disabled = false;
                } else if (slotType === 'booked') {
                  color = '#757575'; // booked
                  label = 'Booked';
                  disabled = true;
                }

                return (
                  <button
                    type="button"
                    key={hour}
                    className={`hour-slot ${slotType === true ? 'available' : slotType === false || hour === LUNCH_HOUR ? 'blocked' : 'booked'}`}
                    style={{
                      background: color,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      height: 44,
                      fontWeight:600,
                      fontSize:'1em',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      boxShadow: slotType === true ? '0 2px 6px #1976d222' :
                        ((slotType === false || hour === LUNCH_HOUR) ? '0 2px 6px #e5393522' : '0 2px 6px #75757522'),
                      opacity: disabled ? 0.7 : 1
                    }}
                    onClick={() => !disabled && handleSlotClick(hour)}
                    title={label}
                    disabled={saving || disabled}
                  >
                    {formatHourTo12Hr(hour)}
                  </button>
                );
              })}
            </div>
            <div style={{marginBottom: '8px'}}>
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#1976d2',
                verticalAlign: 'middle',
                marginRight: 6,
                border: '1px solid #bbb'
              }} />
              Available &nbsp;&nbsp;
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#e53935',
                verticalAlign: 'middle',
                marginRight: 6,
                border: '1px solid #bbb'
              }} />
              Blocked &nbsp;&nbsp;
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#FF9800',
                verticalAlign: 'middle',
                marginRight: 6,
                border: '1px solid #bbb'
              }} />
              Lunch Break &nbsp;&nbsp;
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#757575',
                verticalAlign: 'middle',
                marginRight: 6,
                border: '1px solid #bbb'
              }} />
              Booked
            </div>
            <div style={{marginBottom:'12px', fontWeight:600}}>
              <span>{availableCount} available, {blockedCount} blocked, {bookedCount} booked</span>
            </div>
            <div style={{display: 'flex', gap: '12px'}}>
              <button
                type="submit"
                style={{
                  background:'#43a047',
                  color:'#fff',
                  fontWeight:600,
                  padding:'10px 24px',
                  border:'none',
                  borderRadius:4,
                  cursor:'pointer'
                }}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                style={{
                  background:'#e53935',
                  color:'#fff',
                  fontWeight:600,
                  padding:'10px 24px',
                  border:'none',
                  borderRadius:4,
                  cursor:'pointer'
                }}
                disabled={saving}
                onClick={handleDeleteDate}
                title="Delete all blocks for this date"
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      )}

      <h3 style={{marginTop: 18, marginBottom: 6}}>Blocked Periods</h3>
      {loading ? (
        <div>Loading availability...</div>
      ) : (
        <div style={{
          maxHeight: 210,
          overflowY: 'auto',
          border: '1px solid #eee',
          borderRadius: 4,
          background: "#fafbfc",
          width: '100%' // or '90%', or '600px', etc.
        }}>
          {renderAvailabilityTable()}
        </div>
      )}
    </div>
  );
}

export default DentistAvailabilityManager;
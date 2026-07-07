import React, { useEffect, useState, useRef, useCallback } from 'react';
import Calendar from 'react-calendar';
import { LuUtensils, LuBan, LuBookMarked, LuClock, LuCheck, LuCalendarClock, LuClipboardList } from 'react-icons/lu';
import { supabase } from '../supabaseClient';
import './AppointmentsModern.css';
import './MainSection.css';
import socket from '../socket';
import Swal from 'sweetalert2';
import { useClinic } from './ClinicContext'; // ✅ import context hook
import { normalizePHMobile } from '../utils/phone';

// ─── Timezone utility ─────────────────────────────────────────────────────────
function getUtcOffset(timeZone) {
  const now = new Date();
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
  const diff = tzDate - utcDate;
  const hours = Math.floor(Math.abs(diff) / 3600000).toString().padStart(2, '0');
  const minutes = ((Math.abs(diff) % 3600000) / 60000).toString().padStart(2, '0');
  return `${diff >= 0 ? '+' : '-'}${hours}:${minutes}`;
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
  return slots;
}

function to12HourFormat(time24) {
  const [hourStr, minStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, '0')}:${minStr} ${ampm}`;
}

function isClinicOpen(date) {
  if (!date) return false;
  return date.getDay() !== 0;
}

// ─── Patient Search + Add Component ───────────────────────────────────────────

function PatientSearchSelect({ patients, selectedPatient, onSelect, onPatientAdded, clinicId, hasError }) {
  const [search, setSearch]           = useState('');
  const [open, setOpen]               = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [newPhone, setNewPhone]       = useState('');
  const [adding, setAdding]           = useState(false);
  const [addError, setAddError]       = useState('');
  const wrapRef                       = useRef(null);
  const inputRef                      = useRef(null);

  // Derive label of selected patient
  const selectedLabel = selectedPatient
    ? (patients.find(p => String(p.id) === String(selectedPatient))?.name || '')
    : '';

  // Filtered list
  const filtered = search.trim().length === 0
    ? patients
    : patients.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.phone || '').includes(search)
      );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setShowAddForm(false);
        setSearch('');
        setAddError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setSearch('');
    setShowAddForm(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (patient) => {
    onSelect(String(patient.id));
    setOpen(false);
    setSearch('');
    setShowAddForm(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect('');
    setSearch('');
  };

  const handleAddNew = async () => {
    setAddError('');
    if (!newName.trim()) { setAddError('Name is required.'); return; }
    if (!newPhone.trim()) { setAddError('Phone is required.'); return; }
    const phone = normalizePHMobile(newPhone);
    if (!phone) { setAddError('Please enter a valid PH mobile number (e.g. 09171234567) — needed for SMS reminders.'); return; }
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert([{ name: newName.trim(), phone, clinic_id: clinicId }])
        .select()
        .single();
      if (error) throw error;
      onPatientAdded(data);   // bubble up so parent refreshes patient list
      onSelect(String(data.id));
      setOpen(false);
      setShowAddForm(false);
      setNewName('');
      setNewPhone('');
      setSearch('');
      Swal.fire({
        icon: 'success',
        title: `${data.name} added!`,
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      setAddError('Failed to add patient. Please try again.');
      console.error(err);
    }
    setAdding(false);
  };

  return (
    <div ref={wrapRef} className="aps-wrap">
      {/* ── Trigger button ── */}
      <div
        onClick={handleOpen}
        className={`aps-trigger${hasError ? ' error' : ''}${selectedLabel ? '' : ' placeholder'}`}
      >
        <span className="aps-trigger-label">
          {selectedLabel || 'Search or select patient…'}
        </span>
        <span className="aps-actions">
          {selectedLabel && (
            <span onClick={handleClear} title="Clear" className="aps-clear">×</span>
          )}
          <span className="aps-caret">▼</span>
        </span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div className="aps-dropdown">
          {/* Search input */}
          <div className="aps-search">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowAddForm(false); }}
              placeholder="Type name or phone…"
            />
          </div>

          {/* Patient list */}
          <div className="aps-list">
            {filtered.length === 0 && !showAddForm && (
              <div className="aps-empty">No patients found.</div>
            )}
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => handleSelect(p)}
                className={`aps-option${String(p.id) === String(selectedPatient) ? ' selected' : ''}`}
              >
                <span>{p.name}</span>
                {p.phone && <span className="aps-option-phone">{p.phone}</span>}
              </div>
            ))}
          </div>

          {/* ── Add new patient ── */}
          {!showAddForm ? (
            <div
              onClick={() => { setShowAddForm(true); setNewName(search); setNewPhone(''); setAddError(''); }}
              className="aps-addrow"
            >
              <span className="aps-addrow-plus">+</span>
              Add new patient{search.trim() ? ` "${search.trim()}"` : ''}
            </div>
          ) : (
            <div className="aps-addform">
              <div className="aps-addform-title">New Patient</div>
              <input
                type="text"
                placeholder="Full name *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
              <input
                type="tel"
                placeholder="09171234567 *"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddNew(); }}
              />
              {addError && <div className="aps-addform-error">{addError}</div>}
              <div className="aps-addform-actions">
                <button
                  type="button"
                  className="dc-btn dc-btn--ghost"
                  onClick={() => { setShowAddForm(false); setAddError(''); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="dc-btn dc-btn--primary"
                  onClick={handleAddNew}
                  disabled={adding}
                >
                  {adding ? 'Adding…' : 'Add Patient'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main AppointmentForm ──────────────────────────────────────────────────────

// ✅ clinicTimeZone removed from props — comes from context now
function AppointmentForm({ appointment, onClose, onEdit, clinicId }) {
  // ✅ Pull clinicTimeZone from context; clinicId still accepted as prop
  //    since AppointmentsModern passes it directly for Supabase queries
  const { clinicTimeZone } = useClinic();

  const [dentists, setDentists] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedDentist, setSelectedDentist] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookedSlots, setBookedSlots] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [procedures, setProcedures] = useState([]);
  const [selectedProcedure, setSelectedProcedure] = useState('');
  const [otherNotes, setOtherNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [doubleBookingChecked, setDoubleBookingChecked] = useState(false);

  const slots = generateTimeSlots("09:00", "18:00", 20);

  const fetchPatients = useCallback(async () => {
    const { data } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('deleted', false);
    const sorted = (data || []).slice().sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
    setPatients(sorted);
  }, [clinicId]);

  useEffect(() => {
    setSelectedDentist(appointment ? String(appointment.dentist_id) : '');
    setSelectedPatient(appointment ? String(appointment.patient_id) : '');
    setSelectedDate(appointment ? new Date(appointment.appointment_time) : new Date());
    setSelectedSlot(appointment ? new Date(appointment.appointment_time).toTimeString().slice(0, 5) : '');
    setOtherNotes('');
    setError('');
    setSuccess('');
    setValidationErrors({});
    setDoubleBookingChecked(false);
    fetchBookedSlots();
    fetchBlockedSlots();
    // eslint-disable-next-line
  }, [appointment]);

  useEffect(() => {
    supabase.from('dentists').select('*').eq('clinic_id', clinicId)
      .then(res => setDentists(res.data || []));
    fetchPatients();
    supabase.from('procedure_categories').select('*, procedures:procedures(*)')
      .eq('clinic_id', clinicId)
      .then(res => setCategories(res.data || []));
  }, [clinicId, fetchPatients]);

  useEffect(() => {
    fetchBookedSlots();
    fetchBlockedSlots();
    // eslint-disable-next-line
  }, [selectedDentist, selectedDate, appointment, clinicId]);

  useEffect(() => {
    // Use the shared socket singleton (env-based URL) — the old code hardcoded
    // http://localhost:5000, so live slot refresh never worked in production.
    // Never disconnect the shared socket here (other views depend on it); just
    // add/remove this listener.
    const handler = () => { fetchBookedSlots(); fetchBlockedSlots(); };
    socket.on('appointment-updated', handler);
    return () => { socket.off('appointment-updated', handler); };
    // eslint-disable-next-line
  }, [selectedDentist, selectedDate, appointment]);

  useEffect(() => {
    const found = categories.find(cat => String(cat.id) === String(selectedCategory));
    setProcedures(found ? found.procedures : []);
    setSelectedProcedure('');
  }, [selectedCategory, categories]);

  useEffect(() => {
    if (appointment && categories.length > 0) {
      let foundProc = null, foundCat = null;
      for (const cat of categories) {
        foundProc = cat.procedures.find(proc => appointment.reason && appointment.reason.includes(proc.name));
        if (foundProc) { foundCat = cat; break; }
      }
      setSelectedCategory(foundCat ? String(foundCat.id) : '');
      setSelectedProcedure(foundProc ? String(foundProc.id) : '');
    }
  }, [appointment, categories]);

  const fetchBookedSlots = async () => {
    if (!selectedDentist || !selectedDate) { setBookedSlots([]); return; }
    const dateStr = selectedDate.toLocaleDateString('sv-SE');
    // Bound the query to a 3-day window around the target day. The old query
    // loaded EVERY appointment for the dentist unscoped — past PostgREST's
    // 1000-row cap that silently truncates, so a busy dentist could have the
    // day's booked slots dropped and rendered "available" → a double-book. A
    // 3-day window can never exceed the cap; the JS date match below stays the
    // authoritative per-day filter.
    const dayMs = 86400000;
    const base = new Date(`${dateStr}T00:00:00`);
    const startISO = new Date(base.getTime() - dayMs).toISOString();
    const endISO = new Date(base.getTime() + 2 * dayMs).toISOString();
    try {
      const { data, error } = await supabase
        .from('appointments').select('id, appointment_time, patient_id, reason')
        .eq('dentist_id', selectedDentist).eq('clinic_id', clinicId).eq('deleted', false)
        .gte('appointment_time', startISO).lt('appointment_time', endISO);
      if (error) { setBookedSlots([]); return; }
      let slotsList = (data || [])
        .filter(appt => new Date(appt.appointment_time).toLocaleDateString('sv-SE') === dateStr)
        .map(appt => ({
          time: new Date(appt.appointment_time).toTimeString().slice(0, 5),
          id: appt.id,
          patientId: appt.patient_id,
          reason: appt.reason || '',
        }));
      if (appointment) slotsList = slotsList.filter(s => s.id !== appointment.id);
      setBookedSlots(slotsList);
    } catch { setBookedSlots([]); }
  };

  const LUNCH_START = 12 * 60;
  const LUNCH_END = 13 * 60;

  function getLunchSlots() {
    return slots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const slotMinutes = h * 60 + m;
      return slotMinutes >= LUNCH_START && slotMinutes < LUNCH_END;
    });
  }

  const fetchBlockedSlots = async () => {
    if (!selectedDentist || !selectedDate) { setBlockedSlots([]); return; }
    const dateStr = selectedDate.toLocaleDateString('sv-SE');
    try {
      const { data: blocks } = await supabase
        .from('dentist_availability').select('*')
        .eq('dentist_id', selectedDentist).eq('clinic_id', clinicId)
        .eq('is_available', false).eq('specific_date', dateStr);
      let blocked = [...getLunchSlots()];
      (blocks || []).forEach(block => {
        const [startHour, startMin] = block.start_time.split(':').map(Number);
        const [endHour, endMin] = block.end_time.split(':').map(Number);
        slots.forEach(slot => {
          const [h, m] = slot.split(':').map(Number);
          const slotMinutes = h * 60 + m;
          if (slotMinutes >= startHour * 60 + startMin && slotMinutes < endHour * 60 + endMin) {
            if (!blocked.includes(slot)) blocked.push(slot);
          }
        });
      });
      setBlockedSlots(blocked);
    } catch { setBlockedSlots(getLunchSlots()); }
  };

  const isTileDisabled = ({ date }) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return date.getDay() === 0 || date < today;
  };

  const isSlotAvailable = (slot) =>
    !bookedSlots.some(s => s.time === slot) && !blockedSlots.includes(slot);

  function isSlotInPast(time) {
    if (!selectedDate) return false;
    const now = new Date();
    const slotDate = new Date(selectedDate);
    const [h, m] = time.split(':').map(Number);
    slotDate.setHours(h, m, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selectedDate.toLocaleDateString() === today.toLocaleDateString()) return slotDate < now;
    return false;
  }

  const validateForm = () => {
    const errors = {};
    if (!selectedDentist) errors.selectedDentist = 'Dentist is required.';
    if (!selectedPatient) errors.selectedPatient = 'Patient is required.';
    if (!selectedSlot) errors.selectedSlot = 'Time slot is required.';
    if (!selectedCategory) errors.selectedCategory = 'Procedure category is required.';
    if (!selectedProcedure) errors.selectedProcedure = 'Procedure is required.';
    if (selectedDate && !isClinicOpen(selectedDate)) errors.selectedDate = 'Clinic is closed on this day.';
    if (selectedDate && selectedDate < new Date(new Date().setHours(0, 0, 0, 0))) errors.selectedDate = 'Date must not be in the past.';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setValidationErrors({});
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the highlighted errors.');
      Swal.fire({ icon: 'error', title: 'Validation Error', html: 'Please fix the highlighted errors.', timer: 2200, timerProgressBar: true });
      return;
    }
    if (!isSlotAvailable(selectedSlot) || isSlotInPast(selectedSlot)) {
      setError('This slot is either booked, blocked, or in the past.');
      Swal.fire({ icon: 'error', title: 'Invalid Slot', html: 'This slot is either booked, blocked, or in the past.', timer: 2200, timerProgressBar: true });
      fetchBookedSlots(); fetchBlockedSlots();
      return;
    }

    // ✅ Build datetime using clinic's timezone offset dynamically
    const dateStr = selectedDate.toLocaleDateString('sv-SE');
    const offset = getUtcOffset(clinicTimeZone);
    const datetime = `${dateStr}T${selectedSlot}:00${offset}`;

    try {
      const { data: patientAppointments, error: dbErr } = await supabase
        .from('appointments').select('*')
        .eq('patient_id', selectedPatient).eq('clinic_id', clinicId).eq('deleted', false);
      if (dbErr) throw dbErr; // don't silently skip the double-booking guard on a read error
      let otherAppointments = appointment
        ? (patientAppointments || []).filter(a => a.id !== appointment.id && a.appointment_time?.startsWith(dateStr))
        : (patientAppointments || []).filter(a => a.appointment_time?.startsWith(dateStr));

      if (otherAppointments.length > 0 && !doubleBookingChecked) {
        const conflictingAppointment = otherAppointments[0];
        Swal.fire({
          icon: 'warning', title: 'Double Booking',
          html: `This patient already has another appointment on this date.<br>
            <b>Appointment Details:</b><br>
            Time: ${new Date(conflictingAppointment.appointment_time).toLocaleTimeString('en-US', {
              timeZone: clinicTimeZone,
              hour: '2-digit',
              minute: '2-digit'
            })}<br>
            Dentist: ${dentists.find(d => String(d.id) === String(conflictingAppointment.dentist_id))?.name || conflictingAppointment.dentist_id}<br>
            Reason: ${conflictingAppointment.reason}<br><br>
            Would you like to edit that appointment instead?`,
          showCancelButton: true,
          confirmButtonText: 'Edit Existing Appointment',
          cancelButtonText: 'Cancel',
        }).then(result => {
          if (result.isConfirmed) { setDoubleBookingChecked(true); onEdit && onEdit(conflictingAppointment); }
        });
        return;
      }
      setDoubleBookingChecked(false);
    } catch {
      Swal.fire({ icon: 'error', title: 'Validation Error', html: 'Could not validate appointment.', timer: 2200, timerProgressBar: true });
      return;
    }

    const selectedProcObj = procedures.find(proc => String(proc.id) === String(selectedProcedure));
    let reasonToSave = selectedProcObj ? selectedProcObj.name : '';
    if (otherNotes.trim()) reasonToSave += ` — Notes: ${otherNotes.trim()}`;

    try {
      // supabase-js does NOT throw on a DB error — it returns { error }. The old
      // code ignored it, so a failed write (RLS/constraint/FK) still showed a
      // success toast and closed the form. Always check the returned error.
      if (appointment) {
        const { error } = await supabase.from('appointments').update({
          dentist_id: selectedDentist, patient_id: selectedPatient,
          appointment_time: datetime, reason: reasonToSave, status: "Scheduled",
          procedure_id: Number(selectedProcedure),
          procedure_price: Number(procedures.find(p => String(p.id) === String(selectedProcedure))?.price || 0),
          notes: otherNotes.trim() || null,
        }).eq('id', appointment.id).eq('clinic_id', clinicId);
        if (error) throw error;
        setSuccess('Appointment updated!');
        Swal.fire({ icon: 'success', title: 'Appointment updated!', timer: 1200, timerProgressBar: true, showConfirmButton: false });
      } else {
        const { error } = await supabase.from('appointments').insert([{
          dentist_id: selectedDentist, patient_id: selectedPatient,
          appointment_time: datetime, reason: reasonToSave, clinic_id: clinicId,
          procedure_id: Number(selectedProcedure),
          procedure_price: Number(procedures.find(p => String(p.id) === String(selectedProcedure))?.price || 0),
          notes: otherNotes.trim() || null,
        }]);
        if (error) throw error;
        setSuccess('Appointment booked!');
        Swal.fire({ icon: 'success', title: 'Appointment booked!', timer: 1200, timerProgressBar: true, showConfirmButton: false });
      }
      setTimeout(() => { setSuccess(''); onClose(); }, 1200);
    } catch (err) {
      // 23505 = the (dentist_id, appointment_time) unique index (migration 023):
      // the slot was taken between our client check and the write.
      const clash = err && (err.code === '23505' || String(err.message || '').toLowerCase().includes('duplicate key'));
      const msg = clash
        ? 'That slot was just taken for this dentist. Please pick another time.'
        : 'Booking failed! This slot may already be taken or dentist is unavailable.';
      setError(msg);
      Swal.fire({ icon: 'error', title: clash ? 'Slot no longer available' : 'Booking failed!', html: msg, timer: 2600, timerProgressBar: true });
      fetchBookedSlots(); fetchBlockedSlots();
    }
  };

  useEffect(() => { setSelectedProcedure(''); }, [selectedCategory]);

  function isLunchSlot(slot) {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m >= LUNCH_START && h * 60 + m < LUNCH_END;
  }

  // Live booking summary values
  const summaryPatient = patients.find(p => String(p.id) === String(selectedPatient))?.name;
  const summaryDentist = dentists.find(d => String(d.id) === String(selectedDentist))?.name;
  const summaryProc = procedures.find(p => String(p.id) === String(selectedProcedure));
  const summaryPrice = summaryProc?.price;
  const canBook = !!(selectedDentist && selectedPatient && selectedSlot && selectedCategory &&
    selectedProcedure && isClinicOpen(selectedDate) && !isSlotInPast(selectedSlot));

  return (
    <section className="main-section appointment-modern">
      <h2>{appointment ? 'Edit Appointment' : 'Add Appointment'}</h2>
      {success && <div className="success-message">{success}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="appointment-grid">
          <div>
            <div className="af-section-head"><LuCalendarClock /><span>Who &amp; When</span></div>
            <label>Dentist:</label>
            <select
              value={selectedDentist}
              onChange={e => setSelectedDentist(e.target.value)}
              className={validationErrors.selectedDentist ? 'input-error' : ''}
            >
              <option value="">Select Dentist</option>
              {dentists.map(d => (
                <option key={d.id} value={String(d.id)}
                  disabled={!d.is_active}
                  style={!d.is_active ? { color: '#aaa', background: '#f4f4f4' } : {}}
                  title={!d.is_active ? "Go to Dentists tab to change this." : undefined}
                >
                  {d.name} {!d.is_active ? "(Inactive)" : ""}
                </option>
              ))}
            </select>
            {validationErrors.selectedDentist && <div className="field-error">{validationErrors.selectedDentist}</div>}

            {/* ── Searchable Patient Field ── */}
            <label>Patient:</label>
            <PatientSearchSelect
              patients={patients}
              selectedPatient={selectedPatient}
              onSelect={setSelectedPatient}
              onPatientAdded={(newPatient) => {
                // Add new patient to local list immediately
                setPatients(prev =>
                  [...prev, newPatient].sort((a, b) =>
                    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
                  )
                );
              }}
              clinicId={clinicId}
              hasError={!!validationErrors.selectedPatient}
            />
            {validationErrors.selectedPatient && <div className="field-error">{validationErrors.selectedPatient}</div>}

            <label>Date:</label>
            <Calendar
              value={selectedDate}
              onChange={setSelectedDate}
              minDate={new Date()}
              tileDisabled={isTileDisabled}
            />
            {validationErrors.selectedDate && <div className="field-error">{validationErrors.selectedDate}</div>}
            {!isClinicOpen(selectedDate) && selectedDate && (
              <div className="appt-closed-note">
                Clinic is closed on Sundays. Please select another day.
              </div>
            )}
          </div>

          <div>
            <div className="af-section-head"><LuClock /><span>Time</span></div>
            <div className="af-slots-sub">
              {selectedDentist && selectedDate && isClinicOpen(selectedDate)
                ? `${dentists.find(d => String(d.id) === String(selectedDentist))?.name || ''} · ${selectedDate.toLocaleDateString()}`
                : 'Select a dentist and date to see available slots'}
            </div>
            <div className="slots-list">
              {slots.map(time => {
                const bookedSlotObj = bookedSlots.find(s => s.time === time);
                const lunch = isLunchSlot(time);
                const blocked = blockedSlots.includes(time) && !lunch;
                const past = isSlotInPast(time);
                const disabled =
                  lunch || blocked || !!bookedSlotObj ||
                  !selectedDentist || !isClinicOpen(selectedDate) || past;
                const isSelected = !disabled && selectedSlot === time;

                let stateClass = 'available', icon = null, title = 'Available';
                if (lunch)              { stateClass = 'lunch';   icon = <LuUtensils />;  title = 'Lunch Break (12:00–1:00 PM)'; }
                else if (blocked)       { stateClass = 'blocked'; icon = <LuBan />;       title = 'Dentist Blocked'; }
                else if (bookedSlotObj) { stateClass = 'booked';  icon = <LuBookMarked />; title = `Booked: ${patients.find(p => String(p.id) === String(bookedSlotObj.patientId))?.name || 'Unknown'}${bookedSlotObj.reason ? '\nProcedure: ' + bookedSlotObj.reason : ''}`; }
                else if (past)          { stateClass = 'past';    icon = <LuClock />;     title = 'Past'; }
                else if (isSelected)    { stateClass = 'selected'; icon = <LuCheck />;    title = 'Selected'; }

                return (
                  <button type="button" key={time}
                    className={`slot-btn ${isSelected ? 'selected' : stateClass}`}
                    disabled={disabled}
                    onClick={() => setSelectedSlot(time)}
                    title={title}
                  >
                    <span className="slot-time">{to12HourFormat(time)}</span>
                    {icon && <span className="slot-icon">{icon}</span>}
                  </button>
                );
              })}
            </div>
            <div className="slot-legend">
              <span className="lg-lunch"><LuUtensils /> Lunch</span>
              <span className="lg-blocked"><LuBan /> Blocked</span>
              <span className="lg-booked"><LuBookMarked /> Booked</span>
            </div>
            {validationErrors.selectedSlot && <div className="field-error">{validationErrors.selectedSlot}</div>}

            <div className="af-section-head"><LuClipboardList /><span>Procedure</span></div>
            <label>Procedure Category:</label>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} required className={validationErrors.selectedCategory ? 'input-error' : ''}>
              <option value="">Select Category</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            {validationErrors.selectedCategory && <div className="field-error">{validationErrors.selectedCategory}</div>}

            <label>Procedure:</label>
            <select value={selectedProcedure} onChange={e => setSelectedProcedure(e.target.value)} required disabled={!selectedCategory} className={validationErrors.selectedProcedure ? 'input-error' : ''}>
              <option value="">Select Procedure</option>
              {procedures.map(proc => (
                <option key={proc.id} value={proc.id}>{proc.name} {proc.price ? `₱${proc.price}` : ""}</option>
              ))}
            </select>
            {validationErrors.selectedProcedure && <div className="field-error">{validationErrors.selectedProcedure}</div>}

            {selectedProcedure && (
              <div className="appt-price">
                Price: ₱{procedures.find(p => String(p.id) === String(selectedProcedure))?.price || '0.00'}
              </div>
            )}

            <label>Additional Notes (optional):</label>
            <input type="text" value={otherNotes} onChange={e => setOtherNotes(e.target.value)} placeholder="Add notes or details" />
          </div>
        </div>

        {/* ── Live booking summary + actions ── */}
        {error && <div className="modal-error af-error">{error}</div>}
        <div className="af-summary">
          <div className="af-summary-items">
            <div className="af-summary-item">
              <span className="af-summary-label">Patient</span>
              <span className="af-summary-value">{summaryPatient || '—'}</span>
            </div>
            <div className="af-summary-item">
              <span className="af-summary-label">Dentist</span>
              <span className="af-summary-value">{summaryDentist || '—'}</span>
            </div>
            <div className="af-summary-item">
              <span className="af-summary-label">Date</span>
              <span className="af-summary-value">{selectedDate ? selectedDate.toLocaleDateString() : '—'}</span>
            </div>
            <div className="af-summary-item">
              <span className="af-summary-label">Time</span>
              <span className="af-summary-value">{selectedSlot ? to12HourFormat(selectedSlot) : '—'}</span>
            </div>
            <div className="af-summary-item">
              <span className="af-summary-label">Procedure</span>
              <span className="af-summary-value">{summaryProc?.name || '—'}</span>
            </div>
          </div>
          <div className="af-summary-right">
            <div className="af-summary-total">
              <span>Total</span>
              <strong>₱{summaryPrice || '0.00'}</strong>
            </div>
            <div className="af-summary-actions">
              <button type="button" className="dc-btn dc-btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="dc-btn dc-btn--primary" disabled={!canBook}>
                {appointment ? 'Save Changes' : 'Book Appointment'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

export default AppointmentForm;
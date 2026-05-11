import React, { useEffect, useState, useRef, useCallback } from 'react';
import Calendar from 'react-calendar';
import { supabase } from '../supabaseClient';
import './AppointmentsModern.css';
import './MainSection.css';
import io from 'socket.io-client';
import Swal from 'sweetalert2';

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
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert([{ name: newName.trim(), phone: newPhone.trim(), clinic_id: clinicId }])
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
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 4 }}>
      {/* ── Trigger button ── */}
      <div
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
          border: hasError ? '1.5px solid #e74c3c' : '1px solid #d1d5db',
          background: '#fff', minHeight: 36, fontSize: 14,
          color: selectedLabel ? '#111827' : '#9ca3af',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel || 'Search or select patient…'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          {selectedLabel && (
            <span
              onClick={handleClear}
              title="Clear"
              style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
            >
              ×
            </span>
          )}
          <span style={{ color: '#9ca3af', fontSize: 11 }}>▼</span>
        </span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.13)', marginTop: 2,
          maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          {/* Search input */}
          <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowAddForm(false); }}
              placeholder="Type name or phone…"
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 4,
                border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Patient list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && !showAddForm && (
              <div style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 13 }}>
                No patients found.
              </div>
            )}
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => handleSelect(p)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                  background: String(p.id) === String(selectedPatient) ? '#eff6ff' : '#fff',
                  color: String(p.id) === String(selectedPatient) ? '#185abd' : '#111827',
                  fontWeight: String(p.id) === String(selectedPatient) ? 600 : 400,
                  borderBottom: '1px solid #f9fafb',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                onMouseLeave={e => e.currentTarget.style.background =
                  String(p.id) === String(selectedPatient) ? '#eff6ff' : '#fff'}
              >
                <span>{p.name}</span>
                {p.phone && (
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{p.phone}</span>
                )}
              </div>
            ))}
          </div>

          {/* ── Add new patient ── */}
          {!showAddForm ? (
            <div
              onClick={() => { setShowAddForm(true); setNewName(search); setNewPhone(''); setAddError(''); }}
              style={{
                padding: '9px 12px', borderTop: '1px solid #e5e7eb',
                cursor: 'pointer', fontSize: 13, color: '#185abd',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                background: '#f8faff',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#f8faff'}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              Add new patient{search.trim() ? ` "${search.trim()}"` : ''}
            </div>
          ) : (
            <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', background: '#f8faff' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#185abd', marginBottom: 8 }}>
                New Patient
              </div>
              <input
                type="text"
                placeholder="Full name *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 4,
                  border: '1px solid #d1d5db', fontSize: 13, marginBottom: 6,
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
              <input
                type="tel"
                placeholder="Phone number *"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 4,
                  border: '1px solid #d1d5db', fontSize: 13, marginBottom: 6,
                  boxSizing: 'border-box',
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleAddNew(); }}
              />
              {addError && (
                <div style={{ fontSize: 12, color: '#e74c3c', marginBottom: 6 }}>{addError}</div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { setShowAddForm(false); setAddError(''); }}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 4,
                    border: '1px solid #d1d5db', background: '#fff',
                    fontSize: 12, cursor: 'pointer', color: '#374151',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNew}
                  disabled={adding}
                  style={{
                    flex: 2, padding: '6px 0', borderRadius: 4,
                    border: 'none', background: '#185abd',
                    fontSize: 12, cursor: adding ? 'not-allowed' : 'pointer',
                    color: '#fff', fontWeight: 600, opacity: adding ? 0.7 : 1,
                  }}
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

function AppointmentForm({ appointment, onClose, onEdit, clinicId }) {
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
  const socketRef = useRef();

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
    socketRef.current = io('http://localhost:5000');
    socketRef.current.on('appointment-updated', () => {
      fetchBookedSlots();
      fetchBlockedSlots();
    });
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
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
    try {
      const { data, error } = await supabase
        .from('appointments').select('id, appointment_time, patient_id, reason')
        .eq('dentist_id', selectedDentist).eq('clinic_id', clinicId).eq('deleted', false);
      if (error) { setBookedSlots([]); return; }
      let slotsList = (data || [])
        .filter(appt => new Date(appt.appointment_time).toLocaleDateString('sv-SE') === dateStr)
        .map(appt => ({
          time: new Date(appt.appointment_time).toTimeString().slice(0, 5),
          id: appt.id,
          patientName: appt.patient_name || '',
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
    const dateStr = selectedDate.toLocaleDateString('sv-SE');
    const datetime = `${dateStr}T${selectedSlot}:00+08:00`;

    try {
      const { data: patientAppointments } = await supabase
        .from('appointments').select('*')
        .eq('patient_id', selectedPatient).eq('clinic_id', clinicId).eq('deleted', false);
      let otherAppointments = appointment
        ? (patientAppointments || []).filter(a => a.id !== appointment.id && a.appointment_time?.startsWith(dateStr))
        : (patientAppointments || []).filter(a => a.appointment_time?.startsWith(dateStr));

      if (otherAppointments.length > 0 && !doubleBookingChecked) {
        const conflictingAppointment = otherAppointments[0];
        Swal.fire({
          icon: 'warning', title: 'Double Booking',
          html: `This patient already has another appointment on this date.<br>
            <b>Appointment Details:</b><br>
            Time: ${new Date(conflictingAppointment.appointment_time).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}<br>
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
      if (appointment) {
        await supabase.from('appointments').update({
          dentist_id: selectedDentist, patient_id: selectedPatient,
          appointment_time: datetime, reason: reasonToSave, status: "Scheduled",
          procedure_id: Number(selectedProcedure),
          procedure_price: Number(procedures.find(p => String(p.id) === String(selectedProcedure))?.price || 0),
          notes: otherNotes.trim() || null,
        }).eq('id', appointment.id).eq('clinic_id', clinicId);
        setSuccess('Appointment updated!');
        Swal.fire({ icon: 'success', title: 'Appointment updated!', timer: 1200, timerProgressBar: true, showConfirmButton: false });
      } else {
        await supabase.from('appointments').insert([{
          dentist_id: selectedDentist, patient_id: selectedPatient,
          appointment_time: datetime, reason: reasonToSave, clinic_id: clinicId,
          procedure_id: Number(selectedProcedure),
          procedure_price: Number(procedures.find(p => String(p.id) === String(selectedProcedure))?.price || 0),
          notes: otherNotes.trim() || null,
        }]);
        setSuccess('Appointment booked!');
        Swal.fire({ icon: 'success', title: 'Appointment booked!', timer: 1200, timerProgressBar: true, showConfirmButton: false });
      }
      setTimeout(() => { setSuccess(''); onClose(); }, 1200);
    } catch {
      setError('Booking failed! This slot may already be taken or dentist is unavailable.');
      Swal.fire({ icon: 'error', title: 'Booking failed!', html: 'This slot may already be taken or dentist is unavailable.', timer: 2200, timerProgressBar: true });
      fetchBookedSlots(); fetchBlockedSlots();
    }
  };

  useEffect(() => { setSelectedProcedure(''); }, [selectedCategory]);

  function isLunchSlot(slot) {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m >= LUNCH_START && h * 60 + m < LUNCH_END;
  }

  return (
    <section className="main-section appointment-modern">
      <h2>{appointment ? 'Edit Appointment' : 'Add Appointment'}</h2>
      {success && <div className="success-message">{success}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="appointment-grid">
          <div>
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
              <div style={{ color: "red", marginTop: 8 }}>
                Clinic is closed on Sundays. Please select another day.
              </div>
            )}
          </div>

          <div>
            <h3>
              {selectedDentist && selectedDate && isClinicOpen(selectedDate)
                ? `Available Slots for ${dentists.find(d => String(d.id) === String(selectedDentist))?.name || ''} on ${selectedDate.toLocaleDateString()}`
                : 'Select a dentist and date'}
            </h3>
            <div className="slots-list">
              {slots.map(time => {
                const bookedSlotObj = bookedSlots.find(s => s.time === time);
                const disabled =
                  blockedSlots.includes(time) || !!bookedSlotObj ||
                  !selectedDentist || !isClinicOpen(selectedDate) || isSlotInPast(time);

                let slotIcon = null, ariaLabel, title;
                if (isLunchSlot(time))               { slotIcon = "🍽️"; ariaLabel = "Lunch Break"; title = "Lunch Break (12:00-1:00 PM)"; }
                else if (blockedSlots.includes(time)) { slotIcon = "🚫"; ariaLabel = "Blocked";     title = "Dentist Blocked"; }
                else if (bookedSlotObj)               { slotIcon = "📒"; ariaLabel = "Booked";      title = `Booked: ${bookedSlotObj.patientName || 'Unknown'}\nProcedure: ${bookedSlotObj.reason || ''}`; }
                else if (isSlotInPast(time))          { slotIcon = "⏰"; ariaLabel = "Past";        title = "Past"; }

                return (
                  <button type="button" key={time}
                    className={
                      disabled
                        ? isLunchSlot(time) ? "slot-btn lunch"
                          : blockedSlots.includes(time) ? "slot-btn blocked"
                          : !!bookedSlotObj ? "slot-btn booked"
                          : isSlotInPast(time) ? "slot-btn past"
                          : "slot-btn disabled"
                        : selectedSlot === time ? "slot-btn selected" : "slot-btn available"
                    }
                    disabled={disabled}
                    onClick={() => setSelectedSlot(time)}
                    title={title || "Available"}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '1em' }}>
                      <span style={{
                        color: isLunchSlot(time) ? '#FF9800' : blockedSlots.includes(time) ? '#b71c1c' : !!bookedSlotObj ? '#888' : isSlotInPast(time) ? '#bdbdbd' : undefined,
                        fontWeight: isLunchSlot(time) || blockedSlots.includes(time) ? 'bold' : undefined,
                      }}>
                        {to12HourFormat(time)}
                      </span>
                      <span
                        className={isLunchSlot(time) ? "lunch-icon" : blockedSlots.includes(time) ? "blocked-icon" : !!bookedSlotObj ? "booked-icon" : isSlotInPast(time) ? "past-icon" : "icon-placeholder"}
                        aria-label={ariaLabel} title={title}
                        style={{ width: '2em', minWidth: '2em', height: '1em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: '4px', fontSize: '1.15em' }}
                      >
                        {slotIcon}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {validationErrors.selectedSlot && <div className="field-error">{validationErrors.selectedSlot}</div>}

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
              <div style={{ marginTop: 6, color: '#185abd', fontWeight: 600 }}>
                Price: ₱{procedures.find(p => String(p.id) === String(selectedProcedure))?.price || '0.00'}
              </div>
            )}

            <label>Additional Notes (optional):</label>
            <input type="text" value={otherNotes} onChange={e => setOtherNotes(e.target.value)} placeholder="Add notes or details" />

            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions" style={{ marginTop: 22 }}>
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit"
                disabled={!selectedDentist || !selectedPatient || !selectedSlot || !selectedCategory || !selectedProcedure || !isClinicOpen(selectedDate) || isSlotInPast(selectedSlot)}
              >
                {appointment ? 'Save' : 'Book'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

export default AppointmentForm;
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { authHeaders } from '../api/authHeaders';
import StatusSelect from './StatusSelect';
import { StatusUpdateModal } from './StatusUpdateModal';
import { LuSquarePen, LuTrash2, LuImages, LuBell, LuBellOff } from 'react-icons/lu';
import './AppointmentsModern.css';
import './MainSection.css';
import Swal from 'sweetalert2';
import socket from '../socket';
import { useClinic } from './ClinicContext';
import { fetchAllRows } from '../api/fetchAllRows';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// ================= CONFIG =================
const ENABLE_ROW_HOVER_AUTO_CLEAR = false;
const TOAST_THROTTLE_MS = 1500;
const FLASH_DURATION_MS = 60000; // 1 minute
const SOUND_PATH = process.env.PUBLIC_URL + '/sounds/notify.mp3';
// ==========================================

function getWeeksOfMonth(year, month) {
  const m = parseInt(month, 10) - 1;
  const firstDayOfMonth = new Date(year, m, 1);
  const lastDayOfMonth = new Date(year, m + 1, 0);

  let weeks = [];
  let start = new Date(firstDayOfMonth);
  let end;
  if (start.getDay() === 0) {
    end = new Date(start);
  } else {
    end = new Date(start);
    end.setDate(start.getDate() + (7 - start.getDay()));
    if (end > lastDayOfMonth) end = new Date(lastDayOfMonth);
  }
  weeks.push({ start: new Date(start), end: new Date(end) });

  let nextMonday = new Date(end);
  nextMonday.setDate(end.getDate() + 1);

  while (nextMonday <= lastDayOfMonth) {
    let weekStart = new Date(nextMonday);
    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > lastDayOfMonth) weekEnd = new Date(lastDayOfMonth);
    weeks.push({ start: weekStart, end: weekEnd });
    nextMonday = new Date(weekEnd);
    nextMonday.setDate(weekEnd.getDate() + 1);
  }
  return weeks;
}

function getYearList(appointments) {
  const years = new Set();
  const thisYear = new Date().getFullYear();
  appointments.forEach(a => years.add(new Date(a.appointment_time).getFullYear()));
  let arr = Array.from(years);
  if (arr.length === 0) arr = [thisYear];
  const min = Math.min(...arr, thisYear - 2);
  const max = Math.max(...arr, thisYear);
  const result = [];
  for (let y = min; y <= max; ++y) result.push(y);
  return result;
}

function getMonthList() {
  return [
    { value: "01", name: "January" }, { value: "02", name: "February" },
    { value: "03", name: "March" }, { value: "04", name: "April" },
    { value: "05", name: "May" }, { value: "06", name: "June" },
    { value: "07", name: "July" }, { value: "08", name: "August" },
    { value: "09", name: "September" }, { value: "10", name: "October" },
    { value: "11", name: "November" }, { value: "12", name: "December" },
  ];
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function AppointmentsTable({ onAdd, onEdit, onReminder, onFiles, clinicId, jumpDate }) {
  const { clinicTimeZone } = useClinic();

  const [appointments, setAppointments] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('daily');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedDentist, setSelectedDentist] = useState('');
  const [statusLoadingIds, setStatusLoadingIds] = useState([]);
  const [now, setNow] = useState(new Date());

  const [flashRow, setFlashRow] = useState(null);
  const flashTimerRef = useRef(null);

  const [unreadUpdates, setUnreadUpdates] = useState([]);

  const lastToastRef = useRef(0);
  const audioRef = useRef(null);
  const glowTimers = useRef({});

  const [collapsedDentists, setCollapsedDentists] = useState({});
  const [summaryPulse, setSummaryPulse] = useState(false);

  const isInitialized = useRef(false);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(()=>{});
    }
  }, []);

  useEffect(() => {
    setSummaryPulse(true);
    const t = setTimeout(() => setSummaryPulse(false), 500);
    return () => clearTimeout(t);
  }, [appointments.length, viewMode, selectedDentist]);

  useEffect(() => {
    if (jumpDate) return;
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate());
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);

    if (viewMode === 'weekly') {
      const weeksArr = getWeeksOfMonth(currentYear, currentMonth);
      let weekIdx = 0;
      for (let i = 0; i < weeksArr.length; i++) {
        const { start, end } = weeksArr[i];
        if (now >= start && now <= end) {
          weekIdx = i;
          break;
        }
      }
      setSelectedWeekIdx(weekIdx);
      setSelectedDay('');
    } else if (viewMode === 'daily') {
      setSelectedWeekIdx(0);
      setSelectedDay(currentDay);
    } else {
      setSelectedWeekIdx(0);
      setSelectedDay('');
    }

    // Mark as initialized after setting all values
    isInitialized.current = true;
  }, [viewMode, jumpDate]);

  useEffect(() => {
    const preload = async () => {
      setLoading(true);
      try {
        const [denRes, patRes, appAll] = await Promise.all([
          supabase.from('dentists').select('*').eq('clinic_id', clinicId),
          supabase.from('patients').select('*').eq('clinic_id', clinicId).eq('deleted', false),
          // Paged so the Year dropdown reflects EVERY year, not just the first
          // 1000 appointments (PostgREST's silent cap).
          fetchAllRows((from, to) =>
            supabase.from('appointments').select('*')
              .eq('clinic_id', clinicId).eq('deleted', false)
              .order('id', { ascending: true }).range(from, to)
          ),
        ]);
        setDentists(denRes.data || []);
        setPatients(patRes.data || []);

        const years = getYearList(appAll || []);
        const currentYear = String(new Date().getFullYear());
        if (!selectedYear && !jumpDate) {
          if (years.includes(Number(currentYear))) {
            setSelectedYear(currentYear);
          } else {
            setSelectedYear(String(Math.max(...years)));
          }
        }

      } catch {
        setDentists([]);
        setPatients([]);
        setAppointments([]);
      }
      
    };
    if (clinicId) preload();
    // eslint-disable-next-line
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) fetchAppointments();
    // eslint-disable-next-line
  }, [viewMode, selectedYear, selectedMonth, selectedWeekIdx, selectedDay, selectedDentist, clinicId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const scrollToRow = useCallback((id) => {
    const appt = appointments.find(a => a.id === id);
    if (appt) {
      const dentistId = appt.dentist_id;
      if (collapsedDentists[dentistId]) {
        setCollapsedDentists(prev => ({
          ...prev,
          [dentistId]: false
        }));
        setTimeout(() => {
          const row = document.querySelector(`tr[data-appt-id="${id}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('row-scroll-focus');
            if (glowTimers.current[id]) clearTimeout(glowTimers.current[id]);
            glowTimers.current[id] = setTimeout(() => {
              row.classList.remove('row-scroll-focus');
            }, 4000);
          }
        }, 350);
        return;
      }
    }
    const row = document.querySelector(`tr[data-appt-id="${id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('row-scroll-focus');
      if (glowTimers.current[id]) clearTimeout(glowTimers.current[id]);
      glowTimers.current[id] = setTimeout(() => {
        row.classList.remove('row-scroll-focus');
      }, 4000);
    }
  }, [appointments, collapsedDentists]);

  const playSound = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(SOUND_PATH);
      audioRef.current.volume = 0.6;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(()=>{});
  };

  const showUpdateToast = (appt) => {
    const nowTs = Date.now();
    if (nowTs - lastToastRef.current < TOAST_THROTTLE_MS) return;
    lastToastRef.current = nowTs;

    const isCancelled = ['Cancelled', 'No Show'].includes(appt.status);
    Swal.fire({
      toast: true,
      icon: isCancelled ? 'error' : 'info',
      title: `#${appt.id} ${appt.status}`,
      html: `<small>${new Date(appt.appointment_time).toLocaleTimeString('en-US', {
        timeZone: clinicTimeZone,
        hour: '2-digit',
        minute: '2-digit'
      })}</small>
             <br/><button id="toast-view-btn" style="margin-top:6px; background:#185abd; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">View</button>`,
      position: 'top-end',
      showConfirmButton: false,
      timer: 6000,
      didOpen: () => {
        const btn = document.getElementById('toast-view-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            scrollToRow(appt.id);
            Swal.close();
          });
        }
      }
    });
  };

  const showBrowserNotification = (appt) => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const n = new Notification(`Appt #${appt.id} ${appt.status}`, {
      body: new Date(appt.appointment_time).toLocaleTimeString('en-US', {
        timeZone: clinicTimeZone,
        hour: '2-digit',
        minute: '2-digit'
      }) + ' • Click to view',
      tag: `appt-${appt.id}`
    });
    n.onclick = () => {
      window.focus();
      setTimeout(() => scrollToRow(appt.id), 300);
    };
  };

  useEffect(() => {
    function handleAppointmentUpdated(updatedRow) {
      if (!updatedRow || String(updatedRow.clinic_id) !== String(clinicId)) return;
      if (!passesCurrentFilter(updatedRow)) return;

      if (collapsedDentists[updatedRow.dentist_id]) {
        setCollapsedDentists(prev => ({
          ...prev,
          [updatedRow.dentist_id]: false
        }));
      }

      setAppointments(prev => {
        let found = false;
        const patched = prev.map(a => {
          if (a.id === updatedRow.id) {
            found = true;
            return { ...a, ...updatedRow };
          }
          return a;
        });
        return found ? patched : [...patched, updatedRow];
      });

      setUnreadUpdates(prev => prev.includes(updatedRow.id) ? prev : [...prev, updatedRow.id]);

      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setFlashRow({ id: updatedRow.id, status: updatedRow.status, ts: Date.now() });
      flashTimerRef.current = setTimeout(() => {
        setFlashRow(null);
      }, FLASH_DURATION_MS);

      playSound();
      if (!document.hidden) {
        showUpdateToast(updatedRow);
      } else {
        showBrowserNotification(updatedRow);
      }
      fetchPatients();
    }

    socket.on('appointment-updated', handleAppointmentUpdated);

    function handleVisibilityChange() {
      if (!document.hidden && unreadUpdates.length > 0) {
        unreadUpdates.forEach(id => {
          const appt = appointments.find(a => a.id === id);
          if (appt) {
            setFlashRow({ id, status: appt.status, ts: Date.now() });
          }
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('appointment-updated', handleAppointmentUpdated);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      Object.values(glowTimers.current).forEach(t => clearTimeout(t));
      glowTimers.current = {};
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line
  }, [clinicId, viewMode, selectedYear, selectedMonth, selectedWeekIdx, selectedDay, scrollToRow, collapsedDentists, unreadUpdates, appointments]);

  useEffect(() => {
    if (!jumpDate) return;
    setSelectedYear(String(jumpDate.year));
    setSelectedMonth(String(jumpDate.month + 1).padStart(2, '0'));
    setSelectedDay(String(jumpDate.day));
    isInitialized.current = true;
  }, [jumpDate]);

  useEffect(() => {
  }, [selectedMonth]);

  function passesCurrentFilter(appt) {
    const d = new Date(appt.appointment_time);
    if (viewMode === 'monthly') {
      return d.getFullYear() === Number(selectedYear) &&
             (d.getMonth() + 1) === Number(selectedMonth);
    }
    if (viewMode === 'weekly') {
      const weeksArr = getWeeksOfMonth(selectedYear, selectedMonth);
      const w = weeksArr[selectedWeekIdx];
      if (!w) return false;
      return d >= w.start && d <= w.end;
    }
    if (viewMode === 'daily') {
      return d.getFullYear() === Number(selectedYear) &&
             (d.getMonth() + 1) === Number(selectedMonth) &&
             d.getDate() === Number(selectedDay);
    }
    return true;
  }

  const fetchAppointments = async () => {
    // Guard: don't fetch if required filter values aren't ready
    if (!isInitialized.current) return;
    if (viewMode === 'daily' && (!selectedYear || !selectedMonth || !selectedDay)) return;
    if (viewMode === 'monthly' && (!selectedYear || !selectedMonth)) return;
    if (viewMode === 'weekly' && (!selectedYear || !selectedMonth)) return;

    setLoading(true);
    try {
      // Paged fetch so views never silently drop the oldest appointments once a
      // clinic passes PostgREST's 1000-row cap. JS date-filtering below unchanged.
      let arr = await fetchAllRows((from, to) =>
        supabase
          .from('appointments')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('deleted', false)
          .order('id', { ascending: true })
          .range(from, to)
      );

      let filtered = [];
      if (viewMode === 'monthly' && selectedYear && selectedMonth) {
        filtered = arr.filter(a => {
          const d = new Date(a.appointment_time);
          return d.getFullYear() === Number(selectedYear) &&
                 (d.getMonth() + 1) === Number(selectedMonth);
        });
      } else if (viewMode === 'weekly' && selectedYear && selectedMonth) {
        const weeksArr = getWeeksOfMonth(selectedYear, selectedMonth);
        const { start, end } = weeksArr[selectedWeekIdx] || {};
        filtered = arr.filter(a => {
          const dateObj = new Date(a.appointment_time);
          return start && end && dateObj >= start && dateObj <= end;
        });
      } else if (viewMode === 'daily' && selectedYear && selectedMonth && selectedDay) {
        filtered = arr.filter(a => {
          const d = new Date(a.appointment_time);
          return d.getFullYear() === Number(selectedYear) &&
                 (d.getMonth() + 1) === Number(selectedMonth) &&
                 d.getDate() === Number(selectedDay);
        });
      } else {
        filtered = arr;
      }

      setAppointments(filtered);
      setUnreadUpdates(prev => prev.filter(id => filtered.some(f => f.id === id)));

      if (flashRow && !filtered.some(a => a.id === flashRow.id)) {
        setFlashRow(null);
      }
    } catch {
      setAppointments([]);
    }
    setLoading(false);
  };

  const fetchPatients = async () => {
    try {
      let { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('deleted', false);
      if (error) throw error;
      setPatients(data);
    } catch {
      setPatients([]);
    }
  };

  const dentistName = (id) =>
    dentists.find(d => String(d.id) === String(id))?.name || id;

  const patientName = (id) =>
    patients.find(p => String(p.id) === String(id))?.name || id;

  const handleDelete = async (id) => {
    const { isConfirmed } = await Swal.fire({
      title: 'Are you sure?',
      text: 'Do you want to cancel this appointment?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, cancel it!',
      cancelButtonText: 'No',
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        confirmButton: 'swal2-confirm-btn',
        cancelButton: 'swal2-cancel-btn'
      }
    });
    if (isConfirmed) {
      try {
        await supabase
          .from('appointments')
          .update({ deleted: true })
          .eq('id', id)
          .eq('clinic_id', clinicId);
        Swal.fire({
          icon: 'success',
          title: 'Appointment cancelled',
          timer: 1400,
          showConfirmButton: false
        });
        fetchAppointments();
        fetchPatients();
      } catch {
        Swal.fire({
          icon: 'error',
          title: 'Failed to cancel',
          text: 'There was a problem cancelling the appointment.',
          timer: 1800,
          showConfirmButton: false
        });
      }
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    setStatusLoadingIds(ids => [...ids, id]);
    const appointment = appointments.find(a => a.id === id);

    if (['Checked-In', 'Completed', 'No Show', 'Cancelled'].includes(newStatus)) {
      await StatusUpdateModal.confirmAndUpdate({
        appointment: {
          ...appointment,
          patient_name: patientName(appointment.patient_id),
          clinic_id: appointment.clinic_id ?? clinicId
        },
        newStatus,
        onStatusUpdated: (updatedStatus) => {
          setAppointments(apps =>
            apps.map(a => a.id === appointment.id ? { ...a, status: updatedStatus } : a)
          );
          fetchPatients();
        }
      });
      setStatusLoadingIds(ids => ids.filter(i => i !== id));
      return;
    }

    try {
      await supabase
        .from('appointments')
        .update({ status: newStatus, checked_in_at: null })
        .eq('id', id)
        .eq('clinic_id', appointment?.clinic_id ?? clinicId);
      await fetch(`${API_BASE}/status-notifications/${id}`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status: newStatus,
          message: "",
          clinic_id: appointment?.clinic_id ?? clinicId
        })
    });

      setAppointments(apps => apps.map(a => a.id === id ? { ...a, status: newStatus } : a));
      Swal.fire({
        icon: 'success',
        title: 'Status updated',
        text: `Appointment status changed to "${newStatus}"`,
        timer: 1200,
        showConfirmButton: false
      });
      fetchPatients();
    } catch {
      Swal.fire({
        icon: 'error',
        title: 'Failed to update status!',
        text: 'There was a problem updating the appointment status.',
        timer: 1800,
        showConfirmButton: false
      });
    }
    setStatusLoadingIds(ids => ids.filter(i => i !== id));
  };

  const acknowledgeAll = () => {
    setUnreadUpdates([]);
  };

  const handleRowMouseEnter = (id) => {
    if (!ENABLE_ROW_HOVER_AUTO_CLEAR) return;
    setUnreadUpdates(prev => prev.filter(x => x !== id));
  };

  const totalAppointmentsAllDentists = appointments.length;

  const dentistAppointmentCountMap = dentists.reduce((acc, d) => {
    acc[d.id] = 0;
    return acc;
  }, {});
  appointments.forEach(appt => {
    if (dentistAppointmentCountMap.hasOwnProperty(appt.dentist_id)) {
      dentistAppointmentCountMap[appt.dentist_id] += 1;
    }
  });

  const years = getYearList(appointments);
  const weeksArr = selectedYear && selectedMonth ? getWeeksOfMonth(selectedYear, selectedMonth) : [];

  function renderStatusCell(appt) {
    const isLoading = statusLoadingIds.includes(appt.id);
    if (isLoading) {
      return <span style={{ padding: '3px 10px', display: 'inline-block' }}>Updating...</span>;
    }
    return (
      <StatusSelect
        value={appt.status}
        onChange={newStatus => handleStatusChange(appt.id, newStatus)}
        appointmentTime={appt.appointment_time}
      />
    );
  }

  function displayOrigin(origin) {
    if (!origin || origin === '') return "System";
    if (origin.toLowerCase().includes("messenger")) return "Messenger";
    return origin;
  }

  function formatLongDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      timeZone: clinicTimeZone,
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      timeZone: clinicTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function renderProcedureCell(appt) {
    return appt.reason;
  }

  function renderActionsCell(appt) {
    const hasMessengerId =
      patients.find(p => String(p.id) === String(appt.patient_id))?.messenger_id
      || appt.guardian_messenger_id;

    return (
      <td className="appointments-actions-cell">
        <div className="appt-actions">
          <button
            type="button"
            className="appt-action-btn appt-action-edit"
            title="Edit"
            aria-label="Edit appointment"
            onClick={() => onEdit(appt)}
          >
            <LuSquarePen size={19} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="appt-action-btn appt-action-delete"
            title="Cancel appointment"
            aria-label="Cancel appointment"
            onClick={() => handleDelete(appt.id)}
          >
            <LuTrash2 size={19} strokeWidth={2} />
          </button>
          {onFiles && (
            <button
              type="button"
              className="appt-action-btn appt-action-files"
              title="Images & Files (X-rays, photos, documents)"
              aria-label="Images and files"
              onClick={() => onFiles(appt.id, appt.patient_id, patientName(appt.patient_id))}
            >
              <LuImages size={19} strokeWidth={2} />
            </button>
          )}
          {hasMessengerId ? (
            <button
              type="button"
              className="appt-action-btn appt-action-reminder"
              title="Manage Reminders"
              aria-label="Manage reminders"
              onClick={() => onReminder(appt.id, patientName(appt.patient_id))}
            >
              <LuBell size={19} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              className="appt-action-btn appt-action-disabled"
              title="No Messenger ID on file — reminders unavailable"
              aria-label="Reminders unavailable"
              disabled
            >
              <LuBellOff size={19} strokeWidth={2} />
            </button>
          )}
        </div>
      </td>
    );
  }

  function rowFlashClass(appt) {
    if (!flashRow || flashRow.id !== appt.id) return '';
    if (flashRow.status === 'Confirmed' || flashRow.status === 'Scheduled') return 'row-flash-confirmed';
    if (flashRow.status === 'Cancelled' || flashRow.status === 'No Show') return 'row-flash-cancelled';
    return 'row-flash-generic';
  }

  function rowPersistentClass(appt) {
    if (!unreadUpdates.includes(appt.id)) return '';
    if (['Confirmed', 'Scheduled'].includes(appt.status)) return 'persistent-highlight-confirmed';
    if (['Cancelled', 'No Show'].includes(appt.status)) return 'persistent-highlight-cancelled';
    return 'persistent-highlight-generic';
  }

  function renderTable(appointmentsArr) {
    const sortedAppointmentsArr = [...appointmentsArr].sort(
      (a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)
    );

    return (
      <div className="appointments-table-scroll">
        <table className="appointments-table-fixed" border="1" cellPadding="8">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Patient / Date & Time</th>
              <th>Procedure</th>
              <th>Origin</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAppointmentsArr.map(appt => {
              const apptTime = new Date(appt.appointment_time);
              const isPast = now > apptTime;
              const needsStatusUpdate =
                isPast && (appt.status === "Scheduled" || appt.status === "Confirmed");

              const flashClass = rowFlashClass(appt);
              const persistentClass = rowPersistentClass(appt);
              const combinedClass = `${flashClass} ${persistentClass}`.trim();

              return (
                <tr
                  key={appt.id}
                  data-appt-id={appt.id}
                  className={combinedClass}
                  onMouseEnter={() => handleRowMouseEnter(appt.id)}
                >
                  <td>
                    <div className="appt-patient-name">{patientName(appt.patient_id)}</div>
                    <div className="appt-when">
                      <span className="appt-when-date">{formatLongDate(appt.appointment_time)}</span>
                      <span className="appt-when-sep">·</span>
                      <span className="appt-when-time">{formatTime(appt.appointment_time)}</span>
                    </div>
                    <div className="appt-meta">
                      <span className="appt-meta-chip" title="Appointment ID">#{appt.id}</span>
                      <span className="appt-meta-chip appt-meta-mid" title="Messenger ID (patient / guardian)">
                        MID {patients.find(p => String(p.id) === String(appt.patient_id))?.messenger_id || 'N/A'}
                        {' / '}
                        {appt.guardian_messenger_id || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td title={appt.reason}>{renderProcedureCell(appt)}</td>
                  <td title={appt.booking_origin}>{displayOrigin(appt.booking_origin)}</td>
                  <td className="appt-status-cell">
                    {renderStatusCell(appt)}
                    {needsStatusUpdate && (
                      <div className="appt-needs-update">
                        <i className="fa fa-exclamation-triangle" aria-hidden="true" />
                        Needs status update
                      </div>
                    )}
                  </td>
                  {renderActionsCell(appt)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const dentistFilteredAppointments = selectedDentist
    ? appointments.filter(appt => String(appt.dentist_id) === String(selectedDentist))
    : null;

  const scopeLabel =
    viewMode === 'monthly' ? 'this month'
      : viewMode === 'weekly' ? 'this week'
      : viewMode === 'daily' ? 'today'
      : '';

  const totalLabel = `Total: ${totalAppointmentsAllDentists} appointment${totalAppointmentsAllDentists === 1 ? '' : 's'} ${scopeLabel}`;

  const toggleCollapse = (dentistId) => {
    setCollapsedDentists(prev => ({
      ...prev,
      [dentistId]: !prev[dentistId]
    }));
  };

  return (
    <div className="dc-page appt-page">
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Schedule</div>
          <h1 className="dc-page-title">Appointments</h1>
        </div>
        <div className="dc-page-header-actions">
          {unreadUpdates.length > 0 && (
            <div className="appt-updates-group">
              <div className="new-updates-pill" title="New/updated appointments in this view">
                {unreadUpdates.length} new update{unreadUpdates.length > 1 ? 's' : ''}
              </div>
              <button className="appt-ack-btn" onClick={acknowledgeAll} title="Clear highlight of updated rows">
                Acknowledge All
              </button>
            </div>
          )}
          <button className="dc-btn dc-btn--primary appt-add-btn" onClick={onAdd}>
            + Add Appointment
          </button>
        </div>
      </header>

      <div className="appointment-modern">
        {/* STICKY FILTER BLOCK */}
        <div className="appointments-sticky-header">
        <div className={`appointments-summary-bar ${summaryPulse ? 'pulse' : ''}`}>
          <i className="fa fa-database" aria-hidden="true" />
          {totalLabel}
          {selectedDentist && (
            <span className="appt-summary-filter">(Filtered: {dentistName(selectedDentist)})</span>
          )}
        </div>

        <div className="appt-filters">
          <label className="appt-field">
            <span>Dentist</span>
            <select value={selectedDentist} onChange={e => setSelectedDentist(e.target.value)} className="appt-select-wide">
              <option value="">All Dentists ({totalAppointmentsAllDentists})</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({dentistAppointmentCountMap[d.id] || 0})</option>
              ))}
            </select>
          </label>

          <div className="appt-field">
            <span>View</span>
            <div className="appt-segmented" role="tablist">
              {['monthly', 'weekly', 'daily'].map(m => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === m}
                  className={`appt-seg-btn${viewMode === m ? ' active' : ''}`}
                  onClick={() => setViewMode(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="appt-field">
            <span>Year</span>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label className="appt-field">
            <span>Month</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {getMonthList().map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
            </select>
          </label>

          {viewMode === 'weekly' && selectedYear && selectedMonth && (
            <label className="appt-field">
              <span>Week</span>
              <select value={selectedWeekIdx} onChange={e => setSelectedWeekIdx(Number(e.target.value))}>
                {weeksArr.map((_, i) => (<option key={i} value={i}>{`Week ${i + 1}`}</option>))}
              </select>
            </label>
          )}

          {viewMode === 'daily' && selectedYear && selectedMonth && (
            <label className="appt-field">
              <span>Day</span>
              <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} className="appt-select-narrow">
                {Array.from({ length: daysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1)
                  .map(day => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      {/* END STICKY HEADER BLOCK */}

      {/* SCROLL AREA FOR CARDS/TABLES */}
      <div className="appointments-scroll-area">
        {loading ? (
          <div className="appt-loading">
            <i className="fa fa-spinner fa-spin" />
            Loading appointments...
          </div>
        ) : selectedDentist ? (
          <div className={`dentist-group-card ${collapsedDentists[selectedDentist] ? 'collapsed' : ''}`}>
            <div className="dentist-group-title" style={{ justifyContent: 'space-between' }}>
              <span>
                {dentistName(selectedDentist)} ({(dentistFilteredAppointments || []).length} appointment{(dentistFilteredAppointments || []).length === 1 ? '' : 's'})
              </span>
              <button
                className="dentist-toggle-btn"
                aria-expanded={!collapsedDentists[selectedDentist]}
                onClick={() => toggleCollapse(selectedDentist)}
              >
                <span className="caret" />
                {collapsedDentists[selectedDentist] ? 'Expand' : 'Collapse'}
              </button>
            </div>
            {!collapsedDentists[selectedDentist] && renderTable(dentistFilteredAppointments || [])}
          </div>
        ) : (
          dentists.map(dentist => {
            const dentistAppointments =
              appointments.filter(a => String(a.dentist_id) === String(dentist.id));
            if (dentistAppointments.length === 0) return null;
            const apptCount = dentistAppointments.length;
            const collapsed = collapsedDentists[dentist.id] === true;
            return (
              <div key={dentist.id} className={`dentist-group-card ${collapsed ? 'collapsed' : ''}`}>
                <div className="dentist-group-title" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {dentist.name} ({apptCount} appointment{apptCount === 1 ? '' : 's'})
                  </span>
                  <button
                    className="dentist-toggle-btn"
                    aria-expanded={!collapsed}
                    onClick={() => toggleCollapse(dentist.id)}
                  >
                    <span className="caret" />
                    {collapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                {!collapsed && renderTable(dentistAppointments)}
              </div>
            );
          })
        )}
      </div>

      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        {flashRow ? `Appointment ${flashRow.id} ${flashRow.status}` : ''}
      </div>
      </div>
    </div>
  );
}

export default AppointmentsTable;

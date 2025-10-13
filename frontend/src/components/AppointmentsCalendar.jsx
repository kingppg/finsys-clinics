import React, { useEffect, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { parseISO, format } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import enPH from 'date-fns/locale/en-US'; // Use English for PH, or change locale if desired

const locales = {
  'en-PH': enPH
};
const localizer = dateFnsLocalizer({
  format,
  parse: (value, formatString) => {
    // Ensure we always return a Date object
    if (value instanceof Date) return value;
    // Try parsing ISO string
    try {
      return parseISO(value);
    } catch {
      return new Date(value);
    }
  },
  startOfWeek: () => 0, // Sunday
  getDay: date => (date instanceof Date ? date.getDay() : new Date(date).getDay()),
  locales,
});

function AppointmentsCalendar({
  onEdit,
  selectedDentist = "",
  dentists = [],
  patients = [],
  statusColors = {},
  style = {},
}) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAppointments() {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:5000/appointments/all');
        const data = await res.json();
        setAppointments(data);
      } catch (e) {
        setAppointments([]);
      }
      setLoading(false);
    }
    fetchAppointments();
  }, []);

  // Helpers to display patient/dentist names
  const dentistName = (id) =>
    dentists.find(d => String(d.id) === String(id))?.name || id;
  const patientName = (id) =>
    patients.find(p => String(p.id) === String(id))?.name || id;

  // Filter appointments by selected dentist (if any)
  const filtered = selectedDentist
    ? appointments.filter(a => String(a.dentist_id) === String(selectedDentist))
    : appointments;

  // Map appointments to calendar events
  const events = filtered.map(appt => {
    // Make sure 'start' and 'end' are always Date objects
    const start =
      appt.appointment_time instanceof Date
        ? appt.appointment_time
        : parseISO(appt.appointment_time);
    // Default duration: 1 hour, or customize per procedure
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      id: appt.id,
      title: `${patientName(appt.patient_id)} – ${appt.reason}`,
      start,
      end,
      dentist: dentistName(appt.dentist_id),
      status: appt.status,
      resource: appt, // pass full object for modal/edit
    };
  });

  // Color events by status (optional)
  function eventPropGetter(event) {
    let backgroundColor = '#185abd';
    if (event.status && statusColors && statusColors[event.status]) {
      backgroundColor = statusColors[event.status];
    }
    return {
      style: { backgroundColor }
    };
  }

  function handleSelectEvent(event) {
    if (onEdit) onEdit(event.resource);
  }

  return (
    <section style={{ padding: 20, ...style }}>
      <h2>Appointments Calendar</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          views={['month', 'week', 'day']}
          defaultView="month"
          style={{ height: 600 }}
          onSelectEvent={handleSelectEvent}
          popup
          eventPropGetter={eventPropGetter}
        />
      )}
    </section>
  );
}

export default AppointmentsCalendar;
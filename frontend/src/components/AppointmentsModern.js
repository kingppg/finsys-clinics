import React, { useState } from 'react';
import AppointmentsTable from './AppointmentsTable';
import AppointmentForm from './AppointmentForm';
import AppointmentReminderControl from './AppointmentReminderControl';

// Modal that utilizes full viewport width (less the dashboard side nav)
// No scroll on modal itself; only Sent Reminders Log card should be scrollable
const Modal = ({ open, onClose, children }) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.18)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: '80px', // adjust this to match the width of your dashboard side nav
      paddingRight: '18px',
      paddingTop: '32px',
      paddingBottom: '32px',
      boxSizing: 'border-box',
      width: '100vw',
      minHeight: '100vh',
      overflow: 'hidden' // <-- Remove scroll on modal
    }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '38px 40px 36px 40px',
          width: '100%',
          maxWidth: '1700px',
          minWidth: '900px',
          boxShadow: '0 8px 32px #0002',
          position: 'relative',
          maxHeight: '86vh',
          overflow: 'hidden', // <-- Remove scroll on modal content
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 28,
            background: 'transparent',
            border: 'none',
            fontSize: 32,
            cursor: 'pointer',
            zIndex: 10
          }}
          aria-label="Close modal"
        >
          &times;
        </button>
        <div style={{ width: '100%', height: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

function AppointmentsModern({ clinicId }) { // <-- Accept clinicId as prop
  const [view, setView] = useState('table'); // 'table', 'add', or 'edit'
  const [editAppointment, setEditAppointment] = useState(null);
  const [reminderAppointmentId, setReminderAppointmentId] = useState(null);
  const [reminderPatientName, setReminderPatientName] = useState('');

  // Handle Add/Edit Appointment
  const handleAddClick = () => {
    setEditAppointment(null);
    setView('add');
  };

  const handleEditClick = (appointment) => {
    setEditAppointment(appointment);
    setView('edit');
  };

  const handleFormClose = () => {
    setEditAppointment(null);
    setView('table');
  };

  // Handle Reminder Modal
  const handleReminderClick = (appointmentId, patientName) => {
    setReminderAppointmentId(appointmentId);
    setReminderPatientName(patientName || '');
  };

  const handleReminderClose = () => {
    setReminderAppointmentId(null);
    setReminderPatientName('');
  };

  return (
    <div>
      {view === 'table' && (
        <AppointmentsTable 
          onAdd={handleAddClick} 
          onEdit={handleEditClick}
          onReminder={handleReminderClick}
          clinicId={clinicId} // <-- Pass down clinicId
        />
      )}
      {(view === 'add' || view === 'edit') && (
        <div>
          <AppointmentForm 
            appointment={editAppointment}
            onClose={handleFormClose}
            onEdit={handleEditClick}
            clinicId={clinicId} // <-- Pass down clinicId
          />
        </div>
      )}
      {/* Wide modal for reminder controls */}
      <Modal open={!!reminderAppointmentId} onClose={handleReminderClose}>
        {reminderAppointmentId && (
          <AppointmentReminderControl
            appointmentId={reminderAppointmentId}
            patientName={reminderPatientName}
            clinicId={clinicId} // <-- Pass down clinicId
          />
        )}
      </Modal>
    </div>
  );
}

export default AppointmentsModern;
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import './AppointmentReminderControl.css';

const MySwal = withReactContent(Swal);

export default function AppointmentReminderControl({ appointmentId, patientName, clinicId }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [edit, setEdit] = useState(null);
  const [sentReminders, setSentReminders] = useState([]);
  const [manualSendLoading, setManualSendLoading] = useState(false);
  const [manualSendMsg, setManualSendMsg] = useState('');
  const [manualRecipient, setManualRecipient] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch appointment settings
        const { data: appt, error: apptErr } = await supabase
          .from('appointments')
          .select(
            `
              *,
              patient:patient_id (
                name
              )
            `
          )
          .eq('id', appointmentId)
          .eq('clinic_id', clinicId)
          .single();

        // Fetch sent reminders log
        const { data: remindersLog, error: remindersErr } = await supabase
          .from('appointment_reminders')
          .select('*')
          .eq('appointment_id', appointmentId)
          .eq('clinic_id', clinicId)
          .order('sent_on', { ascending: false });

        if (apptErr) throw apptErr;

        setSettings({
          reminder_enabled: appt.reminder_enabled,
          reminder_days: appt.reminder_days ?? [],
          reminder_message: appt.reminder_message ?? '',
          reminder_recipient_type: appt.reminder_recipient_type ?? 'patient',
          appointment_date: appt.appointment_time,
          patient_name: appt.patientName || appt.patient?.name,
        });
        setEdit({
          reminder_enabled: appt.reminder_enabled,
          reminder_days: appt.reminder_days ? [...appt.reminder_days] : [],
          reminder_message: appt.reminder_message || '',
          reminder_recipient_type: appt.reminder_recipient_type || 'patient'
        });
        setSentReminders(remindersLog || []);
      } catch (e) {
        MySwal.fire({
          icon: 'error',
          title: 'Oops...',
          text: 'Failed to fetch reminder settings',
          customClass: {
            popup: 'swal2-reminder-above-modal'
          }
        });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [appointmentId, clinicId]);

  const handleEditChange = e => {
    const { name, value, type, checked } = e.target;
    setEdit(edit => ({
      ...edit,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDaysChange = idx => e => {
    const value = parseInt(e.target.value, 10);
    setEdit(edit => {
      const days = [...edit.reminder_days];
      days[idx] = isNaN(value) ? '' : value;
      return { ...edit, reminder_days: days };
    });
  };

  const addDay = () => {
    setEdit(edit => ({
      ...edit,
      reminder_days: [...(edit.reminder_days || []), '']
    }));
  };

  const removeDay = idx => {
    setEdit(edit => {
      const days = [...edit.reminder_days];
      days.splice(idx, 1);
      return { ...edit, reminder_days: days };
    });
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      await supabase
        .from('appointments')
        .update({
          reminder_enabled: edit.reminder_enabled,
          reminder_days: edit.reminder_days.filter(d => d !== '' && !isNaN(d)),
          reminder_message: edit.reminder_message,
          reminder_recipient_type: edit.reminder_recipient_type
        })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId);

      MySwal.fire({
        icon: 'success',
        title: 'Settings Saved!',
        text: 'Reminder settings have been updated.',
        timer: 1500,
        showConfirmButton: false,
        customClass: {
          popup: 'swal2-reminder-above-modal'
        }
      });

      // Re-fetch settings/log
      const { data: appt } = await supabase
        .from('appointments')
        .select(
          `
            *,
            patient:patient_id (
              name
            )
          `
        )
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .single();

      const { data: remindersLog } = await supabase
        .from('appointment_reminders')
        .select('*')
        .eq('appointment_id', appointmentId)
        .eq('clinic_id', clinicId)
        .order('sent_on', { ascending: false });

      setSettings({
        reminder_enabled: appt.reminder_enabled,
        reminder_days: appt.reminder_days ?? [],
        reminder_message: appt.reminder_message ?? '',
        reminder_recipient_type: appt.reminder_recipient_type ?? 'patient',
        appointment_date: appt.appointment_time,
        patient_name: appt.patientName || appt.patient?.name,
      });
      setSentReminders(remindersLog || []);
      setEdit({
        reminder_enabled: appt.reminder_enabled,
        reminder_days: appt.reminder_days ? [...appt.reminder_days] : [],
        reminder_message: appt.reminder_message || '',
        reminder_recipient_type: appt.reminder_recipient_type || 'patient'
      });
    } catch {
      MySwal.fire({
        icon: 'error',
        title: 'Failed to save',
        text: 'Could not save reminder settings.',
        customClass: {
          popup: 'swal2-reminder-above-modal'
        }
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const getDaysAhead = () => {
    if (!settings || !settings.appointment_date) return 1;
    const appointmentDate = new Date(settings.appointment_date);
    const now = new Date();
    appointmentDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const timeDiff = appointmentDate.getTime() - now.getTime();
    const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 1;
  };

  const handleManualSend = async () => {
    setManualSendLoading(true);
    let daysAhead = getDaysAhead();
    try {
      // Call backend route to actually send the Messenger reminder (still required; only backend can send to Messenger)
      await fetch(`/appointments/${appointmentId}/send-reminder?clinic_id=${clinicId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_ahead: daysAhead,
          message_override: manualSendMsg || undefined,
          recipient_override: manualRecipient || undefined
        }),
      });

      MySwal.fire({
        icon: 'success',
        title: 'Reminder Sent!',
        text: 'The reminder has been sent successfully.',
        timer: 1500,
        showConfirmButton: false,
        customClass: {
          popup: 'swal2-reminder-above-modal'
        }
      });

      // Refresh sent reminders log from Supabase
      const { data: remindersLog } = await supabase
        .from('appointment_reminders')
        .select('*')
        .eq('appointment_id', appointmentId)
        .eq('clinic_id', clinicId)
        .order('sent_on', { ascending: false });
      setSentReminders(remindersLog || []);
    } catch (error) {
      console.error('Manual Reminder Send Error:', error);
      MySwal.fire({
        icon: 'error',
        title: 'Failed to send reminder',
        text: 'Could not send the reminder. Please try again.',
        customClass: {
          popup: 'swal2-reminder-above-modal'
        }
      });
    } finally {
      setManualSendLoading(false);
    }
  };

  if (loading) return (
    <div className="reminder-loading">
      <span>Loading reminder settings...</span>
    </div>
  );
  if (!settings) return <div>Appointment not found.</div>;

  // Always use the prop patientName if provided, fallback to settings if not.
  const displayName = patientName || settings?.patient_name || "Patient";

  return (
    <div>
      {/* Patient Name - Horizontally centered */}
      <div className="reminder-modal-patient-name">
        <i className="fa fa-user" style={{ marginRight: 8 }} />
        <span>{displayName}</span>
      </div>
      <div className="reminder-modal-cards">
        {/* Reminder Settings Card */}
        <div className="reminder-card reminder-settings-card equal-height-card">
          <h3>
            <i className="fa fa-bell" style={{ marginRight: 8 }} /> Reminder Settings
          </h3>
          <form
            className="reminder-form"
            onSubmit={e => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div>
              <label>
                <input
                  type="checkbox"
                  name="reminder_enabled"
                  checked={!!edit.reminder_enabled}
                  onChange={handleEditChange}
                  style={{ marginRight: 8 }}
                />
                <span>Enable Reminders</span>
              </label>
            </div>
            <div>
              <label>Reminder Days (before appointment):</label>
              <div className="reminder-days-list">
                {(edit.reminder_days || []).map((day, idx) => (
                  <span key={idx}>
                    <input
                      className="reminder-day-input"
                      type="number"
                      min="0"
                      step="1"
                      value={day}
                      onChange={handleDaysChange(idx)}
                      disabled={!edit.reminder_enabled}
                    />
                    <button
                      type="button"
                      className="reminder-remove-btn"
                      onClick={() => removeDay(idx)}
                      disabled={edit.reminder_days.length <= 1}
                      title="Remove day"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="reminder-add-btn"
                  onClick={addDay}
                  disabled={!edit.reminder_enabled}
                >
                  + Add Day
                </button>
              </div>
            </div>
            <div>
              <label>
                Reminder Message:
                <textarea
                  className="reminder-textarea reminder-message-textarea"
                  name="reminder_message"
                  value={edit.reminder_message}
                  onChange={handleEditChange}
                  disabled={!edit.reminder_enabled}
                  placeholder="Custom reminder message (leave blank for default)"
                  style={{
                    fontSize: '1.05rem',
                    minHeight: '70px',
                    width: '100%'
                  }}
                />
              </label>
            </div>
            <div>
              <label>
                Recipient:&nbsp;
                <select
                  name="reminder_recipient_type"
                  value={edit.reminder_recipient_type}
                  onChange={handleEditChange}
                  disabled={!edit.reminder_enabled}
                  className="reminder-select"
                >
                  <option value="patient">Patient</option>
                  <option value="guardian">Guardian</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="reminder-submit-btn"
              disabled={saveLoading || !edit.reminder_enabled}
            >
              {saveLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>

        {/* Manual Reminder Send Card */}
        <div className="reminder-card reminder-manual-card equal-height-card">
          <h4>
            <i className="fa fa-paper-plane" style={{ marginRight: 8 }} /> Manual Reminder Send
          </h4>
          <div>
            <label>
              Custom Message:
              <textarea
                value={manualSendMsg}
                onChange={e => setManualSendMsg(e.target.value)}
                className="reminder-textarea"
                placeholder="Override default message"
                style={{
                  fontSize: '1.05rem',
                  minHeight: '70px',
                  width: '100%',
                  marginTop: '6px'
                }}
              />
            </label>
          </div>
          <div>
            <label>
              Recipient Messenger ID:{' '}
              <input
                type="text"
                value={manualRecipient}
                onChange={e => setManualRecipient(e.target.value)}
                style={{
                  width: '90%',
                  fontSize: '1.05rem'
                }}
                className="reminder-day-input"
                placeholder="Override recipient"
              />
            </label>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleManualSend}
            className="reminder-send-btn"
            disabled={manualSendLoading || !settings.reminder_enabled}
          >
            {manualSendLoading ? 'Sending...' : 'Send Reminder Now'}
          </button>
        </div>

        {/* Sent Reminders Log Card */}
        <div
          className="reminder-card reminder-log-card equal-height-card"
          style={{
            overflowY: 'auto',
          }}
        >
          <h4>
            <i className="fa fa-history" style={{ marginRight: 8 }} /> Sent Reminders Log
          </h4>
          {/* --- FIXED HEIGHT REMINDER LOG TABLE --- */}
          <div style={{maxHeight: "500px", overflowY: "auto", marginBottom: "1px"}}>
            <table className="reminder-log-table">
              <thead>
                <tr>
                  <th>Date Sent</th>
                  <th>Days Ahead</th>
                  <th>Messenger ID</th>
                </tr>
              </thead>
              <tbody>
                {sentReminders.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No reminders sent yet.</td>
                  </tr>
                )}
                {sentReminders.map((rem, idx) => (
                  <tr key={idx}>
                    <td style={{
                      color: rem.is_manual === true
                        ? "#007bff"
                        : "#d9534f"
                    }}>
                      {new Date(rem.sent_on).toLocaleString()}
                    </td>
                    <td style={{
                      color: rem.is_manual === true
                        ? "#007bff"
                        : "#d9534f"
                    }}>
                      {rem.days_ahead}
                    </td>
                    <td style={{
                      color: rem.is_manual === true
                        ? "#007bff"
                        : "#d9534f"
                    }}>
                      {rem.messenger_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* --- END FIXED HEIGHT REMINDER LOG TABLE --- */}
          <div style={{ marginTop: "8px", fontSize: "0.96rem" }}>
            <span>
              <span style={{ color: "#007bff", marginRight: "12px" }}>■ Manual Reminder</span>
              <span style={{ color: "#d9534f" }}>■ Automated Reminder</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
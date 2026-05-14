import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const statusMessages = {
  Completed: "Patient will be notified that their appointment has been marked as completed. You may send a 'thank you' or follow-up message.",
  "No Show": "Patient will be notified that they missed their appointment. You may send an acknowledgement or reschedule message.",
  Cancelled: "Patient will be notified that their appointment has been cancelled. You may send a cancellation confirmation message."
};

export const StatusUpdateModal = {
  async confirmAndUpdate({ appointment, newStatus, onStatusUpdated }) {
    const patientName = appointment.patient_name || 'Patient';

    // -----------------------------------------------------------------------
    // CHECKED-IN: direct update — no confirmation modal needed
    // -----------------------------------------------------------------------
    if (newStatus === 'Checked-In') {
      try {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({ status: newStatus })
          .eq('id', appointment.id)
          .eq('clinic_id', appointment.clinic_id);
        if (updateError) throw updateError;

        const res = await fetch(`${API_BASE}/status-notifications/${appointment.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            message: "",
            clinic_id: appointment.clinic_id
          })
        });

        const result = await res.json();

        if (result.sent === false) {
          onStatusUpdated && onStatusUpdated(newStatus);
          Swal.fire({
            icon: 'warning',
            title: 'Checked-In',
            html: `<b>${patientName}</b> is now checked in.<br><br>
                   No Messenger ID on file — patient was <b>not notified</b> via Messenger.`,
            timer: 3500,
            showConfirmButton: false
          });
          return true;
        }

        onStatusUpdated && onStatusUpdated(newStatus);
        Swal.fire({
          icon: 'success',
          title: 'Checked-In!',
          html: `<b>${patientName}</b> is now checked in and has been notified via Messenger. 😊`,
          timer: 2000,
          showConfirmButton: false
        });
        return true;

      } catch (e) {
        Swal.fire({
          icon: 'error',
          title: 'Update failed',
          text: 'There was a problem saving the status. Please try again.',
          timer: 2500,
          showConfirmButton: false
        });
        return false;
      }
    }

    // -----------------------------------------------------------------------
    // COMPLETED / NO SHOW / CANCELLED: confirmation modal with custom message
    // -----------------------------------------------------------------------
    const modalText = statusMessages[newStatus] || "Are you sure you want to update the status?";

    const { value: customMessage, isConfirmed } = await Swal.fire({
      title: `Mark as "${newStatus}"?`,
      html: `<b>${patientName}</b><br>${modalText}<br><br>
        <textarea id="custom-message" class="swal2-textarea" placeholder="Optional: Add a custom message for the patient"></textarea>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, update & notify patient',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusConfirm: false,
      preConfirm: () => {
        return document.getElementById('custom-message').value;
      },
      customClass: {
        confirmButton: 'swal2-confirm-btn',
        cancelButton: 'swal2-cancel-btn'
      }
    });

    if (!isConfirmed) return false;

    try {
      // 1. Update status in Supabase
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appointment.id)
        .eq('clinic_id', appointment.clinic_id);
      if (updateError) throw updateError;

      // 2. Notify backend to send Messenger message
      const res = await fetch(`${API_BASE}/status-notifications/${appointment.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          message: customMessage || "",
          clinic_id: appointment.clinic_id
        })
      });

      const result = await res.json();

      // 3. No Messenger ID — status was saved, but patient couldn't be notified
      if (result.sent === false) {
        onStatusUpdated && onStatusUpdated(newStatus);
        Swal.fire({
          icon: 'warning',
          title: 'Status updated',
          html: `<b>${patientName}</b> has no Messenger ID on file.<br><br>
                 Status was saved successfully but the patient was <b>not notified</b> via Messenger.`,
          timer: 3500,
          showConfirmButton: false
        });
        return true;
      }

      // 4. Hard failure (e.g. no page token, server error)
      if (!res.ok) {
        throw new Error(result.error || 'Messenger notification failed');
      }

      // 5. Full success — status saved and message sent
      onStatusUpdated && onStatusUpdated(newStatus);
      Swal.fire({
        icon: 'success',
        title: 'Status updated & patient notified!',
        timer: 1600,
        showConfirmButton: false
      });
      return true;

    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Update failed',
        text: 'There was a problem saving the status. Please try again.',
        timer: 2500,
        showConfirmButton: false
      });
      return false;
    }
  }
};

export default StatusUpdateModal;

import React from 'react';
import Swal from 'sweetalert2';
import { supabase } from '../supabaseClient';

const statusMessages = {
  Completed: "Patient will be notified that their appointment has been marked as completed. You may send a 'thank you' or follow-up message.",
  "No Show": "Patient will be notified that they missed their appointment. You may send an acknowledgement or reschedule message.",
  Cancelled: "Patient will be notified that their appointment has been cancelled. You may send a cancellation confirmation message."
};

export const StatusUpdateModal = {
  async confirmAndUpdate({ appointment, newStatus, onStatusUpdated }) {
    const patientName = appointment.patient_name || 'Patient';
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
      const res = await fetch(`/status-notifications/${appointment.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          message: customMessage || "",
          clinic_id: appointment.clinic_id
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Messenger notification failed');
      }

      if (onStatusUpdated) onStatusUpdated(newStatus);

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
        title: 'Failed!',
        text: 'There was a problem updating the status or sending the message.',
        timer: 1800,
        showConfirmButton: false
      });
      return false;
    }
  }
};

export default StatusUpdateModal;
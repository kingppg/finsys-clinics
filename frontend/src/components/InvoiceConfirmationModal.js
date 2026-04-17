import Swal from 'sweetalert2';
import './InvoiceReceiptModal.css';

export async function confirmInvoice({
  patientName,
  dentistName,
  procedureName,
  procedurePrice,
  appointmentTime,
  clinicName,
  notes
}) {
  const html = `
    <div class="invoice-modal-receipt">
      <div class="invoice-modal-header">Dental Clinic Invoice</div>
      <div class="invoice-modal-clinic">${clinicName || ''}</div>
      
      <div class="invoice-date-row">
        <div class="invoice-label">Date & Time:</div>
        <div class="invoice-value">${appointmentTime ? new Date(appointmentTime).toLocaleString() : '--'}</div>
      </div>
      <div class="invoice-main-row">
        <div class="invoice-main-col">
          <div class="invoice-label">Patient:</div>
          <div class="invoice-value">${patientName || '--'}</div>
        </div>
        <div class="invoice-main-col">
          <div class="invoice-label">Dentist:</div>
          <div class="invoice-value">${dentistName || '--'}</div>
        </div>
      </div>

      <div class="invoice-proc-box">
        <span class="invoice-proc-label">Procedures:</span>
        ${procedureName || '<i>No procedure specified</i>'}
      </div>

      <div class="invoice-amount-row">
        <span class="invoice-amount-label">Amount:</span>
        <span class="invoice-amount">₱${procedurePrice !== undefined && procedurePrice !== null ? procedurePrice : '--'}</span>
      </div>

      <div class="invoice-confirm">
        <span class="confirm-red"><b>Confirm?</b></span> Marking as <span class="confirm-blue">Completed</span> will create a <span class="confirm-bold">final official invoice.</span>
        <br>
        Please verify all details.
      </div>
    </div>
  `;

  const result = await Swal.fire({
    title: "",
    html,
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Yes, Generate Invoice",
    cancelButtonText: "Cancel",
    customClass: {
      popup: 'invoice-modal-wide', // You can keep if you want the modal wider
      confirmButton: 'swal2-confirm-btn',
      cancelButton: 'swal2-cancel-btn'
    }
  });

  return result.isConfirmed;
}
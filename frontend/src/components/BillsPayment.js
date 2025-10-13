import React, { useState, useEffect } from 'react';
import AddPaymentForm from './AddPaymentForm';
import './BillsPayment.css';
import { supabase } from '../supabaseClient';

function BillsPayment({ clinicId }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [addInvoicePatientSearch, setAddInvoicePatientSearch] = useState('');
  const [addInvoicePatientId, setAddInvoicePatientId] = useState('');
  const [addInvoiceTotal, setAddInvoiceTotal] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [patientDropdownVisible, setPatientDropdownVisible] = useState(false);

  useEffect(() => {
    // Fetch invoices
    supabase
      .from('invoices')
      .select('*')
      .eq('clinic_id', clinicId)
      .then(({ data }) => setInvoices(data || []))
      .catch(() => setInvoices([]));
    // Fetch payments
    supabase
      .from('payments')
      .select('*')
      .eq('clinic_id', clinicId)
      .then(({ data }) => setPayments(data || []))
      .catch(() => setPayments([]));
    // Fetch patients
    supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .then(({ data }) => setPatients(data || []))
      .catch(() => setPatients([]));
  }, [clinicId]);

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowAddPayment(true);
  };

  const handlePaymentAdded = (payment) => {
    setPayments([...payments, payment]);
    setShowAddPayment(false);
    setSelectedInvoice(null);
  };

  const invoicePayments = (invoiceId) => payments.filter(p => p.invoice_id === invoiceId);

  const handleShowAddInvoice = () => {
    setShowAddInvoice(true);
    setAddInvoicePatientSearch('');
    setAddInvoicePatientId('');
    setAddInvoiceTotal('');
    setFilteredPatients([]);
    setPatientDropdownVisible(false);
  };

  const handlePatientSearchChange = (e) => {
    const search = e.target.value;
    setAddInvoicePatientSearch(search);
    if (search.length > 0) {
      const matches = patients.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
      );
      setFilteredPatients(matches);
      setPatientDropdownVisible(true);
    } else {
      setFilteredPatients([]);
      setPatientDropdownVisible(false);
    }
    setAddInvoicePatientId('');
  };

  const handleSelectPatient = (patient) => {
    setAddInvoicePatientSearch(patient.name);
    setAddInvoicePatientId(patient.id);
    setPatientDropdownVisible(false);
  };

  const getPatientById = (id) => patients.find(p => p.id === id);

  const handleAddInvoiceSubmit = async (e) => {
    e.preventDefault();
    if (!addInvoicePatientId) {
      alert('Please select a patient.');
      return;
    }
    setInvoiceLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .insert([{
          patient_id: addInvoicePatientId,
          total: addInvoiceTotal,
          clinic_id: clinicId
        }])
        .select()
        .single();
      if (error) {
        alert('Error adding invoice: ' + (error.message || 'Unknown'));
      } else if (data) {
        setInvoices([...invoices, data]);
        setShowAddInvoice(false);
      }
    } catch (err) {
      alert('Network error while adding invoice.');
    }
    setInvoiceLoading(false);
  };

  return (
    <div className="bills-container">
      {/* Sticky Header (Title + Add Invoice Button) */}
      <div className="bills-sticky-header">
        <div className="bills-header-row">
          <h2 className="bills-header">Bills & Payment</h2>
          <button className="bills-action-btn" onClick={handleShowAddInvoice}>Add Invoice</button>
        </div>
      </div>

      <h3 className="bills-section-title">Invoices</h3>
      <table className="bills-table bills-invoices-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Patient</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <tr>
              <td colSpan={5} className="bills-no-data">
                No invoices found.
              </td>
            </tr>
          ) : (
            invoices.map(inv => {
              const paid = invoicePayments(inv.id).reduce((sum, p) => sum + parseFloat(p.amount), 0);
              const status = paid >= parseFloat(inv.total)
                ? 'Paid'
                : paid > 0
                  ? 'Partial'
                  : 'Unpaid';
              const patient = getPatientById(inv.patient_id);
              return (
                <tr key={inv.id}>
                  <td>{inv.id}</td>
                  <td>{patient ? patient.name : inv.patient_id}</td>
                  <td>₱{inv.total}</td>
                  <td>{status}</td>
                  <td>
                    <button className="bills-action-btn" onClick={() => handleAddPayment(inv)}>Add Payment</button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <h3 className="bills-section-title">Payments</h3>
      <table className="bills-table bills-payments-table">
        <thead>
          <tr>
            <th>IID</th>
            <th>Patient</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Ref #</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr>
              <td colSpan={6} className="bills-no-data">
                No payments found.
              </td>
            </tr>
          ) : (
            payments.map(pay => {
              const patient = getPatientById(pay.patient_id);
              return (
                <tr key={pay.id}>
                  <td>{pay.invoice_id}</td>
                  <td>{patient ? patient.name : pay.patient_id}</td>
                  <td>₱{pay.amount}</td>
                  <td>{pay.method}</td>
                  <td>{pay.reference_number}</td>
                  <td>{pay.payment_date ? new Date(pay.payment_date).toLocaleDateString() : ''}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Pass clinicId prop here */}
      {showAddPayment && (
        <AddPaymentForm
          invoice={selectedInvoice}
          clinicId={clinicId}
          onClose={() => setShowAddPayment(false)}
          onPaymentAdded={handlePaymentAdded}
        />
      )}

      {showAddInvoice && (
        <div className="bills-modal-overlay">
          <form
            onSubmit={handleAddInvoiceSubmit}
            className="bills-modal-form"
            autoComplete="off"
          >
            <h3>Add Invoice</h3>
            <div className="bills-modal-fields-row">
              <div>
                <label>Patient:</label>
                <input
                  className="bills-modal-input"
                  type="text"
                  value={addInvoicePatientSearch}
                  onChange={handlePatientSearchChange}
                  onFocus={() => addInvoicePatientSearch && setPatientDropdownVisible(true)}
                  placeholder="Search patient by name..."
                  required
                />
                {patientDropdownVisible && filteredPatients.length > 0 && (
                  <ul className="bills-patient-dropdown">
                    {filteredPatients.map(p => (
                      <li
                        key={p.id}
                        onClick={() => handleSelectPatient(p)}
                      >
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label>Total:</label>
                <input
                  className="bills-modal-input"
                  type="number"
                  step="0.01"
                  value={addInvoiceTotal}
                  onChange={e => setAddInvoiceTotal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="bills-modal-actions">
              <button type="submit" disabled={invoiceLoading}>Add Invoice</button>
              <button type="button" onClick={() => setShowAddInvoice(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default BillsPayment;
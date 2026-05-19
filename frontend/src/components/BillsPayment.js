import React, { useState, useEffect, useRef } from 'react';
import AddPaymentForm from './AddPaymentForm';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext'; 
import Swal from 'sweetalert2';
import './BillsPayment.css';

const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) =>
      p.startsWith("M") || p.startsWith("m") ? <path key={i} d={p} /> : <polyline key={i} points={p} />
    )}
  </svg>
);

const I = {
  plus:     ["M12 5v14", "M5 12h14"],
  check:    ["M20 6L9 17l-5-5"],
  x:        ["M18 6L6 18", "M6 6l12 12"],
  search:   ["M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"],
  wallet:   ["M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-4z", "M3 10h18", "M16 14h.01"],
  fileText: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8M16 17H8M10 9H8"],
  eye:      ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  print:    ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"]
};

const swalConfig = {
  confirmButtonColor: "#0f2340",
  cancelButtonColor: "#64748b",
  customClass: {
    confirmButton: "bills-swal-confirm-btn",
    cancelButton: "bills-swal-cancel-btn",
  }
};

function BillsPayment() {
  const { clinicId, currencySymbol, currencyLocale, loading: contextLoading } = useClinic();

  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [addInvoicePatientSearch, setAddInvoicePatientSearch] = useState('');
  const [addInvoicePatientId, setAddInvoicePatientId] = useState('');
  const [addInvoiceTotal, setAddInvoiceTotal] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [patientDropdownVisible, setPatientDropdownVisible] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!clinicId) return;
    setTableLoading(true);

    Promise.all([
      supabase.from('invoices').select('*').eq('clinic_id', clinicId).order('id', { ascending: false }),
      supabase.from('payments').select('*').eq('clinic_id', clinicId).order('id', { ascending: false }),
      supabase.from('patients').select('*').eq('clinic_id', clinicId)
    ])
    .then(([invRes, payRes, patRes]) => {
      setInvoices(invRes.data || []);
      setPayments(payRes.data || []);
      setPatients(patRes.data || []);
    })
    .catch((err) => console.error("Error syncing data logs:", err))
    .finally(() => setTableLoading(false));
  }, [clinicId]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setPatientDropdownVisible(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowAddPayment(true);
  };

  const handlePaymentAdded = async (payment) => {
    // Kinukuha ang pinakabagong listahan ng payments at invoices matapos magbayad para sigurado ang status sync
    if (clinicId) {
      const [invRes, payRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('clinic_id', clinicId).order('id', { ascending: false }),
        supabase.from('payments').select('*').eq('clinic_id', clinicId).order('id', { ascending: false })
      ]);
      setInvoices(invRes.data || []);
      setPayments(payRes.data || []);
    }
    setShowAddPayment(false);
    setSelectedInvoice(null);
    Swal.fire({ ...swalConfig, title: "Payment Posted", text: "Transaction ledger updated safely.", icon: "success", timer: 1500, showConfirmButton: false });
  };

  const invoicePayments = (invoiceId) => payments.filter(p => p.invoice_id === invoiceId);
  const getPatientById = (id) => patients.find(p => p.id === id);

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
    if (search.trim().length > 0) {
      const matches = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
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

  const handleOpenReceipt = (invoice) => {
    setActiveReceipt(invoice);
    setShowReceiptModal(true);
  };

  const handleAddInvoiceSubmit = async (e) => {
    e.preventDefault();
    if (!addInvoicePatientId) {
      Swal.fire({ ...swalConfig, title: "Validation Error", text: "Please pick a registered patient from the active search registry.", icon: "warning" });
      return;
    }
    setInvoiceLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .insert([{
          patient_id: addInvoicePatientId,
          total: parseFloat(addInvoiceTotal),
          clinic_id: clinicId,
          status: 'Unpaid'
        }])
        .select()
        .single();
        
      if (error) {
        Swal.fire({ ...swalConfig, title: "Query Error", text: error.message || "Failed to catalog invoice.", icon: "error" });
      } else if (data) {
        setInvoices(prev => [data, ...prev]);
        setShowAddInvoice(false);
        Swal.fire({ ...swalConfig, title: "Created", text: "New diagnostic account invoice deployed.", icon: "success", timer: 1500, showConfirmButton: false });
      }
    } catch (err) {
      Swal.fire({ ...swalConfig, title: "Network Interrupted", text: "Connection issues blocking database writes.", icon: "error" });
    }
    setInvoiceLoading(false);
  };

  if (contextLoading) {
    return <div className="bills-loading"><span className="bills-spinner" /> Loading currency and clinic environments...</div>;
  }

  return (
    <div className="bills-container">
      {/* Header Panel */}
      <div className="bills-sticky-header no-print">
        <div className="bills-header-row">
          <div className="bills-header-title">
            <h2>Bills & Payments Ledger</h2>
            <div className="bills-header-meta">
              <span className="bills-stat">{invoices.length} <em>invoices</em></span>
              <span className="bills-stat-divider">·</span>
              <span className="bills-stat">{payments.length} <em>processed payments</em></span>
            </div>
          </div>
          <button className="bills-action-btn" onClick={handleShowAddInvoice}>
            <Icon d={I.plus} /> Add Invoice
          </button>
        </div>
      </div>

      {/* Main Container Workspace */}
      <div className="bills-body no-print">
        {tableLoading && <div className="bills-table-loading"><span className="bills-spinner"/> Syncing ledgers...</div>}
        
        {/* INVOICES */}
        <div className="bills-section-card">
          <div className="bills-section-header">
            <Icon d={I.fileText} size={16} />
            <h3 className="bills-section-title">Active Invoices</h3>
          </div>
          
          <table className="bills-table bills-invoices-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>ID</th>
                <th>Patient Name</th>
                <th style={{ textAlign: "right" }}>Total Bill</th>
                <th style={{ textAlign: "center", width: "120px" }}>Status</th>
                <th style={{ textAlign: "right", width: "220px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="bills-no-data">No recorded clinic invoices discovered.</td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const patient = getPatientById(inv.patient_id);
                  const currentStatus = inv.status || 'Unpaid';
                  
                  return (
                    <tr key={inv.id}>
                      <td className="bills-td-id">#{inv.id}</td>
                      <td><span className="bills-patient-name">{patient ? patient.name : `ID: ${inv.patient_id}`}</span></td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">
                        {currencySymbol}{Number(inv.total || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`bills-status-badge bills-status--${currentStatus.toLowerCase()}`}>{currentStatus}</span>
                      </td>
                      <td style={{ textAlign: "right" }} className="bills-actions-cell">
                        <button className="bills-table-btn bills-btn-secondary" onClick={() => handleOpenReceipt(inv)}>
                          <Icon d={I.eye} size={12} /> View
                        </button>
                        <button className="bills-table-btn" onClick={() => handleAddPayment(inv)} disabled={currentStatus.toLowerCase() === 'paid'}>
                          <Icon d={I.wallet} size={12} /> Pay
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* RECENT PAYMENTS */}
        <div className="bills-section-card" style={{ marginTop: "32px" }}>
          <div className="bills-section-header">
            <Icon d={I.wallet} size={16} />
            <h3 className="bills-section-title">Payment Collections Audit</h3>
          </div>
          
          <table className="bills-table bills-payments-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>Inv ID</th>
                <th>Patient Name</th>
                <th style={{ textAlign: "right" }}>Amount Settled</th>
                <th>Method</th>
                <th>Reference #</th>
                <th style={{ textAlign: "right" }}>Transaction Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="bills-no-data">Zero monetary collections documented yet.</td>
                </tr>
              ) : (
                payments.map(pay => {
                  const patient = getPatientById(pay.patient_id);
                  return (
                    <tr key={pay.id}>
                      <td className="bills-td-id">#{pay.invoice_id}</td>
                      <td><span className="bills-patient-name">{patient ? patient.name : `ID: ${pay.patient_id}`}</span></td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">
                        {currencySymbol}{Number(pay.amount || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                      </td>
                      <td><span className="bills-method-tag">{pay.method}</span></td>
                      <td><code className="bills-ref-num">{pay.reference_number || '—'}</code></td>
                      <td style={{ textAlign: "right" }} className="bills-td-date">
                        {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub-form Modal Hooks */}
      {showAddPayment && (
        <AddPaymentForm
          invoice={selectedInvoice}
          clinicId={clinicId}
          currencySymbol={currencySymbol}
          currencyLocale={currencyLocale}
          onClose={() => setShowAddPayment(false)}
          onPaymentAdded={handlePaymentAdded}
        />
      )}

      {/* Add Invoice Pop-up Form */}
      {showAddInvoice && (
        <div className="bills-modal-overlay no-print" onClick={() => setShowAddInvoice(false)}>
          <form onSubmit={handleAddInvoiceSubmit} className="bills-modal-form" autoComplete="off" onClick={e => e.stopPropagation()}>
            <div className="bills-modal-header">
              <h3>Create Patient Invoice</h3>
              <p className="bills-modal-sub">Account creation for tracking diagnostic services rendered.</p>
            </div>
            <div className="bills-modal-body">
              <div className="bills-modal-row" ref={dropdownRef}>
                <label>Select Patient</label>
                <div className="bills-search-input-wrap">
                  <span className="bills-input-icon"><Icon d={I.search} size={14} /></span>
                  <input
                    className="bills-modal-input bills-input-has-icon"
                    type="text"
                    value={addInvoicePatientSearch}
                    onChange={handlePatientSearchChange}
                    onFocus={() => addInvoicePatientSearch && setPatientDropdownVisible(true)}
                    placeholder="Search patient registry by name..."
                    required
                  />
                </div>
                {patientDropdownVisible && filteredPatients.length > 0 && (
                  <ul className="bills-patient-dropdown">
                    {filteredPatients.map(p => (
                      <li key={p.id} onClick={() => handleSelectPatient(p)}>{p.name}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bills-modal-row">
                <label>Total Account Balance Due ({currencySymbol})</label>
                <input
                  className="bills-modal-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={addInvoiceTotal}
                  onFocus={(e) => e.target.select()}
                  onChange={e => setAddInvoiceTotal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="bills-modal-footer">
              <button type="button" className="bills-btn-ghost" onClick={() => setShowAddInvoice(false)}>Cancel</button>
              <button type="submit" className="bills-btn-confirm" disabled={invoiceLoading}>
                {invoiceLoading ? <span className="bills-spinner-small" /> : <><Icon d={I.check} /> Deploy Invoice</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATEMENT OF ACCOUNT (SOA) PRINTABLE MODAL */}
      {showReceiptModal && activeReceipt && (() => {
        const pHistory = invoicePayments(activeReceipt.id);
        const totalPaid = pHistory.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const balanceDue = parseFloat(activeReceipt.total) - totalPaid;
        const patient = getPatientById(activeReceipt.patient_id);
        const currentStatus = activeReceipt.status || 'Unpaid';

        return (
          <div className="bills-modal-overlay receipt-overlay" onClick={() => setShowReceiptModal(false)}>
            <div className="bills-receipt-card" onClick={e => e.stopPropagation()}>
              <div className="receipt-actions-toolbar no-print">
                <button className="bills-table-btn bills-btn-secondary" onClick={() => window.print()}>
                  <Icon d={I.print} size={13} /> Print / Export PDF
                </button>
                <button className="receipt-close-btn" onClick={() => setShowReceiptModal(false)}>
                  <Icon d={I.x} size={16} />
                </button>
              </div>

              <div className="print-receipt-area">
                <div className="receipt-clinic-branding">
                  <h2>DENTAL CLINIC SYSTEM</h2>
                  <p>Official Statement of Account & Receipts Ledger</p>
                  <span className="receipt-date-stamp">Generated: {new Date().toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>

                <hr className="receipt-divider" />

                <div className="receipt-meta-grid">
                  <div>
                    <span className="receipt-label">INVOICE TO:</span>
                    <div className="receipt-patient-title">{patient ? patient.name : 'Unknown Patient'}</div>
                    <small>Patient ID: #{activeReceipt.patient_id}</small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="receipt-label">INVOICE DETAILS:</span>
                    <div className="receipt-number">ID: #{activeReceipt.id}</div>
                    <span className={`bills-status-badge bills-status--${currentStatus.toLowerCase()}`}>
                      {currentStatus}
                    </span>
                  </div>
                </div>

                <table className="receipt-items-table">
                  <thead>
                    <tr>
                      <th>Description Summary</th>
                      <th style={{ textAlign: "right" }}>Total Amount Charged</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Dental Services Rendering Log</strong>
                        <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#64748b" }}>
                          Account charges configured relative to diagnosis guidelines.
                        </p>
                      </td>
                      <td style={{ textAlign: "right" }} className="receipt-bold-num">
                        {currencySymbol}{Number(activeReceipt.total || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {pHistory.length > 0 && (
                  <div className="receipt-payment-history-block">
                    <h4>Collections Breakdown Logs</h4>
                    <table className="receipt-payments-subtable">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Method</th>
                          <th>Reference #</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pHistory.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.payment_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td><span className="bills-method-tag">{p.method}</span></td>
                            <td><code>{p.reference_number || '—'}</code></td>
                            <td style={{ textAlign: "right" }}>
                              {currencySymbol}{Number(p.amount || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="receipt-totals-summary-wrapper">
                  <div className="receipt-summary-line">
                    <span>Grand Total Due:</span>
                    <span>{currencySymbol}{Number(activeReceipt.total || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="receipt-summary-line">
                    <span>Total Amount Paid:</span>
                    <span style={{ color: "#16a34a" }}>
                      (-) {currencySymbol}{Number(totalPaid).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <hr />
                  <div className="receipt-summary-line receipt-grand-total">
                    <span>Remaining Balance Due:</span>
                    <span>
                      {currencySymbol}{Number(balanceDue > 0 ? balanceDue : 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="receipt-footer-signoff">
                  <p>Thank you for trusting our clinic with your dental healthcare needs.</p>
                  <small>This serves as an official administrative copy of financial balances recorded in our system matrix.</small>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default BillsPayment;
import React, { useState, useEffect, useRef } from 'react';
import AddPaymentForm from './AddPaymentForm';
import InvoiceManagementModal from './InvoiceManagementModal';
import { DcThemeProvider } from '../themes/DcThemeProvider';
import { AgingAnalysis } from './billing/AgingAnalysis';
import { CollectionsOverview } from './billing/CollectionsOverview';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext';
import Swal from 'sweetalert2';
import './BillsPayment.css';
import html2pdf from 'html2pdf.js';

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
  print:    ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],
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
  const { clinicId, clinicName, currencySymbol, currencyLocale, loading: contextLoading } = useClinic();

  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'aging' | 'collections'

  // Invoice Management Modal
  const [showManageModal, setShowManageModal] = useState(false);
  const [managingInvoice, setManagingInvoice] = useState(null);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  // SOA Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Add Invoice Modal
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
      supabase.from('patients').select('*').eq('clinic_id', clinicId),
      supabase.from('dentists').select('*').eq('clinic_id', clinicId),
    ])
    .then(([invRes, payRes, patRes, denRes]) => {
      setInvoices(invRes.data || []);
      setPayments(payRes.data || []);
      setPatients(patRes.data || []);
      setDentists(denRes.data || []);
    })
    .catch(err => console.error("Error syncing data:", err))
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

  const refreshData = async () => {
    if (!clinicId) return;
    const [invRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('clinic_id', clinicId).order('id', { ascending: false }),
      supabase.from('payments').select('*').eq('clinic_id', clinicId).order('id', { ascending: false }),
    ]);
    setInvoices(invRes.data || []);
    setPayments(payRes.data || []);

    // Also refresh managing invoice if open
    if (managingInvoice) {
      const fresh = (invRes.data || []).find(i => i.id === managingInvoice.id);
      if (fresh) setManagingInvoice(fresh);
    }
  };

  const handleAddPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowAddPayment(true);
  };

  const handlePaymentAdded = async () => {
    await refreshData();
    setShowAddPayment(false);
    setSelectedInvoice(null);
    setInvoiceRefreshTrigger(prev => prev + 1); // ADD THIS LINE
    Swal.fire({ ...swalConfig, title: "Payment Posted", text: "Transaction ledger updated safely.", icon: "success", timer: 1500, showConfirmButton: false });
  };

  // Open Invoice Management Modal
  const handleManageInvoice = (invoice) => {
    setManagingInvoice(invoice);
    setShowManageModal(true);
  };

  // Record payment from inside Invoice Management Modal
  const handleRecordPaymentFromModal = () => {
    setSelectedInvoice(managingInvoice);
    setShowAddPayment(true);
  };

  // Print SOA from inside Invoice Management Modal
  const handlePrintSOAFromModal = () => {
    setActiveReceipt(managingInvoice);
    setShowManageModal(false);
    setShowReceiptModal(true);
  };

  const invoicePayments = (invoiceId) => payments
  .filter(p => p.invoice_id === invoiceId)
  .sort((a, b) => a.id - b.id);
  const getPatientById = (id) => patients.find(p => p.id === id);

  // Total paid per invoice, built once per render from the loaded payments —
  // powers the Paid / Balance columns without any extra queries.
  const paidByInvoice = payments.reduce((map, p) => {
    map.set(p.invoice_id, (map.get(p.invoice_id) || 0) + parseFloat(p.amount || 0));
    return map;
  }, new Map());

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
          total: parseFloat(addInvoiceTotal) || 0,
          clinic_id: clinicId,
          status: 'Unpaid',
          invoice_date: new Date().toISOString().slice(0, 10),
        }])
        .select()
        .single();

      if (error) {
        Swal.fire({ ...swalConfig, title: "Query Error", text: error.message || "Failed to catalog invoice.", icon: "error" });
      } else if (data) {
        setInvoices(prev => [data, ...prev]);
        setShowAddInvoice(false);
        Swal.fire({ ...swalConfig, title: "Created", text: "Invoice created. Open it to add line items.", icon: "success", timer: 1800, showConfirmButton: false });
      }
    } catch (err) {
      Swal.fire({ ...swalConfig, title: "Network Interrupted", text: "Connection issues blocking database writes.", icon: "error" });
    }
    setInvoiceLoading(false);
  };

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;

  if (contextLoading) {
    return (
      <DcThemeProvider>
        <div className="bills-loading"><span className="bills-spinner" /> Loading currency and clinic environments...</div>
      </DcThemeProvider>
    );
  }

  const handleDownloadPDF = () => {
    const element = document.querySelector('.print-receipt-area');
    const opt = {
      margin:       [8, 8, 8, 8],
      filename:     `SOA-Invoice-${activeReceipt?.id}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      windowWidth: 350,  // ADD THIS — constrains the render width to match narrow receipt
      jsPDF:        { unit: 'mm', format: [110, 297], orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <DcThemeProvider>
    <div className="bills-container">
      {/* Header */}
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
          {activeTab === 'invoices' && (
            <button className="bills-action-btn" onClick={handleShowAddInvoice}>
              <Icon d={I.plus} /> Add Invoice
            </button>
          )}
        </div>

        {/* Tabs Navigation */}
        <div className="bills-tabs-container">
          <button
            className={`bills-tab ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoices')}
          >
            Invoices
          </button>
          <button
            className={`bills-tab ${activeTab === 'aging' ? 'active' : ''}`}
            onClick={() => setActiveTab('aging')}
          >
            Aging Analysis
          </button>
          <button
            className={`bills-tab ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
          >
            Collections
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="bills-body no-print">
        {tableLoading && activeTab === 'invoices' && <div className="bills-table-loading"><span className="bills-spinner" /> Syncing ledgers...</div>}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
        <>
        {/* INVOICES TABLE */}
        <div className="bills-section-card">
          <div className="bills-section-header">
            <Icon d={I.fileText} size={16} />
            <h3 className="bills-section-title">Active Invoices</h3>
          </div>

          <table className="bills-table bills-invoices-table">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Patient Name</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Balance</th>
                <th style={{ textAlign: "center", width: "110px" }}>Status</th>
                <th style={{ textAlign: "right", width: "260px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="bills-no-data">No recorded clinic invoices discovered.</td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const patient = getPatientById(inv.patient_id);
                  const currentStatus = inv.status || 'Unpaid';
                  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && currentStatus !== 'Paid';
                  const paidAmount = paidByInvoice.get(inv.id) || 0;
                  const balanceDue = Math.max(parseFloat(inv.total || 0) - paidAmount, 0);
                  const displayStatus = isOverdue ? 'Overdue' : currentStatus;

                  return (
                    <tr key={inv.id}>
                      <td className="bills-td-id">#{inv.id}</td>
                      <td><span className="bills-patient-name">{patient ? patient.name : `ID: ${inv.patient_id}`}</span></td>
                      <td className="bills-td-date">
                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="bills-td-date">
                        {inv.due_date ? (
                          <span style={{ color: isOverdue ? 'var(--dc-danger)' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                            {new Date(inv.due_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
                            {isOverdue && ' ⚠'}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">
                        {fmt(inv.total || 0)}
                      </td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">
                        {paidAmount > 0
                          ? <span style={{ color: 'var(--dc-success)' }}>{fmt(paidAmount)}</span>
                          : <span style={{ color: 'var(--dc-text-3)', fontWeight: 400 }}>—</span>}
                      </td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">
                        <span style={{ color: balanceDue > 0 ? (isOverdue ? 'var(--dc-danger)' : 'inherit') : 'var(--dc-text-3)' }}>
                          {fmt(balanceDue)}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`bills-status-badge bills-status--${displayStatus.toLowerCase()}`}>{displayStatus}</span>
                      </td>
                      <td style={{ textAlign: "right" }} className="bills-actions-cell">
                        <button className="bills-table-btn bills-btn-manage" onClick={() => handleManageInvoice(inv)}>
                          <Icon d={I.settings} size={12} /> Manage
                        </button>
                        <button className="bills-table-btn bills-btn-secondary" onClick={() => { setActiveReceipt(inv); setShowReceiptModal(true); }}>
                          <Icon d={I.print} size={12} /> SOA
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

        {/* PAYMENTS TABLE */}
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
                <th>OR #</th>
                <th>Method</th>
                <th>Reference #</th>
                <th style={{ textAlign: "right" }}>Transaction Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="bills-no-data">Zero monetary collections documented yet.</td>
                </tr>
              ) : (
                payments.map(pay => {
                  const patient = getPatientById(pay.patient_id);
                  return (
                    <tr key={pay.id}>
                      <td className="bills-td-id">#{pay.invoice_id}</td>
                      <td><span className="bills-patient-name">{patient ? patient.name : `ID: ${pay.patient_id}`}</span></td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">{fmt(pay.amount || 0)}</td>
                      <td><code className="inv-or-num">{pay.or_number || '—'}</code></td>
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
        </>
        )}

        {/* AGING ANALYSIS TAB — computed from the same ledger data above */}
        {activeTab === 'aging' && (
          <AgingAnalysis
            invoices={invoices}
            payments={payments}
            patients={patients}
            fmt={fmt}
            locale={currencyLocale}
          />
        )}

        {/* COLLECTIONS OVERVIEW TAB — computed from the same ledger data above */}
        {activeTab === 'collections' && (
          <CollectionsOverview
            invoices={invoices}
            payments={payments}
            fmt={fmt}
            currencySymbol={currencySymbol}
            locale={currencyLocale}
          />
        )}
      </div>

      {/* INVOICE MANAGEMENT MODAL */}
      {showManageModal && managingInvoice && (
        <InvoiceManagementModal
          invoice={managingInvoice}
          clinicId={clinicId}
          currencySymbol={currencySymbol}
          currencyLocale={currencyLocale}
          patients={patients}
          dentists={dentists}
          refreshTrigger={invoiceRefreshTrigger}  // ADD THIS LINE
          onClose={() => { setShowManageModal(false); setManagingInvoice(null); refreshData(); }}
          onInvoiceUpdated={refreshData}
          onRecordPayment={handleRecordPaymentFromModal}
          onPrintSOA={handlePrintSOAFromModal}
        />
      )}

      {/* ADD PAYMENT FORM */}
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

      {/* ADD INVOICE MODAL */}
      {showAddInvoice && (
        <div className="bills-modal-overlay no-print" onClick={() => setShowAddInvoice(false)}>
          <form onSubmit={handleAddInvoiceSubmit} className="bills-modal-form" autoComplete="off" onClick={e => e.stopPropagation()}>
            <div className="bills-modal-header">
              <h3>Create Patient Invoice</h3>
              <p className="bills-modal-sub">A blank invoice will be created. Add line items after creation.</p>
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
            </div>
            <div className="bills-modal-footer">
              <button type="button" className="bills-btn-ghost" onClick={() => setShowAddInvoice(false)}>Cancel</button>
              <button type="submit" className="bills-btn-confirm" disabled={invoiceLoading}>
                {invoiceLoading ? <span className="bills-spinner-small" /> : <><Icon d={I.check} /> Create Invoice</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SOA PRINTABLE MODAL */}
      {showReceiptModal && activeReceipt && (() => {
        const pHistory = invoicePayments(activeReceipt.id);
        const totalPaid = pHistory.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const balanceDue = parseFloat(activeReceipt.total) - totalPaid;
        const patient = getPatientById(activeReceipt.patient_id);
        const dentist = dentists.find(d => d.id === activeReceipt.dentist_id);
        const currentStatus = activeReceipt.status || 'Unpaid';

        return (
          <div className="bills-modal-overlay receipt-overlay" onClick={() => setShowReceiptModal(false)}>
            <div className="bills-receipt-card" onClick={e => e.stopPropagation()}>
              <div className="receipt-actions-toolbar no-print">
                <button className="bills-table-btn bills-btn-secondary" onClick={handleDownloadPDF}>
                  <Icon d={I.print} size={13} /> Download PDF
                </button>
                <button className="receipt-close-btn" onClick={() => setShowReceiptModal(false)}>
                  <Icon d={I.x} size={16} />
                </button>
              </div>

              <div className="print-receipt-area">
                <div className="receipt-clinic-branding">
                  <h2>{clinicName || 'DENTAL CLINIC SYSTEM'}</h2>
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
                    {dentist && <div style={{ fontSize: '12px', color: '#64748b' }}>Dr. {dentist.name}</div>}
                    {activeReceipt.invoice_date && <div style={{ fontSize: '12px', color: '#64748b' }}>Date: {new Date(activeReceipt.invoice_date).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
                    {activeReceipt.due_date && <div style={{ fontSize: '12px', color: '#64748b' }}>Due: {new Date(activeReceipt.due_date).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
                    <span className={`bills-status-badge bills-status--${currentStatus.toLowerCase()}`}>{currentStatus}</span>
                  </div>
                </div>

                {/* Line Items on SOA */}
                <SOALineItems
                  invoiceId={activeReceipt.id}
                  currencySymbol={currencySymbol}
                  currencyLocale={currencyLocale}
                />

                {pHistory.length > 0 && (
                  <div className="receipt-payment-history-block">
                    <h4>Collections Breakdown Logs</h4>
                    <table className="receipt-payments-subtable">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>OR #</th>
                          <th>Method</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pHistory.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.payment_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td><code>{p.or_number || '—'}</code></td>
                            <td><span className="bills-method-tag">{p.method}</span></td>
                            <td style={{ textAlign: "right" }}>{fmt(p.amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="receipt-totals-summary-wrapper">
                  <div className="receipt-summary-line">
                    <span>Grand Total Due:</span>
                    <span>{fmt(activeReceipt.total || 0)}</span>
                  </div>
                  {parseFloat(activeReceipt.discount || 0) > 0 && (
                    <div className="receipt-summary-line">
                      <span>Discount Applied:</span>
                      <span style={{ color: '#16a34a' }}>(-) {fmt(activeReceipt.discount)}</span>
                    </div>
                  )}
                  <div className="receipt-summary-line">
                    <span>Total Amount Paid:</span>
                    <span style={{ color: "#16a34a" }}>(-) {fmt(totalPaid)}</span>
                  </div>
                  <hr />
                  <div className="receipt-summary-line receipt-grand-total">
                    <span>Remaining Balance Due:</span>
                    <span>{fmt(balanceDue > 0 ? balanceDue : 0)}</span>
                  </div>
                </div>

                {activeReceipt.notes && (
                  <div style={{ margin: '16px 0', padding: '12px', background: '#f8fafc', borderRadius: 6, fontSize: '13px', color: '#475569' }}>
                    <strong>Notes:</strong> {activeReceipt.notes}
                  </div>
                )}

                <div className="receipt-footer-signoff">
                  <p>Thank you for trusting our clinic with your dental healthcare needs.</p>
                  <small>This serves as an official administrative copy of financial balances recorded in our system.</small>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </DcThemeProvider>
  );
}

// Sub-component: fetches and renders line items inside the SOA printable modal
function SOALineItems({ invoiceId, currencySymbol, currencyLocale }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('id')
      .then(({ data }) => setItems(data || []));
  }, [invoiceId]);

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;

  if (items.length === 0) return null;

  return (
    <table className="receipt-items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th style={{ textAlign: 'center' }}>Qty</th>
          <th style={{ textAlign: 'right' }}>Unit Price</th>
          <th style={{ textAlign: 'right' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id}>
            <td>{item.description}</td>
            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
            <td style={{ textAlign: 'right' }} className="receipt-bold-num">{fmt(item.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default BillsPayment;
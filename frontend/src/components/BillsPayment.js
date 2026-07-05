import React, { useState, useEffect, useRef } from 'react';
import AddPaymentForm from './AddPaymentForm';
import InvoiceManagementModal from './InvoiceManagementModal';
import InvoiceLineItems from './billing/InvoiceLineItems';
import { DcThemeProvider } from '../themes/DcThemeProvider';
import { AgingAnalysis } from './billing/AgingAnalysis';
import { CollectionsOverview } from './billing/CollectionsOverview';
import { GRANS, getPeriodRange, shiftAnchor, inRange, isCurrentOrFuture } from './billing/period';
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
  trendingUp: ["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"],
  chevL:    ["M15 18l-6-6 6-6"],
  chevR:    ["M9 18l6-6-6-6"],
  alert:    ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  banknote: ["M2 6h20v12H2z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 9v.01M18 15v.01"],
  coins:    ["M12 8c-3.87 0-7-1.34-7-3s3.13-3 7-3 7 1.34 7 3-3.13 3-7 3z", "M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5", "M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6"],
};

// One status color language for chips + KPIs (mirrors the table status badges).
const TONE = {
  accent:  { t: 'var(--dc-accent)',  s: 'var(--dc-accent-soft)' },
  success: { t: 'var(--dc-success)', s: 'var(--dc-success-soft)' },
  warning: { t: 'var(--dc-warning)', s: 'var(--dc-warning-soft)' },
  danger:  { t: 'var(--dc-danger)',  s: 'var(--dc-danger-soft)' },
  info:    { t: 'var(--dc-info)',    s: 'var(--dc-info-soft)' },
  muted:   { t: 'var(--dc-text-3)',  s: 'var(--dc-surface-2)' },
};
const toneVars = (tone) => ({ '--tone': TONE[tone].t, '--tone-soft': TONE[tone].s });
const CHIP_TONE = { all: 'accent', Unpaid: 'danger', Partial: 'warning', Overdue: 'danger', Paid: 'success', Voided: 'muted' };

const swalConfig = {
  // Dialog colors come from the global swalTheme.css (app-wide SweetAlert theme);
  // only geometry is set here via customClass.
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
  const [procedures, setProcedures] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'aging' | 'collections'

  // Period picker — scopes the Invoices tab, header, and Collections KPIs.
  // Aging stays a live "as of today" snapshot (unaffected).
  const [periodGran, setPeriodGran] = useState('all'); // 'all' | 'year' | 'month' | 'week' | 'day'
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());

  // Invoices table: search / filter / sort / pagination
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Unpaid' | 'Partial' | 'Overdue' | 'Paid' | 'Voided'
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('desc');
  const [invoicePage, setInvoicePage] = useState(1);

  // Invoice Management Modal
  const [showManageModal, setShowManageModal] = useState(false);
  const [managingInvoice, setManagingInvoice] = useState(null);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  // SOA Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Create Invoice Modal (staged — invoice + line items committed atomically)
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [addInvoicePatientSearch, setAddInvoicePatientSearch] = useState('');
  const [addInvoicePatientId, setAddInvoicePatientId] = useState('');
  const [addInvoiceDentistId, setAddInvoiceDentistId] = useState('');
  const [addInvoiceApptId, setAddInvoiceApptId] = useState('');
  const [addInvoiceDate, setAddInvoiceDate] = useState('');
  const [addInvoiceDue, setAddInvoiceDue] = useState('');
  const [addInvoiceDiscount, setAddInvoiceDiscount] = useState('');
  const [addInvoiceNotes, setAddInvoiceNotes] = useState('');
  const [addLineItems, setAddLineItems] = useState([]);
  const [patientAppointments, setPatientAppointments] = useState([]);
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
      supabase.from('procedures').select('*').eq('clinic_id', clinicId).order('name'),
    ])
    .then(([invRes, payRes, patRes, denRes, procRes]) => {
      setInvoices(invRes.data || []);
      setPayments(payRes.data || []);
      setPatients(patRes.data || []);
      setDentists(denRes.data || []);
      setProcedures(procRes.data || []);
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

  // Invoice lookup — lets the payments audit show the ORIGINAL invoice date next
  // to the payment date, so cross-period cash (a July payment on a May invoice)
  // is obvious in the table itself.
  const invoiceById = new Map(invoices.map(i => [i.id, i]));

  // ------- Period scoping -------
  // Invoices are scoped by invoice_date, payments by payment_date (cash in the
  // period). Balances still use ALL payments (paidByInvoice above) so a period
  // invoice's outstanding reflects every payment ever made against it.
  const periodRange = getPeriodRange(periodGran, periodAnchor, currencyLocale);
  const invoicesInPeriod = invoices.filter(inv => inRange(inv.invoice_date, periodRange, inv.created_at));
  const paymentsInPeriod = payments.filter(p => inRange(p.payment_date, periodRange, p.created_at));
  const canGoNext = !isCurrentOrFuture(periodRange);
  const periodCollected = paymentsInPeriod.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const goPeriod = (dir) => { setPeriodAnchor(a => shiftAnchor(periodGran, a, dir)); setInvoicePage(1); };
  const setGran = (g) => { setPeriodGran(g); setPeriodAnchor(new Date()); setInvoicePage(1); setStatusFilter('all'); setInvoiceSearch(''); };

  // ------- Invoices table pipeline: enrich → filter → sort → paginate -------
  const INVOICES_PAGE_SIZE = 20;
  const nowForOverdue = new Date();

  const enrichedInvoices = invoicesInPeriod.map(inv => {
    const patient = getPatientById(inv.patient_id);
    const patientName = patient ? patient.name : `ID: ${inv.patient_id}`;
    const currentStatus = inv.status || 'Unpaid';
    const isCancelled = currentStatus.toLowerCase() === 'cancelled';
    const paidAmount = paidByInvoice.get(inv.id) || 0;
    const balanceDue = Math.max(parseFloat(inv.total || 0) - paidAmount, 0);
    const isOverdue = !isCancelled && inv.due_date && new Date(inv.due_date) < nowForOverdue && currentStatus !== 'Paid';
    const displayStatus = isCancelled ? 'Voided' : (isOverdue ? 'Overdue' : currentStatus);
    return { inv, patient, patientName, currentStatus, isCancelled, isOverdue, paidAmount, balanceDue, displayStatus };
  });

  const chipDefs = (() => {
    const counts = { Unpaid: 0, Partial: 0, Overdue: 0, Paid: 0, Voided: 0 };
    let active = 0;
    for (const row of enrichedInvoices) {
      if (counts[row.displayStatus] !== undefined) counts[row.displayStatus] += 1;
      if (!row.isCancelled) active += 1;
    }
    return [
      { key: 'all', label: 'All', count: active },
      { key: 'Unpaid', label: 'Unpaid', count: counts.Unpaid },
      { key: 'Partial', label: 'Partial', count: counts.Partial },
      { key: 'Overdue', label: 'Overdue', count: counts.Overdue },
      { key: 'Paid', label: 'Paid', count: counts.Paid },
      { key: 'Voided', label: 'Voided', count: counts.Voided },
    ];
  })();

  // Practice-finance KPIs for the Invoices tab — scoped to the selected period.
  // Billed/Outstanding/Overdue come from invoices billed in the period (voided
  // excluded); Collected is CASH RECEIVED in the period (by payment date), so it
  // can include payments settling older invoices — that's true period income.
  const ledgerKpis = (() => {
    let billed = 0, outstanding = 0, overdueAmt = 0, overdueCount = 0, activeCount = 0;
    for (const r of enrichedInvoices) {
      if (r.isCancelled) continue;
      activeCount += 1;
      billed += parseFloat(r.inv.total || 0);
      outstanding += r.balanceDue;
      if (r.isOverdue) { overdueAmt += r.balanceDue; overdueCount += 1; }
    }
    const collected = periodCollected; // cash received in the period (any invoice)
    // Collection Rate is COHORT-based: what share of THIS period's own billings
    // has been paid = (billed − still-outstanding) / billed. This avoids the
    // misleading "100%" you get from dividing period-cash (which may settle old
    // invoices) by period-billed. All-time, cohort == cash so it's unchanged.
    const cohortPaid = Math.max(billed - outstanding, 0);
    return { billed, collected, cohortPaid, outstanding, overdueAmt, overdueCount, activeCount, rate: billed > 0 ? cohortPaid / billed : 0 };
  })();

  const searchQ = invoiceSearch.trim().toLowerCase().replace(/^#/, '');
  const filteredRows = enrichedInvoices.filter(row => {
    if (statusFilter === 'all') {
      if (row.isCancelled) return false; // voided hidden by default
    } else if (row.displayStatus !== statusFilter) {
      return false;
    }
    if (searchQ) {
      const matchesName = row.patientName.toLowerCase().includes(searchQ);
      const matchesId = String(row.inv.id).includes(searchQ);
      if (!matchesName && !matchesId) return false;
    }
    return true;
  });

  const sortValue = (row) => {
    switch (sortKey) {
      case 'patient': return row.patientName.toLowerCase();
      case 'invoice_date': return row.inv.invoice_date || '';
      case 'due_date': return row.inv.due_date || '';
      case 'total': return parseFloat(row.inv.total || 0);
      case 'paid': return row.paidAmount;
      case 'balance': return row.balanceDue;
      default: return row.inv.id;
    }
  };

  const sortedRows = [...filteredRows].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const invoiceTotals = filteredRows.reduce(
    (t, r) => {
      t.total += parseFloat(r.inv.total || 0);
      t.paid += r.paidAmount;
      t.balance += r.balanceDue;
      return t;
    },
    { total: 0, paid: 0, balance: 0 }
  );

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / INVOICES_PAGE_SIZE));
  const safePage = Math.min(invoicePage, pageCount);
  const pageRows = sortedRows.slice((safePage - 1) * INVOICES_PAGE_SIZE, safePage * INVOICES_PAGE_SIZE);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'patient' ? 'asc' : 'desc');
    }
    setInvoicePage(1);
  };

  const sortArrow = (key) =>
    sortKey === key ? <span className="bills-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  // Void = soft cancel. Record is kept for audit; analytics and default view
  // exclude it. Only invoices with ZERO payments can be voided.
  const handleVoidInvoice = async (row) => {
    if (row.paidAmount > 0) return;
    const { isConfirmed } = await Swal.fire({
      ...swalConfig,
      title: `Void Invoice #${row.inv.id}?`,
      html: `This marks the invoice as <b>Cancelled</b>. It stays in the records for audit but is excluded from balances, aging, and collections.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, void it',
    });
    if (!isConfirmed) return;

    const { error } = await supabase
      .from('invoices')
      .update({ status: 'Cancelled' })
      .eq('id', row.inv.id)
      .eq('clinic_id', clinicId);

    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed to void', text: error.message });
    } else {
      await refreshData();
      Swal.fire({ ...swalConfig, icon: 'success', title: 'Invoice voided', timer: 1400, showConfirmButton: false });
    }
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const handleShowAddInvoice = () => {
    setShowAddInvoice(true);
    setAddInvoicePatientSearch('');
    setAddInvoicePatientId('');
    setAddInvoiceDentistId('');
    setAddInvoiceApptId('');
    setAddInvoiceDate(todayStr());
    setAddInvoiceDue('');
    setAddInvoiceDiscount('');
    setAddInvoiceNotes('');
    setAddLineItems([]);
    setPatientAppointments([]);
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
    // Changing the patient resets the visit link + attending dentist.
    setAddInvoicePatientId('');
    setAddInvoiceApptId('');
    setPatientAppointments([]);
  };

  const fetchPatientAppointments = async (patientId) => {
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_time, status, dentist_id, procedure_id, procedure_price, reason')
      .eq('patient_id', patientId)
      .eq('clinic_id', clinicId)
      .neq('status', 'Cancelled')
      .order('appointment_time', { ascending: false })
      .limit(15);
    setPatientAppointments(data || []);
  };

  const handleSelectPatient = (patient) => {
    setAddInvoicePatientSearch(patient.name);
    setAddInvoicePatientId(patient.id);
    setPatientDropdownVisible(false);
    setAddInvoiceApptId('');
    fetchPatientAppointments(patient.id);
  };

  // Linking a visit auto-fills the attending dentist + the invoice date AND
  // prefills the appointment's procedure as a line item — so a manual invoice
  // ends up as complete as the one the Completed-status trigger generates.
  const handleSelectAppt = (apptId) => {
    setAddInvoiceApptId(apptId);
    const appt = patientAppointments.find(a => String(a.id) === String(apptId));
    if (!appt) return;
    if (appt.dentist_id) setAddInvoiceDentistId(appt.dentist_id);
    if (appt.appointment_time) setAddInvoiceDate(appt.appointment_time.slice(0, 10));

    // Prefill the booked procedure as a line item (deduped by procedure).
    if (appt.procedure_id) {
      const proc = procedures.find(p => String(p.id) === String(appt.procedure_id));
      const price = parseFloat(appt.procedure_price ?? proc?.price ?? 0) || 0;
      // Appointment `reason` is stored as "Procedure Name — Notes: ...";
      // use the clean procedure name for the line description.
      const desc = proc?.name || (appt.reason ? appt.reason.split(' — Notes:')[0].trim() : 'Procedure');
      setAddLineItems(prev => {
        if (prev.some(li => String(li.procedure_id) === String(appt.procedure_id))) return prev;
        return [...prev, {
          procedure_id: appt.procedure_id,
          description: desc,
          quantity: 1,
          unit_price: price,
          total: price,
          _tmpId: `${Date.now()}-${Math.random()}`,
        }];
      });
    }
  };

  // Staged line-item handlers (in-memory until the invoice is committed).
  const addStagedItem = (item) => {
    setAddLineItems(prev => [
      ...prev,
      { ...item, _tmpId: `${Date.now()}-${Math.random()}`, total: item.quantity * item.unit_price },
    ]);
  };
  const removeStagedItem = (item) => {
    setAddLineItems(prev => prev.filter(x => x !== item));
  };

  const addSubtotal = addLineItems.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const addDiscountAmt = parseFloat(addInvoiceDiscount || 0) || 0;
  const addTotal = Math.max(addSubtotal - addDiscountAmt, 0);

  // Atomic create: insert the invoice, then its line items (DB triggers own the
  // totals). Nothing is written until this runs, so cancelling leaves no orphan.
  const handleCreateInvoice = async (thenPay = false) => {
    if (!addInvoicePatientId) {
      Swal.fire({ ...swalConfig, title: 'Select a patient', text: 'Please pick a registered patient first.', icon: 'warning' });
      return;
    }
    setInvoiceLoading(true);
    try {
      const { data: inv, error } = await supabase
        .from('invoices')
        .insert([{
          patient_id: addInvoicePatientId,
          dentist_id: addInvoiceDentistId || null,
          clinic_id: clinicId,
          status: 'Unpaid',
          invoice_date: addInvoiceDate || todayStr(),
          due_date: addInvoiceDue || null,
          discount: addDiscountAmt,
          notes: addInvoiceNotes.trim() || null,
          total: 0,
        }])
        .select()
        .single();
      if (error) throw error;

      if (addLineItems.length > 0) {
        const rows = addLineItems.map(li => ({
          invoice_id: inv.id,
          clinic_id: clinicId,
          procedure_id: li.procedure_id || null,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
        }));
        const { error: itemsErr } = await supabase.from('invoice_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }

      await refreshData();
      setShowAddInvoice(false);

      if (thenPay) {
        // Re-read so the DB-computed total drives the payment screen's balance.
        const { data: fresh } = await supabase.from('invoices').select('*').eq('id', inv.id).single();
        setSelectedInvoice(fresh || inv);
        setShowAddPayment(true);
      } else {
        Swal.fire({
          ...swalConfig,
          title: 'Invoice created',
          text: addLineItems.length ? 'Invoice and line items saved.' : 'Empty invoice created — open it to add line items.',
          icon: 'success',
          timer: 1600,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      Swal.fire({ ...swalConfig, title: 'Failed to create', text: err.message || 'Could not create the invoice.', icon: 'error' });
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
    <div className="dc-page bills-page">
      {/* Standard module header */}
      <header className="dc-page-header no-print">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Clinic Finance</div>
          <h1 className="dc-page-title">Billing &amp; Payments</h1>
          <div className="dc-page-subtitle bills-header-meta">
            <span className="bills-stat">{ledgerKpis.activeCount} <em>invoices billed</em></span>
            <span className="bills-stat-divider">·</span>
            <span className="bills-stat">{paymentsInPeriod.length} <em>payments</em></span>
            <span className="bills-stat-divider">·</span>
            <span className="bills-stat">{fmt(periodCollected)} <em>collected</em></span>
            {periodGran !== 'all' && <span className="bills-period-tag">{periodRange.label}</span>}
          </div>
        </div>
        <div className="dc-page-header-actions">
          {activeTab === 'invoices' && (
            <button className="dc-btn dc-btn--primary" onClick={handleShowAddInvoice}>
              <Icon d={I.plus} size={16} /> Add Invoice
            </button>
          )}
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="dc-tabs no-print">
        <button
          className={`dc-tab ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices
        </button>
        <button
          className={`dc-tab ${activeTab === 'aging' ? 'active' : ''}`}
          onClick={() => setActiveTab('aging')}
        >
          Aging Analysis
        </button>
        <button
          className={`dc-tab ${activeTab === 'collections' ? 'active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
      </div>

      {/* Period picker — Aging is always "as of today", so it opts out */}
      {activeTab !== 'aging' && (
        <div className="bills-period-bar no-print">
          <div className="bills-seg">
            {GRANS.map(g => (
              <button
                key={g.key}
                className={`bills-seg-btn ${periodGran === g.key ? 'active' : ''}`}
                onClick={() => setGran(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          {periodGran !== 'all' && (
            <div className="bills-period-nav">
              <button className="dc-icon-btn" onClick={() => goPeriod(-1)} aria-label="Previous period">
                <Icon d={I.chevL} size={16} />
              </button>
              <span className="bills-period-label">{periodRange.label}</span>
              <button className="dc-icon-btn" onClick={() => goPeriod(1)} disabled={!canGoNext} aria-label="Next period">
                <Icon d={I.chevR} size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Body */}
      <div className="bills-body no-print">
        {tableLoading && activeTab === 'invoices' && <div className="bills-table-loading"><span className="bills-spinner" /> Syncing ledgers...</div>}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
        <>
        {/* KPI STRIP — headline finance metrics for the active ledger */}
        <div className="bills-kpis">
          <div className="bills-kpi" style={toneVars('warning')}>
            <div className="bills-kpi-top">
              <span className="bills-kpi-label">Outstanding</span>
              <span className="bills-kpi-icon"><Icon d={I.wallet} size={16} /></span>
            </div>
            <div className="bills-kpi-value">{fmt(ledgerKpis.outstanding)}</div>
            <div className="bills-kpi-sub">{periodGran === 'all' ? 'across active invoices' : 'unpaid on period invoices'}</div>
          </div>
          <div className="bills-kpi" style={toneVars('success')}>
            <div className="bills-kpi-top">
              <span className="bills-kpi-label">Cash Collected</span>
              <span className="bills-kpi-icon"><Icon d={I.banknote} size={16} /></span>
            </div>
            <div className="bills-kpi-value">{fmt(ledgerKpis.collected)}</div>
            <div className="bills-kpi-sub">{periodGran === 'all' ? 'received all-time' : 'received in period (any invoice)'}</div>
          </div>
          <div className="bills-kpi" style={toneVars('danger')}>
            <div className="bills-kpi-top">
              <span className="bills-kpi-label">Overdue</span>
              <span className="bills-kpi-icon"><Icon d={I.alert} size={16} /></span>
            </div>
            <div className="bills-kpi-value">{fmt(ledgerKpis.overdueAmt)}</div>
            <div className="bills-kpi-sub">{ledgerKpis.overdueCount} invoice{ledgerKpis.overdueCount === 1 ? '' : 's'} past due</div>
          </div>
          <div className="bills-kpi" style={toneVars('accent')}>
            <div className="bills-kpi-top">
              <span className="bills-kpi-label">Collection Rate</span>
              <span className="bills-kpi-icon"><Icon d={I.trendingUp} size={16} /></span>
            </div>
            <div className="bills-kpi-value">{(ledgerKpis.rate * 100).toFixed(1)}%</div>
            <div className="bills-kpi-sub">of this period's invoices paid</div>
          </div>
        </div>

        {/* INVOICES TABLE */}
        <div className="bills-section-card">
          <div className="bills-section-header">
            <Icon d={I.fileText} size={16} />
            <h3 className="bills-section-title">Active Invoices</h3>
            <span className="bills-section-sub">{filteredRows.length} shown</span>
          </div>

          {/* Search + status filter toolbar */}
          <div className="bills-toolbar">
            <div className="bills-search">
              <span className="bills-input-icon"><Icon d={I.search} size={14} /></span>
              <input
                type="text"
                placeholder="Search patient or invoice #..."
                value={invoiceSearch}
                onChange={e => { setInvoiceSearch(e.target.value); setInvoicePage(1); }}
              />
            </div>
            <div className="bills-chips">
              {chipDefs.map(chip => (
                (chip.key !== 'Voided' || chip.count > 0) && (
                  <button
                    key={chip.key}
                    className={`dc-chip${statusFilter === chip.key ? ' active' : ''}`}
                    style={toneVars(CHIP_TONE[chip.key] || 'accent')}
                    onClick={() => { setStatusFilter(chip.key); setInvoicePage(1); }}
                  >
                    {chip.label} <span className="dc-chip-count">{chip.count}</span>
                  </button>
                )
              ))}
            </div>
          </div>

          <table className="bills-table bills-invoices-table">
            <thead>
              <tr>
                <th className="bills-th-sort" style={{ width: "70px" }} onClick={() => handleSort('id')}>ID{sortArrow('id')}</th>
                <th className="bills-th-sort" onClick={() => handleSort('patient')}>Patient Name{sortArrow('patient')}</th>
                <th className="bills-th-sort" onClick={() => handleSort('invoice_date')}>Invoice Date{sortArrow('invoice_date')}</th>
                <th className="bills-th-sort" onClick={() => handleSort('due_date')}>Due Date{sortArrow('due_date')}</th>
                <th className="bills-th-sort" style={{ textAlign: "right" }} onClick={() => handleSort('total')}>Total{sortArrow('total')}</th>
                <th className="bills-th-sort" style={{ textAlign: "right" }} onClick={() => handleSort('paid')}>Paid{sortArrow('paid')}</th>
                <th className="bills-th-sort" style={{ textAlign: "right" }} onClick={() => handleSort('balance')}>Balance{sortArrow('balance')}</th>
                <th style={{ textAlign: "center", width: "100px" }}>Status</th>
                <th style={{ textAlign: "right", width: "300px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="bills-no-data">
                    {invoices.length === 0
                      ? 'No recorded clinic invoices discovered.'
                      : enrichedInvoices.length === 0
                        ? `No invoices billed in ${periodGran === 'all' ? 'the ledger' : periodRange.label}.`
                        : (
                          <>
                            No invoices match the current filter{searchQ ? ' / search' : ''}
                            {statusFilter !== 'all' ? ` (${statusFilter})` : ''}.{' '}
                            <button
                              type="button"
                              className="bills-inline-link"
                              onClick={() => { setStatusFilter('all'); setInvoiceSearch(''); setInvoicePage(1); }}
                            >
                              Show all {enrichedInvoices.filter(r => !r.isCancelled).length} invoice{enrichedInvoices.filter(r => !r.isCancelled).length === 1 ? '' : 's'}
                            </button>
                          </>
                        )}
                  </td>
                </tr>
              ) : (
                pageRows.map(row => {
                  const { inv, patient, currentStatus, isCancelled, isOverdue, paidAmount, balanceDue, displayStatus } = row;

                  return (
                    <tr key={inv.id} className={isCancelled ? 'bills-row-voided' : ''}>
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
                        <button className="bills-table-btn" onClick={() => handleAddPayment(inv)} disabled={isCancelled || currentStatus.toLowerCase() === 'paid'}>
                          <Icon d={I.wallet} size={12} /> Pay
                        </button>
                        {!isCancelled && (
                          <button
                            className="bills-table-btn bills-btn-void"
                            onClick={() => handleVoidInvoice(row)}
                            disabled={paidAmount > 0}
                            title={paidAmount > 0 ? 'Cannot void — payments are recorded on this invoice' : 'Void this invoice'}
                          >
                            <Icon d={I.x} size={12} /> Void
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="bills-tfoot">
                <tr>
                  <td colSpan={4}>
                    Totals — {filteredRows.length} invoice{filteredRows.length === 1 ? '' : 's'}
                    {(statusFilter !== 'all' || searchQ) ? ' (filtered)' : ''}
                  </td>
                  <td style={{ textAlign: "right" }} className="bills-td-price">{fmt(invoiceTotals.total)}</td>
                  <td style={{ textAlign: "right" }} className="bills-td-price">
                    <span style={{ color: 'var(--dc-success)' }}>{fmt(invoiceTotals.paid)}</span>
                  </td>
                  <td style={{ textAlign: "right" }} className="bills-td-price">
                    <span style={{ color: invoiceTotals.balance > 0 ? 'var(--dc-danger)' : 'inherit' }}>{fmt(invoiceTotals.balance)}</span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Pagination */}
          {sortedRows.length > INVOICES_PAGE_SIZE && (
            <div className="bills-pagination">
              <span>
                Showing {(safePage - 1) * INVOICES_PAGE_SIZE + 1}–{Math.min(safePage * INVOICES_PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
              </span>
              <div className="bills-page-btns">
                <button className="bills-page-btn" onClick={() => setInvoicePage(p => Math.max(1, p - 1))} disabled={safePage <= 1}>
                  ← Prev
                </button>
                <span className="bills-page-indicator">Page {safePage} of {pageCount}</span>
                <button className="bills-page-btn" onClick={() => setInvoicePage(p => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PAYMENTS TABLE */}
        <div className="bills-section-card" style={{ marginTop: "32px" }}>
          <div className="bills-section-header">
            <Icon d={I.wallet} size={16} />
            <h3 className="bills-section-title">Payment Collections Audit</h3>
            <span className="bills-section-sub">{paymentsInPeriod.length} transaction{paymentsInPeriod.length === 1 ? '' : 's'}</span>
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
                <th>Invoice Date</th>
                <th style={{ textAlign: "right" }}>Transaction Date</th>
              </tr>
            </thead>
            <tbody>
              {paymentsInPeriod.length === 0 ? (
                <tr>
                  <td colSpan={8} className="bills-no-data">No payments recorded in this period.</td>
                </tr>
              ) : (
                paymentsInPeriod.map(pay => {
                  const patient = getPatientById(pay.patient_id);
                  const srcInv = invoiceById.get(pay.invoice_id);
                  const invDate = srcInv?.invoice_date;
                  const isEarlier = periodRange.start && invDate && new Date(invDate) < periodRange.start;
                  return (
                    <tr key={pay.id}>
                      <td className="bills-td-id">#{pay.invoice_id}</td>
                      <td><span className="bills-patient-name">{patient ? patient.name : `ID: ${pay.patient_id}`}</span></td>
                      <td style={{ textAlign: "right" }} className="bills-td-price">{fmt(pay.amount || 0)}</td>
                      <td><code className="inv-or-num">{pay.or_number || '—'}</code></td>
                      <td><span className="bills-method-tag">{pay.method}</span></td>
                      <td><code className="bills-ref-num">{pay.reference_number || '—'}</code></td>
                      <td className="bills-td-date">
                        {invDate ? new Date(invDate).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                        {isEarlier && <span className="bills-earlier-tag" title="This payment settled an invoice billed before the selected period">earlier</span>}
                      </td>
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
            periodStart={periodRange.start}
            periodEnd={periodRange.end}
            periodLabel={periodGran === 'all' ? null : periodRange.label}
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

      {/* ADD PAYMENT FORM (POS-style) */}
      {showAddPayment && selectedInvoice && (
        <AddPaymentForm
          invoice={selectedInvoice}
          clinicId={clinicId}
          currencySymbol={currencySymbol}
          currencyLocale={currencyLocale}
          balanceDue={Math.max(parseFloat(selectedInvoice.total || 0) - (paidByInvoice.get(selectedInvoice.id) || 0), 0)}
          patientName={getPatientById(selectedInvoice.patient_id)?.name || `Patient #${selectedInvoice.patient_id}`}
          onClose={() => setShowAddPayment(false)}
          onPaymentAdded={handlePaymentAdded}
        />
      )}

      {/* CREATE INVOICE MODAL — staged builder, atomic commit */}
      {showAddInvoice && (
        <div className="dc-overlay no-print" onClick={() => setShowAddInvoice(false)}>
          <div className="dc-modal dc-modal--wide bills-create-modal" onClick={e => e.stopPropagation()}>
            <div className="bills-create-head">
              <div>
                <h3 className="bills-create-title">Create Invoice</h3>
                <p className="bills-create-sub">Build the invoice and its line items, then create it in one step.</p>
              </div>
              <button className="dc-modal-close" onClick={() => setShowAddInvoice(false)} aria-label="Close">×</button>
            </div>

            <div className="bills-create-body">
              {/* PATIENT & VISIT */}
              <div className="inv-mgmt-section">
                <div className="inv-mgmt-section-title">Patient &amp; Visit</div>
                <div className="bills-create-grid">
                  <div className="bills-create-patient" ref={dropdownRef}>
                    <span>Patient *</span>
                    <div className="bills-search-input-wrap">
                      <span className="bills-input-icon"><Icon d={I.search} size={14} /></span>
                      <input
                        className="bills-modal-input bills-input-has-icon"
                        type="text"
                        value={addInvoicePatientSearch}
                        onChange={handlePatientSearchChange}
                        onFocus={() => addInvoicePatientSearch && setPatientDropdownVisible(true)}
                        placeholder="Search patient by name..."
                      />
                      {patientDropdownVisible && filteredPatients.length > 0 && (
                        <ul className="bills-patient-dropdown">
                          {filteredPatients.map(p => (
                            <li key={p.id} onClick={() => handleSelectPatient(p)}>{p.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <label className="dc-field">
                    <span>Link Appointment</span>
                    <select value={addInvoiceApptId} onChange={e => handleSelectAppt(e.target.value)} disabled={!addInvoicePatientId}>
                      <option value="">{addInvoicePatientId ? '— None —' : 'Select a patient first'}</option>
                      {patientAppointments.map(a => (
                        <option key={a.id} value={a.id}>
                          {new Date(a.appointment_time).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' })} · {a.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="dc-field">
                    <span>Attending Dentist</span>
                    <select value={addInvoiceDentistId} onChange={e => setAddInvoiceDentistId(e.target.value)}>
                      <option value="">— None —</option>
                      {dentists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>

                  <label className="dc-field">
                    <span>Invoice Date</span>
                    <input type="date" value={addInvoiceDate} onChange={e => setAddInvoiceDate(e.target.value)} />
                  </label>
                </div>
              </div>

              {/* LINE ITEMS — shared builder (staged mode) */}
              <InvoiceLineItems
                items={addLineItems}
                procedures={procedures}
                onAddItem={addStagedItem}
                onDeleteItem={removeStagedItem}
                fmt={fmt}
                currencySymbol={currencySymbol}
              />

              {/* DETAILS */}
              <div className="inv-mgmt-section">
                <div className="inv-mgmt-section-title">Invoice Details</div>
                <div className="bills-create-grid">
                  <label className="dc-field">
                    <span>Discount ({currencySymbol})</span>
                    <input type="number" min="0" step="0.01" value={addInvoiceDiscount}
                      onChange={e => setAddInvoiceDiscount(e.target.value)} onFocus={e => e.target.select()} placeholder="0.00" />
                  </label>
                  <label className="dc-field">
                    <span>Due Date</span>
                    <input type="date" value={addInvoiceDue} onChange={e => setAddInvoiceDue(e.target.value)} />
                  </label>
                  <label className="dc-field dc-field--wide">
                    <span>Notes</span>
                    <textarea rows={2} value={addInvoiceNotes} onChange={e => setAddInvoiceNotes(e.target.value)}
                      placeholder="Optional notes for this invoice..." />
                  </label>
                </div>
              </div>

              {/* TOTALS */}
              <div className="inv-totals-block">
                <div className="inv-totals-row"><span>Subtotal</span><span>{fmt(addSubtotal)}</span></div>
                {addDiscountAmt > 0 && (
                  <div className="inv-totals-row inv-totals-discount"><span>Discount</span><span>- {fmt(addDiscountAmt)}</span></div>
                )}
                <hr className="inv-totals-hr" />
                <div className="inv-totals-row inv-totals-balance"><span>Total</span><span>{fmt(addTotal)}</span></div>
              </div>
            </div>

            <div className="bills-create-footer">
              <button className="dc-btn dc-btn--ghost" onClick={() => setShowAddInvoice(false)}>Cancel</button>
              <button className="dc-btn dc-btn--ghost bills-create-pay" onClick={() => handleCreateInvoice(true)} disabled={invoiceLoading || !addInvoicePatientId}>
                <Icon d={I.wallet} size={15} /> Create &amp; Record Payment
              </button>
              <button className="dc-btn dc-btn--primary" onClick={() => handleCreateInvoice(false)} disabled={invoiceLoading || !addInvoicePatientId}>
                {invoiceLoading ? <span className="bills-spinner-small" /> : <><Icon d={I.check} size={16} /> Create Invoice</>}
              </button>
            </div>
          </div>
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
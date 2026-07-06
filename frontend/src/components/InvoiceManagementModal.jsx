import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import InvoiceLineItems from './billing/InvoiceLineItems';
import { DISCOUNT_TYPES, computeInvoiceTotals } from './billing/discount';

const swalConfig = {
  confirmButtonColor: "#0f2340",
  cancelButtonColor: "#64748b",
};

const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) =>
      p.startsWith("M") || p.startsWith("m") ? <path key={i} d={p} /> : <polyline key={i} points={p} />
    )}
  </svg>
);

const I = {
  x:        ["M18 6L6 18", "M6 6l12 12"],
  trash:    ["M3 6h18", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6", "M9 6V4h6v2"],
  plus:     ["M12 5v14", "M5 12h14"],
  check:    ["M20 6L9 17l-5-5"],
  print:    ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  wallet:   ["M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3", "M3 10h18", "M16 14h.01"],
  search:   ["M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"],
  edit:     ["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"],
  refresh:  ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10", "M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
  lock:     ["M5 11h14v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z", "M8 11V7a4 4 0 0 1 8 0v4"],
};

function InvoiceManagementModal({
  invoice,
  clinicId,
  currencySymbol,
  currencyLocale,
  refreshTrigger,  // ADD THIS
  onClose,
  onInvoiceUpdated,
  onRecordPayment,
  onPrintSOA,
  patients,
  dentists,
  vatRegistered = false,
  vatRate = 12,
}) {
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);

  // Line item add state (the add form UI lives in <InvoiceLineItems>)
  const [addingItem, setAddingItem] = useState(false);

  // Invoice meta edit state
  const [discountType, setDiscountType] = useState(
    invoice.discount_type || (parseFloat(invoice.discount || 0) > 0 ? 'amount' : 'none')
  );
  const [discountValue, setDiscountValue] = useState(''); // seeded when Edit opens
  const [scPwdIdEdit, setScPwdIdEdit] = useState(invoice.sc_pwd_id || '');
  const [discountEdit, setDiscountEdit] = useState(false);
  const [refundFor, setRefundFor] = useState(null);   // payment being refunded
  const [refundAmount, setRefundAmount] = useState(''); // ₱, editable (partial refunds)
  const [dueDate, setDueDate] = useState(invoice.due_date || '');
  const [notes, setNotes] = useState(invoice.notes || '');
  const [savingMeta, setSavingMeta] = useState(false);

  const patient = patients.find(p => p.id === invoice.patient_id);
  const dentist = dentists?.find(d => d.id === invoice.dentist_id);
  const isFinalized = !!invoice.finalized_at;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [invoice.id]);

  useEffect(() => {
    if (refreshTrigger > 0) fetchData();
    // eslint-disable-next-line
  }, [refreshTrigger]);

  // Lock background scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [itemsRes, paymentsRes, procsRes] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('id'),
      supabase.from('payments').select('*').eq('invoice_id', invoice.id).order('id'),
      supabase.from('procedures').select('*').eq('clinic_id', clinicId).order('name'),
    ]);
    setItems(itemsRes.data || []);
    setPayments(paymentsRes.data || []);
    setProcedures(procsRes.data || []);
    setLoading(false);
  };

  // Computed values. While editing, the discount is derived live from the
  // type + value; otherwise we show the stored invoice.discount.
  const subtotal = items.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const discLabelFor = (t) => t === 'senior' ? 'Senior Citizen 20%' : t === 'pwd' ? 'PWD 20%'
    : t === 'percent' ? 'Discount' : t === 'amount' ? 'Discount' : '';
  // While editing → live preview via the shared engine (per-line eligibility +
  // additive VAT). Not editing → read the DB-authoritative stored snapshot.
  const mgmtTotals = discountEdit
    ? computeInvoiceTotals({ items, discountType, customValue: parseFloat(discountValue) || 0, vatRegistered, vatRate })
    : {
        subtotal: invoice.subtotal != null ? parseFloat(invoice.subtotal) : subtotal,
        discount: parseFloat(invoice.discount || 0),
        discountLabel: discLabelFor(invoice.discount_type),
        isScPwd: invoice.discount_type === 'senior' || invoice.discount_type === 'pwd',
        vat: parseFloat(invoice.tax_amount || 0),
        vatRate,
        total: parseFloat(invoice.total || 0),
        nonEligibleBase: 0,
      };
  const discountAmt = mgmtTotals.discount;
  const total = mgmtTotals.total;
  const isScPwd = mgmtTotals.isScPwd;
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balanceDue = Math.max(total - totalPaid, 0);

  // Seed the custom value so an unchanged save preserves the amount.
  const openDiscountEdit = () => {
    const d = parseFloat(invoice.discount || 0);
    if (discountType === 'amount' || (!invoice.discount_type && d > 0)) {
      setDiscountValue(d ? String(d) : '');
    } else if (discountType === 'percent' && subtotal > 0) {
      setDiscountValue(String(Math.round((d / subtotal) * 10000) / 100));
    } else {
      setDiscountValue('');
    }
    setScPwdIdEdit(invoice.sc_pwd_id || '');
    setDiscountEdit(true);
  };

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;

  // Add line item — persisted mode: write to the DB immediately, then refetch
  // so the DB-computed totals are reflected. The add form itself lives in
  // <InvoiceLineItems>, which validates and hands us the finished item.
  const handleAddItem = async (item) => {
    setAddingItem(true);
    const { error } = await supabase.from('invoice_items').insert([{
      invoice_id: invoice.id,
      clinic_id: clinicId,
      procedure_id: item.procedure_id || null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sc_pwd_eligible: item.sc_pwd_eligible !== false,
    }]);

    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
    }
    setAddingItem(false);
  };

  // Re-apply catalog eligibility — refresh every procedure-linked line against
  // the CURRENT Procedures settings, then the DB triggers recompute. Guarded to
  // unpaid invoices (a draft) so finalized/paid records stay immutable.
  const handleReapplyEligibility = async () => {
    if (payments.length > 0) return;
    const procMap = new Map((procedures || []).map(p => [p.id, p.sc_pwd_eligible !== false]));
    const stale = items.filter(it =>
      it.procedure_id != null && procMap.has(it.procedure_id) &&
      (it.sc_pwd_eligible !== false) !== procMap.get(it.procedure_id)
    );
    if (stale.length === 0) {
      Swal.fire({ ...swalConfig, icon: 'info', title: 'Already in sync', text: 'All catalog-linked items match the current Procedures settings.', timer: 2000, showConfirmButton: false });
      return;
    }
    const { isConfirmed } = await Swal.fire({
      ...swalConfig,
      title: 'Re-apply catalog eligibility?',
      html: `<b>${stale.length}</b> line item${stale.length === 1 ? '' : 's'} will be updated to match current Procedures settings, and the Senior/PWD discount will recompute.`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, re-apply',
    });
    if (!isConfirmed) return;
    for (const it of stale) {
      await supabase.from('invoice_items').update({ sc_pwd_eligible: procMap.get(it.procedure_id) }).eq('id', it.id);
    }
    await fetchData();
    onInvoiceUpdated && onInvoiceUpdated();
    Swal.fire({ ...swalConfig, icon: 'success', title: 'Eligibility updated', timer: 1400, showConfirmButton: false });
  };

  // Finalize (lock) the invoice. The Senior/PWD ID is captured with the invoice
  // (Create form / Details → Edit), so this is a simple confirm.
  const handleFinalize = async () => {
    if (totalPaid > 0.005) return; // partially-paid invoices lock only via full payment
    let msg = 'Once finalized, this invoice is <b>locked</b> — its line items and amounts can no longer be changed. Make sure discounts and items are correct first. A finalized invoice can only be reopened while it has <b>no net payments</b>.';
    if (isScPwd && !invoice.sc_pwd_id) {
      msg += '<br><br><b>No Senior/PWD ID recorded.</b> You can add it via <b>Edit</b> first (recommended for BIR), or finalize anyway.';
    }
    const res = await Swal.fire({
      ...swalConfig, title: 'Finalize invoice?', html: msg, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Finalize & lock',
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from('invoices')
      .update({ finalized_at: new Date().toISOString() })
      .eq('id', invoice.id);
    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed to finalize', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
      Swal.fire({ ...swalConfig, icon: 'success', title: 'Invoice finalized & locked', timer: 1500, showConfirmButton: false });
    }
  };

  // Reopen (unlock) a finalized invoice — only allowed while it has no payments
  // (a premature manual lock on a draft is recoverable; paid invoices are not).
  const handleReopen = async () => {
    if (totalPaid > 0.005) return;
    const res = await Swal.fire({
      ...swalConfig, title: 'Reopen this invoice?',
      html: 'This <b>unlocks</b> the invoice so items and amounts can be edited again. Possible only because it has no net payments (unpaid, or all payments reversed).',
      icon: 'question', showCancelButton: true, confirmButtonText: 'Reopen',
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from('invoices').update({ finalized_at: null }).eq('id', invoice.id);
    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Cannot reopen', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
      Swal.fire({ ...swalConfig, icon: 'success', title: 'Invoice reopened', timer: 1300, showConfirmButton: false });
    }
  };

  // Reverse / refund a payment — opens the amount modal (default = full amount;
  // reduce it for a partial refund, e.g. an overpayment).
  const handleReversePayment = (p) => {
    const amt = parseFloat(p.amount || 0);
    if (amt <= 0 || p.reversed_at) return;
    setRefundFor(p);
    setRefundAmount(String(amt));
  };

  // Records an OFFSETTING negative entry (the original stays for audit). A FULL
  // refund also marks the original reversed_at; a partial one leaves it open.
  // Net paid drops, so a fully-reversed invoice becomes reopenable/editable.
  const confirmRefund = async () => {
    const p = refundFor;
    if (!p) return;
    const payAmt = parseFloat(p.amount || 0);
    const maxRefund = Math.min(payAmt, totalPaid);
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0 || amt > maxRefund + 0.005) {
      Swal.fire({ ...swalConfig, icon: 'warning', title: 'Invalid amount', text: `Enter an amount between ${fmt(0)} and ${fmt(maxRefund)} (net collected).`, timer: 2600, showConfirmButton: false });
      return;
    }
    const isFull = amt >= payAmt - 0.005;
    const { error: e1 } = await supabase.from('payments').insert([{
      patient_id: p.patient_id || invoice.patient_id,
      invoice_id: invoice.id,
      clinic_id: clinicId,
      amount: -amt,
      method: 'Reversal',
      payment_date: new Date().toISOString(),
      notes: `${isFull ? 'Reversal' : 'Partial refund'} of ${p.method} payment${p.or_number ? ' OR ' + p.or_number : ''} (${fmt(amt)}${isFull ? '' : ' of ' + fmt(payAmt)})`,
    }]);
    if (e1) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed to refund', text: e1.message });
      return;
    }
    if (isFull) {
      await supabase.from('payments').update({ reversed_at: new Date().toISOString() }).eq('id', p.id);
    }
    setRefundFor(null);
    setRefundAmount('');
    await fetchData();
    onInvoiceUpdated && onInvoiceUpdated();
    Swal.fire({ ...swalConfig, icon: 'success', title: isFull ? 'Payment reversed' : 'Partial refund recorded', timer: 1400, showConfirmButton: false });
  };

  // Toggle a line's SC/PWD eligibility — the DB trigger recomputes discount+VAT.
  const handleToggleEligible = async (item) => {
    const { error } = await supabase.from('invoice_items')
      .update({ sc_pwd_eligible: item.sc_pwd_eligible === false })
      .eq('id', item.id);
    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
    }
  };

  // Delete line item
  const handleDeleteItem = async (itemId) => {
    const { isConfirmed } = await Swal.fire({
      ...swalConfig,
      title: 'Remove this item?',
      text: 'This will recompute the invoice total.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, remove it',
    });
    if (!isConfirmed) return;

    const { error } = await supabase.from('invoice_items').delete().eq('id', itemId);
    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
    }
  };

  // Save invoice meta (discount, due_date, notes)
  const handleSaveMeta = async () => {
    setSavingMeta(true);
    const isScPwdSave = discountType === 'senior' || discountType === 'pwd';
    const { error } = await supabase.from('invoices').update({
      discount: discountAmt,
      discount_type: discountType === 'none' ? null : discountType,
      sc_pwd_id: isScPwdSave ? (scPwdIdEdit.trim() || null) : null,
      due_date: dueDate || null,
      notes: notes || null,
    }).eq('id', invoice.id);

    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed to save', text: error.message });
    } else {
      setDiscountEdit(false);
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
      Swal.fire({ ...swalConfig, icon: 'success', title: 'Saved!', timer: 1200, showConfirmButton: false });
    }
    setSavingMeta(false);
  };

  return (
    <>
    <div className="bills-modal-overlay" onClick={onClose}>
      <div className="inv-mgmt-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="inv-mgmt-header">
          <div>
            <div className="inv-mgmt-title">
              Invoice <span className="inv-mgmt-id">{invoice.invoice_number || `#${invoice.id}`}</span>
              {isFinalized && <span className="inv-locked-badge"><Icon d={I.lock} size={11} /> Finalized</span>}
            </div>
            <div className="inv-mgmt-sub">
              <span className="inv-mgmt-patient">{patient?.name || `Patient #${invoice.patient_id}`}</span>
              {dentist && <span className="inv-mgmt-dentist"> · Dr. {dentist.name}</span>}
              <span className="inv-mgmt-date"> · {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
            </div>
          </div>
          <div className="inv-mgmt-header-actions">
            <button className="inv-mgmt-btn-print" onClick={onPrintSOA}>
              <Icon d={I.print} size={13} /> Print SOA
            </button>
            {!isFinalized && items.length > 0 && totalPaid <= 0.005 && (
              <button className="inv-mgmt-btn-print" onClick={handleFinalize} title="Lock this invoice as a final record">
                <Icon d={I.lock} size={13} /> Finalize
              </button>
            )}
            {isFinalized && totalPaid <= 0.005 && (
              <button className="inv-mgmt-btn-print" onClick={handleReopen} title="Unlock this draft (no net payments)">
                <Icon d={I.refresh} size={13} /> Reopen
              </button>
            )}
            <button className="inv-mgmt-btn-pay" onClick={onRecordPayment} disabled={balanceDue <= 0}>
              <Icon d={I.wallet} size={13} /> Record Payment
            </button>
            <button className="inv-mgmt-close-btn" onClick={onClose}>
              <Icon d={I.x} size={16} />
            </button>
          </div>
        </div>

        <div className="inv-mgmt-body">
          {loading ? (
            <div className="inv-mgmt-loading"><span className="bills-spinner" /> Loading invoice data...</div>
          ) : (
            <>
              {/* LINE ITEMS — shared builder (persisted mode) */}
              {isFinalized && (
                <div className="inv-lock-banner">
                  <Icon d={I.lock} size={14} />
                  <span>
                    This invoice was finalized on {new Date(invoice.finalized_at).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' })} and is locked — line items and amounts can no longer be changed.
                    {totalPaid <= 0.005 ? ' Since it has no net payment, you can Reopen it to edit.' : ''}
                  </span>
                </div>
              )}
              <InvoiceLineItems
                items={items}
                procedures={procedures}
                readOnly={isFinalized}
                onAddItem={handleAddItem}
                onDeleteItem={(item) => handleDeleteItem(item.id)}
                onToggleEligible={handleToggleEligible}
                headerAction={!isFinalized && totalPaid <= 0.005 && items.some(it => it.procedure_id != null) ? (
                  <button type="button" className="inv-add-btn" onClick={handleReapplyEligibility}
                    title="Update all catalog-linked lines to match current Procedures eligibility settings">
                    <Icon d={I.refresh} size={12} /> Re-apply eligibility
                  </button>
                ) : null}
                fmt={fmt}
                currencySymbol={currencySymbol}
                busy={addingItem}
              />

              {/* INVOICE META */}
              <div className="inv-mgmt-section inv-mgmt-meta-section">
                <div className="inv-mgmt-section-title">
                  Invoice Details
                  {!discountEdit && !isFinalized && (
                    <button className="inv-edit-meta-btn" onClick={openDiscountEdit}>
                      <Icon d={I.edit} size={12} /> Edit
                    </button>
                  )}
                </div>

                {discountEdit ? (
                  <div className="inv-meta-edit-form">
                    <div className="inv-meta-row">
                      <label>Discount Type</label>
                      <select className="inv-input" value={discountType} onChange={e => setDiscountType(e.target.value)}>
                        {DISCOUNT_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    {(discountType === 'percent' || discountType === 'amount') && (
                      <div className="inv-meta-row">
                        <label>{discountType === 'percent' ? 'Percent (%)' : `Amount (${currencySymbol})`}</label>
                        <input className="inv-input inv-input-sm" type="number" min="0" step="0.01"
                          value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                          onFocus={e => e.target.select()} placeholder={discountType === 'percent' ? '0' : '0.00'} />
                      </div>
                    )}
                    {(discountType === 'senior' || discountType === 'pwd') && (
                      <>
                        <div className="inv-meta-row">
                          <label>Computed</label>
                          <span className="inv-line-total">{fmt(discountAmt)}{vatRegistered ? ' (VAT-exempt + 20%)' : ' (20%)'}</span>
                        </div>
                        <div className="inv-meta-row">
                          <label>Senior/PWD ID</label>
                          <input className="inv-input" value={scPwdIdEdit} onChange={e => setScPwdIdEdit(e.target.value)} placeholder="OSCA / PWD ID No." />
                        </div>
                      </>
                    )}
                    <div className="inv-meta-row">
                      <label>Due Date</label>
                      <input className="inv-input" type="date"
                        value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                    <div className="inv-meta-row">
                      <label>Notes</label>
                      <textarea className="inv-input inv-textarea"
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Optional notes for this invoice..." rows={2} />
                    </div>
                    <div className="inv-add-actions">
                      <button className="inv-btn-ghost" onClick={() => { setDiscountEdit(false); setDiscountType(invoice.discount_type || (parseFloat(invoice.discount || 0) > 0 ? 'amount' : 'none')); setScPwdIdEdit(invoice.sc_pwd_id || ''); setDueDate(invoice.due_date || ''); setNotes(invoice.notes || ''); }}>Cancel</button>
                      <button className="inv-btn-confirm" onClick={handleSaveMeta} disabled={savingMeta}>
                        {savingMeta ? <span className="bills-spinner-small" /> : <><Icon d={I.check} size={12} /> Save</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inv-meta-display">
                    {discountAmt > 0 && (
                      <div className="inv-meta-row-display">
                        <span>Discount</span>
                        <span>{fmt(discountAmt)}{mgmtTotals.discountLabel ? ` · ${mgmtTotals.discountLabel}` : ''}</span>
                      </div>
                    )}
                    <div className="inv-meta-row-display">
                      <span>Due Date</span>
                      <span>{dueDate ? new Date(dueDate).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
                    </div>
                    {invoice.sc_pwd_id && (
                      <div className="inv-meta-row-display">
                        <span>Senior/PWD ID</span>
                        <span>{invoice.sc_pwd_id}</span>
                      </div>
                    )}
                    {notes && (
                      <div className="inv-meta-row-display">
                        <span>Notes</span>
                        <span>{notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PAYMENT HISTORY */}
              {payments.length > 0 && (
                <div className="inv-mgmt-section">
                  <div className="inv-mgmt-section-title">Payment History</div>
                  <table className="inv-items-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>OR #</th>
                        <th>Method</th>
                        <th>Ref #</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => {
                        const amt = parseFloat(p.amount || 0);
                        const isReversal = amt < 0;
                        return (
                        <tr key={p.id}>
                          <td>{p.payment_date ? new Date(p.payment_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                          <td><code className="inv-or-num">{p.or_number || '—'}</code></td>
                          <td><span className="bills-method-tag">{p.method}</span></td>
                          <td><code className="bills-ref-num">{p.reference_number || '—'}</code></td>
                          <td style={{ textAlign: 'right' }} className="inv-item-total">
                            {isReversal
                              ? <span style={{ color: 'var(--dc-danger, #dc2626)' }}>({fmt(-amt)})</span>
                              : fmt(amt)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {amt > 0 && !p.reversed_at && (
                              <button type="button" className="inv-delete-btn" onClick={() => handleReversePayment(p)} title="Reverse / refund this payment">
                                <Icon d={I.refresh} size={13} />
                              </button>
                            )}
                            {p.reversed_at && <span className="inv-reversed-tag">Reversed</span>}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TOTALS SUMMARY */}
              <div className="inv-totals-block">
                <div className="inv-totals-row">
                  <span>Subtotal</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="inv-totals-row inv-totals-discount">
                    <span>Discount{mgmtTotals.discountLabel ? ` (${mgmtTotals.discountLabel})` : ''}</span>
                    <span>- {fmt(discountAmt)}</span>
                  </div>
                )}
                {vatRegistered && isScPwd && (
                  <div className="inv-totals-row"><span>VAT-Exempt{mgmtTotals.vat > 0 ? ' (eligible items)' : ' Sale'}</span><span>—</span></div>
                )}
                {mgmtTotals.vat > 0 && (
                  <div className="inv-totals-row"><span>VAT ({mgmtTotals.vatRate}%)</span><span>+ {fmt(mgmtTotals.vat)}</span></div>
                )}
                <div className="inv-totals-row inv-totals-total">
                  <span>Total</span>
                  <span>{fmt(total)}</span>
                </div>
                <div className="inv-totals-row inv-totals-paid">
                  <span>Total Paid</span>
                  <span style={{ color: 'var(--dc-success, #16a34a)' }}>- {fmt(totalPaid)}</span>
                </div>
                <hr className="inv-totals-hr" />
                <div className="inv-totals-row inv-totals-balance">
                  <span>Balance Due</span>
                  <span style={{ color: balanceDue > 0 ? 'var(--dc-danger, #dc2626)' : 'var(--dc-success, #16a34a)' }}>{fmt(balanceDue)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {refundFor && (
      <div className="dc-overlay" onClick={() => setRefundFor(null)}>
        <div className="dc-modal dc-modal--sm" onClick={e => e.stopPropagation()}>
          <h3 className="dc-modal-title">Reverse / refund payment</h3>
          <p style={{ margin: '0 0 14px' }}>
            Payment: <b>{fmt(refundFor.amount)}</b> · {refundFor.method}{refundFor.or_number ? ` · OR ${refundFor.or_number}` : ''}
          </p>
          <label className="dc-field">
            <span>Refund amount ({currencySymbol})</span>
            <input type="number" min="0" step="0.01" value={refundAmount}
              onChange={e => setRefundAmount(e.target.value)} onFocus={e => e.target.select()} autoFocus />
          </label>
          <p style={{ fontSize: '0.78rem', color: 'var(--dc-text-3)', marginTop: 8, lineHeight: 1.5 }}>
            Max <b>{fmt(Math.min(parseFloat(refundFor.amount || 0), totalPaid))}</b> (net collected). A full refund marks the payment reversed; a partial refund (e.g. an overpayment) just reduces the paid amount.
          </p>
          <div className="dc-modal-actions">
            <button className="dc-btn dc-btn--ghost" onClick={() => setRefundFor(null)}>Cancel</button>
            <button className="dc-btn dc-btn--danger-solid" onClick={confirmRefund}>Record refund</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default InvoiceManagementModal;
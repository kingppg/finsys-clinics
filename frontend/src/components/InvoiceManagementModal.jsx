import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import InvoiceLineItems from './billing/InvoiceLineItems';

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
}) {
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);

  // Line item add state (the add form UI lives in <InvoiceLineItems>)
  const [addingItem, setAddingItem] = useState(false);

  // Invoice meta edit state
  const [discount, setDiscount] = useState(invoice.discount || 0);
  const [discountEdit, setDiscountEdit] = useState(false);
  const [dueDate, setDueDate] = useState(invoice.due_date || '');
  const [notes, setNotes] = useState(invoice.notes || '');
  const [savingMeta, setSavingMeta] = useState(false);

  const patient = patients.find(p => p.id === invoice.patient_id);
  const dentist = dentists?.find(d => d.id === invoice.dentist_id);

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

  // Computed values
  const subtotal = items.reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const discountAmt = parseFloat(discount || 0);
  const total = Math.max(subtotal - discountAmt, 0);
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balanceDue = Math.max(total - totalPaid, 0);

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
    }]);

    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed', text: error.message });
    } else {
      await fetchData();
      onInvoiceUpdated && onInvoiceUpdated();
    }
    setAddingItem(false);
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
    const { error } = await supabase.from('invoices').update({
      discount: parseFloat(discount) || 0,
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
    <div className="bills-modal-overlay" onClick={onClose}>
      <div className="inv-mgmt-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="inv-mgmt-header">
          <div>
            <div className="inv-mgmt-title">
              Invoice <span className="inv-mgmt-id">#{invoice.id}</span>
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
              <InvoiceLineItems
                items={items}
                procedures={procedures}
                onAddItem={handleAddItem}
                onDeleteItem={(item) => handleDeleteItem(item.id)}
                fmt={fmt}
                currencySymbol={currencySymbol}
                busy={addingItem}
              />

              {/* INVOICE META */}
              <div className="inv-mgmt-section inv-mgmt-meta-section">
                <div className="inv-mgmt-section-title">
                  Invoice Details
                  {!discountEdit && (
                    <button className="inv-edit-meta-btn" onClick={() => setDiscountEdit(true)}>
                      <Icon d={I.edit} size={12} /> Edit
                    </button>
                  )}
                </div>

                {discountEdit ? (
                  <div className="inv-meta-edit-form">
                    <div className="inv-meta-row">
                      <label>Discount ({currencySymbol})</label>
                      <input className="inv-input inv-input-sm" type="number" min="0" step="0.01"
                        value={discount} onChange={e => setDiscount(e.target.value)}
                        onFocus={e => e.target.select()} />
                    </div>
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
                      <button className="inv-btn-ghost" onClick={() => { setDiscountEdit(false); setDiscount(invoice.discount || 0); setDueDate(invoice.due_date || ''); setNotes(invoice.notes || ''); }}>Cancel</button>
                      <button className="inv-btn-confirm" onClick={handleSaveMeta} disabled={savingMeta}>
                        {savingMeta ? <span className="bills-spinner-small" /> : <><Icon d={I.check} size={12} /> Save</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inv-meta-display">
                    <div className="inv-meta-row-display">
                      <span>Due Date</span>
                      <span>{dueDate ? new Date(dueDate).toLocaleDateString(currencyLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
                    </div>
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
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{p.payment_date ? new Date(p.payment_date).toLocaleDateString(currencyLocale, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                          <td><code className="inv-or-num">{p.or_number || '—'}</code></td>
                          <td><span className="bills-method-tag">{p.method}</span></td>
                          <td><code className="bills-ref-num">{p.reference_number || '—'}</code></td>
                          <td style={{ textAlign: 'right' }} className="inv-item-total">{fmt(p.amount)}</td>
                        </tr>
                      ))}
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
                    <span>Discount</span>
                    <span>- {fmt(discountAmt)}</span>
                  </div>
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
  );
}

export default InvoiceManagementModal;
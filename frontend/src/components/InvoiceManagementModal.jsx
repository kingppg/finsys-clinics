import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';

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

  // Line item add state
  const [addMode, setAddMode] = useState(null); // 'procedure' | 'custom'
  const [procSearch, setProcSearch] = useState('');
  const [procDropdownVisible, setProcDropdownVisible] = useState(false);
  const [filteredProcs, setFilteredProcs] = useState([]);
  const [selectedProc, setSelectedProc] = useState(null);
  const [itemQty, setItemQty] = useState(1);
  const [itemUnitPrice, setItemUnitPrice] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  // Invoice meta edit state
  const [discount, setDiscount] = useState(invoice.discount || 0);
  const [discountEdit, setDiscountEdit] = useState(false);
  const [dueDate, setDueDate] = useState(invoice.due_date || '');
  const [notes, setNotes] = useState(invoice.notes || '');
  const [savingMeta, setSavingMeta] = useState(false);

  const dropdownRef = useRef(null);

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

  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProcDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
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

  // Procedure search
  const handleProcSearch = (e) => {
    const val = e.target.value;
    setProcSearch(val);
    setSelectedProc(null);
    if (val.trim().length > 0) {
      setFilteredProcs(procedures.filter(p => p.name.toLowerCase().includes(val.toLowerCase())));
      setProcDropdownVisible(true);
    } else {
      setFilteredProcs([]);
      setProcDropdownVisible(false);
    }
    setItemUnitPrice('');
  };

  const handleSelectProc = (proc) => {
    setSelectedProc(proc);
    setProcSearch(proc.name);
    setItemUnitPrice(proc.price || '');
    setProcDropdownVisible(false);
    setFilteredProcs([]);
  };

  // Add line item
  const handleAddItem = async () => {
    const desc = addMode === 'procedure' ? (selectedProc?.name || procSearch) : itemDesc;
    const price = parseFloat(itemUnitPrice);
    const qty = parseFloat(itemQty);

    if (!desc || !desc.trim()) {
      Swal.fire({ ...swalConfig, icon: 'warning', title: 'Missing description', text: 'Please enter a description.', timer: 1800, showConfirmButton: false });
      return;
    }
    if (!price || price <= 0) {
      Swal.fire({ ...swalConfig, icon: 'warning', title: 'Invalid price', text: 'Please enter a valid unit price.', timer: 1800, showConfirmButton: false });
      return;
    }

    setAddingItem(true);
    const { error } = await supabase.from('invoice_items').insert([{
      invoice_id: invoice.id,
      clinic_id: clinicId,
      procedure_id: addMode === 'procedure' ? (selectedProc?.id || null) : null,
      description: desc.trim(),
      quantity: qty,
      unit_price: price,
    }]);

    if (error) {
      Swal.fire({ ...swalConfig, icon: 'error', title: 'Failed', text: error.message });
    } else {
      setAddMode(null);
      setProcSearch('');
      setSelectedProc(null);
      setItemQty(1);
      setItemUnitPrice('');
      setItemDesc('');
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
              {/* LINE ITEMS */}
              <div className="inv-mgmt-section">
                <div className="inv-mgmt-section-title">
                  Line Items
                  <div className="inv-mgmt-add-btns">
                    <button className="inv-add-btn" onClick={() => { setAddMode('procedure'); setItemDesc(''); setItemUnitPrice(''); setItemQty(1); setProcSearch(''); setSelectedProc(null); }}>
                      <Icon d={I.search} size={12} /> From Procedures
                    </button>
                    <button className="inv-add-btn inv-add-btn-custom" onClick={() => { setAddMode('custom'); setItemDesc(''); setItemUnitPrice(''); setItemQty(1); }}>
                      <Icon d={I.plus} size={12} /> Custom Item
                    </button>
                  </div>
                </div>

                {/* Add Item Form */}
                {addMode && (
                  <div className="inv-add-item-form">
                    {addMode === 'procedure' ? (
                      <div className="inv-add-row" ref={dropdownRef}>
                        <div className="inv-search-wrap">
                          <Icon d={I.search} size={13} />
                          <input
                            className="inv-input"
                            placeholder="Search procedure..."
                            value={procSearch}
                            onChange={handleProcSearch}
                            onFocus={() => procSearch && setProcDropdownVisible(true)}
                            autoFocus
                          />
                          {procDropdownVisible && filteredProcs.length > 0 && (
                            <ul className="inv-proc-dropdown">
                              {filteredProcs.map(p => (
                                <li key={p.id} onClick={() => handleSelectProc(p)}>
                                  <span>{p.name}</span>
                                  <span className="inv-proc-price">{fmt(p.price)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    ) : (
                      <input
                        className="inv-input"
                        placeholder="Item description..."
                        value={itemDesc}
                        onChange={e => setItemDesc(e.target.value)}
                        autoFocus
                      />
                    )}

                    <div className="inv-add-row inv-add-row-inline">
                      <label>Qty</label>
                      <input className="inv-input inv-input-sm" type="number" min="1" step="0.01"
                        value={itemQty} onChange={e => setItemQty(e.target.value)} />
                      <label>Unit Price</label>
                      <input className="inv-input inv-input-sm" type="number" min="0" step="0.01"
                        placeholder="0.00" value={itemUnitPrice}
                        onChange={e => setItemUnitPrice(e.target.value)}
                        onFocus={e => e.target.select()} />
                      <span className="inv-line-total">
                        = {fmt((parseFloat(itemQty) || 0) * (parseFloat(itemUnitPrice) || 0))}
                      </span>
                    </div>

                    <div className="inv-add-row inv-add-actions">
                      <button className="inv-btn-ghost" onClick={() => setAddMode(null)}>Cancel</button>
                      <button className="inv-btn-confirm" onClick={handleAddItem} disabled={addingItem}>
                        {addingItem ? <span className="bills-spinner-small" /> : <><Icon d={I.check} size={12} /> Add Item</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Items Table */}
                <table className="inv-items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th style={{ textAlign: 'center' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Unit Price</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={5} className="inv-no-items">No line items yet. Add a procedure or custom item above.</td></tr>
                    ) : (
                      items.map(item => (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                          <td style={{ textAlign: 'right' }} className="inv-item-total">{fmt(item.total)}</td>
                          <td>
                            <button className="inv-delete-btn" onClick={() => handleDeleteItem(item.id)}>
                              <Icon d={I.trash} size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

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
                  <span style={{ color: '#16a34a' }}>- {fmt(totalPaid)}</span>
                </div>
                <hr className="inv-totals-hr" />
                <div className="inv-totals-row inv-totals-balance">
                  <span>Balance Due</span>
                  <span style={{ color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>{fmt(balanceDue)}</span>
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
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';

// Payment methods offered by the clinic. GCash and Cash are the day-to-day
// channels; the reference field adapts its label to the selected method.
const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'e-wallet', label: 'E-Wallet (Other)' },
];

const REFERENCE_LABELS = {
  gcash: 'GCash Reference No.',
  bank: 'Bank Reference No.',
  card: 'Card Transaction Ref.',
  'e-wallet': 'Wallet Reference No.',
};

function AddPaymentForm({ invoice, clinicId, currencySymbol = '₱', currencyLocale = 'en-PH', onClose, onPaymentAdded }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [orNumber, setOrNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;
  const referenceLabel = REFERENCE_LABELS[method] || 'Reference # (optional)';

  const handleSubmit = async e => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      Swal.fire({ title: 'Invalid amount', text: 'Please enter a valid payment amount.', icon: 'warning' });
      return;
    }
    setLoading(true);

    const payment = {
      patient_id: invoice.patient_id,
      invoice_id: invoice.id,
      amount: numericAmount,
      method,
      or_number: orNumber.trim() || null,
      reference_number: referenceNumber.trim() || null,
      notes: notes.trim() || null,
      clinic_id: clinicId
    };

    const { data, error } = await supabase
      .from('payments')
      .insert([payment])
      .select()
      .single();

    setLoading(false);
    if (!error) {
      onPaymentAdded(data);
    } else {
      Swal.fire({ title: 'Payment failed', text: error.message, icon: 'error' });
    }
  };

  return (
    <div className="bills-modal-overlay no-print" onClick={onClose}>
      <form className="bills-modal-form" autoComplete="off" onSubmit={handleSubmit} onClick={e => e.stopPropagation()}>
        <div className="bills-modal-header">
          <h3>Record Payment</h3>
        </div>
        <p className="bills-modal-sub">
          Invoice #{invoice.id} · Total {fmt(invoice.total || 0)}
        </p>

        <div className="bills-modal-row">
          <label>Payment Method</label>
          <select
            className="bills-modal-input"
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            {METHOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="bills-modal-row">
          <label>Amount ({currencySymbol})</label>
          <input
            className="bills-modal-input"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onFocus={e => e.target.select()}
            required
            autoFocus
          />
        </div>

        <div className="bills-modal-row">
          <label>Official Receipt (OR) #</label>
          <input
            className="bills-modal-input"
            type="text"
            placeholder="e.g., OR-2026-0001 (optional)"
            value={orNumber}
            onChange={e => setOrNumber(e.target.value)}
          />
        </div>

        <div className="bills-modal-row">
          <label>{referenceLabel}</label>
          <input
            className="bills-modal-input"
            type="text"
            placeholder={method === 'gcash' ? 'e.g., 1234 567 890123' : 'Optional'}
            value={referenceNumber}
            onChange={e => setReferenceNumber(e.target.value)}
          />
        </div>

        <div className="bills-modal-row">
          <label>Notes</label>
          <textarea
            className="bills-modal-input"
            rows={2}
            placeholder="Optional notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="bills-modal-footer">
          <button type="button" className="bills-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="bills-btn-confirm" disabled={loading}>
            {loading ? <span className="bills-spinner-small" /> : 'Record Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddPaymentForm;

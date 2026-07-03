import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';

// POS-style payment entry: giant amount readout, on-screen numpad, big
// tender buttons. Optimized for fast, error-free front-desk use — the
// insert payload is unchanged (DB triggers own totals/status).

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'e-wallet', label: 'E-Wallet' },
];

const REFERENCE_LABELS = {
  gcash: 'GCash Ref No.',
  bank: 'Bank Ref No.',
  card: 'Card Txn Ref.',
  'e-wallet': 'Wallet Ref No.',
};

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function AddPaymentForm({
  invoice,
  clinicId,
  currencySymbol = '₱',
  currencyLocale = 'en-PH',
  balanceDue,
  patientName,
  onClose,
  onPaymentAdded,
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [orNumber, setOrNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;
  const referenceLabel = REFERENCE_LABELS[method] || 'Reference # (optional)';
  const methodLabel = (METHOD_OPTIONS.find(m => m.value === method) || METHOD_OPTIONS[0]).label;

  const amountNum = parseFloat(amount) || 0;
  const hasBalance = typeof balanceDue === 'number' && isFinite(balanceDue);
  const remaining = hasBalance ? Math.max(balanceDue - amountNum, 0) : null;
  const overpay = hasBalance && balanceDue > 0 && amountNum > balanceDue + 0.004;

  // Numpad key press — keeps the value a clean money string (max 2 decimals)
  const pressKey = (key) => {
    setAmount(prev => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const next = prev + key;
      const decimals = next.split('.')[1];
      if (decimals && decimals.length > 2) return prev;
      if (next.replace('.', '').length > 9) return prev;
      return next.replace(/^0+(?=\d)/, '');
    });
  };

  // Direct keyboard typing — sanitize to digits + one dot, 2 decimals
  const handleAmountChange = (e) => {
    let val = e.target.value.replace(/[^\d.]/g, '');
    const firstDot = val.indexOf('.');
    if (firstDot !== -1) {
      val = val.slice(0, firstDot + 1) + val.slice(firstDot + 1).replace(/\./g, '');
      const [whole, dec] = val.split('.');
      val = whole + '.' + (dec || '').slice(0, 2);
    }
    setAmount(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amountNum || amountNum <= 0) {
      Swal.fire({ title: 'Invalid amount', text: 'Please enter a valid payment amount.', icon: 'warning' });
      return;
    }
    setLoading(true);

    const payment = {
      patient_id: invoice.patient_id,
      invoice_id: invoice.id,
      amount: amountNum,
      method,
      or_number: orNumber.trim() || null,
      reference_number: referenceNumber.trim() || null,
      notes: notes.trim() || null,
      clinic_id: clinicId,
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
      <form className="pos-modal" autoComplete="off" onSubmit={handleSubmit} onClick={e => e.stopPropagation()}>

        {/* Header: who & what, with balance due as the anchor number */}
        <div className="pos-header">
          <div>
            <h3 className="pos-title">Record Payment</h3>
            <p className="pos-sub">
              Invoice #{invoice.id}{patientName ? ` · ${patientName}` : ''}
            </p>
          </div>
          {hasBalance && (
            <div className="pos-balance">
              <span className="pos-balance-label">Balance Due</span>
              <span className="pos-balance-value">{fmt(balanceDue)}</span>
            </div>
          )}
        </div>

        {/* Giant amount readout */}
        <div className="pos-amount-wrap">
          <span className="pos-amount-symbol">{currencySymbol}</span>
          <input
            className="pos-amount-input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={handleAmountChange}
            autoFocus
          />
        </div>
        <div className="pos-amount-meta">
          {overpay ? (
            <span className="pos-warn">Overpayment: {fmt(amountNum - balanceDue)} above balance</span>
          ) : remaining !== null ? (
            <span>Remaining after payment: <strong>{fmt(remaining)}</strong></span>
          ) : null}
        </div>

        {/* Quick tender */}
        <div className="pos-quick-row">
          {hasBalance && balanceDue > 0 && (
            <button type="button" className="pos-quick-btn" onClick={() => setAmount(balanceDue.toFixed(2))}>
              Exact · {fmt(balanceDue)}
            </button>
          )}
          <button type="button" className="pos-quick-btn pos-quick-clear" onClick={() => setAmount('')}>
            Clear
          </button>
        </div>

        {/* Numpad + payment method */}
        <div className="pos-grid">
          <div className="pos-numpad">
            {NUMPAD_KEYS.map(key => (
              <button type="button" key={key} className="pos-key" onClick={() => pressKey(key)}>
                {key}
              </button>
            ))}
          </div>
          <div className="pos-methods">
            {METHOD_OPTIONS.map(m => (
              <button
                type="button"
                key={m.value}
                className={`pos-method${method === m.value ? ' active' : ''}`}
                onClick={() => setMethod(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Compact detail fields */}
        <div className="pos-fields">
          <div className="pos-field">
            <label>Official Receipt (OR) #</label>
            <input
              className="bills-modal-input"
              type="text"
              placeholder="Optional"
              value={orNumber}
              onChange={e => setOrNumber(e.target.value)}
            />
          </div>
          <div className="pos-field">
            <label>{referenceLabel}</label>
            <input
              className="bills-modal-input"
              type="text"
              placeholder={method === 'gcash' ? 'e.g., 1234 567 890123' : 'Optional'}
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
            />
          </div>
          <div className="pos-field pos-field-full">
            <label>Notes</label>
            <input
              className="bills-modal-input"
              type="text"
              placeholder="Optional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Big confirm */}
        <div className="pos-footer">
          <button type="button" className="bills-btn-ghost pos-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pos-confirm" disabled={loading || amountNum <= 0}>
            {loading
              ? <span className="bills-spinner-small" />
              : amountNum > 0
                ? `Record ${fmt(amountNum)} · ${methodLabel}`
                : 'Record Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddPaymentForm;

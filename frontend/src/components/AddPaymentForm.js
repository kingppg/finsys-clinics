import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';

// POS-style payment entry: giant amount readout, on-screen numpad, big
// tender buttons. Optimized for fast, error-free front-desk use — the
// DB triggers still own totals/status.
//
// CASH is treated as a real tender: the input is "Cash Received"; we apply up
// to the balance and hand back the rest as Change Due, so a cash payment can
// never silently become a credit. Electronic methods record the amount as-is,
// and paying over balance is an intentional advance credit.

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
const DENOMS = [1000, 500, 200, 100, 50, 20];

// Local YYYY-MM-DD (not UTC) so the date picker matches the front desk's day.
const localDateStr = (d = new Date()) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

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
  const [paymentDate, setPaymentDate] = useState(localDateStr());
  const [loading, setLoading] = useState(false);

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;
  const fmt0 = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale)}`;
  const referenceLabel = REFERENCE_LABELS[method] || 'Reference # (optional)';
  const methodLabel = (METHOD_OPTIONS.find(m => m.value === method) || METHOD_OPTIONS[0]).label;

  const amountNum = parseFloat(amount) || 0;
  const hasBalance = typeof balanceDue === 'number' && isFinite(balanceDue);
  const isCash = method === 'cash';

  // Cash: input = cash received (tendered). Apply up to balance, rest is change.
  // Non-cash: input = amount recorded; over balance = intentional advance credit.
  const tendered = amountNum;
  const applied = isCash && hasBalance ? Math.min(tendered, balanceDue) : amountNum;
  const changeDue = isCash && hasBalance ? Math.max(tendered - balanceDue, 0) : 0;
  const recordedAmount = isCash ? applied : amountNum;
  const remaining = hasBalance ? Math.max(balanceDue - recordedAmount, 0) : null;
  const creditOver = !isCash && hasBalance && amountNum > balanceDue + 0.004;
  const today = localDateStr();
  const isBackdated = paymentDate && paymentDate < today;

  const amountLabel = isCash ? 'Cash Received' : 'Payment Amount';

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

  // Denomination chip — stack bills onto the cash received
  const addDenom = (d) => {
    setAmount(prev => ((parseFloat(prev) || 0) + d).toFixed(2));
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
    if (!recordedAmount || recordedAmount <= 0) {
      Swal.fire({ title: 'Invalid amount', text: 'Please enter a valid payment amount.', icon: 'warning' });
      return;
    }
    setLoading(true);

    // TIMESTAMPTZ column — send an ISO instant. Same-day keeps the real time;
    // a back-dated entry lands at local noon so it can't slip a day in the
    // period filters (which read payment_date).
    const paymentInstant = (!paymentDate || paymentDate === today)
      ? new Date().toISOString()
      : new Date(`${paymentDate}T12:00:00`).toISOString();

    const payment = {
      patient_id: invoice.patient_id,
      invoice_id: invoice.id,
      amount: recordedAmount,
      method,
      or_number: orNumber.trim() || null,
      reference_number: referenceNumber.trim() || null,
      notes: notes.trim() || null,
      payment_date: paymentInstant,
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
              {invoice.invoice_number || `#${invoice.id}`}{patientName ? ` · ${patientName}` : ''}
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
        <span className="pos-amount-label">{amountLabel}</span>
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
          {isCash ? (
            changeDue > 0.004 ? (
              <span className="pos-change">Applies {fmt(applied)} · Change Due <strong>{fmt(changeDue)}</strong></span>
            ) : remaining !== null && remaining > 0.004 ? (
              <span>Remaining after payment: <strong>{fmt(remaining)}</strong></span>
            ) : recordedAmount > 0 ? (
              <span className="pos-exact-note">Exact payment · no change</span>
            ) : null
          ) : creditOver ? (
            <span className="pos-credit">Records {fmt(amountNum - balanceDue)} as advance credit</span>
          ) : remaining !== null && remaining > 0.004 ? (
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

        {/* Cash denominations — stack bills onto the received total */}
        {isCash && (
          <div className="pos-denom-row">
            {DENOMS.map(d => (
              <button type="button" key={d} className="pos-denom-btn" onClick={() => addDenom(d)}>
                +{fmt0(d)}
              </button>
            ))}
          </div>
        )}

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
            <label>Payment Date{isBackdated ? ' · back-dated' : ''}</label>
            <input
              className={`bills-modal-input${isBackdated ? ' pos-input-backdated' : ''}`}
              type="date"
              max={today}
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </div>
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
          <button type="submit" className="pos-confirm" disabled={loading || recordedAmount <= 0}>
            {loading
              ? <span className="bills-spinner-small" />
              : recordedAmount > 0
                ? `Record ${fmt(recordedAmount)} · ${methodLabel}`
                : 'Record Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddPaymentForm;

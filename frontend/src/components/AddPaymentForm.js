import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function AddPaymentForm({ invoice, clinicId, onClose, onPaymentAdded }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);

    const payment = {
      patient_id: invoice.patient_id,
      invoice_id: invoice.id,
      amount,
      method,
      reference_number: referenceNumber,
      notes,
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
      alert('Error: ' + error.message);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff', padding: 24, borderRadius: 8,
          minWidth: 320, boxShadow: '0 2px 16px rgba(0,0,0,0.13)'
        }}
      >
        <h3>Add Payment for Invoice #{invoice.id}</h3>
        <div>
          <label>Amount:</label>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        </div>
        <div>
          <label>Method:</label>
          <select value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="e-wallet">E-Wallet</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
        <div>
          <label>Reference #:</label>
          <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label>Notes:</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={loading}>Add Payment</button>
          <button type="button" onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default AddPaymentForm;
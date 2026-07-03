// ====================================================================
// ENHANCED BILLING COMPONENT - Phase 1 MVP
// Manual GCash payment recording + Invoice management
// ====================================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext';
import Swal from 'sweetalert2';
import './BillsPaymentEnhanced.css';

const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) =>
      p.startsWith("M") || p.startsWith("m") ? <path key={i} d={p} /> : <polyline key={i} points={p} />
    )}
  </svg>
);

const I = {
  plus: ["M12 5v14", "M5 12h14"],
  check: ["M20 6L9 17l-5-5"],
  wallet: ["M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"],
  fileText: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"],
  search: ["M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v6", "M12 20h.01"],
};

function BillsPaymentEnhanced() {
  const { clinicId, clinicName, currencySymbol, currencyLocale } = useClinic();
  const [invoices, setInvoices] = useState([]);
  const [agingData, setAgingData] = useState(null);
  const [collectionsData, setCollectionsData] = useState(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'aging' | 'collections'

  const fmt = (n) => `${currencySymbol}${Number(n).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}`;

  // Load invoices and reports
  useEffect(() => {
    if (!clinicId) return;
    loadData();
  }, [clinicId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, agingRes, collectionsRes] = await Promise.all([
        fetch(`/api/billing/invoices?clinic_id=${clinicId}`).then(r => r.json()),
        fetch(`/api/billing/reports/aging?clinic_id=${clinicId}`).then(r => r.json()),
        fetch(`/api/billing/reports/collections?clinic_id=${clinicId}`).then(r => r.json()),
      ]);

      setInvoices(invRes || []);
      setAgingData(agingRes || {});
      setCollectionsData(collectionsRes || {});
    } catch (err) {
      console.error('Error loading data:', err);
      Swal.fire({ title: 'Error', text: 'Failed to load billing data', icon: 'error' });
    }
    setLoading(false);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const formData = new FormData(e.target);
    const paymentData = {
      invoice_id: selectedInvoice.id,
      clinic_id: clinicId,
      amount: parseFloat(formData.get('amount')),
      method: formData.get('method'),
      or_number: formData.get('or_number') || null,
      gcash_reference: formData.get('gcash_reference') || null,
      notes: formData.get('notes') || null,
    };

    try {
      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });

      if (!res.ok) throw new Error('Failed to record payment');

      Swal.fire({ title: 'Success', text: 'Payment recorded successfully', icon: 'success', timer: 1500 });
      setShowAddPayment(false);
      loadData();
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.message, icon: 'error' });
    }
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      'draft': 'badge-draft',
      'sent': 'badge-sent',
      'partial': 'badge-partial',
      'paid': 'badge-paid',
      'overdue': 'badge-overdue',
    };
    return classes[status] || 'badge-default';
  };

  const getOverdueStatus = (invoice) => {
    if (invoice.status === 'paid' || invoice.status === 'draft') return null;
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    if (dueDate < today) return 'overdue';
    return null;
  };

  if (loading) {
    return <div className="bills-loading"><span className="bills-spinner" /> Loading billing data...</div>;
  }

  return (
    <div className="bills-container">
      {/* HEADER */}
      <div className="bills-sticky-header">
        <div className="bills-header-row">
          <div className="bills-header-title">
            <h2>Bills & Payments</h2>
            <div className="bills-header-meta">
              <span className="bills-stat">{invoices.length} <em>invoices</em></span>
              <span className="bills-stat-divider">·</span>
              <span className="bills-stat">{collectionsData?.invoiceCount || 0} <em>tracked</em></span>
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="bills-tabs">
          <button
            className={`bills-tab ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoices')}
          >
            <Icon d={I.fileText} size={14} /> Invoices
          </button>
          <button
            className={`bills-tab ${activeTab === 'aging' ? 'active' : ''}`}
            onClick={() => setActiveTab('aging')}
          >
            <Icon d={I.alert} size={14} /> Aging Analysis
          </button>
          <button
            className={`bills-tab ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
          >
            <Icon d={I.wallet} size={14} /> Collections
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="bills-body">
        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <div className="bills-section-card">
            <div className="bills-section-header">
              <Icon d={I.fileText} size={16} />
              <h3 className="bills-section-title">Active Invoices</h3>
            </div>

            <table className="bills-table bills-invoices-table">
              <thead>
                <tr>
                  <th style={{ width: "80px" }}>ID</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "center", width: "120px" }}>Status</th>
                  <th style={{ textAlign: "right", width: "200px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="bills-no-data">No invoices yet</td>
                  </tr>
                ) : (
                  invoices.map(inv => {
                    const overdueStatus = getOverdueStatus(inv);
                    return (
                      <tr key={inv.id} className={overdueStatus === 'overdue' ? 'bills-row-overdue' : ''}>
                        <td className="bills-td-id">#{inv.invoice_number}</td>
                        <td>{inv.patient?.name || 'Unknown'}</td>
                        <td className="bills-td-date">
                          {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="bills-td-date">
                          {inv.due_date ? (
                            <span style={{ color: overdueStatus === 'overdue' ? '#dc2626' : 'inherit', fontWeight: overdueStatus ? 600 : 400 }}>
                              {new Date(inv.due_date).toLocaleDateString()}
                              {overdueStatus === 'overdue' && ' ⚠'}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: "right" }} className="bills-td-price">
                          {fmt(inv.total || 0)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`bills-status-badge bills-status--${inv.status}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="bills-table-btn"
                            onClick={() => { setSelectedInvoice(inv); setShowAddPayment(true); }}
                            disabled={inv.status === 'paid'}
                          >
                            <Icon d={I.wallet} size={12} /> Record Payment
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* AGING ANALYSIS TAB */}
        {activeTab === 'aging' && (
          <div className="bills-section-card">
            <div className="bills-section-header">
              <Icon d={I.alert} size={16} />
              <h3 className="bills-section-title">Aging Analysis</h3>
            </div>

            {agingData && (
              <div className="aging-buckets">
                <div className="aging-bucket current">
                  <div className="bucket-label">Current (Not Due)</div>
                  <div className="bucket-count">{agingData.current?.length || 0}</div>
                </div>
                <div className="aging-bucket bucket-1-30">
                  <div className="bucket-label">1-30 Days Overdue</div>
                  <div className="bucket-count">{agingData['1-30']?.length || 0}</div>
                </div>
                <div className="aging-bucket bucket-31-60">
                  <div className="bucket-label">31-60 Days</div>
                  <div className="bucket-count">{agingData['31-60']?.length || 0}</div>
                </div>
                <div className="aging-bucket bucket-61-90">
                  <div className="bucket-label">61-90 Days</div>
                  <div className="bucket-count">{agingData['61-90']?.length || 0}</div>
                </div>
                <div className="aging-bucket bucket-90plus">
                  <div className="bucket-label">90+ Days</div>
                  <div className="bucket-count">{agingData['90+']?.length || 0}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* COLLECTIONS TAB */}
        {activeTab === 'collections' && (
          <div className="bills-section-card">
            <div className="bills-section-header">
              <Icon d={I.wallet} size={16} />
              <h3 className="bills-section-title">Collections Metrics</h3>
            </div>

            {collectionsData && (
              <div className="collections-grid">
                <div className="collections-stat">
                  <div className="stat-label">Total Billed</div>
                  <div className="stat-value">{collectionsData.totalBilled}</div>
                </div>
                <div className="collections-stat">
                  <div className="stat-label">Total Collected</div>
                  <div className="stat-value" style={{ color: '#16a34a' }}>{collectionsData.totalCollected}</div>
                </div>
                <div className="collections-stat">
                  <div className="stat-label">Outstanding</div>
                  <div className="stat-value" style={{ color: '#dc2626' }}>{collectionsData.outstandingAmount}</div>
                </div>
                <div className="collections-stat highlight">
                  <div className="stat-label">Collections Rate</div>
                  <div className="stat-value">{collectionsData.collectionsRate}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showAddPayment && selectedInvoice && (
        <div className="bills-modal-overlay" onClick={() => setShowAddPayment(false)}>
          <form onSubmit={handleRecordPayment} className="bills-modal-form" onClick={e => e.stopPropagation()}>
            <div className="bills-modal-header">
              <h3>Record Payment</h3>
              <p className="bills-modal-sub">Invoice #{selectedInvoice.invoice_number}</p>
            </div>

            <div className="bills-modal-body">
              <div className="bills-modal-row">
                <label>Payment Method</label>
                <select name="method" required defaultValue="gcash">
                  <option value="gcash">GCash (Manual)</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div className="bills-modal-row">
                <label>Amount ({currencySymbol})</label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0"
                  max={selectedInvoice.total}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="bills-modal-row">
                <label>GCash Reference (if applicable)</label>
                <input
                  type="text"
                  name="gcash_reference"
                  placeholder="e.g., GC123456789"
                />
              </div>

              <div className="bills-modal-row">
                <label>Official Receipt (OR) #</label>
                <input
                  type="text"
                  name="or_number"
                  placeholder="e.g., OR-2026-001"
                />
              </div>

              <div className="bills-modal-row">
                <label>Notes</label>
                <textarea name="notes" rows={2} placeholder="Optional notes..." />
              </div>
            </div>

            <div className="bills-modal-footer">
              <button type="button" className="bills-btn-ghost" onClick={() => setShowAddPayment(false)}>
                Cancel
              </button>
              <button type="submit" className="bills-btn-confirm">
                <Icon d={I.check} /> Record Payment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default BillsPaymentEnhanced;

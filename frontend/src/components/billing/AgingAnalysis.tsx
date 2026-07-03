import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangleIcon, CheckCircleIcon } from './icons';
import { useDcTheme } from '../../themes/DcThemeProvider';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  BucketKey,
  computeAging,
  InvoiceLike,
  PaymentLike,
} from './billingAnalytics';
import './BillingAnalytics.css';

// ============================================================================
// AGING ANALYSIS — receivables aging on the ledger's own data (read-only).
// Numbers always agree with the invoice table and SOA: balance = total − paid.
// ============================================================================

interface PatientLike {
  id: number;
  name?: string | null;
}

interface AgingAnalysisProps {
  invoices: InvoiceLike[];
  payments: PaymentLike[];
  patients: PatientLike[];
  fmt: (n: number) => string;
  locale?: string;
}

const toneStyle = (color: string, soft: string): React.CSSProperties =>
  ({ '--tone': color, '--tone-soft': soft } as React.CSSProperties);

function softOf(hex: string): string {
  // Derive a translucent wash from a solid tone for chips/cards.
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 'rgba(148, 163, 184, 0.14)';
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, 0.14)`;
}

export function AgingAnalysis({ invoices, payments, patients, fmt, locale }: AgingAnalysisProps) {
  const { theme } = useDcTheme();
  const [selected, setSelected] = useState<BucketKey | 'all'>('all');

  const aging = useMemo(() => computeAging(invoices || [], payments || []), [invoices, payments]);

  const patientName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of patients || []) {
      if (p && p.id != null) map.set(Number(p.id), p.name || `Patient #${p.id}`);
    }
    return map;
  }, [patients]);

  const bucketColor = (key: BucketKey): string =>
    theme.agingScale[BUCKET_ORDER.indexOf(key)] || theme.tokens.accent;

  const visibleEntries =
    selected === 'all' ? aging.entries : aging.buckets[selected].entries;

  const fmtDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

  if (aging.totalCount === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dcb-card">
        <div className="dcb-empty">
          <CheckCircleIcon size={36} color={theme.tokens.success} />
          <div className="dcb-empty-title">All receivables settled</div>
          <div>No outstanding balances found — every invoice is fully paid.</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="dcb-stack"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Summary + buckets */}
      <div className="dcb-card">
        <div className="dcb-card-head">
          <AlertTriangleIcon size={16} color={theme.tokens.warning} />
          <h3 className="dcb-card-title">Receivables Aging</h3>
          <span className="dcb-card-sub">
            {fmt(aging.totalOutstanding)} outstanding · {aging.totalCount} invoices ·{' '}
            {aging.overdueCount} past due
          </span>
        </div>
        <div className="dcb-card-body">
          <div className="dcb-buckets">
            {BUCKET_ORDER.map((key, i) => {
              const bucket = aging.buckets[key];
              const color = bucketColor(key);
              const isSelected = selected === key;
              return (
                <motion.button
                  type="button"
                  key={key}
                  className={`dcb-bucket${isSelected ? ' selected' : ''}`}
                  style={toneStyle(color, softOf(color))}
                  onClick={() => setSelected(isSelected ? 'all' : key)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  title={isSelected ? 'Click to show all' : 'Click to filter the list below'}
                >
                  <div className="dcb-bucket-label">
                    {BUCKET_LABELS[key]}
                    {key !== 'current' ? ' overdue' : ''}
                  </div>
                  <div className="dcb-bucket-amount">{fmt(bucket.amount)}</div>
                  <div className="dcb-bucket-count">
                    {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Proportional distribution bar */}
          {aging.totalOutstanding > 0 && (
            <>
              <div className="dcb-stackbar">
                {BUCKET_ORDER.map((key) => {
                  const bucket = aging.buckets[key];
                  if (bucket.amount <= 0) return null;
                  const pct = (bucket.amount / aging.totalOutstanding) * 100;
                  return (
                    <div
                      key={key}
                      className="dcb-stackbar-seg"
                      style={{ width: `${pct}%`, background: bucketColor(key) }}
                      title={`${BUCKET_LABELS[key]}: ${fmt(bucket.amount)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
              <div className="dcb-legend">
                {BUCKET_ORDER.filter((key) => aging.buckets[key].amount > 0).map((key) => (
                  <span key={key} className="dcb-legend-item">
                    <span className="dcb-dot" style={{ background: bucketColor(key) }} />
                    {BUCKET_LABELS[key]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Outstanding invoices detail */}
      <div className="dcb-card">
        <div className="dcb-card-head">
          <h3 className="dcb-card-title">Outstanding Invoices</h3>
          <span className="dcb-card-sub">
            {selected === 'all' ? (
              `${visibleEntries.length} invoices with a balance`
            ) : (
              <>
                <span className="dcb-filter-note">
                  Filtered: {BUCKET_LABELS[selected]} ({visibleEntries.length}) ·{' '}
                </span>
                <button type="button" className="dcb-link-btn" onClick={() => setSelected('all')}>
                  Show all
                </button>
              </>
            )}
          </span>
        </div>
        <div className="dcb-table-scroll">
          <table className="bills-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Patient</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th style={{ textAlign: 'center' }}>Age</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const inv = entry.invoice;
                const color = bucketColor(entry.bucket);
                return (
                  <tr key={inv.id}>
                    <td className="bills-td-id">#{inv.id}</td>
                    <td>
                      <span className="bills-patient-name">
                        {patientName.get(Number(inv.patient_id)) || `ID: ${inv.patient_id}`}
                      </span>
                    </td>
                    <td className="bills-td-date">{fmtDate(inv.invoice_date)}</td>
                    <td className="bills-td-date">{fmtDate(inv.due_date)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="dcb-chip" style={toneStyle(color, softOf(color))}>
                        {entry.daysPastDue <= 0 ? 'Not due' : `${entry.daysPastDue}d overdue`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="bills-td-price">
                      {fmt(entry.paid)}
                    </td>
                    <td style={{ textAlign: 'right' }} className="bills-td-price">
                      {fmt(entry.balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

export default AgingAnalysis;

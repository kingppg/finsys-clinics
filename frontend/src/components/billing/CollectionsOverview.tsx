import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BanknoteIcon, HourglassIcon, TrendingUpIcon, WalletIcon } from './icons';
import { useDcTheme } from '../../themes/DcThemeProvider';
import {
  compactAmount,
  computeCollections,
  InvoiceLike,
  PaymentLike,
} from './billingAnalytics';
import './BillingAnalytics.css';

// ============================================================================
// COLLECTIONS OVERVIEW — practice revenue KPIs, monthly billed-vs-collected
// trend, and payment method mix. Read-only; computed from ledger data.
// ============================================================================

interface CollectionsOverviewProps {
  invoices: InvoiceLike[];
  payments: PaymentLike[];
  fmt: (n: number) => string;
  currencySymbol?: string;
  locale?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  periodLabel?: string | null;
}

const toneStyle = (color: string, soft: string): React.CSSProperties =>
  ({ '--tone': color, '--tone-soft': soft } as React.CSSProperties);

// SVG donut geometry
const DONUT_SIZE = 150;
const DONUT_RADIUS = 58;
const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function CollectionsOverview({
  invoices,
  payments,
  fmt,
  currencySymbol = '₱',
  locale,
  periodStart = null,
  periodEnd = null,
  periodLabel = null,
}: CollectionsOverviewProps) {
  const { theme } = useDcTheme();
  const t = theme.tokens;

  const data = useMemo(
    () => computeCollections(invoices || [], payments || [], { months: 6, locale, periodStart, periodEnd }),
    [invoices, payments, locale, periodStart, periodEnd]
  );

  const ratePct = Math.min(data.collectionRate * 100, 100);

  const kpis = [
    {
      label: 'Total Billed',
      value: fmt(data.totalBilled),
      sub: `${data.invoiceCount} invoices`,
      icon: <BanknoteIcon size={18} />,
      tone: t.info,
      toneSoft: t.infoSoft,
    },
    {
      label: 'Cash Collected',
      value: fmt(data.totalCollected),
      sub: `${data.paymentCount} payments received`,
      icon: <WalletIcon size={18} />,
      tone: t.success,
      toneSoft: t.successSoft,
    },
    {
      label: 'Outstanding',
      value: fmt(data.outstanding),
      sub: 'Awaiting collection',
      icon: <HourglassIcon size={18} />,
      tone: t.warning,
      toneSoft: t.warningSoft,
    },
    {
      label: 'Collection Rate',
      value: `${(data.collectionRate * 100).toFixed(1)}%`,
      sub: 'Collected vs billed',
      icon: <TrendingUpIcon size={18} />,
      tone: t.accent,
      toneSoft: t.accentSoft,
    },
  ];

  const maxMonthly = Math.max(
    1,
    ...data.monthly.map((m) => Math.max(m.billed, m.collected))
  );

  const billedColor = t.info;
  const collectedColor = t.accent;

  // Donut segments
  const donutTotal = data.byMethod.reduce((s, m) => s + m.amount, 0);
  let donutOffset = 0;
  const donutSegments = data.byMethod.map((slice, i) => {
    const fraction = donutTotal > 0 ? slice.amount / donutTotal : 0;
    const seg = {
      ...slice,
      color: theme.chartSeries[i % theme.chartSeries.length],
      dash: `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
      offset: -donutOffset * CIRCUMFERENCE,
      fraction,
    };
    donutOffset += fraction;
    return seg;
  });

  return (
    <motion.div
      className="dcb-stack"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* KPI row */}
      <div className="dcb-kpi-grid">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            className="dcb-kpi"
            style={toneStyle(kpi.tone, kpi.toneSoft)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.06 }}
          >
            <div className="dcb-kpi-top">
              <span className="dcb-kpi-label">{kpi.label}</span>
              <span className="dcb-kpi-icon">{kpi.icon}</span>
            </div>
            <div className="dcb-kpi-value">{kpi.value}</div>
            <div className="dcb-kpi-sub">{kpi.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Collection rate */}
      <div className="dcb-card">
        <div className="dcb-card-body">
          <div className="dcb-progress-head">
            <span className="dcb-progress-title">Collection Progress <span className="dcb-progress-note">· of this period's billings</span></span>
            <span className="dcb-progress-value">{(data.collectionRate * 100).toFixed(1)}%</span>
          </div>
          <div className="dcb-progress">
            <div className="dcb-progress-fill" style={{ width: `${ratePct}%` }} />
          </div>
          <div className="dcb-progress-foot">
            <span>Settled: {fmt(Math.max(data.totalBilled - data.outstanding, 0))}</span>
            <span>Billed: {fmt(data.totalBilled)}</span>
          </div>
        </div>
      </div>

      {/* Charges vs discounts — gross → discounts given → net billed */}
      <div className="dcb-card">
        <div className="dcb-card-head">
          <h3 className="dcb-card-title">Charges &amp; Discounts</h3>
          <span className="dcb-card-sub">{periodLabel ? `In ${periodLabel}` : 'Across active invoices'}</span>
        </div>
        <div className="dcb-card-body">
          <div className="dcb-gdn">
            <div className="dcb-gdn-item">
              <span className="dcb-gdn-label">Gross Charged</span>
              <span className="dcb-gdn-val">{fmt(data.grossCharged)}</span>
            </div>
            <span className="dcb-gdn-op">−</span>
            <div className="dcb-gdn-item">
              <span className="dcb-gdn-label">Discounts Given</span>
              <span className="dcb-gdn-val dcb-gdn-val--discount">{fmt(data.discountsGiven)}</span>
            </div>
            <span className="dcb-gdn-op">=</span>
            <div className="dcb-gdn-item">
              <span className="dcb-gdn-label">Net Billed</span>
              <span className="dcb-gdn-val dcb-gdn-val--net">{fmt(data.netBilled)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dcb-two-col">
        {/* Monthly billed vs collected */}
        <div className="dcb-card">
          <div className="dcb-card-head">
            <h3 className="dcb-card-title">Billed vs Collected</h3>
            <span className="dcb-card-sub">Last 6 months</span>
          </div>
          <div className="dcb-card-body">
            <div className="dcb-bars">
              {data.monthly.map((month) => (
                <div key={month.key} className="dcb-bar-group">
                  <div className="dcb-bar-pair">
                    <div
                      className="dcb-bar"
                      style={{
                        height: `${(month.billed / maxMonthly) * 100}%`,
                        background: billedColor,
                        opacity: 0.55,
                      }}
                      title={`Billed ${month.label}: ${fmt(month.billed)}`}
                    >
                      {month.billed > 0 && (
                        <span className="dcb-bar-val">
                          {compactAmount(month.billed, currencySymbol, locale)}
                        </span>
                      )}
                    </div>
                    <div
                      className="dcb-bar"
                      style={{
                        height: `${(month.collected / maxMonthly) * 100}%`,
                        background: collectedColor,
                      }}
                      title={`Collected ${month.label}: ${fmt(month.collected)}`}
                    >
                      {month.collected > 0 && (
                        <span className="dcb-bar-val">
                          {compactAmount(month.collected, currencySymbol, locale)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="dcb-bar-month">{month.label}</span>
                </div>
              ))}
            </div>
            <div className="dcb-legend" style={{ marginTop: 14 }}>
              <span className="dcb-legend-item">
                <span className="dcb-dot" style={{ background: billedColor, opacity: 0.55 }} />
                Billed
              </span>
              <span className="dcb-legend-item">
                <span className="dcb-dot" style={{ background: collectedColor }} />
                Collected
              </span>
            </div>
          </div>
        </div>

        {/* Payment method mix */}
        <div className="dcb-card">
          <div className="dcb-card-head">
            <h3 className="dcb-card-title">Payment Methods</h3>
            <span className="dcb-card-sub">By amount collected</span>
          </div>
          <div className="dcb-card-body">
            {donutTotal <= 0 ? (
              <div className="dcb-empty">
                <div className="dcb-empty-title">No payments recorded yet</div>
                <div>The method mix will appear once payments are posted.</div>
              </div>
            ) : (
              <div className="dcb-donut-row">
                <div className="dcb-donut-figure">
                  <svg
                    width={DONUT_SIZE}
                    height={DONUT_SIZE}
                    viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
                    role="img"
                    aria-label="Payment method distribution"
                  >
                    <circle
                      cx={DONUT_SIZE / 2}
                      cy={DONUT_SIZE / 2}
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke={t.surface2}
                      strokeWidth={DONUT_STROKE}
                    />
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.label}
                        cx={DONUT_SIZE / 2}
                        cy={DONUT_SIZE / 2}
                        r={DONUT_RADIUS}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={DONUT_STROKE}
                        strokeDasharray={seg.dash}
                        strokeDashoffset={seg.offset}
                        transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                      >
                        <title>{`${seg.label}: ${fmt(seg.amount)} (${(seg.fraction * 100).toFixed(1)}%)`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className="dcb-donut-center">
                    <span className="dcb-donut-center-value">
                      {compactAmount(donutTotal, currencySymbol, locale)}
                    </span>
                    <span className="dcb-donut-center-label">Collected</span>
                  </div>
                </div>
                <div className="dcb-donut-legend">
                  {donutSegments.map((seg) => (
                    <div key={seg.label} className="dcb-donut-legend-row">
                      <span className="dcb-dot" style={{ background: seg.color }} />
                      <span>
                        {seg.label} · {seg.count}
                      </span>
                      <span className="dcb-donut-legend-amount">{fmt(seg.amount)}</span>
                      <span className="dcb-donut-legend-pct">
                        {(seg.fraction * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default CollectionsOverview;

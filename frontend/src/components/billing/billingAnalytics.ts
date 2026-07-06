// ============================================================================
// BILLING ANALYTICS — pure, read-only computations
// ----------------------------------------------------------------------------
// Operates on the SAME invoice/payment rows the Billing ledger already loads
// from Supabase. Never fetches, never writes — invoice totals and statuses
// are owned by the database (triggers) and the existing UI. Conventions match
// the SOA / Invoice Management modal exactly: balance = invoice.total − paid.
// ============================================================================

export interface InvoiceLike {
  id: number;
  patient_id?: number | null;
  total?: number | string | null;
  discount?: number | string | null;
  status?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  [key: string]: unknown;
}

export interface PaymentLike {
  id: number;
  invoice_id?: number | null;
  amount?: number | string | null;
  method?: string | null;
  payment_date?: string | null;
  [key: string]: unknown;
}

export type BucketKey = 'current' | 'b1_30' | 'b31_60' | 'b61_90' | 'b90_plus';

export const BUCKET_ORDER: BucketKey[] = ['current', 'b1_30', 'b31_60', 'b61_90', 'b90_plus'];

export const BUCKET_LABELS: Record<BucketKey, string> = {
  current: 'Current',
  b1_30: '1–30 Days',
  b31_60: '31–60 Days',
  b61_90: '61–90 Days',
  b90_plus: '90+ Days',
};

export interface AgingEntry {
  invoice: InvoiceLike;
  paid: number;
  balance: number;
  /** Days past the reference date; <= 0 means not yet due */
  daysPastDue: number;
  bucket: BucketKey;
}

export interface BucketSummary {
  key: BucketKey;
  count: number;
  amount: number;
  entries: AgingEntry[];
}

export interface AgingResult {
  buckets: Record<BucketKey, BucketSummary>;
  entries: AgingEntry[];
  totalOutstanding: number;
  totalCount: number;
  overdueAmount: number;
  overdueCount: number;
}

export interface MethodSlice {
  method: string;
  label: string;
  amount: number;
  count: number;
}

export interface MonthPoint {
  key: string; // 'YYYY-MM'
  label: string; // localized short month
  billed: number;
  collected: number;
}

export interface CollectionsResult {
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  /** 0..1 (may exceed 1 with overpayments; clamp at render time) */
  collectionRate: number;
  invoiceCount: number;
  paymentCount: number;
  byMethod: MethodSlice[];
  monthly: MonthPoint[];
  /** Gross charged before discounts = Σ(invoice.total + invoice.discount). */
  grossCharged: number;
  /** Total price reductions given = Σ(invoice.discount). */
  discountsGiven: number;
  /** Net billed after discounts = Σ(invoice.total) (== totalBilled). */
  netBilled: number;
}

// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const normStatus = (s: unknown): string => String(s ?? '').trim().toLowerCase();

/** Parse a 'YYYY-MM-DD' (or ISO) string as a local date at midnight. */
function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function sumPaymentsByInvoice(payments: PaymentLike[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const p of payments || []) {
    const invId = Number(p.invoice_id);
    if (!Number.isFinite(invId)) continue;
    map.set(invId, (map.get(invId) || 0) + num(p.amount));
  }
  return map;
}

/**
 * The ONE overdue rule, shared by the invoices table and the Aging tab so they
 * can never disagree. An invoice is overdue when it still owes money AND its due
 * date is STRICTLY BEFORE today (local day granularity). "Due today" is NOT
 * overdue — the patient has until the day ends. Paid/cancelled or no-due-date
 * invoices are never overdue.
 */
export function isInvoiceOverdue(
  invoice: InvoiceLike,
  paid: number,
  today: Date = new Date()
): boolean {
  const status = normStatus(invoice.status);
  if (status === 'paid' || status === 'cancelled') return false;
  if (num(invoice.total) - paid <= 0.005) return false; // nothing owed
  const due = parseDay(invoice.due_date);
  if (!due) return false; // no due date -> never overdue
  return due.getTime() < startOfDay(today).getTime();
}

// ---------------------------------------------------------------------------
// AGING
// ---------------------------------------------------------------------------

export function computeAging(
  invoices: InvoiceLike[],
  payments: PaymentLike[],
  today: Date = new Date()
): AgingResult {
  const paidMap = sumPaymentsByInvoice(payments);
  const today0 = startOfDay(today);

  const buckets: Record<BucketKey, BucketSummary> = {
    current: { key: 'current', count: 0, amount: 0, entries: [] },
    b1_30: { key: 'b1_30', count: 0, amount: 0, entries: [] },
    b31_60: { key: 'b31_60', count: 0, amount: 0, entries: [] },
    b61_90: { key: 'b61_90', count: 0, amount: 0, entries: [] },
    b90_plus: { key: 'b90_plus', count: 0, amount: 0, entries: [] },
  };
  const entries: AgingEntry[] = [];

  for (const inv of invoices || []) {
    const status = normStatus(inv.status);
    if (status === 'paid' || status === 'cancelled') continue;

    const paid = paidMap.get(Number(inv.id)) || 0;
    const balance = num(inv.total) - paid;
    if (balance <= 0.005) continue;

    // Reference date: due date when set, otherwise the invoice date.
    // (Invoices with neither are treated as current — never falsely overdue.)
    const refDate = parseDay(inv.due_date) || parseDay(inv.invoice_date);
    const daysPastDue = refDate
      ? Math.floor((today0.getTime() - refDate.getTime()) / MS_PER_DAY)
      : 0;

    let bucket: BucketKey;
    if (daysPastDue <= 0) bucket = 'current';
    else if (daysPastDue <= 30) bucket = 'b1_30';
    else if (daysPastDue <= 60) bucket = 'b31_60';
    else if (daysPastDue <= 90) bucket = 'b61_90';
    else bucket = 'b90_plus';

    const entry: AgingEntry = { invoice: inv, paid, balance, daysPastDue, bucket };
    entries.push(entry);
    buckets[bucket].entries.push(entry);
    buckets[bucket].count += 1;
    buckets[bucket].amount += balance;
  }

  entries.sort((a, b) => b.daysPastDue - a.daysPastDue || b.balance - a.balance);

  const totalOutstanding = entries.reduce((s, e) => s + e.balance, 0);
  const overdueAmount = totalOutstanding - buckets.current.amount;

  return {
    buckets,
    entries,
    totalOutstanding,
    totalCount: entries.length,
    overdueAmount,
    overdueCount: entries.length - buckets.current.count,
  };
}

// ---------------------------------------------------------------------------
// COLLECTIONS
// ---------------------------------------------------------------------------

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  'e-wallet': 'E-Wallet',
  bank: 'Bank Transfer',
  card: 'Card',
};

function methodLabel(raw: unknown): string {
  const key = normStatus(raw);
  if (!key) return 'Unspecified';
  if (METHOD_LABELS[key]) return METHOD_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function computeCollections(
  invoices: InvoiceLike[],
  payments: PaymentLike[],
  options?: { months?: number; locale?: string; today?: Date; periodStart?: Date | null; periodEnd?: Date | null }
): CollectionsResult {
  const months = options?.months ?? 6;
  const locale = options?.locale || undefined;
  const today = options?.today || new Date();
  const periodStart = options?.periodStart ?? null;
  const periodEnd = options?.periodEnd ?? null;

  // Period filter (invoices by invoice_date, payments by payment_date). Balances
  // use ALL payments so a period invoice's outstanding reflects every payment.
  const inPeriod = (raw: unknown, fallback?: unknown): boolean => {
    if (!periodStart || !periodEnd) return true;
    const d = parseDay(String(raw ?? '')) || parseDay(String(fallback ?? ''));
    return d ? d >= periodStart && d < periodEnd : false;
  };

  const paidMap = sumPaymentsByInvoice(payments); // all-payments, for cohort balances
  const activeAll = (invoices || []).filter((inv) => normStatus(inv.status) !== 'cancelled');
  const activePeriod = activeAll.filter((inv) => inPeriod(inv.invoice_date, inv.created_at));
  const paymentsPeriod = (payments || []).filter((p) => inPeriod(p.payment_date, p.created_at));

  const totalBilled = activePeriod.reduce((s, inv) => s + num(inv.total), 0);
  const totalCollected = paymentsPeriod.reduce((s, p) => s + num(p.amount), 0); // cash in period
  const outstanding = activePeriod.reduce(
    (s, inv) => s + Math.max(num(inv.total) - (paidMap.get(Number(inv.id)) || 0), 0),
    0
  ); // cohort: unpaid balance of period invoices
  // Cohort collection rate = share of THIS period's billings that are settled.
  // (Not period-cash / period-billed, which is misleading when cash pays older
  // invoices.) All-time, cohort == cash so the number is unchanged.
  const collectionRate = totalBilled > 0 ? Math.max(totalBilled - outstanding, 0) / totalBilled : 0;

  // Charges vs discounts. invoice.total is stored NET of discount, so gross =
  // net + discount. Lets the practice see how much was discounted per period.
  const discountsGiven = activePeriod.reduce((s, inv) => s + num(inv.discount), 0);
  const netBilled = totalBilled;
  const grossCharged = netBilled + discountsGiven;

  // Payment method mix — money that came IN, by method. Reversals (method
  // 'Reversal', negative amount) are money OUT, not an inflow method, so they
  // are excluded here (they would otherwise draw a negative donut slice). They
  // still net correctly into totalCollected above.
  const methodMap = new Map<string, MethodSlice>();
  for (const p of paymentsPeriod) {
    if (normStatus(p.method) === 'reversal' || num(p.amount) < 0) continue;
    const label = methodLabel(p.method);
    const slice = methodMap.get(label) || { method: normStatus(p.method), label, amount: 0, count: 0 };
    slice.amount += num(p.amount);
    slice.count += 1;
    methodMap.set(label, slice);
  }
  const byMethod = Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount);

  // Monthly billed vs collected (last N months, oldest → newest)
  const monthly: MonthPoint[] = [];
  const index = new Map<string, MonthPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const point: MonthPoint = {
      key,
      label: d.toLocaleDateString(locale, { month: 'short' }),
      billed: 0,
      collected: 0,
    };
    monthly.push(point);
    index.set(key, point);
  }
  // Monthly trend is a fixed trailing window (full data), independent of the
  // selected period, so the chart stays a stable "last 6 months" view.
  for (const inv of activeAll) {
    const key = String(inv.invoice_date || '').slice(0, 7);
    const point = index.get(key);
    if (point) point.billed += num(inv.total);
  }
  for (const p of payments || []) {
    const key = String(p.payment_date || '').slice(0, 7);
    const point = index.get(key);
    if (point) point.collected += num(p.amount);
  }

  return {
    totalBilled,
    totalCollected,
    outstanding,
    collectionRate,
    invoiceCount: activePeriod.length,
    paymentCount: paymentsPeriod.length,
    byMethod,
    monthly,
    grossCharged,
    discountsGiven,
    netBilled,
  };
}

// ---------------------------------------------------------------------------
// Formatting helper for chart annotations (e.g., "₱81.8K")
// ---------------------------------------------------------------------------

export function compactAmount(n: number, symbol: string, locale?: string): string {
  try {
    return (
      symbol +
      new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    );
  } catch {
    return symbol + Math.round(n).toLocaleString();
  }
}

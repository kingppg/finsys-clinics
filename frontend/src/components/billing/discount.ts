// ============================================================================
// DISCOUNT ENGINE — invoice discount types + PH statutory Senior/PWD + VAT.
// Pure, no dependencies. Shared by the Create and Manage invoice modals.
// ============================================================================

export type DiscountType = 'none' | 'senior' | 'pwd' | 'percent' | 'amount';

export const DISCOUNT_TYPES: { value: DiscountType; label: string }[] = [
  { value: 'none', label: 'No discount' },
  { value: 'senior', label: 'Senior Citizen (20%)' },
  { value: 'pwd', label: 'PWD (20%)' },
  { value: 'percent', label: 'Custom %' },
  { value: 'amount', label: 'Custom amount' },
];

export const SC_PWD_RATE = 0.20;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineLike {
  total?: number | string | null;
  sc_pwd_eligible?: boolean;
  [key: string]: unknown;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export interface InvoiceTotals {
  subtotal: number;
  eligibleBase: number;
  nonEligibleBase: number;
  discount: number;
  discountLabel: string;
  isScPwd: boolean;
  vat: number;
  vatRate: number;
  total: number;
}

/**
 * The single source of truth for invoice money math — mirrors the DB total
 * triggers (migration 010) exactly.
 *
 * PERMANENT MODEL: line prices are VAT-EXCLUSIVE base amounts.
 *  • Senior/PWD → 20% of the ELIGIBLE base only (mixed invoices: cosmetic lines
 *    marked sc_pwd_eligible=false are excluded). Eligible lines are VAT-exempt;
 *    non-eligible lines are VATable for a VAT-registered clinic.
 *  • Regular (none/percent/amount) → discount on the whole subtotal; VAT (if
 *    registered) added to the discounted base.
 *  • VAT is ADDED (never divided/backed-out).
 */
export function computeInvoiceTotals(opts: {
  items: LineLike[];
  discountType: DiscountType;
  customValue?: number;      // % for 'percent', ₱ for 'amount'
  vatRegistered?: boolean;
  vatRate?: number;
}): InvoiceTotals {
  const { items, discountType, customValue = 0, vatRegistered = false, vatRate = 12 } = opts;
  const list = items || [];

  const subtotal = round2(list.reduce((s, i) => s + num(i.total), 0));
  const eligibleBase = round2(list.reduce((s, i) => s + (i.sc_pwd_eligible === false ? 0 : num(i.total)), 0));
  const nonEligibleBase = round2(subtotal - eligibleBase);
  const isScPwd = discountType === 'senior' || discountType === 'pwd';

  let discount = 0;
  let discountLabel = '';
  if (isScPwd) {
    discount = round2(eligibleBase * SC_PWD_RATE);
    discountLabel = discountType === 'senior' ? 'Senior Citizen 20%' : 'PWD 20%';
  } else if (discountType === 'percent') {
    const pct = Math.max(0, Math.min(customValue, 100));
    discount = round2(subtotal * (pct / 100));
    discountLabel = pct ? `${pct}% discount` : '';
  } else if (discountType === 'amount') {
    discount = round2(Math.max(0, Math.min(customValue, subtotal)));
  }

  // Eligible SC/PWD lines are VAT-exempt → only non-eligible lines are VATable.
  // For non-SC/PWD, the whole discounted base is VATable.
  const vatBase = isScPwd ? nonEligibleBase : Math.max(subtotal - discount, 0);
  const vat = (vatRegistered && vatBase > 0) ? round2(vatBase * (vatRate / 100)) : 0;
  const total = round2(Math.max(subtotal - discount, 0) + vat);

  return { subtotal, eligibleBase, nonEligibleBase, discount, discountLabel, isScPwd, vat, vatRate, total };
}

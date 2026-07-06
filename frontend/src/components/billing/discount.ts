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

export interface DiscountResult {
  amount: number;   // peso amount to subtract from subtotal
  label: string;    // human label for the SOA/summary (e.g. "Senior Citizen 20%")
}

/**
 * Compute the discount amount for an invoice.
 *
 * PERMANENT MODEL: line prices are stored VAT-EXCLUSIVE (base amounts). So the
 * statutory Senior/PWD 20% is applied to the base directly — regardless of the
 * clinic's VAT status (a senior/PWD is VAT-exempt; VAT is simply never charged
 * to them, handled by computeVat below). We do NOT divide by 1.12 — there is no
 * VAT embedded in a VAT-exclusive base to back out.
 */
export function computeDiscount(opts: {
  subtotal: number;
  type: DiscountType;
  customValue?: number;      // % for 'percent', ₱ for 'amount'
}): DiscountResult {
  const { subtotal, type, customValue = 0 } = opts;
  if (type === 'none' || !subtotal || subtotal <= 0) return { amount: 0, label: '' };

  if (type === 'senior' || type === 'pwd') {
    return {
      amount: round2(subtotal * SC_PWD_RATE),
      label: type === 'senior' ? 'Senior Citizen 20%' : 'PWD 20%',
    };
  }

  if (type === 'percent') {
    const pct = Math.max(0, Math.min(customValue, 100));
    return { amount: round2(subtotal * (pct / 100)), label: pct ? `${pct}% discount` : '' };
  }

  // amount
  const amt = Math.max(0, Math.min(customValue, subtotal));
  return { amount: round2(amt), label: '' };
}

/**
 * Add VAT to a VAT-EXCLUSIVE taxable base (additive, not backed out).
 * VAT is zero when the clinic isn't VAT-registered OR the sale is exempt
 * (Senior/PWD). Returns the VAT and the VAT-inclusive amount due.
 *   regular VAT: base 1000 → { vat: 120, total: 1120 }
 *   senior/exempt or non-VAT: → { vat: 0, total: base }
 */
export function computeVat(opts: {
  taxableBase: number;
  vatRegistered: boolean;
  exempt: boolean;
  vatRate?: number;
}): { vat: number; total: number; rate: number } {
  const { taxableBase, vatRegistered, exempt, vatRate = 12 } = opts;
  const base = Math.max(taxableBase, 0);
  if (!vatRegistered || exempt) return { vat: 0, total: round2(base), rate: vatRate };
  const vat = round2(base * (vatRate / 100));
  return { vat, total: round2(base + vat), rate: vatRate };
}

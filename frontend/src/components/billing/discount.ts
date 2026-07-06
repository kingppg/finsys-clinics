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
 * Senior / PWD is the PH statutory computation: the sale is VAT-EXEMPT, so when
 * the clinic is VAT-registered we strip the VAT first, THEN take 20% of the
 * VAT-exempt (net) base. Non-VAT clinics have no VAT to strip → plain 20% off.
 */
export function computeDiscount(opts: {
  subtotal: number;
  type: DiscountType;
  customValue?: number;      // % for 'percent', ₱ for 'amount'
  vatRegistered?: boolean;
  vatRate?: number;          // e.g. 12
}): DiscountResult {
  const { subtotal, type, customValue = 0, vatRegistered = false, vatRate = 12 } = opts;
  if (type === 'none' || !subtotal || subtotal <= 0) return { amount: 0, label: '' };

  if (type === 'senior' || type === 'pwd') {
    const base = vatRegistered ? subtotal / (1 + vatRate / 100) : subtotal;
    return {
      amount: round2(base * SC_PWD_RATE),
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

export interface VatBreakdown {
  net: number;   // VAT-exempt / VATable sales (price ÷ 1+rate)
  vat: number;   // the VAT portion
  rate: number;
}

/** Back out the VAT portion of a VAT-inclusive amount (null when not registered). */
export function vatBreakdown(grossInclusive: number, vatRegistered: boolean, vatRate = 12): VatBreakdown | null {
  if (!vatRegistered || !grossInclusive) return null;
  const net = grossInclusive / (1 + vatRate / 100);
  return { net: round2(net), vat: round2(grossInclusive - net), rate: vatRate };
}

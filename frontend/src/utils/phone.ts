// frontend/src/utils/phone.ts
// Mirror of backend helpers/phone.js (normalizePHMobile) — keep the two in
// lockstep so the staff Add/Edit Patient form and the booking bot validate and
// store phone numbers identically. Phone is required for SMS reminders (the
// fallback whenever Facebook's 24-hour Messenger window has closed).
//
// Accepts what real people type (09…, +639…, 639…, 9…, with spaces/dashes) and
// returns canonical `09XXXXXXXXX`, or null if it isn't a PH mobile (rejects
// landlines and junk).
export function normalizePHMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, ''); // drop +, spaces, dashes, letters
  if (d.startsWith('63')) d = d.slice(2);       // 639171234567 → 9171234567
  else if (d.startsWith('0')) d = d.slice(1);   // 09171234567  → 9171234567
  if (!/^9\d{9}$/.test(d)) return null;         // 10 digits, starts with 9
  return '0' + d;                               // canonical 09XXXXXXXXX
}

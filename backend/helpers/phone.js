// backend/helpers/phone.js
// One place that understands Philippine mobile numbers, shared by the booking
// bot (validation at capture) and every SMS send path (formatting at send).
// Dependency-free on purpose so any module can require it.

// Validate + canonicalize a PH mobile number. Accepts what real people type
// (09…, +639…, 639…, 9…, with spaces/dashes) and returns canonical
// `09XXXXXXXXX`, or null if it isn't a PH mobile (rejects landlines and junk
// like ten zeros that a bare /^\d{10,}$/ would pass).
function normalizePHMobile(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, ''); // drop +, spaces, dashes, letters
  if (d.startsWith('63')) d = d.slice(2);       // 639171234567 → 9171234567
  else if (d.startsWith('0')) d = d.slice(1);   // 09171234567  → 9171234567
  // PH mobile national number: 10 digits, always starting with 9.
  if (!/^9\d{9}$/.test(d)) return null;
  return '0' + d;                               // canonical 09XXXXXXXXX
}

// Format a stored number for a specific SMS provider at send time. The SMS
// senders used to pass the raw stored value straight through — fine for
// Semaphore (accepts local `09…`) but wrong for Twilio, which needs E.164
// (`+63…`). This makes the send tolerant of ANY stored format, so legacy rows
// that were never normalized still go out correctly.
//   - twilio   → +639XXXXXXXXX (E.164)
//   - semaphore / default → 09XXXXXXXXX (local)
// If a value can't be recognized as a PH mobile we fall back to a best-effort
// transform rather than dropping the send outright.
function formatForProvider(raw, provider) {
  if (!raw) return null;
  const canon = normalizePHMobile(raw); // 09XXXXXXXXX or null
  if (String(provider || '').toLowerCase() === 'twilio') {
    if (canon) return '+63' + canon.slice(1);   // 09171234567 → +639171234567
    // Best effort for non-canonical legacy data.
    const d = String(raw).replace(/\D/g, '');
    if (d.startsWith('63')) return '+' + d;
    if (d.startsWith('0')) return '+63' + d.slice(1);
    return String(raw).trim();
  }
  // Semaphore and any other/local provider: keep the local 09 format.
  return canon || String(raw).trim();
}

module.exports = { normalizePHMobile, formatForProvider };

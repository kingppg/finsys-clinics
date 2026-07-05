// ============================================================================
// SMS segment / encoding estimator (client-side, no dependencies)
// ----------------------------------------------------------------------------
// SMS is billed per 160-character "segment" (credit) when the text fits the
// GSM 03.38 alphabet. A single non-GSM character (₱, an em dash, a curly quote,
// an emoji…) forces the WHOLE message into Unicode (UCS-2), which drops the
// segment size to ~70 chars — roughly doubling the cost. This module estimates
// the segment count and flags the pricey characters so staff can catch them
// before spending credits. Pure UI helper — never touches sending.
// ============================================================================

// GSM 03.38 basic set (each char = 1 septet)
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// GSM extension chars — valid GSM, but each costs 2 septets (escape + char)
const GSM_EXTENDED = '^{}\\[~]|€';

function isGsm7(text) {
  for (const ch of text) {
    if (GSM_BASIC.indexOf(ch) === -1 && GSM_EXTENDED.indexOf(ch) === -1) return false;
  }
  return true;
}

// 'GSM' (cheap, 160/credit) or 'Unicode' (expensive, 70/credit)
export function encodingLabel(text) {
  return isGsm7(text || '') ? 'GSM' : 'Unicode';
}

// Estimated number of segments (= credits) the text will cost.
export function estimateSegments(text) {
  const str = text || '';
  const chars = [...str];
  if (chars.length === 0) return 0;

  if (isGsm7(str)) {
    let septets = 0;
    for (const ch of chars) septets += GSM_EXTENDED.indexOf(ch) !== -1 ? 2 : 1;
    return septets <= 160 ? 1 : Math.ceil(septets / 153);
  }
  // UCS-2: count UTF-16 code units (surrogate pairs already count as 2 here)
  const units = str.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}

// Distinct characters that break GSM encoding (drives the cost warning).
export function nonGsmChars(text) {
  const seen = new Set();
  for (const ch of (text || '')) {
    if (GSM_BASIC.indexOf(ch) === -1 && GSM_EXTENDED.indexOf(ch) === -1) seen.add(ch);
  }
  return [...seen];
}

// Convenience: everything the UI needs in one call.
export function smsInfo(text) {
  const str = text || '';
  const encoding = encodingLabel(str);
  return {
    chars: [...str].length,
    segments: estimateSegments(str),
    encoding,
    isUnicode: encoding === 'Unicode',
    offenders: nonGsmChars(str),
  };
}

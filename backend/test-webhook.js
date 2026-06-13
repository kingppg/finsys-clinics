// test-webhook.js — function-level test harness (no Facebook / no real DB / no real LLM)
// ---------------------------------------------------------------------------
// Run with:  node test-webhook.js
//
// This drives the real state machine in webhook.js and the real history logic
// in ai/claire.js, while stubbing the three external boundaries:
//   - axios            → captures every outbound Messenger message (the "BOT" lines)
//   - @supabase/...    → an in-memory fake DB that records inserts/updates
//   - global.fetch     → a scripted Anthropic API (only for the claire history test)
//   - ai/claire        → a scripted intent classifier (for the webhook flow tests)
//
// It is a plain Node script (no Jest needed). Exit code is non-zero if any
// assertion fails, so it can be wired into CI later.
// ---------------------------------------------------------------------------

const Module = require('module');

// --- Minimal env so the helper modules don't complain at load time. ---
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------
let passCount = 0;
let failCount = 0;
function check(label, cond) {
  if (cond) { passCount++; console.log(`    ✅ ${label}`); }
  else { failCount++; console.log(`    ❌ ${label}`); }
}
function section(title) { console.log(`\n=== ${title} ===`); }

// ---------------------------------------------------------------------------
// In-memory fake Supabase (chainable query builder, thenable like the real one)
// ---------------------------------------------------------------------------
function makeFakeSupabase(seed = {}) {
  const db = {
    dentists: [], patients: [], appointments: [], dentist_availability: [], clinics: [],
    ...seed
  };
  let idSeq = 1000;

  function matches(rows, filters) {
    return rows.filter(r => filters.every(f => {
      const v = r[f.col];
      switch (f.type) {
        case 'eq':  return v === f.val;
        case 'neq': return v !== f.val;
        case 'gte': return v >= f.val;
        case 'lte': return v <= f.val;
        case 'gt':  return v > f.val;
        case 'lt':  return v < f.val;
        // No-wildcard ilike in this codebase → case-insensitive equality.
        case 'ilike': return String(v ?? '').toLowerCase() === String(f.val ?? '').toLowerCase();
        default: return true;
      }
    }));
  }

  function makeBuilder(table) {
    const b = { _table: table, _op: 'select', _payload: null, _filters: [], _single: false, _maybe: false, _limit: null };
    const addFilter = (type, col, val) => { b._filters.push({ type, col, val }); return b; };

    b.select = () => { return b; };              // keeps current op (insert/update/select)
    b.insert = (p) => { b._op = 'insert'; b._payload = p; return b; };
    b.update = (p) => { b._op = 'update'; b._payload = p; return b; };
    b.delete = () => { b._op = 'delete'; return b; };
    b.eq = (c, v) => addFilter('eq', c, v);
    b.neq = (c, v) => addFilter('neq', c, v);
    b.gte = (c, v) => addFilter('gte', c, v);
    b.lte = (c, v) => addFilter('lte', c, v);
    b.gt = (c, v) => addFilter('gt', c, v);
    b.lt = (c, v) => addFilter('lt', c, v);
    b.ilike = (c, v) => addFilter('ilike', c, v);
    b.or = () => b;                              // availability OR clause — no-op for tests
    b.order = () => b;
    b.limit = (n) => { b._limit = n; return b; };
    b.single = () => { b._single = true; return resolve(b); };
    b.maybeSingle = () => { b._maybe = true; return resolve(b); };
    b.then = (onF, onR) => resolve(b).then(onF, onR);
    return b;
  }

  async function resolve(b) {
    const table = db[b._table] || (db[b._table] = []);
    if (b._op === 'insert') {
      const payloads = Array.isArray(b._payload) ? b._payload : [b._payload];
      const inserted = payloads.map(p => { const row = { id: ++idSeq, ...p }; table.push(row); return row; });
      const data = (b._single || b._maybe) ? inserted[0] : inserted;
      return { data, error: null };
    }
    if (b._op === 'update') {
      const hit = matches(table, b._filters);
      hit.forEach(r => Object.assign(r, b._payload));
      const data = (b._single || b._maybe) ? (hit[0] || null) : hit;
      return { data, error: (b._single && !hit.length) ? { message: 'no rows' } : null };
    }
    // select
    let hit = matches(table, b._filters);
    if (b._limit) hit = hit.slice(0, b._limit);
    if (b._single) return { data: hit[0] || null, error: hit.length ? null : { message: 'no rows' } };
    if (b._maybe) return { data: hit[0] || null, error: null };
    return { data: hit, error: null };
  }

  return { from: (t) => makeBuilder(t), __db: db };
}

// ---------------------------------------------------------------------------
// Outbound message capture (replaces axios for all Messenger sends)
// ---------------------------------------------------------------------------
const outbox = [];
const axiosMock = {
  post: async (_url, body) => { outbox.push(body); return { data: {} }; },
  get: async () => ({ data: {} })
};

function describe(body) {
  const m = body && body.message;
  if (!m) return JSON.stringify(body);
  if (m.text) return m.text.replace(/\n/g, ' / ');
  const p = m.attachment && m.attachment.payload;
  if (p && p.buttons) return `[template: "${(p.text || '').replace(/\n/g, ' ')}" buttons: ${p.buttons.map(x => x.title).join(' | ')}]`;
  return JSON.stringify(m);
}

// ---------------------------------------------------------------------------
// Scripted Claude (for webhook flow tests). Keyword-based, deterministic.
// `confidence` is set high except for the explicit low-confidence probe.
// ---------------------------------------------------------------------------
function scriptedClaude(message /*, sender_psid, state, context */) {
  const m = String(message).toLowerCase().trim();
  if (['yes', 'oo', 'opo', 'sige', 'yep'].includes(m)) return { intent: 'yes', confidence: 0.95, reply: null };
  if (['no', 'hindi', 'ayaw', 'nope'].includes(m)) return { intent: 'no', confidence: 0.95, reply: null };
  if (m.includes('lowbook')) return { intent: 'book_appointment', confidence: 0.3, reply: 'Pwede po kayong mag-book. 😊' };
  if (m.includes('book') || m.includes('appointment') || m.includes('pa-book')) return { intent: 'book_appointment', confidence: 0.92, reply: 'Sige po! Paki-type ang petsa (YYYY-MM-DD). 😊' };
  if (m.includes('cancel') || m.includes('wag na') || m.includes('exit')) return { intent: 'cancel_flow', confidence: 0.9, reply: 'Okay lang po! 😊' };
  if (m.includes('anak') || m.includes('asawa') || m.includes('para sa iba')) return { intent: 'yes', confidence: 0.8, reply: null };
  return { intent: 'unknown', confidence: 0.3, reply: 'Paumanhin po, paano kita matutulungan? 😊' };
}

// ---------------------------------------------------------------------------
// PART 1 — claire.js conversation-history correctness (the critical fix)
// Loads the REAL claire.js and stubs global.fetch.
// ---------------------------------------------------------------------------
async function testClaireHistory() {
  section('PART 1 — claire.js history (alternation + error recovery)');
  const claire = require('./ai/claire');

  const sent = [];        // each entry = the `messages` array sent to the API
  let mode = 'ok';
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    sent.push(body.messages);
    if (mode === 'error') {
      return { json: async () => ({ error: { type: 'api_error', message: 'simulated failure' } }) };
    }
    return { json: async () => ({ content: [{ text: '{"intent":"unknown","confidence":0.8,"reply":"ok po"}' }] }) };
  };

  const ctx = { timeZone: 'Asia/Manila', clinic: { name: 'Test Dental' } };
  const psid = 'claire-history-user';

  function validity(msgs) {
    if (!msgs || !msgs.length) return 'EMPTY';
    if (msgs[0].role !== 'user') return `STARTS_WITH_${msgs[0].role}`;
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].role === msgs[i - 1].role) return `DOUBLE_${msgs[i].role}_@${i}`;
    }
    return 'OK';
  }

  let everyTurnValid = true;
  // 12 successful turns — this crosses the old slice(-10) breakpoint (~turn 6).
  for (let i = 1; i <= 12; i++) {
    await claire.getClaudeResponse(`patient message ${i}`, psid, 'default', ctx);
    const last = sent[sent.length - 1];
    const v = validity(last);
    if (v !== 'OK') { everyTurnValid = false; console.log(`    turn ${i}: ${last.length} msgs, first=${last[0]?.role}, ${v}`); }
  }
  check('12 consecutive turns: every request starts with user and alternates', everyTurnValid);

  // A failed API turn must NOT leave a dangling user turn.
  mode = 'error';
  await claire.getClaudeResponse('this one errors', psid, 'default', ctx);
  mode = 'ok';
  await claire.getClaudeResponse('recovery turn', psid, 'default', ctx);
  check('after an API error, the next request is still valid (no dangling user turn)', validity(sent[sent.length - 1]) === 'OK');
}

// ---------------------------------------------------------------------------
// PART 2 — webhook flow tests (scripted Claude + fake DB + captured sends)
// ---------------------------------------------------------------------------
let wh;          // the webhook module (loaded after mocks are installed)
let fakeDb;      // the fake supabase instance shared by all modules
const APPT_DATE = futureOpenDate(30);

function futureOpenDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1); // never a Sunday (clinic closed)
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

const context = {
  clinicId: 1,
  pageAccessToken: 'TEST_PAGE_TOKEN',
  timeZone: 'Asia/Manila',
  clinicName: 'Test Dental',
  fb_page_id: 'PAGE_1',
  clinic: { id: 1, name: 'Test Dental', address: '123 Test St', contact_phone: '02-8888', time_zone: 'Asia/Manila' }
};
const req = {}; // no socket.io in tests (req?.io is undefined → emit skipped)

async function send(psid, text) {
  outbox.length = 0;
  await wh.handleMessage(psid, text, { sender: { id: psid } }, req, context);
  const lines = outbox.map(describe);
  console.log(`    USER(${psid}): ${text}`);
  lines.forEach(l => console.log(`      BOT: ${l}`));
  return lines;
}
const stateOf = (psid) => wh.userStates[psid] && wh.userStates[psid].state;
const lastText = (lines) => (lines.join(' || ')).toLowerCase();

// Scenario B — cancel at the confirmation screen records the contact + a Cancelled row
async function testCancelAtConfirm() {
  section('PART 2a — cancel at confirmation (records contact + Cancelled appointment)');
  const psid = 'new-patient-cancel';

  await send(psid, 'I want to book an appointment');
  check('default → awaiting_date on confident book intent', stateOf(psid) === 'awaiting_date');

  await send(psid, APPT_DATE);                       // new user → asked for name
  check('awaiting_date → awaiting_my_name (new user)', stateOf(psid) === 'awaiting_my_name');

  await send(psid, 'Juan Cruz');
  await send(psid, '09171234567');
  check('reached slot selection', stateOf(psid) === 'awaiting_slot');

  await send(psid, '1');                             // pick first slot
  check('slot picked → confirming', stateOf(psid) === 'confirming');

  await send(psid, 'CANCEL_BOOKING');                // cancel at summary
  check('confirming → default after cancel', stateOf(psid) === 'default');

  const patient = fakeDb.__db.patients.find(p => p.messenger_id === psid);
  check('contact captured: patient row created with messenger_id', !!patient);

  const cancelled = fakeDb.__db.appointments.find(a => a.status === 'Cancelled' && a.guardian_messenger_id === psid);
  check('Cancelled appointment recorded for analytics/follow-up', !!cancelled);
  check('Cancelled row references the captured patient', cancelled && patient && cancelled.patient_id === patient.id);
}

// Scenario D — a confirmed booking writes the patient + a Confirmed appointment
async function testConfirmBooking() {
  section('PART 2b — successful confirm (patient inserted only on confirm)');
  const psid = 'new-patient-confirm';

  await send(psid, 'pa-book po ng appointment');
  await send(psid, APPT_DATE);
  await send(psid, 'Pedro Reyes');
  await send(psid, '09180001122');
  await send(psid, '1');
  check('reached confirming', stateOf(psid) === 'confirming');

  await send(psid, 'CONFIRM_BOOKING');
  check('confirming → default after confirm', stateOf(psid) === 'default');

  const patient = fakeDb.__db.patients.find(p => p.messenger_id === psid);
  check('patient inserted on confirm', !!patient);
  const confirmed = fakeDb.__db.appointments.find(a => a.status === 'Confirmed' && patient && a.patient_id === patient.id);
  check('Confirmed appointment created', !!confirmed);
}

// Scenario C — someone-else, same name → guardian confirmation (YES reuses, NO creates new)
async function testSomeoneElseSameName() {
  section('PART 2c — someone-else same-name guardian confirmation');

  function mariaCount() {
    return fakeDb.__db.patients.filter(p => String(p.name).toLowerCase() === 'maria santos').length;
  }
  const startMaria = mariaCount();

  // --- guard1 confirms YES → reuse the existing Maria record (no new patient) ---
  const g1 = 'guard1';
  await send(g1, 'book appointment');
  await send(g1, APPT_DATE);                          // guard1 already double-booked → for-whom
  check('guard1: double-booked → awaiting_for_whom', stateOf(g1) === 'awaiting_for_whom');

  await send(g1, 'para sa anak ko');
  check('guard1: someone-else → awaiting_patient_name', stateOf(g1) === 'awaiting_patient_name');

  await send(g1, 'Maria Santos');
  const askLines = await send(g1, 'skip');           // no phone → name-only match → confirm prompt
  check('guard1: name-only match → awaiting_guardian_confirm_match', stateOf(g1) === 'awaiting_guardian_confirm_match');
  check('guard1: bot asks to confirm the same-name record', lastText(askLines).includes('pareho ng pangalan'));

  await send(g1, 'yes');
  check('guard1: YES → proceeds to slot selection', stateOf(g1) === 'awaiting_slot');
  check('guard1: existing Maria reused (no new patient created)', mariaCount() === startMaria);

  // --- guard2 answers NO → a fresh record will be created instead ---
  const g2 = 'guard2';
  await send(g2, 'book appointment');
  await send(g2, APPT_DATE);
  await send(g2, 'para sa asawa ko');
  await send(g2, 'Maria Santos');
  await send(g2, 'skip');
  check('guard2: reached guardian confirmation', stateOf(g2) === 'awaiting_guardian_confirm_match');

  const noLines = await send(g2, 'no');
  check('guard2: NO → proceeds to slot selection', stateOf(g2) === 'awaiting_slot');
  check('guard2: bot signals a new record will be made', lastText(noLines).includes('bagong record'));
}

// Scenario E — confidence gating: a low-confidence book intent must NOT change state
async function testConfidenceGating() {
  section('PART 2d — confidence gating (low-confidence intent is not acted on)');

  const lowUser = 'low-conf-user';
  await send(lowUser, 'lowbook');                    // book_appointment @ confidence 0.3
  check('low-confidence book does NOT transition (stays default)', stateOf(lowUser) === 'default');

  const highUser = 'high-conf-user';
  await send(highUser, 'I want to book an appointment'); // book_appointment @ confidence 0.92
  check('high-confidence book DOES transition (awaiting_date)', stateOf(highUser) === 'awaiting_date');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function main() {
  // PART 1 first, with the REAL claire (uses global.fetch, no DB/axios needed).
  await testClaireHistory();

  // Install module mocks, THEN load webhook so it picks them up.
  fakeDb = makeFakeSupabase({
    dentists: [{ id: 1, name: 'Dr. Test', is_active: true, clinic_id: 1 }],
    patients: [
      // A DIFFERENT "Maria Santos" already in the system (no messenger link).
      { id: 1, name: 'Maria Santos', phone: '09990001111', clinic_id: 1 },
      // Two guardians who each already have an appointment on APPT_DATE.
      { id: 5, name: 'Guardian One', phone: '09170000001', messenger_id: 'guard1', clinic_id: 1 },
      { id: 6, name: 'Guardian Two', phone: '09170000002', messenger_id: 'guard2', clinic_id: 1 }
    ],
    appointments: [
      { id: 100, patient_id: 5, dentist_id: 1, appointment_time: `${APPT_DATE}T10:00:00+08:00`, status: 'Confirmed', clinic_id: 1 },
      { id: 101, patient_id: 6, dentist_id: 1, appointment_time: `${APPT_DATE}T10:00:00+08:00`, status: 'Confirmed', clinic_id: 1 }
    ]
  });

  const realLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'axios') return axiosMock;
    if (request === '@supabase/supabase-js') return { createClient: () => fakeDb };
    if (request === './ai/claire' || request.endsWith('ai/claire') || request.endsWith('ai\\claire')) {
      return { getClaudeResponse: async (...a) => scriptedClaude(...a) };
    }
    return realLoad.call(this, request, parent, isMain);
  };

  wh = require('./webhook');

  await testCancelAtConfirm();
  await testConfirmBooking();
  await testSomeoneElseSameName();
  await testConfidenceGating();

  console.log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => { console.error('Harness crashed:', err); process.exit(1); });

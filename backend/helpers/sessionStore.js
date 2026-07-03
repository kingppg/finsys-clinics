// backend/helpers/sessionStore.js
// ---------------------------------------------------------------------------
// Persistent Messenger conversation state (fix for the #1 reliability risk:
// `userStates` lived only in process memory, so every deploy/restart orphaned
// patients mid-booking).
//
// Design: the webhook LOADS the session from Supabase before handling each
// message and SAVES it after. The state machine itself is untouched — it still
// reads/writes the same in-memory object during a message. Reading fresh from
// the DB on every message also makes this safe if Render ever runs more than
// one instance.
//
// Failure mode: if the DB is unreachable, we fall back to a small in-memory
// cache — exactly the old behavior — and log loudly. The bot never goes down
// because the sessions table is missing or Supabase hiccups.
// ---------------------------------------------------------------------------

const { createClient } = require('@supabase/supabase-js');

const HAS_DB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const supabase = HAS_DB
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!HAS_DB) {
  console.warn('[SessionStore] Supabase env vars missing — sessions are in-memory only (dev/test).');
}

// A booking conversation should finish within minutes; anything older than
// this on load is treated as expired (stored slot lists would be stale anyway).
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
// Rows older than this are purged from the table entirely.
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory fallback used only when the DB read/write fails.
const memoryFallback = new Map(); // `${clinicId}:${psid}` -> { state, data, touched }

const freshSession = () => ({ state: 'default', data: {} });

const isIdleSession = (s) =>
  !s || (s.state === 'default' && (!s.data || Object.keys(s.data).length === 0));

async function loadSession(psid, clinicId) {
  if (!psid || !clinicId) return freshSession();
  if (!HAS_DB) {
    const mem = memoryFallback.get(`${clinicId}:${psid}`);
    return mem ? { state: mem.state, data: mem.data } : freshSession();
  }
  try {
    const { data, error } = await supabase
      .from('messenger_sessions')
      .select('state, data, updated_at')
      .eq('clinic_id', clinicId)
      .eq('psid', psid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return freshSession();
    if (Date.now() - new Date(data.updated_at).getTime() > SESSION_TTL_MS) {
      return freshSession(); // expired mid-flow session; purge job removes the row
    }
    return { state: data.state || 'default', data: data.data || {} };
  } catch (err) {
    console.error('[SessionStore] load failed — using in-memory fallback:', err.message);
    const mem = memoryFallback.get(`${clinicId}:${psid}`);
    return mem ? { state: mem.state, data: mem.data } : freshSession();
  }
}

async function saveSession(psid, clinicId, session) {
  if (!psid || !clinicId) return;
  const safe = session && typeof session === 'object' ? session : freshSession();

  // Always mirror to the fallback cache so a DB outage degrades gracefully.
  memoryFallback.set(`${clinicId}:${psid}`, {
    state: safe.state || 'default',
    data: safe.data || {},
    touched: Date.now(),
  });

  if (!HAS_DB) return;
  try {
    if (isIdleSession(safe)) {
      // Conversation is back at rest — no row needed. Keeps the table tiny
      // (only in-flight conversations are stored).
      await supabase
        .from('messenger_sessions')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('psid', psid);
    } else {
      const { error } = await supabase.from('messenger_sessions').upsert(
        {
          clinic_id: clinicId,
          psid,
          state: safe.state || 'default',
          data: safe.data || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,psid' }
      );
      if (error) throw error;
    }
  } catch (err) {
    console.error('[SessionStore] save failed — state kept in memory only:', err.message);
  }
}

// Hourly housekeeping: purge stale DB rows and evict stale fallback entries.
// (This also fixes the old unbounded-growth leak of `userStates`.)
const cleanupTimer = setInterval(async () => {
  const memCutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, val] of memoryFallback) {
    if ((val.touched || 0) < memCutoff) memoryFallback.delete(key);
  }
  if (!HAS_DB) return;
  try {
    const dbCutoff = new Date(Date.now() - PURGE_AFTER_MS).toISOString();
    await supabase.from('messenger_sessions').delete().lt('updated_at', dbCutoff);
  } catch (err) {
    console.error('[SessionStore] cleanup failed:', err.message);
  }
}, 60 * 60 * 1000);
// Never keep the process alive just for housekeeping (matters for test runs).
cleanupTimer.unref?.();

module.exports = { loadSession, saveSession };

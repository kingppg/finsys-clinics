// backend/middleware/requireAuth.js
// ---------------------------------------------------------------------------
// Staff authentication for backend write/send endpoints (audit finding #2:
// manual reminders, status notifications, and SMS config/test were callable
// by anyone who knew the URL — patient spam / SMS-credit-burn risk).
//
// The frontend logs in with Supabase Auth, so every staff session carries a
// JWT. `requireAuth` verifies that JWT against Supabase and resolves the
// staff profile (users table, matched by email) onto req.staff. `sameClinic`
// then enforces that the request only operates on the caller's own clinic
// (superadmin exempt). Both return JSON errors the frontend already displays.
// ---------------------------------------------------------------------------

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Not signed in. Please log in and try again.' });
    }

    // Validates signature + expiry with Supabase Auth (GoTrue).
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.email) {
      return res.status(401).json({ error: 'Session invalid or expired. Please log in again.' });
    }

    // Map the auth user to a staff profile. An auth account with no users row
    // (e.g. signup not completed) gets no access to staff actions.
    const { data: staff, error: staffErr } = await supabase
      .from('users')
      .select('id, clinic_id, role, email')
      .eq('email', data.user.email)
      .maybeSingle();

    if (staffErr || !staff) {
      return res.status(403).json({ error: 'No staff profile linked to this account.' });
    }

    req.staff = staff;
    next();
  } catch (err) {
    console.error('[requireAuth] error:', err.message);
    res.status(401).json({ error: 'Authentication failed.' });
  }
}

// Factory: enforce that the clinic targeted by the request is the caller's
// own clinic. `extract` pulls the requested clinic id from the request
// (params/query/body — varies per route). Superadmins may act across clinics.
function sameClinic(extract) {
  return function (req, res, next) {
    const requested = Number(extract(req));
    if (!requested) {
      return res.status(400).json({ error: 'Missing clinic_id' });
    }
    if (req.staff?.role === 'superadmin') return next();
    if (Number(req.staff?.clinic_id) !== requested) {
      return res.status(403).json({ error: 'You do not have access to this clinic.' });
    }
    next();
  };
}

module.exports = { requireAuth, sameClinic };

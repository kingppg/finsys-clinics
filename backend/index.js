// Import required libraries
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const socketio = require('socket.io');
const axios = require('axios');

// --- Supabase Client ---
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Import routers
const remindersRouter = require('./routes/reminders');
const statusNotificationsRouter = require('./routes/statusNotifications');
const { router: webhookRouter } = require('./webhook');
const billingRoutes = require('./routes/billing');
const { requireAuth, sameClinic } = require('./middleware/requireAuth');

require('./reminderScheduler');

const app = express();
const PORT = process.env.PORT || 5000;
// Public base URL of THIS backend, used for OAuth redirect URIs. Must be set in
// production (e.g. https://finsys-clinics.onrender.com); falls back to localhost
// for dev. The same URL must be whitelisted in the Facebook app's Valid OAuth
// Redirect URIs.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

app.use(express.static('../public'));

console.log('STARTING BACKEND');

// Middleware
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://finsys-clinics-gq55.vercel.app"
  ]
}));
// Capture the raw request body so the webhook can verify Facebook's
// X-Hub-Signature-256 HMAC against the unparsed payload.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// --- LOGIN ENDPOINT ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, password, role, clinic_id, clinics(name)')
      .eq('username', username);

    if (error) {
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = users[0];
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      clinic_id: user.clinic_id,
      clinic_name: user.clinics?.name ?? ''
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// --- FACEBOOK OAUTH CONNECT ENDPOINT ---
app.get('/api/clinics/:id/facebook/connect', (req, res) => {
  const clinicId = req.params.id;
  const fbClientId = process.env.FB_CLIENT_ID;
  const redirectUri = `${BACKEND_URL}/api/clinics/${clinicId}/facebook/callback`;
  const base = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${fbClientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  // If a Facebook Login for Business Configuration ID is set, use the config_id
  // flow (permissions come from the Configuration). Otherwise fall back to the
  // classic scope-based flow (regular Facebook Login).
  const configId = process.env.FB_LOGIN_CONFIG_ID;
  let fbOauthUrl;
  if (configId) {
    fbOauthUrl = `${base}&config_id=${configId}`;
  } else {
    const scope = [
      'pages_messaging',
      'pages_manage_metadata',
      'pages_read_engagement',
      'pages_show_list'
    ].join(',');
    fbOauthUrl = `${base}&scope=${scope}`;
  }
  res.redirect(fbOauthUrl);
});

// --- FACEBOOK OAUTH PAGE SELECTION FLOW ---
const fbPagesCache = {};

app.get('/api/clinics/:id/facebook/callback', async (req, res) => {
  const clinicId = req.params.id;
  const code = req.query.code;
  const fbClientId = process.env.FB_CLIENT_ID;
  const fbClientSecret = process.env.FB_CLIENT_SECRET;
  const redirectUri = `${BACKEND_URL}/api/clinics/${clinicId}/facebook/callback`;

  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v17.0/oauth/access_token', {
      params: {
        client_id: fbClientId,
        client_secret: fbClientSecret,
        redirect_uri: redirectUri,
        code,
      }
    });
    const userAccessToken = tokenRes.data.access_token;

    const pagesRes = await axios.get('https://graph.facebook.com/v17.0/me/accounts', {
      params: {
        access_token: userAccessToken,
        fields: 'id,name,access_token,picture{url}'
      }
    });

    const fbPages = pagesRes.data.data || [];
    if (fbPages.length === 0) {
      return res.send('No Facebook page found! Please make sure you have a Facebook Page linked.');
    }

    fbPagesCache[clinicId] = {
      pages: fbPages,
      expires: Date.now() + 5 * 60 * 1000
    };

    res.send(`
      <html>
        <body>
          <h3>Facebook OAuth successful!</h3>
          <p>You may close this window and select a page in the app.</p>
          <script>
            setTimeout(() => window.close(), 1500);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.send('Error connecting Facebook page. Please try again.');
  }
});

// Get cached FB Pages for modal selection
app.get('/api/clinics/:id/facebook/pages', (req, res) => {
  const clinicId = req.params.id;
  const cacheEntry = fbPagesCache[clinicId];
  if (cacheEntry && cacheEntry.expires > Date.now()) {
    res.json({ pages: cacheEntry.pages });
  } else {
    res.status(404).json({ pages: [] });
  }
});

// Save selected page to DB
app.post('/api/clinics/:id/facebook/select-page', async (req, res) => {
  const clinicId = req.params.id;
  const { pageId, pageAccessToken } = req.body;
  if (!pageId || !pageAccessToken) {
    return res.status(400).json({ error: 'Missing page selection.' });
  }
  try {
    const { error } = await supabase
      .from('clinics')
      .update({
        fb_page_access_token: pageAccessToken,
        fb_page_id: pageId,
        messenger_page_id: pageId
      })
      .eq('id', clinicId);

    if (error) {
      return res.status(500).json({ error: 'Failed to save Facebook page.', details: error.message });
    }
    delete fbPagesCache[clinicId];
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Facebook page.', details: err.message });
  }
});

// Semaphore throttles rapid calls (HTTP 429 "Too Many Attempts"). Opening the
// SMS tab fires balance + sender-status back to back, so the second call can be
// rejected. Retry a GET a couple times with backoff to smooth that over.
async function semaphoreGet(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url);
    } catch (e) {
      if (e.response?.status === 429 && attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

// --- SMS BALANCE ENDPOINT ---
app.get('/api/clinics/:id/sms/balance', requireAuth, sameClinic(req => req.params.id), async (req, res) => {
  const clinicId = req.params.id;
  try {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('sms_provider, sms_api_key, sms_api_secret')
      .eq('id', clinicId)
      .single();

    if (error || !clinic) {
      return res.status(404).json({ error: 'Clinic not found.' });
    }

    if (clinic.sms_provider === 'semaphore') {
      if (!clinic.sms_api_key) return res.status(400).json({ error: 'No Semaphore API key configured.' });
      const response = await semaphoreGet(`https://semaphore.co/api/v4/account?apikey=${clinic.sms_api_key}`);
      res.json({
        credit_balance: response.data.credit_balance,
        currency: 'credits',
        provider: 'semaphore'
      });

    } else if (clinic.sms_provider === 'twilio') {
      if (!clinic.sms_api_key || !clinic.sms_api_secret) return res.status(400).json({ error: 'No Twilio credentials configured.' });
      const response = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${clinic.sms_api_key}.json`,
        { auth: { username: clinic.sms_api_key, password: clinic.sms_api_secret } }
      );
      res.json({
        credit_balance: parseFloat(response.data.balance).toFixed(2),
        currency: response.data.currency || 'USD',
        provider: 'twilio'
      });

    } else {
      return res.status(400).json({ error: 'No SMS provider configured.' });
    }

  } catch (err) {
    console.error('SMS balance error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch SMS balance.' });
  }
});

// --- SMS SENDER NAME APPROVAL STATUS (Semaphore only) ---
// Semaphore rejects sends from a sender name that isn't approved on the account.
// This looks up the clinic's configured sender name against the account's
// registered sender names and returns a normalized state the UI can render.
// Uses the saved key server-side (service key); never exposes it.
app.get('/api/clinics/:id/sms/sender-status', requireAuth, sameClinic(req => req.params.id), async (req, res) => {
  const clinicId = req.params.id;
  try {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('sms_provider, sms_api_key, sms_sender')
      .eq('id', clinicId)
      .single();

    if (error || !clinic) return res.status(404).json({ error: 'Clinic not found.' });

    // Sender-name approval is a Semaphore concept only.
    if (clinic.sms_provider !== 'semaphore') {
      return res.json({ state: 'na', sender: clinic.sms_sender || null });
    }
    if (!clinic.sms_api_key) {
      return res.json({ state: 'no_key', sender: clinic.sms_sender || null });
    }
    const sender = (clinic.sms_sender || '').trim();
    if (!sender) return res.json({ state: 'none', sender: null });

    // Semaphore's built-in default sender is always usable.
    if (sender.toLowerCase() === 'semaphore') {
      return res.json({ state: 'approved', sender, provider_status: 'Default sender' });
    }

    const response = await semaphoreGet(
      `https://api.semaphore.co/api/v4/account/sendernames?apikey=${encodeURIComponent(clinic.sms_api_key)}`
    );
    const list = Array.isArray(response.data) ? response.data : [];
    const match = list.find(
      s => String(s.name || '').trim().toLowerCase() === sender.toLowerCase()
    );

    if (!match) return res.json({ state: 'not_found', sender, provider_status: null });

    const raw = String(match.status || '').toLowerCase();
    let state = 'unknown';
    if (raw.includes('approv') || raw === 'success' || raw === 'active') state = 'approved';
    else if (raw.includes('pend')) state = 'pending';
    else if (raw.includes('reject') || raw.includes('denied') || raw.includes('fail')) state = 'rejected';

    return res.json({ state, sender, provider_status: match.status || null });
  } catch (err) {
    console.error('SMS sender-status error:', err.response?.data || err.message);
    // Non-fatal: the UI treats this as "couldn't check", not a hard error.
    return res.json({ state: 'error', error: 'Could not check sender status.' });
  }
});

// --- SMS TEST ENDPOINT ---
app.post('/api/clinics/:id/sms/test', requireAuth, sameClinic(req => req.params.id), async (req, res) => {
  const clinicId = req.params.id;
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Missing phone number.' });

  try {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('sms_provider, sms_api_key, sms_api_secret, sms_sender, name')
      .eq('id', clinicId)
      .single();

    if (error || !clinic) {
      return res.status(404).json({ error: 'Clinic not found.' });
    }
    if (!clinic.sms_provider || clinic.sms_provider === 'none' || !clinic.sms_api_key) {
      return res.status(400).json({ error: 'No SMS provider configured.' });
    }

    const message = `This is a test SMS from ${clinic.name}. Your SMS reminders are working correctly!`;

    if (clinic.sms_provider === 'semaphore') {
      await axios.post('https://api.semaphore.co/api/v4/messages', {
        apikey: clinic.sms_api_key,
        number: phone,
        message,
        sendername: clinic.sms_sender || 'SEMAPHORE'
      });
    } else if (clinic.sms_provider === 'twilio') {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${clinic.sms_api_key}/Messages.json`,
        new URLSearchParams({ To: phone, From: clinic.sms_sender, Body: message }),
        { auth: { username: clinic.sms_api_key, password: clinic.sms_api_secret } }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('SMS test error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || 'Failed to send test SMS.' });
  }
});

// --- SAVE SMS CONFIG (server-side, service key) ---
// SMS credentials are secrets, so the client must NOT write them directly to
// Supabase (the anon key is public). This endpoint persists them server-side.
// A blank api_key/secret means "leave the existing one unchanged", so the UI can
// edit provider/sender without seeing or wiping the stored key.
app.put('/api/clinics/:id/sms', requireAuth, sameClinic(req => req.params.id), async (req, res) => {
  const clinicId = req.params.id;
  const { sms_provider, sms_api_key, sms_api_secret, sms_sender } = req.body || {};

  const update = {
    sms_provider: sms_provider || 'none',
    sms_sender: sms_sender ?? null
  };
  if (typeof sms_api_key === 'string' && sms_api_key.trim() !== '') {
    update.sms_api_key = sms_api_key.trim();
  }
  if (typeof sms_api_secret === 'string' && sms_api_secret.trim() !== '') {
    update.sms_api_secret = sms_api_secret.trim();
  }
  // Disabling SMS clears stored credentials.
  if (update.sms_provider === 'none') {
    update.sms_api_key = null;
    update.sms_api_secret = null;
  }

  try {
    const { error } = await supabase.from('clinics').update(update).eq('id', clinicId);
    if (error) {
      return res.status(500).json({ error: 'Failed to save SMS settings.', details: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('SMS config save error:', err.message);
    res.status(500).json({ error: 'Failed to save SMS settings.' });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('Dental Clinic Backend is running!');
});

// Keep-alive endpoint
app.post('/api/keep-alive', (req, res) => {
  console.log('[KeepAlive] Full process wake at', new Date().toISOString());
  res.json({ ok: true });
});

// --- PUBLIC QUEUE DISPLAY (token-scoped) ---
// The waiting-room TV has NO login, so it cannot read the RLS-protected
// patients/appointments tables with the anon key. This endpoint serves the
// minimal queue (first names only) using the SERVICE key, scoped by the clinic's
// queue_token — the token IS the credential. Read-only; no PII beyond a first name.
const firstNameOf = (n) => (String(n || '').trim().split(/\s+/)[0] || '');
app.get('/api/queue/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const { data: clinic, error: cErr } = await supabase
      .from('clinics')
      .select('id, name, queue_stations')
      .eq('queue_token', token)
      .single();
    if (cErr || !clinic) return res.status(404).json({ error: 'Invalid token' });

    const { data: appts } = await supabase
      .from('appointments')
      .select('id, patient_id, checked_in_at, clinic_id')
      .eq('clinic_id', clinic.id)
      .eq('deleted', false)
      .eq('status', 'Checked-In')
      .order('checked_in_at', { ascending: true });

    const ids = [...new Set((appts || []).map(a => a.patient_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const { data: pts } = await supabase.from('patients').select('id, name').in('id', ids);
      names = Object.fromEntries((pts || []).map(p => [p.id, p.name]));
    }

    const queue = (appts || []).map(a => ({
      id: a.id,
      clinic_id: a.clinic_id,
      status: 'Checked-In',
      checked_in_at: a.checked_in_at,
      first_name: firstNameOf(names[a.patient_id]),
    }));

    res.json({
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      stations: clinic.queue_stations || 1,
      queue,
    });
  } catch (err) {
    console.error('[GET /api/queue/:token]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://finsys-clinics.vercel.app",
      "https://finsys-clinics-gq55.vercel.app"
    ],
    methods: ["GET", "POST"]
  }
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Reminder + status-notification routes are staff actions that SEND messages
// (Messenger/SMS) — they require a valid staff login scoped to their clinic.
// The webhook stays public by design (Facebook calls it; HMAC-verified).
app.use('/appointments', requireAuth, sameClinic(req => req.query.clinic_id), remindersRouter);
app.use('/status-notifications', requireAuth, sameClinic(req => req.body?.clinic_id), statusNotificationsRouter);
app.use('/webhook', webhookRouter);
// SECURITY (C1): the /api/billing router runs on the SERVICE key (bypasses RLS)
// and had NO auth middleware — a public bypass of the database's row-level
// security. The frontend does not use this router (it reads Supabase directly),
// so it is unmounted. To re-enable as a real API, gate it exactly like the SMS
// routes above: app.use('/api/billing', requireAuth, sameClinic(req => req.query.clinic_id), billingRoutes);
// app.use('/api/billing', billingRoutes);

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
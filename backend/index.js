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

require('./reminderScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static('../public'));

console.log('STARTING BACKEND');
console.log('ENVIRONMENT:', process.env);

// Middleware
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://finsys-clinics-gq55.vercel.app"
  ]
}));
app.use(express.json());

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
  const redirectUri = `http://localhost:5000/api/clinics/${clinicId}/facebook/callback`;
  const scope = [
    'pages_messaging',
    'pages_manage_metadata',
    'pages_read_engagement',
    'pages_show_list'
  ].join(',');
  const fbOauthUrl = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${fbClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  res.redirect(fbOauthUrl);
});

// --- FACEBOOK OAUTH PAGE SELECTION FLOW ---
const fbPagesCache = {};

app.get('/api/clinics/:id/facebook/callback', async (req, res) => {
  const clinicId = req.params.id;
  const code = req.query.code;
  const fbClientId = process.env.FB_CLIENT_ID;
  const fbClientSecret = process.env.FB_CLIENT_SECRET;
  const redirectUri = `http://localhost:5000/api/clinics/${clinicId}/facebook/callback`;

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

// --- SMS BALANCE ENDPOINT ---
app.get('/api/clinics/:id/sms/balance', async (req, res) => {
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
      const response = await axios.get(`https://semaphore.co/api/v4/account?apikey=${clinic.sms_api_key}`);
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

// --- SMS TEST ENDPOINT ---
app.post('/api/clinics/:id/sms/test', async (req, res) => {
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

// Test route
app.get('/', (req, res) => {
  res.send('Dental Clinic Backend is running!');
});

// Keep-alive endpoint
app.post('/api/keep-alive', (req, res) => {
  console.log('[KeepAlive] Full process wake at', new Date().toISOString());
  res.json({ ok: true });
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

app.use('/appointments', remindersRouter);
app.use('/status-notifications', statusNotificationsRouter);
app.use('/webhook', webhookRouter);

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
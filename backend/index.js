// Import required libraries
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');
const http = require('http');
const socketio = require('socket.io');
const axios = require('axios'); // For Facebook OAuth callback

// Import routers
const appointmentsRouter = require('./appointments');
const dentistAvailabilityRouter = require('./dentistAvailability');
const dentistsRouter = require('./dentists');
const remindersRouter = require('./routes/reminders');
const statusNotificationsRouter = require('./routes/statusNotifications');
const { router: webhookRouter } = require('./webhook');
const invoicesRouter = require('./routes/invoices');
const paymentsRouter = require('./routes/payments');
const proceduresRouter = require('./routes/procedures'); // <--- NEW

require('./reminderScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from public folder (for webview, etc.)
app.use(express.static('../public'));

// PostgreSQL pool
const pool = new Pool();

// Test PostgreSQL connection on server start
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected:', res.rows[0]);
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// --- LOGIN ENDPOINT ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password, u.role, u.clinic_id, c.name AS clinic_name
       FROM users u
       LEFT JOIN clinics c ON u.clinic_id = c.id
       WHERE u.username = $1`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const { id, username: uname, role, clinic_id, clinic_name } = user;
    res.json({ id, username: uname, role, clinic_id, clinic_name });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// --- CLINICS CRUD ENDPOINTS ---
app.get('/api/clinics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, created_at, updated_at, messenger_page_id, reminder_time
      FROM clinics
      ORDER BY id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clinics', details: err.message });
  }
});

app.get('/api/clinics/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT id, name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, created_at, updated_at, messenger_page_id, reminder_time
      FROM clinics
      WHERE id = $1
    `, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clinic', details: err.message });
  }
});

app.post('/api/clinics', async (req, res) => {
  const {
    name,
    address,
    contact_email,
    contact_phone,
    fb_page_id,
    fb_page_access_token,
    messenger_page_id,
    reminder_time
  } = req.body;
  if (!name || !fb_page_access_token || !reminder_time) {
    return res.status(400).json({ error: 'Clinic name, Messenger Page Access Token, and Reminder Time are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO clinics (name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, messenger_page_id, reminder_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, messenger_page_id, reminder_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add clinic', details: err.message });
  }
});

app.put('/api/clinics/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    address,
    contact_email,
    contact_phone,
    fb_page_id,
    fb_page_access_token,
    messenger_page_id,
    reminder_time
  } = req.body;
  if (!name || !fb_page_access_token || !reminder_time) {
    return res.status(400).json({ error: 'Clinic name, Messenger Page Access Token, and Reminder Time are required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE clinics SET
        name = $1,
        address = $2,
        contact_email = $3,
        contact_phone = $4,
        fb_page_id = $5,
        fb_page_access_token = $6,
        messenger_page_id = $7,
        reminder_time = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *`,
      [name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, messenger_page_id, reminder_time, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update clinic', details: err.message });
  }
});

app.delete('/api/clinics/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM clinics WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
    res.json({ message: 'Clinic deleted', clinic: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete clinic', details: err.message });
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
const fbPagesCache = {}; // Simple in-memory cache (use Redis for production!)

app.get('/api/clinics/:id/facebook/callback', async (req, res) => {
  const clinicId = req.params.id;
  const code = req.query.code;
  const fbClientId = process.env.FB_CLIENT_ID;
  const fbClientSecret = process.env.FB_CLIENT_SECRET;
  const redirectUri = `http://localhost:5000/api/clinics/${clinicId}/facebook/callback`;

  try {
    // Exchange code for user access token
    const tokenRes = await axios.get('https://graph.facebook.com/v17.0/oauth/access_token', {
      params: {
        client_id: fbClientId,
        client_secret: fbClientSecret,
        redirect_uri: redirectUri,
        code,
      }
    });
    const userAccessToken = tokenRes.data.access_token;

    // Get user pages with name, access_token, and picture
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

    // Cache the pages per clinic for frontend modal selection (expires after 5 min)
    fbPagesCache[clinicId] = {
      pages: fbPages,
      expires: Date.now() + 5 * 60 * 1000
    };

    // Just show a message. Frontend will poll /api/clinics/:id/facebook/pages.
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
    await pool.query(
      'UPDATE clinics SET fb_page_access_token = $1, fb_page_id = $2, messenger_page_id = $3 WHERE id = $4',
      [pageAccessToken, pageId, pageId, clinicId] // <-- This is the fix!
    );
    delete fbPagesCache[clinicId];
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Facebook page.', details: err.message });
  }
});

// --- PATIENTS CRUD ---
app.get('/patients', async (req, res) => {
  const clinic_id = req.query.clinic_id;
  const role = req.query.role || 'user';
  try {
    let query = 'SELECT id, name, email, phone, messenger_id FROM patients';
    let params = [];
    if (role !== 'superadmin') {
      query += ' WHERE clinic_id = $1';
      params.push(clinic_id);
    }
    query += ' ORDER BY id';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.post('/patients', async (req, res) => {
  const { name, email, phone, messenger_id, clinic_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO patients (name, email, phone, messenger_id, clinic_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, phone, messenger_id, clinic_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add patient', details: err.message });
  }
});

app.put('/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, messenger_id, clinic_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE patients SET name = $1, email = $2, phone = $3, messenger_id = $4, clinic_id = $5 WHERE id = $6 RETURNING *',
      [name, email, phone, messenger_id, clinic_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update patient', details: err.message });
  }
});

app.delete('/patients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM patients WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json({ message: 'Patient deleted', patient: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete patient', details: err.message });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('Dental Clinic Backend is running!');
});

// Use routers for module routes!
app.use('/dentists', dentistsRouter);
app.use('/appointments', appointmentsRouter);
app.use('/appointments', remindersRouter);
app.use('/availability', dentistAvailabilityRouter);
app.use('/status-notifications', statusNotificationsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', proceduresRouter);

// --- SOCKET.IO SETUP --- //
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: [
  "http://localhost:3000",
  "https://finsys-clinics.vercel.app"
],
    methods: ["GET", "POST"]
  }
});

// Pass io to webhookRouter via req (middleware)
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Messenger webhook endpoint
app.use('/', webhookRouter);

// Start the server (use server instead of app)
server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
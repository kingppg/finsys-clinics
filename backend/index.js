// Import required libraries
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');
const http = require('http');
const socketio = require('socket.io');
const axios = require('axios'); // For Facebook OAuth callback

// Import routers
const remindersRouter = require('./routes/reminders');
const statusNotificationsRouter = require('./routes/statusNotifications');
const { router: webhookRouter } = require('./webhook');

require('./reminderScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from public folder (for webview, etc.)
app.use(express.static('../public'));

// PostgreSQL pool
const pool = new Pool();
console.log('STARTING BACKEND');
console.log('ENVIRONMENT:', process.env);

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
      [pageAccessToken, pageId, pageId, clinicId]
    );
    delete fbPagesCache[clinicId];
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Facebook page.', details: err.message });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('Dental Clinic Backend is running!');
});

// Use routers for module routes!
app.use('/appointments', remindersRouter);
app.use('/status-notifications', statusNotificationsRouter);

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
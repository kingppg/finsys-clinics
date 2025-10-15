// Import required libraries
const express = require('express');
const cors = require('cors');
require('dotenv').config();
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

console.log('STARTING BACKEND');
console.log('ENVIRONMENT:', process.env);

// Middleware
app.use(cors());
app.use(express.json());

// --- LOGIN ENDPOINT ---
// TODO: MIGRATE TO SUPABASE -- currently not implemented
app.post('/api/login', async (req, res) => {
  res.status(501).json({ error: 'Login endpoint not yet migrated to Supabase' });
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
// TODO: MIGRATE TO SUPABASE -- currently not implemented
app.post('/api/clinics/:id/facebook/select-page', async (req, res) => {
  res.status(501).json({ error: 'FB page selection endpoint not yet migrated to Supabase' });
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
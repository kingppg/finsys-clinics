const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '860261',
  database: process.env.PGDATABASE || 'dental_clinic',
  port: process.env.PGPORT || 5432
});

// GET /api/clinics
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, address, contact_email, contact_phone, fb_page_id, fb_page_access_token, messenger_page_id, reminder_time
       FROM clinics
       ORDER BY id`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clinics', details: err.message });
  }
});

// PUT /api/clinics/:id
router.put('/:id', async (req, res) => {
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

// Optionally: POST for new clinics
router.post('/', async (req, res) => {
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

module.exports = router;
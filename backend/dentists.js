const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool();

// GET all dentists (clinic-scoped)
router.get('/', async (req, res) => {
  const { clinic_id } = req.query;
  try {
    let result;
    if (clinic_id) {
      result = await pool.query('SELECT * FROM dentists WHERE clinic_id = $1 ORDER BY id', [clinic_id]);
    } else {
      result = await pool.query('SELECT * FROM dentists ORDER BY id');
    }
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Database error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// ADD a new dentist (clinic-scoped)
router.post('/', async (req, res) => {
  const { name, email, phone, is_active, clinic_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO dentists (name, email, phone, is_active, clinic_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, phone, typeof is_active === 'boolean' ? is_active : true, clinic_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to add dentist:', err);
    res.status(500).json({ error: 'Failed to add dentist', details: err.message });
  }
});

// EDIT a dentist (clinic-scoped)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, is_active, clinic_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE dentists SET name = $1, email = $2, phone = $3, is_active = $4, clinic_id = $5 WHERE id = $6 RETURNING *',
      [name, email, phone, typeof is_active === 'boolean' ? is_active : true, clinic_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dentist not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Failed to update dentist:', err);
    res.status(500).json({ error: 'Failed to update dentist', details: err.message });
  }
});

// DELETE a dentist (clinic-scoped, but still by id only)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinic_id } = req.query;
  try {
    let result;
    if (clinic_id) {
      result = await pool.query('DELETE FROM dentists WHERE id = $1 AND clinic_id = $2 RETURNING *', [id, clinic_id]);
    } else {
      result = await pool.query('DELETE FROM dentists WHERE id = $1 RETURNING *', [id]);
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dentist not found' });
    }
    res.json({ message: 'Dentist deleted', dentist: result.rows[0] });
  } catch (err) {
    console.error('❌ Failed to delete dentist:', err);
    res.status(500).json({ error: 'Failed to delete dentist', details: err.message });
  }
});

module.exports = router;
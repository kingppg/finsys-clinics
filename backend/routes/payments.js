const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool();

// List all payments (clinic-scoped)
router.get('/', async (req, res) => {
  const clinicId = req.query.clinic_id;
  try {
    let result;
    if (clinicId) {
      result = await pool.query('SELECT * FROM payments WHERE clinic_id = $1', [clinicId]);
    } else {
      result = await pool.query('SELECT * FROM payments');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new payment (clinic-scoped)
router.post('/', async (req, res) => {
  const { patient_id, invoice_id, amount, method, reference_number, notes, clinic_id } = req.body;
  try {
    // clinic_id required!
    if (!clinic_id) {
      return res.status(400).json({ error: "clinic_id is required" });
    }
    const result = await pool.query(
      `INSERT INTO payments (patient_id, invoice_id, amount, method, reference_number, notes, clinic_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [patient_id, invoice_id, amount, method, reference_number, notes, clinic_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payment by ID (optionally clinic-scoped)
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const clinicId = req.query.clinic_id;
  try {
    let result;
    if (clinicId) {
      result = await pool.query('SELECT * FROM payments WHERE id = $1 AND clinic_id = $2', [id, clinicId]);
    } else {
      result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
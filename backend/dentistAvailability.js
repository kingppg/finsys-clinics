const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool();

/**
 * GET /availability/:dentist_id
 * Get all availability blocks for a dentist (including recurring and specific dates)
 * Query params:
 *   date (optional): filter by a specific date (YYYY-MM-DD)
 *   clinic_id (optional): filter by clinic
 */
router.get('/:dentist_id', async (req, res) => {
  const { dentist_id } = req.params;
  const { date, clinic_id } = req.query;

  try {
    let query = `
      SELECT * FROM dentist_availability
      WHERE dentist_id = $1
    `;
    let params = [dentist_id];
    let idx = 2;

    if (clinic_id) {
      query += ` AND clinic_id = $${idx++}`;
      params.push(clinic_id);
    }

    if (date) {
      query += `
        AND (
          (specific_date = $${idx})
          OR
          (day_of_week = EXTRACT(DOW FROM $${idx}::date) AND specific_date IS NULL)
        )
      `;
      params.push(date);
      idx++;
    }

    query += `
      ORDER BY specific_date ASC NULLS LAST, day_of_week ASC NULLS LAST, start_time ASC NULLS LAST
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(`[GET /availability/${dentist_id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.', details: err.message });
  }
});

/**
 * POST /availability
 * Add a new availability or block for a dentist.
 * Body: { dentist_id, day_of_week, specific_date, start_time, end_time, is_available, clinic_id }
 */
router.post('/', async (req, res) => {
  const { dentist_id, day_of_week, specific_date, start_time, end_time, is_available, clinic_id } = req.body;

  if (!dentist_id || (typeof day_of_week !== 'number' && !specific_date) || !clinic_id) {
    return res.status(400).json({ error: 'dentist_id, clinic_id and (day_of_week [number] or specific_date) required.' });
  }

  try {
    const insertSql = `
      INSERT INTO dentist_availability
        (dentist_id, day_of_week, specific_date, start_time, end_time, is_available, clinic_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      dentist_id,
      typeof day_of_week === 'number' ? day_of_week : null,
      specific_date || null,
      start_time || null,
      end_time || null,
      typeof is_available === 'boolean' ? is_available : false,
      clinic_id
    ];
    const result = await pool.query(insertSql, params);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /availability] Database error:', err);
    res.status(500).json({ error: 'Database error.', details: err.message });
  }
});

/**
 * PUT /availability/:id
 * Update an existing availability/block by id.
 * Accepts clinic_id in body (for extra safety).
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { day_of_week, specific_date, start_time, end_time, is_available, clinic_id } = req.body;

  try {
    let updateSql = `
      UPDATE dentist_availability
      SET day_of_week = $1,
          specific_date = $2,
          start_time = $3,
          end_time = $4,
          is_available = $5
    `;
    let params = [
      typeof day_of_week === 'number' ? day_of_week : null,
      specific_date || null,
      start_time || null,
      end_time || null,
      typeof is_available === 'boolean' ? is_available : false
    ];
    if (clinic_id) {
      updateSql += `, clinic_id = $6 WHERE id = $7 AND clinic_id = $6`;
      params.push(clinic_id, id);
    } else {
      updateSql += ` WHERE id = $6`;
      params.push(id);
    }
    updateSql += ` RETURNING *`;

    const result = await pool.query(updateSql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`[PUT /availability/${id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.', details: err.message });
  }
});

/**
 * DELETE /availability/:id
 * Delete an availability/block by id.
 * Accepts clinic_id in query/body (for extra safety).
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const clinicId = req.query.clinic_id || req.body.clinic_id;
  try {
    let result;
    if (clinicId) {
      result = await pool.query('DELETE FROM dentist_availability WHERE id = $1 AND clinic_id = $2 RETURNING *', [id, clinicId]);
    } else {
      result = await pool.query('DELETE FROM dentist_availability WHERE id = $1 RETURNING *', [id]);
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability not found.' });
    }
    res.json({ message: 'Block deleted', block: result.rows[0] });
  } catch (err) {
    console.error(`[DELETE /availability/${id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.', details: err.message });
  }
});

module.exports = router;
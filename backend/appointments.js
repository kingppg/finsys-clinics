const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Use .env or system environment variables for connection:
const pool = new Pool();

// GET /appointments/all - list all appointments for table view (clinic-scoped)
router.get('/all', async (req, res) => {
  const clinicId = req.query.clinic_id;
  try {
    let result;
    if (clinicId) {
      result = await pool.query('SELECT * FROM appointments WHERE clinic_id = $1 ORDER BY appointment_time', [clinicId]);
    } else {
      result = await pool.query('SELECT * FROM appointments ORDER BY appointment_time');
    }
    res.json(result.rows);
  } catch (err) {
    console.error(`[GET /appointments/all] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /appointments?dentist_id=1&date=2025-09-15&clinic_id=1
router.get('/', async (req, res) => {
  const { dentist_id, patient_id, date, include_cancelled, clinic_id } = req.query;

  let whereClauses = [];
  let params = [];
  let idx = 1;

  if (clinic_id) {
    whereClauses.push(`a.clinic_id = $${idx++}`);
    params.push(clinic_id);
  }
  if (dentist_id) {
    whereClauses.push(`a.dentist_id = $${idx++}`);
    params.push(dentist_id);
  }
  if (patient_id) {
    whereClauses.push(`a.patient_id = $${idx++}`);
    params.push(patient_id);
  }
  if (date) {
    whereClauses.push(`DATE(a.appointment_time) = $${idx++}`);
    params.push(date);
  }

  // Only exclude cancelled by default
  if (!include_cancelled || include_cancelled === 'false') {
    whereClauses.push(`LOWER(a.status) != 'cancelled'`);
  }

  if (whereClauses.length === 0) {
    return res.status(400).json({ error: 'Missing filter parameters' });
  }

  const selectSql = `
    SELECT 
      a.*, 
      p.name AS patient_name, 
      p.phone AS patient_phone
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY a.appointment_time
  `;

  try {
    const result = await pool.query(selectSql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(`[GET /appointments] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// POST /appointments (clinic-scoped)
router.post('/', async (req, res) => {
  const { dentist_id, patient_id, appointment_time, reason, status, clinic_id } = req.body;
  const appointmentStatus = status || 'Scheduled';

  if (!clinic_id) {
    return res.status(400).json({ error: 'Missing clinic_id in body.' });
  }

  const findCancelledSql = `
    SELECT id FROM appointments
    WHERE dentist_id = $1 AND appointment_time = $2 AND clinic_id = $3 AND LOWER(status) = 'cancelled'
    LIMIT 1
  `;
  try {
    const existing = await pool.query(findCancelledSql, [dentist_id, appointment_time, clinic_id]);
    if (existing.rows.length > 0) {
      const updateSql = `
        UPDATE appointments
        SET patient_id = $1, reason = $2, status = $3
        WHERE id = $4
        RETURNING id
      `;
      const result = await pool.query(updateSql, [
        patient_id,
        reason,
        appointmentStatus,
        existing.rows[0].id
      ]);
      if (req.io) req.io.emit('appointment-updated'); // <-- Socket event!
      return res.status(200).json({ id: result.rows[0].id, updated: true });
    }

    const insertSql = `
      INSERT INTO appointments (dentist_id, patient_id, appointment_time, reason, status, clinic_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const result = await pool.query(insertSql, [dentist_id, patient_id, appointment_time, reason, appointmentStatus, clinic_id]);
    if (req.io) req.io.emit('appointment-updated'); // <-- Socket event!
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This slot is already booked for the dentist.' });
    }
    console.error(`[POST /appointments] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// PUT /appointments/:id - update an appointment (clinic-scoped)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { dentist_id, patient_id, appointment_time, reason, status, clinic_id } = req.body;

  if (!clinic_id) {
    return res.status(400).json({ error: 'Missing clinic_id in body.' });
  }

  const conflictSql = `
    SELECT 1 FROM appointments
    WHERE dentist_id = $1 AND appointment_time = $2 AND clinic_id = $3 AND id != $4
    LIMIT 1
  `;
  try {
    const conflict = await pool.query(conflictSql, [dentist_id, appointment_time, clinic_id, id]);
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'This slot is already booked for the dentist.' });
    }

    let updateSql;
    let params;
    if (typeof status !== 'undefined') {
      updateSql = `
        UPDATE appointments
        SET dentist_id = $1, patient_id = $2, appointment_time = $3, reason = $4, status = $5, clinic_id = $6
        WHERE id = $7
      `;
      params = [dentist_id, patient_id, appointment_time, reason, status, clinic_id, id];
    } else {
      updateSql = `
        UPDATE appointments
        SET dentist_id = $1, patient_id = $2, appointment_time = $3, reason = $4, clinic_id = $5
        WHERE id = $6
      `;
      params = [dentist_id, patient_id, appointment_time, reason, clinic_id, id];
    }

    await pool.query(updateSql, params);
    if (req.io) req.io.emit('appointment-updated'); // <-- Socket event!
    res.status(200).json({ message: 'Appointment updated.' });
  } catch (err) {
    console.error(`[PUT /appointments/${id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// DELETE /appointments/:id (optionally clinic-scoped)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const clinicId = req.body.clinic_id || req.query.clinic_id;
  try {
    let result;
    if (clinicId) {
      result = await pool.query('DELETE FROM appointments WHERE id = $1 AND clinic_id = $2 RETURNING *', [id, clinicId]);
    } else {
      result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING *', [id]);
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (req.io) req.io.emit('appointment-updated'); // <-- Socket event!
    res.json({ message: 'Appointment deleted', appointment: result.rows[0] });
  } catch (err) {
    console.error(`[DELETE /appointments/${id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// PATCH /appointments/:id - update status only (optionally clinic-scoped)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, clinic_id } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status in body.' });
  }

  const allowedStatuses = ['Scheduled', 'Confirmed', 'Completed', 'No Show', 'Cancelled'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  try {
    let updateResult;
    if (clinic_id) {
      updateResult = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 AND clinic_id = $3', [status, id, clinic_id]);
    } else {
      updateResult = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
    }
    if (req.io) req.io.emit('appointment-updated'); // <-- Socket event!
    res.status(200).json({ message: 'Status updated.' });
  } catch (err) {
    console.error(`[PATCH /appointments/${id}] Database error:`, err);
    res.status(500).json({ error: 'Database error.' });
  }
});

module.exports = router;
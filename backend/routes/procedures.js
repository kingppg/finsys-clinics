const express = require('express');
const router = express.Router();
const pool = require('../db'); // Use your DB connection/query helper

// 1. Get all clinics
router.get('/clinics', async (req, res) => {
  const clinics = await pool.query('SELECT id, name FROM clinics ORDER BY name');
  res.json(clinics.rows);
});

// 2. Get categories + procedures for a clinic
router.get('/clinics/:clinicId/procedure-categories', async (req, res) => {
  const { clinicId } = req.params;
  const categories = await pool.query(
    `SELECT id, name FROM procedure_categories WHERE clinic_id = $1 ORDER BY id`, [clinicId]
  );
  const result = [];
  for (const cat of categories.rows) {
    const procedures = await pool.query(
      `SELECT id, name, price FROM procedures WHERE clinic_id = $1 AND category_id = $2 ORDER BY id`,
      [clinicId, cat.id]
    );
    result.push({
      id: cat.id,
      name: cat.name,
      procedures: procedures.rows
    });
  }
  res.json(result);
});

// 3. Add a procedure
router.post('/clinics/:clinicId/procedures', async (req, res) => {
  const { clinicId } = req.params;
  const { categoryId, name, price } = req.body;
  const proc = await pool.query(
    `INSERT INTO procedures (clinic_id, category_id, name, price)
     VALUES ($1, $2, $3, $4) RETURNING id, name, price`,
    [clinicId, categoryId, name, price]
  );
  res.status(201).json(proc.rows[0]);
});

// 4. Update a procedure
router.put('/procedures/:procedureId', async (req, res) => {
  const { procedureId } = req.params;
  const { name, price } = req.body;
  const proc = await pool.query(
    `UPDATE procedures SET name = $1, price = $2 WHERE id = $3 RETURNING id, name, price`,
    [name, price, procedureId]
  );
  res.json(proc.rows[0]);
});

// 5. Delete a procedure
router.delete('/procedures/:procedureId', async (req, res) => {
  const { procedureId } = req.params;
  await pool.query(`DELETE FROM procedures WHERE id = $1`, [procedureId]);
  res.sendStatus(204);
});

// 6. Add a procedure category
router.post('/clinics/:clinicId/procedure-categories', async (req, res) => {
  const { clinicId } = req.params;
  const { name } = req.body;
  const cat = await pool.query(
    `INSERT INTO procedure_categories (clinic_id, name) VALUES ($1, $2) RETURNING id, name`,
    [clinicId, name]
  );
  res.status(201).json(cat.rows[0]);
});

module.exports = router;
const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [req.params.id.trim()]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, name: rows[0].name, role: rows[0].role });
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role FROM users ORDER BY id');
  res.json({ success: true, users: rows });
});

router.post('/', async (req, res) => {
  const { id, name, role } = req.body || {};
  if (!id || !name) return res.status(400).json({ success: false, error: 'id and name required' });
  try {
    await pool.query(
      `INSERT INTO users (id, name, role) VALUES ($1,$2,COALESCE($3,'engineer'))
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = COALESCE($3, users.role)`,
      [id, name, role || null]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;

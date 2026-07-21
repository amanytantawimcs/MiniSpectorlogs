const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/exists', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM admins LIMIT 1');
  res.json({ exists: rows.length > 0 });
});

router.post('/login', async (req, res) => {
  const { username, passwordHash } = req.body || {};
  const { rows } = await pool.query('SELECT id FROM admins WHERE username = $1 AND password_hash = $2', [username, passwordHash]);
  if (!rows[0]) return res.status(401).json({ success: false, error: 'Invalid credentials' });
  res.json({ success: true });
});

router.post('/setup', async (req, res) => {
  const { username, passwordHash } = req.body || {};
  if (!username || !passwordHash) return res.status(400).json({ success: false, error: 'username and passwordHash required' });
  try {
    await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1,$2)', [username, passwordHash]);
    res.json({ success: true });
  } catch (e) { res.status(409).json({ success: false, error: e.message }); }
});

module.exports = router;

const express = require('express');
const pool = require('../db');
const { verifyAdminCredentials, hashAdminPassword } = require('../lib/adminAuth');
const { createSession } = require('../lib/sessions');
const { rateLimit } = require('../lib/rateLimit');
const { asyncRoute } = require('../lib/asyncRoute');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 60_000, max: 8 });

router.get('/exists', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM admins LIMIT 1');
  res.json({ exists: rows.length > 0 });
}));

// `password` is the raw password now (sent over HTTPS, same as regular
// passcode login) — the server salts+hashes it, matching how passcode.js
// already did this correctly. See lib/adminAuth.js for why the previous
// client-computed-hash approach was actually a bearer credential, not a hash.
router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  const ok = await verifyAdminCredentials(pool, username, password);
  if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
  res.json({ success: true, token: createSession(username, 'admin') });
}));

router.post('/setup', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
  try {
    await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1,$2)', [username, hashAdminPassword(password)]);
    res.json({ success: true, token: createSession(username, 'admin') });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'That admin username already exists.' });
    throw e; // not a duplicate-username conflict — let asyncRoute log it and return a generic 500
  }
}));

module.exports = router;

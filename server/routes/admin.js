const express = require('express');
const pool = require('../db');
const { verifyAdminCredentials, hashAdminPassword } = require('../lib/adminAuth');
const { createSession } = require('../lib/sessions');
const { rateLimit } = require('../lib/rateLimit');
const { asyncRoute } = require('../lib/asyncRoute');
const { requireAdminAuth } = require('../lib/auth');
const { recordLogin, getRecentLogins } = require('../lib/loginLog');

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
  recordLogin(pool, { userId: username, userName: username, role: 'admin' });
  res.json({ success: true, token: createSession(username, 'admin') });
}));

router.post('/setup', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
  try {
    await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1,$2)', [username, hashAdminPassword(password)]);
    recordLogin(pool, { userId: username, userName: username, role: 'admin' });
    res.json({ success: true, token: createSession(username, 'admin') });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'That admin username already exists.' });
    throw e; // not a duplicate-username conflict — let asyncRoute log it and return a generic 500
  }
}));

// Admin-gated: who signed into the app, when, and as which kind of account.
router.get('/login-log', requireAdminAuth, asyncRoute(async (req, res) => {
  const logs = await getRecentLogins(pool, 100);
  res.json({ success: true, logs });
}));

// Cross-project directory for the admin panel's Projects tab — every
// project regardless of who created it, gated on the admin session (which
// covers both a real admin login and a privileged/is_admin user's own
// session — see requireAdminAuth).
router.get('/projects', requireAdminAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT project_code, project_name, mode, created_by, updated_at, is_sim_locked
     FROM projects ORDER BY updated_at DESC`
  );
  res.json({ success: true, projects: rows });
}));

module.exports = router;

const express = require('express');
const pool = require('../db');
const { hashPasscode, verifyPasscode, PASSCODE_FORMAT } = require('../lib/passcode');
const { verifyAdminCredentials } = require('../lib/adminAuth');
const { createSession } = require('../lib/sessions');

const router = express.Router();

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, passcode_hash FROM users WHERE id = $1', [req.params.id.trim()]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, name: rows[0].name, role: rows[0].role, hasPasscode: !!rows[0].passcode_hash });
});

// First-time passcode set. Rejected if a passcode already exists for this user.
router.post('/:id/passcode', async (req, res) => {
  const id = req.params.id.trim();
  const { passcode } = req.body || {};
  if (!PASSCODE_FORMAT.test(passcode || '')) {
    return res.status(400).json({ success: false, error: 'Passcode must be 4-6 digits.' });
  }
  const { rows } = await pool.query('SELECT passcode_hash FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
  if (rows[0].passcode_hash) return res.status(409).json({ success: false, error: 'Passcode already set.' });

  const { hash, salt } = hashPasscode(passcode);
  await pool.query('UPDATE users SET passcode_hash = $1, passcode_salt = $2 WHERE id = $3', [hash, salt, id]);
  res.json({ success: true, token: createSession(id) });
});

router.post('/:id/verify-passcode', async (req, res) => {
  const id = req.params.id.trim();
  const { passcode } = req.body || {};
  const { rows } = await pool.query('SELECT passcode_hash, passcode_salt FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
  const ok = verifyPasscode(passcode || '', rows[0].passcode_hash, rows[0].passcode_salt);
  if (!ok) return res.status(401).json({ success: false, error: 'Incorrect passcode.' });
  res.json({ success: true, token: createSession(id) });
});

// Self-service: a user who forgot their passcode clears it themselves from the
// login screen, then goes through first-time setup again on their next attempt.
// No admin gate here on purpose — that's the whole point of moving it off the admin tab.
router.post('/:id/reset-passcode', async (req, res) => {
  const id = req.params.id.trim();
  const { rowCount } = await pool.query('UPDATE users SET passcode_hash = NULL, passcode_salt = NULL WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true });
});

// Admin-gated: the full directory (every ID + name) is sensitive enough that it
// shouldn't be readable by anyone who just opens DevTools and hits the endpoint.
router.get('/', async (req, res) => {
  const { adminUsername, adminPasswordHash } = req.query;
  const isAdmin = await verifyAdminCredentials(pool, adminUsername, adminPasswordHash);
  if (!isAdmin) return res.status(401).json({ success: false, error: 'Admin authentication required.' });
  const { rows } = await pool.query('SELECT id, name, role FROM users ORDER BY id');
  res.json({ success: true, users: rows });
});

router.post('/', async (req, res) => {
  const { id, name, role, adminUsername, adminPasswordHash } = req.body || {};
  const isAdmin = await verifyAdminCredentials(pool, adminUsername, adminPasswordHash);
  if (!isAdmin) return res.status(401).json({ success: false, error: 'Admin authentication required.' });
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
  const { adminUsername, adminPasswordHash } = req.query;
  const isAdmin = await verifyAdminCredentials(pool, adminUsername, adminPasswordHash);
  if (!isAdmin) return res.status(401).json({ success: false, error: 'Admin authentication required.' });
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;

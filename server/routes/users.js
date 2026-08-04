const express = require('express');
const pool = require('../db');
const { hashPasscode, verifyPasscode, PASSCODE_FORMAT } = require('../lib/passcode');
const { createSession } = require('../lib/sessions');
const { requireAuth, requireAdminAuth } = require('../lib/auth');
const { rateLimit } = require('../lib/rateLimit');
const { asyncRoute } = require('../lib/asyncRoute');
const { recordLogin } = require('../lib/loginLog');

const router = express.Router();
const passcodeLimiter = rateLimit({ windowMs: 60_000, max: 8 });
const resetLimiter = rateLimit({ windowMs: 60_000, max: 5 });

// Lightweight directory lookup for the Project Team picker — any logged-in
// user can search by id/name to find teammates to add, but only gets back
// id+name (no role, no passcode state), unlike the admin-only GET '/' below.
router.get('/search', requireAuth, asyncRoute(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, users: [] });
  const { rows } = await pool.query(
    `SELECT id, name FROM users WHERE id ILIKE $1 OR name ILIKE $1 ORDER BY name LIMIT 15`,
    [`%${q}%`]
  );
  res.json({ success: true, users: rows });
}));

// Identifies whoever a session token belongs to — lets the client silently
// re-authenticate after a page refresh (the token is persisted in
// localStorage; the token alone doesn't say who it is, so this resolves it
// back to a display name/role) instead of forcing the login form again.
// Declared before the generic GET '/:id' below so "/me" isn't swallowed by it.
router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, is_admin FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, userId: rows[0].id, name: rows[0].name, role: rows[0].role, isAdmin: rows[0].is_admin });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, passcode_hash, is_admin FROM users WHERE id = $1', [req.params.id.trim()]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, name: rows[0].name, role: rows[0].role, hasPasscode: !!rows[0].passcode_hash, isAdmin: rows[0].is_admin });
}));

// First-time passcode set. Rejected if a passcode already exists for this user.
router.post('/:id/passcode', asyncRoute(async (req, res) => {
  const id = req.params.id.trim();
  const { passcode } = req.body || {};
  if (!PASSCODE_FORMAT.test(passcode || '')) {
    return res.status(400).json({ success: false, error: 'Passcode must be 4-6 digits.' });
  }
  const { rows } = await pool.query('SELECT name, passcode_hash FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
  if (rows[0].passcode_hash) return res.status(409).json({ success: false, error: 'Passcode already set.' });

  const { hash, salt } = hashPasscode(passcode);
  await pool.query('UPDATE users SET passcode_hash = $1, passcode_salt = $2 WHERE id = $3', [hash, salt, id]);
  recordLogin(pool, { userId: id, userName: rows[0].name, role: 'user' });
  res.json({ success: true, token: createSession(id) });
}));

// Rate-limited: a 4-digit passcode is only 10,000 combinations — without a
// limit here, brute-forcing one is a script running for under a minute.
router.post('/:id/verify-passcode', passcodeLimiter, asyncRoute(async (req, res) => {
  const id = req.params.id.trim();
  const { passcode } = req.body || {};
  const { rows } = await pool.query('SELECT name, passcode_hash, passcode_salt FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
  const ok = verifyPasscode(passcode || '', rows[0].passcode_hash, rows[0].passcode_salt);
  if (!ok) return res.status(401).json({ success: false, error: 'Incorrect passcode.' });
  recordLogin(pool, { userId: id, userName: rows[0].name, role: 'user' });
  res.json({ success: true, token: createSession(id) });
}));

// Admin-only. This used to be self-service from the login screen with no
// identity check at all beyond knowing someone's User ID — since IDs are
// short sequential numbers, that meant anyone could clear a coworker's
// passcode and set their own before the real person noticed. There's no
// email or second factor in this app to verify identity another way, so
// requiring an admin (who already proved who they are) is the only real fix.
// Rate-limited too, defense in depth against a compromised admin session.
router.post('/:id/reset-passcode', requireAdminAuth, resetLimiter, asyncRoute(async (req, res) => {
  const id = req.params.id.trim();
  const { rowCount } = await pool.query('UPDATE users SET passcode_hash = NULL, passcode_salt = NULL WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true });
}));

// Admin-gated via session token (server/lib/auth.js) instead of re-sending
// admin credentials on every call — the old version put adminUsername/
// adminPasswordHash in the URL query string, which lands in the browser's
// Network tab, address bar history, and any server access logs in the clear.
router.get('/', requireAdminAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, is_admin FROM users ORDER BY id');
  res.json({ success: true, users: rows });
}));

// Grants or revokes Admin panel access for a user — separate from the two
// hardcoded PRIVILEGED_USER_IDS (see lib/auth.js), which also get All
// Projects + simulation approvals and aren't affected by this flag.
router.post('/:id/set-admin', requireAdminAuth, asyncRoute(async (req, res) => {
  const id = req.params.id.trim();
  const { isAdmin } = req.body || {};
  const { rowCount } = await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [!!isAdmin, id]);
  if (!rowCount) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true });
}));

router.post('/', requireAdminAuth, asyncRoute(async (req, res) => {
  const { id, name, role } = req.body || {};
  if (!id || !name) return res.status(400).json({ success: false, error: 'id and name required' });
  await pool.query(
    `INSERT INTO users (id, name, role) VALUES ($1,$2,COALESCE($3,'engineer'))
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = COALESCE($3, users.role)`,
    [id, name, role || null]
  );
  res.json({ success: true });
}));

router.delete('/:id', requireAdminAuth, asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;

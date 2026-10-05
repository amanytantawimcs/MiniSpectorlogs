// Shared scope bundles. Any signed-in user can list them. Only the user who
// published a bundle can change it, and deletion is also open to the privileged
// users (PRIVILEGED_USER_IDS in lib/auth.js).
const express = require('express');
const pool = require('../db');
const { requireAuth, PRIVILEGED_USER_IDS } = require('../lib/auth');
const { asyncRoute } = require('../lib/asyncRoute');

const router = express.Router();
const ID_PATTERN = /^SHR-[A-Z0-9]{4,12}$/;

router.get('/', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT bundle FROM shared_scope_bundles ORDER BY created_at');
  res.json({ success: true, bundles: rows.map(r => r.bundle) });
}));

router.put('/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = String(req.params.id);
  const bundle = req.body?.bundle;
  if (!ID_PATTERN.test(id) || !bundle || bundle.id !== id || !Array.isArray(bundle.req) || !Array.isArray(bundle.opt)) {
    return res.status(400).json({ success: false, error: 'Invalid bundle' });
  }
  const { rows } = await pool.query(
    `INSERT INTO shared_scope_bundles (id, owner_id, bundle) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET bundle = EXCLUDED.bundle
       WHERE shared_scope_bundles.owner_id = EXCLUDED.owner_id
     RETURNING id`,
    [id, String(req.userId), JSON.stringify({ ...bundle, custom: true, shared: true })]
  );
  if (rows.length === 0) return res.status(403).json({ success: false, error: 'That bundle id belongs to another user.' });
  res.json({ success: true });
}));

router.delete('/:id', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT owner_id FROM shared_scope_bundles WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.json({ success: true });
  const isOwner = rows[0].owner_id === String(req.userId);
  if (!isOwner && !PRIVILEGED_USER_IDS.includes(String(req.userId))) {
    return res.status(403).json({ success: false, error: 'Only the publisher can delete this bundle.' });
  }
  await pool.query('DELETE FROM shared_scope_bundles WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;

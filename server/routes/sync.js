const express = require('express');
const pool = require('../db');
const { getProjectRowByCode } = require('../lib/projectData');
const { asyncRoute } = require('../lib/asyncRoute');

const router = express.Router();

router.post('/sync-log', asyncRoute(async (req, res) => {
  const { project_code, device_role, user_name, action, meta } = req.body || {};
  const project = await getProjectRowByCode(project_code);
  if (!project) return res.status(404).json({ success: false });
  await pool.query(
    'INSERT INTO sync_log (project_id, device_role, user_name, action, meta) VALUES ($1,$2,$3,$4,$5)',
    [project.id, device_role || '', user_name || '', action || '', JSON.stringify(meta || {})]
  );
  res.json({ success: true });
}));

router.get('/sync-log/:code', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ success: true, log: [] });
  const { rows } = await pool.query('SELECT * FROM sync_log WHERE project_id = $1 ORDER BY synced_at DESC LIMIT 10', [project.id]);
  res.json({ success: true, log: rows });
}));

router.post('/session-meta', asyncRoute(async (req, res) => {
  const { device_id, project_code, device_role, user_name } = req.body || {};
  const project = await getProjectRowByCode(project_code);
  await pool.query(
    `INSERT INTO session_meta (device_id, project_id, device_role, user_name) VALUES ($1,$2,$3,$4)
     ON CONFLICT (device_id) DO UPDATE SET project_id = EXCLUDED.project_id, device_role = EXCLUDED.device_role, user_name = EXCLUDED.user_name, updated_at = now()`,
    [device_id, project ? project.id : null, device_role || '', user_name || '']
  );
  res.json({ success: true });
}));

router.get('/session-meta/:deviceId', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sm.device_id, sm.device_role, sm.user_name, sm.updated_at, p.project_code
     FROM session_meta sm LEFT JOIN projects p ON p.id = sm.project_id
     WHERE sm.device_id = $1`,
    [req.params.deviceId]
  );
  if (!rows[0]) return res.status(404).json({ success: false });
  res.json({ success: true, meta: rows[0] });
}));

module.exports = router;

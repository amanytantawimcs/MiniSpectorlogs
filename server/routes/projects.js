const express = require('express');
const pool = require('../db');
const {
  getProjectRowByCode, upsertOperationProject, upsertSimulationProject,
  buildOperationData, buildSimulationData, lockSimulation,
} = require('../lib/projectData');
const { requireAuth, assertCanWrite } = require('../lib/auth');

const router = express.Router();

// Without this, a rejected pool.query() inside a route with no try/catch
// becomes an unhandled rejection: process.on('unhandledRejection') logs it
// and keeps the server alive, but never sends a response — the request just
// hangs forever from the client's perspective. Wrapping every handler here
// guarantees a response (or a clean 500) no matter what the DB does.
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((e) => {
      console.error('[projects route]', e);
      if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
    });
  };
}

router.post('/', requireAuth, asyncRoute(async (req, res) => {
  const { project_code, mode, created_by, project_name, data } = req.body || {};
  if (!project_code) return res.status(400).json({ success: false, error: 'project_code required' });
  if (!(await assertCanWrite(req.userId, project_code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const row = mode === 'simulation'
      ? await upsertSimulationProject(client, { project_code, project_name, created_by, data })
      : await upsertOperationProject(client, { project_code, project_name, created_by, data });
    await client.query('COMMIT');
    res.json({ success: true, updated_at: row.updated_at });
  } catch (e) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally {
    if (client) client.release();
  }
}));

router.get('/', asyncRoute(async (req, res) => {
  const { mode } = req.query;
  if (mode === 'simulation') {
    // Includes approval fields so the Approvals tab can list/filter without a second round trip.
    const { rows } = await pool.query(
      `SELECT p.id, p.project_code, p.project_name, p.mode, p.created_by, p.updated_at, p.is_sim_locked,
              s.approval_status, s.approval_history
       FROM projects p
       LEFT JOIN simulations s ON s.project_id = p.id
       WHERE p.mode = 'simulation'
       ORDER BY p.updated_at DESC`
    );
    return res.json({ success: true, projects: rows });
  }
  const { rows } = mode
    ? await pool.query('SELECT id, project_code, project_name, mode, created_by, updated_at, is_sim_locked FROM projects WHERE mode = $1 ORDER BY updated_at DESC', [mode])
    : await pool.query('SELECT id, project_code, project_name, mode, created_by, updated_at, is_sim_locked FROM projects ORDER BY updated_at DESC');
  res.json({ success: true, projects: rows });
}));

// Same two privileged User IDs as the simulation approver gate
// (APPROVER_IDS in public/js/simulation/config.js) — keep both lists in sync.
const PRIVILEGED_USER_IDS = ['1162', '1774'];

// Cross-project directory for those two users: every project regardless of
// who created it, with its mode (operation/simulation) and creator — not to
// be confused with the mode-filtered GET '/' above, which every user hits
// from their own Simulation History tab.
router.get('/overview', asyncRoute(async (req, res) => {
  const { userId } = req.query;
  if (!PRIVILEGED_USER_IDS.includes(String(userId))) {
    return res.status(403).json({ success: false, error: 'Not authorized.' });
  }
  const { rows } = await pool.query(
    `SELECT project_code, project_name, mode, created_by, updated_at, is_sim_locked
     FROM projects ORDER BY updated_at DESC`
  );
  res.json({ success: true, projects: rows });
}));

router.get('/:code', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.status(404).json({ success: false, notFound: true, error: 'Not found' });
  const data = project.mode === 'simulation' ? await buildSimulationData(project) : await buildOperationData(project);
  res.json({
    success: true,
    project: {
      project_code: project.project_code,
      mode: project.mode,
      created_by: project.created_by,
      project_name: project.project_name,
      updated_at: project.updated_at,
      is_sim_locked: project.is_sim_locked,
      data,
    },
  });
}));

// Marks a simulation as pushed to operation — persists across reloads (projects.is_sim_locked),
// unlike the old app's client-only lock flag which reset on every page refresh.
router.post('/:code/lock-simulation', requireAuth, asyncRoute(async (req, res) => {
  if (!(await assertCanWrite(req.userId, req.params.code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.status(404).json({ success: false, error: 'Not found' });
  await lockSimulation(project.id);
  res.json({ success: true });
}));

router.get('/:code/members', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ success: true, members: [] });
  const { rows } = await pool.query('SELECT user_id, role, added_by, added_at FROM project_members WHERE project_id = $1', [project.id]);
  res.json({ success: true, members: rows });
}));

router.post('/:code/members', requireAuth, asyncRoute(async (req, res) => {
  if (!(await assertCanWrite(req.userId, req.params.code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }
  const { userId, role, addedBy } = req.body || {};
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by`,
    [project.id, userId, role || 'operator', addedBy || '']
  );
  res.json({ success: true });
}));

router.delete('/:code/members/:userId', requireAuth, asyncRoute(async (req, res) => {
  if (!(await assertCanWrite(req.userId, req.params.code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ success: true });
  await pool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [project.id, req.params.userId]);
  res.json({ success: true });
}));

router.get('/:code/access/:userId', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ allowed: true, role: 'operator' });
  const { rows: members } = await pool.query('SELECT user_id, role FROM project_members WHERE project_id = $1', [project.id]);
  if (members.length === 0) return res.json({ allowed: true, role: 'operator' });
  const member = members.find(m => String(m.user_id) === String(req.params.userId));
  res.json(member ? { allowed: true, role: member.role } : { allowed: false });
}));

module.exports = router;

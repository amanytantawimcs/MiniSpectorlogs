const express = require('express');
const pool = require('../db');
const {
  getProjectRowByCode, upsertOperationProject, upsertSimulationProject,
  buildOperationData, buildSimulationData, lockSimulation,
} = require('../lib/projectData');
const { requireAuth, assertCanWrite, PRIVILEGED_USER_IDS } = require('../lib/auth');
const { asyncRoute } = require('../lib/asyncRoute');

const router = express.Router();

router.post('/', requireAuth, asyncRoute(async (req, res) => {
  const { project_code, mode, created_by, project_name, data, createOnly } = req.body || {};
  if (!project_code) return res.status(400).json({ success: false, error: 'project_code required' });
  if (!(await assertCanWrite(req.userId, project_code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const row = mode === 'simulation'
      ? await upsertSimulationProject(client, { project_code, project_name, created_by, data, createOnly })
      : await upsertOperationProject(client, { project_code, project_name, created_by, data, createOnly });
    if (row.conflict) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false, codeTaken: true,
        error: `Project code "${project_code}" is already in use by another project.`,
      });
    }
    await client.query('COMMIT');
    res.json({ success: true, updated_at: row.updated_at });
  } catch (e) {
    if (client) await client.query('ROLLBACK');
    console.error('[projects route]', e);
    res.status(500).json({ success: false, error: 'Save failed. Please try again.' });
  } finally {
    if (client) client.release();
  }
}));

// Returns every project in the system regardless of who created it — same
// sensitivity as /overview below, so it gets the same privileged-user gate.
// (Nothing in the client actually calls this today; api.js's listProjects()
// has zero callers — kept for completeness, but locked down rather than left
// open just because it happens to be unused.)
router.get('/', requireAuth, asyncRoute(async (req, res) => {
  if (!PRIVILEGED_USER_IDS.includes(String(req.userId))) {
    return res.status(403).json({ success: false, error: 'Not authorized.' });
  }
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
  const updatedAt = await lockSimulation(project.id);
  res.json({ success: true, updated_at: updatedAt });
}));

router.get('/:code/members', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ success: true, members: [] });
  const { rows } = await pool.query(
    `SELECT pm.user_id, pm.role, pm.added_by, pm.added_at, u.name
     FROM project_members pm LEFT JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 ORDER BY pm.added_at`,
    [project.id]
  );
  res.json({ success: true, members: rows });
}));

router.post('/:code/members', requireAuth, asyncRoute(async (req, res) => {
  if (!(await assertCanWrite(req.userId, req.params.code))) {
    return res.status(403).json({ success: false, error: 'You have view-only access to this project.' });
  }
  const { userId, role, addedBy } = req.body || {};
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  // The moment a project gets its first team member, it flips from "open to
  // everyone" to "allowlist-only" (assertCanWrite). If the person doing the
  // adding isn't in that first batch themselves, they'd lock themselves out
  // of their own project on the very next save — so make sure they're on
  // the team too, as an operator, before the restriction takes effect.
  const { rows: existing } = await pool.query('SELECT user_id FROM project_members WHERE project_id = $1', [project.id]);
  if (existing.length === 0 && String(userId) !== String(req.userId)) {
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,'operator',$3)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [project.id, req.userId, addedBy || '']
    );
  }

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

// A configured team is an allowlist for *write* access, not for entry —
// anyone can still open the project, they just land as a viewer if they
// aren't on the team. { allowed: false } is reserved for a code that
// doesn't resolve to a project at all (handled above the members check).
router.get('/:code/access/:userId', asyncRoute(async (req, res) => {
  const project = await getProjectRowByCode(req.params.code);
  if (!project) return res.json({ allowed: true, role: 'operator' });
  const { rows: members } = await pool.query('SELECT user_id, role FROM project_members WHERE project_id = $1', [project.id]);
  if (members.length === 0) return res.json({ allowed: true, role: 'operator' }); // no team configured — open project
  const member = members.find(m => String(m.user_id) === String(req.params.userId));
  res.json({ allowed: true, role: member ? member.role : 'viewer' });
}));

module.exports = router;

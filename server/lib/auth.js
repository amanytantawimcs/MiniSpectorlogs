// Server-side write authorization. Previously every /api/projects write
// route trusted whatever the client sent with zero identity check — the
// "reviewer"/"viewer" read-only gate was enforced only in browser JS and
// could be bypassed with a raw API call. requireAuth() proves the caller is
// a logged-in user; assertCanWrite() then checks that user isn't a 'viewer'
// on this specific project (mirrors the client's existing checkProjectAccess
// semantics: no project_members rows at all = open project = allowed).

const pool = require('../db');
const { getSession } = require('./sessions');
const { getProjectRowByCode } = require('./projectData');

function requireAuth(req, res, next) {
  const token = (req.body && req.body.sessionToken) || req.get('X-Session-Token');
  const session = getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Not authenticated. Please log in again.' });
  req.userId = session.userId;
  next();
}

async function assertCanWrite(userId, projectCode) {
  const project = await getProjectRowByCode(projectCode);
  if (!project) return true; // new project — any logged-in user may create it
  const { rows } = await pool.query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [project.id, userId]);
  if (rows.length === 0) return true; // open project, no explicit membership restriction
  return rows[0].role !== 'viewer';
}

module.exports = { requireAuth, assertCanWrite };

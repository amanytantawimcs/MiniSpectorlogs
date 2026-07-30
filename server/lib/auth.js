// Server-side write authorization. Previously every /api/projects write
// route trusted whatever the client sent with zero identity check — the
// "reviewer"/"viewer" read-only gate was enforced only in browser JS and
// could be bypassed with a raw API call. requireAuth() proves the caller is
// a logged-in user; assertCanWrite() then checks that user isn't a 'viewer'
// on this specific project (mirrors the client's existing checkProjectAccess
// semantics: no project_members rows at all = open project = allowed).
//
// Once a project has a configured team (Project Team tab), membership is
// the allowlist: anyone not on it is implicitly a viewer, not implicitly an
// operator. Querying only "this user's row" can't tell those two cases
// apart — a project with 3 operators and this caller absent would look
// identical to a wide-open project (both return zero rows for this user).
// So this pulls every member row for the project and checks emptiness
// against the whole set, not just the caller's row.

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

function requireAdminAuth(req, res, next) {
  const token = req.get('X-Admin-Session-Token');
  const session = getSession(token);
  if (!session || session.type !== 'admin') return res.status(401).json({ success: false, error: 'Admin authentication required.' });
  req.adminUsername = session.userId;
  next();
}

async function assertCanWrite(userId, projectCode) {
  const project = await getProjectRowByCode(projectCode);
  if (!project) return true; // new project — any logged-in user may create it
  const { rows } = await pool.query('SELECT user_id, role FROM project_members WHERE project_id = $1', [project.id]);
  if (rows.length === 0) return true; // no team configured yet — open project
  const mine = rows.find(r => String(r.user_id) === String(userId));
  return !!mine && mine.role !== 'viewer'; // team configured: unlisted users are implicitly viewers
}

module.exports = { requireAuth, requireAdminAuth, assertCanWrite };

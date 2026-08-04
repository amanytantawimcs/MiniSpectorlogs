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
const { asyncRoute } = require('./asyncRoute');

// Same two privileged User IDs as the simulation approver gate (APPROVER_IDS
// in public/js/simulation/config.js) and the /overview privileged-user gate
// in routes/projects.js — keep all three lists in sync.
const PRIVILEGED_USER_IDS = ['1162', '1774'];

function requireAuth(req, res, next) {
  const token = (req.body && req.body.sessionToken) || req.get('X-Session-Token');
  const session = getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Not authenticated. Please log in again.' });
  req.userId = session.userId;
  next();
}

// Accepts a real admin session, a privileged user's own regular session, or
// any user whose users.is_admin flag has been set from the Users tab — the
// "Admin Management" sidebar button lets any of these open the admin panel
// without a separate admin login, so the routes it calls must recognize an
// ordinary session token too, not just X-Admin-Session-Token. Wrapped in
// asyncRoute since the is_admin lookup makes this middleware async — an
// unwrapped async middleware that rejects would otherwise become an
// unhandled rejection instead of a response.
const requireAdminAuth = asyncRoute(async function requireAdminAuth(req, res, next) {
  const adminToken = req.get('X-Admin-Session-Token');
  const adminSession = getSession(adminToken);
  if (adminSession && adminSession.type === 'admin') {
    req.adminUsername = adminSession.userId;
    return next();
  }
  const userToken = (req.body && req.body.sessionToken) || req.get('X-Session-Token');
  const userSession = getSession(userToken);
  if (userSession && userSession.type === 'user') {
    if (PRIVILEGED_USER_IDS.includes(String(userSession.userId))) {
      req.adminUsername = userSession.userId;
      return next();
    }
    const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userSession.userId]);
    if (rows[0] && rows[0].is_admin) {
      req.adminUsername = userSession.userId;
      return next();
    }
  }
  return res.status(401).json({ success: false, error: 'Admin authentication required.' });
});

// knownProject lets a caller that already fetched the project row (e.g. the
// POST / route, which needs it to resolve project_code's on-file casing
// before it can even call this) pass it straight through instead of paying
// for a second identical getProjectRowByCode query.
async function assertCanWrite(userId, projectCode, knownProject) {
  const project = knownProject !== undefined ? knownProject : await getProjectRowByCode(projectCode);
  if (!project) return true; // new project — any logged-in user may create it
  const { rows } = await pool.query('SELECT user_id, role FROM project_members WHERE project_id = $1', [project.id]);
  if (rows.length === 0) return true; // no team configured yet — open project
  const mine = rows.find(r => String(r.user_id) === String(userId));
  return !!mine && mine.role !== 'viewer'; // team configured: unlisted users are implicitly viewers
}

module.exports = { requireAuth, requireAdminAuth, assertCanWrite, PRIVILEGED_USER_IDS };

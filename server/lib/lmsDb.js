// Read/write link to the separate LMS/training app's Postgres database
// ("SkillStream"), used to unify login credentials between the two apps —
// whichever app a user sets a real password/passcode in first becomes the
// one credential valid in both. Matched by MiniSpector users.id == LMS
// users.employee_id.
//
// SkillStream provisions every account with a default password up front
// (password_changed starts false) and flips password_changed to true once
// the person actually chooses their own — password_hash itself is NEVER
// null, so password_changed is the only reliable signal for "this is a
// real, user-chosen credential" vs. an unclaimed default nobody actually
// knows. Every check here keys off password_changed, not just presence of
// a hash.
//
// All lookups fail OPEN (env unset, network error, employee not found in
// LMS -> treat as "no LMS credential", let MiniSpector's own passcode flow
// proceed) since this is a supplementary bridge, not a hard dependency —
// an LMS outage must never lock MiniSpector out of its own login.

const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = process.env.LMS_DATABASE_URL
  ? new Pool({
      connectionString: process.env.LMS_DATABASE_URL,
      ssl: process.env.LMS_DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      max: 3,
    })
  : null;

async function getLmsUser(employeeId) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT is_active, password_hash, password_changed, email, department, title, manager_name, join_date, role
       FROM users WHERE employee_id = $1`,
      [employeeId]
    );
    return rows[0] || null;
  } catch (e) {
    console.warn('[lmsDb] lookup failed, treating as no LMS record:', e.message);
    return null;
  }
}

// false only when LMS explicitly has this employee marked inactive.
async function isActiveInLms(employeeId) {
  const u = await getLmsUser(employeeId);
  return !u || u.is_active !== false;
}

function hasRealLmsPassword(lmsUser) {
  return !!(lmsUser && lmsUser.password_changed);
}

// Verifies against LMS's password only if it's a real, user-chosen one —
// never authenticates against an unclaimed default password.
async function verifyLmsPassword(employeeId, plaintext) {
  const u = await getLmsUser(employeeId);
  if (!hasRealLmsPassword(u)) return false;
  try {
    return await bcrypt.compare(plaintext, u.password_hash);
  } catch (e) {
    console.warn('[lmsDb] bcrypt compare failed:', e.message);
    return false;
  }
}

// Called after a successful MiniSpector passcode verification/set. If this
// employee has an LMS row that still holds the unclaimed default password,
// pushes the just-used MiniSpector passcode into it as their real
// SkillStream password too — this is how "MiniSpector first" propagates.
// Best-effort: a write failure here must not fail the MiniSpector login
// that triggered it.
async function mirrorToLmsIfUnclaimed(employeeId, plaintext) {
  if (!pool) return;
  const u = await getLmsUser(employeeId);
  if (!u || u.password_changed) return;
  try {
    const hash = await bcrypt.hash(plaintext, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed = true, updated_at = now() WHERE employee_id = $2',
      [hash, employeeId]
    );
  } catch (e) {
    console.warn('[lmsDb] mirror-to-LMS write failed:', e.message);
  }
}

module.exports = { getLmsUser, isActiveInLms, hasRealLmsPassword, verifyLmsPassword, mirrorToLmsIfUnclaimed };

// Read-only link to the separate LMS/training app's Postgres database, used
// only to check whether a shared employee (matched by users.id == LMS
// users.employee_id) has been deactivated there. MiniSpector's own passcode
// login stays fully independent — this is a supplementary signal, not a
// credential source, so any lookup failure (env var unset, network error,
// employee not found in LMS) must fail OPEN (treat as "unknown, allow") to
// avoid an unrelated outage taking down MiniSpector logins.

const { Pool, types } = require('pg');

types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = process.env.LMS_DATABASE_URL
  ? new Pool({
      connectionString: process.env.LMS_DATABASE_URL,
      ssl: process.env.LMS_DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      max: 3,
    })
  : null;

// Returns false only when LMS explicitly has this employee marked inactive.
// Returns true for "no LMS link configured", "employee not in LMS", or any
// query error — none of those are grounds to lock someone out of MiniSpector.
async function isActiveInLms(employeeId) {
  if (!pool) return true;
  try {
    const { rows } = await pool.query('SELECT is_active FROM users WHERE employee_id = $1', [employeeId]);
    if (!rows[0]) return true;
    return rows[0].is_active !== false;
  } catch (e) {
    console.warn('[lmsDb] status check failed, allowing login:', e.message);
    return true;
  }
}

module.exports = { isActiveInLms };

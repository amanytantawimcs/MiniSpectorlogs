// Login activity for the admin panel. Uses its own CREATE TABLE IF NOT
// EXISTS at startup rather than relying on server/migrate.js — that script
// runs the whole of db/schema.sql as one implicit multi-statement query, so
// on an already-provisioned database the very first CREATE TABLE (users)
// fails as "already exists" and aborts the entire batch before ever reaching
// a newly-appended table. This runs standalone and is safe to run on every
// boot. db/schema.sql is still updated too, so a brand-new deploy from
// scratch creates this table the normal way.

async function ensureLoginLogTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_log (
      id           BIGSERIAL PRIMARY KEY,
      user_id      TEXT,
      user_name    TEXT,
      role         TEXT NOT NULL DEFAULT 'user',
      logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_log_logged_in_at ON login_log(logged_in_at DESC)`);
}

// Never lets a logging failure block an actual login — this is a nice-to-have
// audit trail, not part of the auth path itself.
async function recordLogin(pool, { userId, userName, role }) {
  try {
    await pool.query(
      'INSERT INTO login_log (user_id, user_name, role) VALUES ($1,$2,$3)',
      [userId || null, userName || null, role || 'user']
    );
  } catch (e) {
    console.error('[loginLog] failed to record login:', e.message);
  }
}

async function getRecentLogins(pool, limit = 100) {
  const { rows } = await pool.query(
    'SELECT user_id, user_name, role, logged_in_at FROM login_log ORDER BY logged_in_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

module.exports = { ensureLoginLogTable, recordLogin, getRecentLogins };

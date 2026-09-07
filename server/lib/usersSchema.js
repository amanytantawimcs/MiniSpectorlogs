// Adds is_admin to a users table that predates it — same idempotent
// "ensure on every boot" pattern as ensureLoginLogTable (see loginLog.js)
// and for the same reason: migrate.js runs the whole of db/schema.sql as
// one implicit multi-statement query, so on an already-provisioned database
// the very first CREATE TABLE fails as "already exists" and aborts before
// ever reaching an appended ALTER. This runs standalone and is safe on
// every boot. db/schema.sql is still updated too, so a brand-new deploy
// from scratch creates the column the normal way.

async function ensureUsersAdminColumn(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
}

// Same idempotent pattern, for the LMS/SkillStream identity fields added
// alongside the passcode-unification work — see db/schema.sql's comment on
// the users table for what these columns are and aren't (one-time backfill,
// not live-synced).
async function ensureUsersLmsColumns(pool) {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS department TEXT,
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS manager_name TEXT,
      ADD COLUMN IF NOT EXISTS join_date DATE,
      ADD COLUMN IF NOT EXISTS lms_role TEXT
  `);
}

module.exports = { ensureUsersAdminColumn, ensureUsersLmsColumns };

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

module.exports = { ensureUsersAdminColumn };

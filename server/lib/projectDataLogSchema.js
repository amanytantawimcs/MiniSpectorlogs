// Adds project_data_log to a projects table that predates it — same
// idempotent "ensure on every boot" pattern as ensureUsersAdminColumn (see
// usersSchema.js). db/schema.sql is still updated too, so a brand-new
// deploy from scratch creates the column the normal way.

async function ensureProjectDataLogColumn(pool) {
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_data_log JSONB`);
}

module.exports = { ensureProjectDataLogColumn };

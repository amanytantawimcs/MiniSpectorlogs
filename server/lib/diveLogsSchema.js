// Adds the Interior Temp/Humidity/Rain/Objective columns to a dive_logs
// table that predates them — same idempotent "ensure on every boot" pattern
// as ensureUsersAdminColumn (see usersSchema.js). db/schema.sql is still
// updated too, so a brand-new deploy from scratch creates these the normal
// way.

async function ensureDiveLogsColumns(pool) {
  await pool.query(`
    ALTER TABLE dive_logs
      ADD COLUMN IF NOT EXISTS int_temp TEXT,
      ADD COLUMN IF NOT EXISTS int_humidity TEXT,
      ADD COLUMN IF NOT EXISTS rain TEXT,
      ADD COLUMN IF NOT EXISTS objective TEXT
  `);
}

module.exports = { ensureDiveLogsColumns };

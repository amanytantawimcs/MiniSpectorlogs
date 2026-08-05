// Adds the issue_reports table to a database that predates it — same
// idempotent "ensure on every boot" pattern as ensureLoginLogTable (see
// loginLog.js) and for the same reason: migrate.js runs the whole of
// db/schema.sql as one implicit multi-statement query, so on an
// already-provisioned database the very first CREATE TABLE fails as
// "already exists" and aborts before ever reaching a newly-appended table.
// This runs standalone and is safe on every boot. db/schema.sql is still
// updated too, so a brand-new deploy from scratch creates it the normal way.

async function ensureIssueReportsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS issue_reports (
      id                  BIGSERIAL PRIMARY KEY,
      project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      dive_no             TEXT,
      description         TEXT,
      cause               TEXT,
      lim_reading         TEXT,
      action_taken        TEXT,
      contacted_by        TEXT,
      malf_component      TEXT,
      replaced_component  TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_issue_reports_project ON issue_reports(project_id)`);
}

module.exports = { ensureIssueReportsTable };

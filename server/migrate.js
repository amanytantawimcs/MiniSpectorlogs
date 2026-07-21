const fs = require('fs');
const path = require('path');
const pool = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[migrate] schema.sql applied successfully.');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

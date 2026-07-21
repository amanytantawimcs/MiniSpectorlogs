const { Pool, types } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — queries will fail until it is configured.');
}

// Return DATE columns as raw 'YYYY-MM-DD' strings instead of JS Date objects.
// pg's default DATE parser builds a Date at local-timezone midnight, and
// converting that back to ISO can shift the date across the UTC day
// boundary depending on server timezone. The app only wants the plain string.
types.setTypeParser(types.builtins.DATE, (val) => val);

// Railway's internal/private Postgres URL doesn't need SSL; the public
// proxy URL does. Set DB_SSL=false when using the internal URL.
const useSSL = process.env.DB_SSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

module.exports = pool;

// Builds a real Express app wired up with the actual route files (same ones
// server/index.js mounts), but with the shared `pool` singleton's .query()/
// .connect() swapped for a scriptable fake — so route-level auth/rate-limit/
// validation logic runs for real, without needing a live Postgres connection.
//
// This works because server/db.js does `module.exports = pool` (a singleton
// object), and every route file does `const pool = require('../db')` — under
// Node's CommonJS module cache they all hold the exact same object reference.
// Mutating that object's methods here therefore reaches every route file
// that already required it, in whatever order.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fake:fake@localhost:5432/fake';

const express = require('express');
const http = require('node:http');
const pool = require('../../server/db');

function installFakePool() {
  const calls = [];
  const responses = [];
  pool.query = async (text, params) => {
    calls.push({ text, params });
    const next = responses.shift();
    if (next === undefined) return { rows: [] };
    if (next instanceof Error) throw next;
    return next;
  };
  pool.connect = async () => ({
    query: (text, params) => pool.query(text, params),
    release: () => {},
  });
  return {
    calls,
    respondWith: (...items) => responses.push(...items),
    reset: () => { calls.length = 0; responses.length = 0; },
  };
}

const fakePool = installFakePool();

// Mirrors server/index.js's router mounting, minus the HTTPS-redirect
// middleware (irrelevant over plain HTTP loopback in tests) and minus the
// static file serving (nothing under test needs the frontend bundle).
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/users', require('../../server/routes/users'));
  app.use('/api/admin', require('../../server/routes/admin'));
  app.use('/api/projects', require('../../server/routes/projects'));
  app.use('/api', require('../../server/routes/sync'));
  return app;
}

async function startTestServer() {
  const app = buildApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startTestServer, fakePool };

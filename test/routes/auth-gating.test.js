// Integration-style tests: real Express routers, real HTTP requests over an
// ephemeral loopback port, with only the database swapped for a scriptable
// fake (see helpers/testApp.js). These exercise the actual auth/rate-limit
// middleware chain end to end, not just the isolated unit under test.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, fakePool } = require('../helpers/testApp');
const { createSession } = require('../../server/lib/sessions');

let baseUrl;
let closeServer;

before(async () => {
  const server = await startTestServer();
  baseUrl = server.baseUrl;
  closeServer = server.close;
});

after(async () => {
  await closeServer();
});

beforeEach(() => {
  fakePool.reset();
});

// ---------------------------------------------------------------------------
// Regression test for this session's fix: reset-passcode used to be callable
// by anyone who knew a User ID, with zero identity check. It must now be
// admin-only.
// ---------------------------------------------------------------------------
test('POST /api/users/:id/reset-passcode is rejected with no admin token', async () => {
  const res = await fetch(`${baseUrl}/api/users/105/reset-passcode`, { method: 'POST' });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(fakePool.calls.length, 0, 'must reject before ever touching the database');
});

test('POST /api/users/:id/reset-passcode is rejected with a regular user token (not admin)', async () => {
  const userToken = createSession('999', 'user');
  const res = await fetch(`${baseUrl}/api/users/105/reset-passcode`, {
    method: 'POST',
    headers: { 'X-Admin-Session-Token': userToken },
  });
  assert.equal(res.status, 401, 'a non-admin session must not satisfy the admin gate');
});

test('POST /api/users/:id/reset-passcode succeeds with a valid admin token', async () => {
  const adminToken = createSession('admin1', 'admin');
  fakePool.respondWith({ rows: [], rowCount: 1 });
  const res = await fetch(`${baseUrl}/api/users/105/reset-passcode`, {
    method: 'POST',
    headers: { 'X-Admin-Session-Token': adminToken },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.match(fakePool.calls[0].text, /UPDATE users SET passcode_hash = NULL/);
});

// ---------------------------------------------------------------------------
// The admin-only user directory — previously gated by credentials resent as
// URL query params on every call; now a session token.
// ---------------------------------------------------------------------------
test('GET /api/users (admin directory) is rejected with no admin token', async () => {
  const res = await fetch(`${baseUrl}/api/users`);
  assert.equal(res.status, 401);
});

test('GET /api/users (admin directory) succeeds with a valid admin token', async () => {
  const adminToken = createSession('admin1', 'admin');
  fakePool.respondWith({ rows: [{ id: '105', name: 'Test Engineer', role: 'engineer' }] });
  const res = await fetch(`${baseUrl}/api/users`, {
    headers: { 'X-Admin-Session-Token': adminToken },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.users.length, 1);
  assert.equal(body.users[0].id, '105');
});

// ---------------------------------------------------------------------------
// Project writes require a real logged-in user session, and are further
// blocked for a user with an explicit 'viewer' role on that project.
// ---------------------------------------------------------------------------
test('POST /api/projects (write) is rejected with no user session', async () => {
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_code: 'PRJ-1', mode: 'operation', data: {} }),
  });
  assert.equal(res.status, 401);
  assert.equal(fakePool.calls.length, 0, 'must reject before ever touching the database');
});

test('POST /api/projects (write) is rejected for a user with viewer role on that project', async () => {
  const userToken = createSession('105', 'user');
  fakePool.respondWith(
    { rows: [{ id: 'proj-uuid-1' }] },   // getProjectRowByCode
    { rows: [{ role: 'viewer' }] },      // project_members lookup for this user
  );
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': userToken },
    body: JSON.stringify({ project_code: 'PRJ-1', mode: 'operation', data: {} }),
  });
  assert.equal(res.status, 403);
});

test('POST /api/projects/:code/lock-simulation is rejected with no session', async () => {
  const res = await fetch(`${baseUrl}/api/projects/PRJ-1/lock-simulation`, { method: 'POST' });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// GET /api/projects/:code is intentionally public (project-code-as-access,
// used by the Reviewer login flow) — should NOT require any session.
// ---------------------------------------------------------------------------
test('GET /api/projects/:code does not require authentication', async () => {
  fakePool.respondWith({ rows: [] }); // getProjectRowByCode finds nothing
  const res = await fetch(`${baseUrl}/api/projects/UNKNOWN-CODE`);
  assert.equal(res.status, 404, 'unauthenticated but reaches real route logic, not a 401');
  const body = await res.json();
  assert.equal(body.notFound, true);
});

// ---------------------------------------------------------------------------
// Server errors must not leak raw DB error text to the client.
// ---------------------------------------------------------------------------
test('a DB failure returns a generic error, not the raw error message', async () => {
  const adminToken = createSession('admin1', 'admin');
  fakePool.respondWith(new Error('relation "users" does not exist'));
  const res = await fetch(`${baseUrl}/api/users`, {
    headers: { 'X-Admin-Session-Token': adminToken },
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.doesNotMatch(body.error, /relation "users" does not exist/);
});

// ---------------------------------------------------------------------------
// Login rate limiting, exercised through real HTTP requests (confirms the
// full Express + trust-proxy + middleware chain, not just the bare function).
// Kept as the only test hitting this exact route+IP bucket in this file.
// ---------------------------------------------------------------------------
test('POST /api/admin/login is rate-limited after repeated attempts', async () => {
  const attempt = () => fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nope', password: 'nope' }),
  });

  const results = [];
  for (let i = 0; i < 9; i++) {
    fakePool.respondWith({ rows: [] });
    results.push((await attempt()).status);
  }
  assert.ok(results.slice(0, 8).every((s) => s === 401), 'first 8 attempts should be real auth failures, not rate-limited');
  assert.equal(results[8], 429, '9th attempt within the window should be rate-limited');
});

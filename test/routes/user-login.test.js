const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, fakePool } = require('../helpers/testApp');
const { hashPasscode } = require('../../server/lib/passcode');

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

test('POST /api/users/:id/verify-passcode succeeds with the correct passcode and returns a session token', async () => {
  const { hash, salt } = hashPasscode('4821');
  fakePool.respondWith({ rows: [{ name: 'Test Engineer', passcode_hash: hash, passcode_salt: salt }] }); // SELECT
  fakePool.respondWith({ rows: [] }); // recordLogin insert (fire-and-forget, but still consumes a queued response)

  const res = await fetch(`${baseUrl}/api/users/105/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: '4821' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.token, 'a successful login should mint a session token');
});

test('POST /api/users/:id/verify-passcode rejects the wrong passcode', async () => {
  const { hash, salt } = hashPasscode('4821');
  fakePool.respondWith({ rows: [{ name: 'Test Engineer', passcode_hash: hash, passcode_salt: salt }] });

  const res = await fetch(`${baseUrl}/api/users/105/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: '0000' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('POST /api/users/:id/verify-passcode returns 404 for an unknown user', async () => {
  fakePool.respondWith({ rows: [] });
  const res = await fetch(`${baseUrl}/api/users/999999/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: '1234' }),
  });
  assert.equal(res.status, 404);
});

test('POST /api/users/:id/passcode (first-time set) rejects a non-numeric or too-short passcode without touching the DB', async () => {
  const res = await fetch(`${baseUrl}/api/users/105/passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'abc' }),
  });
  assert.equal(res.status, 400);
  assert.equal(fakePool.calls.length, 0, 'format validation should short-circuit before any query');
});

test('POST /api/users/:id/passcode (first-time set) rejects if a passcode already exists for that user', async () => {
  fakePool.respondWith({ rows: [{ passcode_hash: 'already-set' }] });
  const res = await fetch(`${baseUrl}/api/users/105/passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: '1234' }),
  });
  assert.equal(res.status, 409, 'must not allow silently overwriting an existing passcode');
});

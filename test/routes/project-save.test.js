// Regression tests for the stale-save check (POST /api/projects) and its
// same-device exemption — see that route's comment for the full story: one
// browser tab saves through more than one path close together (the
// simulation autosave and the Operations-crossing sync), and without the
// exemption, whichever lands second was wrongly refused as "changed on
// another device" even though only this device had touched the project.

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

// A privileged test user, so assertCanWrite()'s accessFor() short-circuits
// on the PRIVILEGED_USER_IDS check without needing a project_members query —
// keeps these tests focused on the staleness check alone.
const PRIVILEGED_USER_ID = '1162';

function existingProjectRow({ lastSavedDevice }) {
  return {
    rows: [{
      id: 'proj-1', project_code: 'J-TEST', mode: 'operation',
      updated_at: new Date('2026-10-07T10:00:00.000Z'),
      last_saved_device: lastSavedDevice,
    }],
  };
}

test('a stale base_updated_at from a different device is refused (409)', async () => {
  const token = createSession(PRIVILEGED_USER_ID, 'user');
  fakePool.respondWith(existingProjectRow({ lastSavedDevice: 'device-B' }));
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_code: 'J-TEST', mode: 'operation', device_id: 'device-A',
      base_updated_at: '2026-10-07T09:00:00.000Z', // older than the row's updated_at
      data: {},
    }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.stale, true);
  assert.equal(fakePool.calls.length, 1, 'must refuse before making any write query');
});

test('a stale base_updated_at from the SAME device is accepted (the self-race fix)', async () => {
  const token = createSession(PRIVILEGED_USER_ID, 'user');
  fakePool.respondWith(
    existingProjectRow({ lastSavedDevice: 'device-A' }), // 1: getProjectRowByCode
    { rows: [] },                                        // 2: BEGIN
    { rows: [{ id: 'proj-1', updated_at: new Date('2026-10-07T10:05:00.000Z') }] }, // 3: the upsert's RETURNING
  );
  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_code: 'J-TEST', mode: 'operation', device_id: 'device-A',
      base_updated_at: '2026-10-07T09:00:00.000Z', // same stale value as the test above
      data: {},
    }),
  });
  assert.equal(res.status, 200, 'the same device\'s own earlier write must not block this one');
  const body = await res.json();
  assert.equal(body.success, true);
});

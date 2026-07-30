const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyAdminCredentials, hashAdminPassword } = require('../../server/lib/adminAuth');
const { FakePool } = require('../helpers/fakePool');

test('hashAdminPassword output verifies via the new salted format', async () => {
  const pool = new FakePool();
  const stored = hashAdminPassword('correct-horse-battery-staple');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/, 'stored value should be "salt:hash", not a bare hash');

  pool.respondWith({ rows: [{ password_hash: stored }] });
  const ok = await verifyAdminCredentials(pool, 'admin1', 'correct-horse-battery-staple');
  assert.equal(ok, true);
});

test('verifyAdminCredentials rejects the wrong password', async () => {
  const pool = new FakePool();
  const stored = hashAdminPassword('right-password');
  pool.respondWith({ rows: [{ password_hash: stored }] });
  const ok = await verifyAdminCredentials(pool, 'admin1', 'wrong-password');
  assert.equal(ok, false);
});

test('verifyAdminCredentials rejects an unknown username', async () => {
  const pool = new FakePool();
  pool.respondWith({ rows: [] });
  const ok = await verifyAdminCredentials(pool, 'nobody', 'whatever');
  assert.equal(ok, false);
});

test('verifyAdminCredentials rejects missing username or password without touching the DB', async () => {
  const pool = new FakePool();
  assert.equal(await verifyAdminCredentials(pool, '', 'pw'), false);
  assert.equal(await verifyAdminCredentials(pool, 'user', ''), false);
  assert.equal(pool.calls.length, 0, 'should short-circuit before any query');
});

test('legacy unsalted SHA-256 accounts still verify, then get upgraded to the salted format', async () => {
  const pool = new FakePool();
  const legacyHash = crypto.createHash('sha256').update('old-password').digest('hex');
  assert.doesNotMatch(legacyHash, /:/, 'sanity check: legacy format has no colon');

  pool.respondWith({ rows: [{ password_hash: legacyHash }] }); // SELECT
  pool.respondWith({ rows: [] }); // UPDATE

  const ok = await verifyAdminCredentials(pool, 'legacy-admin', 'old-password');
  assert.equal(ok, true, 'legacy account should still authenticate on the first login after the fix');

  const updateCall = pool.calls.find(c => c.text.startsWith('UPDATE admins'));
  assert.ok(updateCall, 'should have issued an UPDATE to migrate the stored hash');
  assert.match(updateCall.params[0], /^[0-9a-f]{32}:[0-9a-f]{128}$/, 'upgraded value should be in the new salted format');
});

test('legacy unsalted accounts reject a wrong password without triggering an upgrade', async () => {
  const pool = new FakePool();
  const legacyHash = crypto.createHash('sha256').update('old-password').digest('hex');
  pool.respondWith({ rows: [{ password_hash: legacyHash }] });

  const ok = await verifyAdminCredentials(pool, 'legacy-admin', 'wrong-guess');
  assert.equal(ok, false);
  assert.equal(pool.calls.length, 1, 'a failed attempt should not issue the UPDATE (only one query total)');
});

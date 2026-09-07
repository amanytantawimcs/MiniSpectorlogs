const { test } = require('node:test');
const assert = require('node:assert/strict');

// LMS_DATABASE_URL is intentionally unset in the test environment (see
// test/helpers/testApp.js) — lmsDb.js reads it at module load to decide
// whether to open a pool at all, so requiring it here exercises the same
// "no LMS link configured" path production hits when the env var is unset.
// That's exactly the fail-open contract these tests check.
const { hasRealLmsPassword, isActiveInLms, verifyLmsPassword, mirrorToLmsIfUnclaimed, getLmsUser } = require('../../server/lib/lmsDb');

test('hasRealLmsPassword is true only when password_changed is true', () => {
  assert.equal(hasRealLmsPassword({ password_changed: true }), true);
  assert.equal(hasRealLmsPassword({ password_changed: false }), false);
  assert.equal(hasRealLmsPassword(null), false, 'no LMS row at all');
});

test('with no LMS_DATABASE_URL configured, every check fails open', async () => {
  assert.equal(await getLmsUser('1162'), null);
  assert.equal(await isActiveInLms('1162'), true, 'unknown status must not block login');
  assert.equal(await verifyLmsPassword('1162', 'anything'), false, 'nothing to verify against');
  await assert.doesNotReject(mirrorToLmsIfUnclaimed('1162', 'anything'), 'must no-op quietly, not throw');
});

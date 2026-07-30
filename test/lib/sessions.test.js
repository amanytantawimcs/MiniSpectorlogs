const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, getSession } = require('../../server/lib/sessions');

test('createSession returns a token that getSession resolves back to the same identity', () => {
  const token = createSession('105', 'user');
  const session = getSession(token);
  assert.ok(session, 'expected a session for a freshly minted token');
  assert.equal(session.userId, '105');
  assert.equal(session.type, 'user');
});

test('createSession coerces userId to a string (so "105" === 105 downstream)', () => {
  const token = createSession(105, 'user');
  const session = getSession(token);
  assert.equal(session.userId, '105');
  assert.equal(typeof session.userId, 'string');
});

test('an admin session is type "admin", distinct from a regular user session', () => {
  const token = createSession('admin1', 'admin');
  const session = getSession(token);
  assert.equal(session.type, 'admin');
});

test('getSession returns null for an unknown or empty token', () => {
  assert.equal(getSession('not-a-real-token'), null);
  assert.equal(getSession(''), null);
  assert.equal(getSession(undefined), null);
});

test('two calls to createSession for the same user produce different tokens', () => {
  const a = createSession('105', 'user');
  const b = createSession('105', 'user');
  assert.notEqual(a, b);
});

test('a session expires after its 12h TTL', (t) => {
  mock.timers.enable({ apis: ['Date'] });
  t.after(() => mock.timers.reset());

  const token = createSession('105', 'user');
  assert.ok(getSession(token), 'session should be valid immediately after creation');

  mock.timers.tick(12 * 60 * 60 * 1000 + 1000); // just past the 12h TTL
  assert.equal(getSession(token), null, 'session should be expired past its TTL');
});

test('a session just under the TTL is still valid', (t) => {
  mock.timers.enable({ apis: ['Date'] });
  t.after(() => mock.timers.reset());

  const token = createSession('105', 'user');
  mock.timers.tick(12 * 60 * 60 * 1000 - 1000); // just under the 12h TTL
  assert.ok(getSession(token), 'session should still be valid just under its TTL');
});

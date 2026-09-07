const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPasscode, verifyPasscode, PASSCODE_FORMAT } = require('../../server/lib/passcode');

test('hashPasscode produces a different salt every call', () => {
  const a = hashPasscode('1234');
  const b = hashPasscode('1234');
  assert.notEqual(a.salt, b.salt, 'same passcode should still get a unique salt');
  assert.notEqual(a.hash, b.hash, 'different salts should produce different hashes even for the same passcode');
});

test('verifyPasscode accepts the correct passcode', () => {
  const { hash, salt } = hashPasscode('4821');
  assert.equal(verifyPasscode('4821', hash, salt), true);
});

test('verifyPasscode rejects a wrong passcode', () => {
  const { hash, salt } = hashPasscode('4821');
  assert.equal(verifyPasscode('9999', hash, salt), false);
});

test('verifyPasscode rejects when hash/salt are missing (no passcode set yet)', () => {
  assert.equal(verifyPasscode('1234', null, null), false);
  assert.equal(verifyPasscode('1234', undefined, undefined), false);
});

test('PASSCODE_FORMAT accepts 4-72 character strings, numeric or not', () => {
  assert.equal(PASSCODE_FORMAT.test('1234'), true);
  assert.equal(PASSCODE_FORMAT.test('123456'), true);
  assert.equal(PASSCODE_FORMAT.test('1'.repeat(72)), true);
  assert.equal(PASSCODE_FORMAT.test('Correct-Horse-9'), true, 'a SkillStream-style password should also be valid');
});

test('PASSCODE_FORMAT rejects too-short or too-long input', () => {
  assert.equal(PASSCODE_FORMAT.test('123'), false, 'below 4 characters');
  assert.equal(PASSCODE_FORMAT.test('1'.repeat(73)), false, 'above 72 characters');
  assert.equal(PASSCODE_FORMAT.test(''), false, 'empty string');
});

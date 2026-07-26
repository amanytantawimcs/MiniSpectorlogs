const crypto = require('crypto');

function hashPasscode(passcode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPasscode(passcode, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = crypto.scryptSync(passcode, salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// No fixed upper digit-count from the product side (4, 5, 6, 7... all valid) —
// 32 is just a sane hard ceiling so someone can't submit a multi-KB string as a "passcode".
const PASSCODE_FORMAT = /^\d{4,32}$/;

module.exports = { hashPasscode, verifyPasscode, PASSCODE_FORMAT };

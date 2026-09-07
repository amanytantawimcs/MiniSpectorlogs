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

// Was digits-only; opened up to any characters so a credential set in
// MiniSpector can also serve as a SkillStream password (and vice versa —
// see server/lib/lmsDb.js) instead of the two apps requiring different
// formats. 72 mirrors bcrypt's effective input cap (it silently ignores
// bytes beyond that), which matters once this value gets mirrored there.
const PASSCODE_FORMAT = /^.{4,72}$/;

module.exports = { hashPasscode, verifyPasscode, PASSCODE_FORMAT };

// Was: the browser computed SHA-256(password) itself and the server just
// compared that value against what's stored — meaning the "hash" WAS the
// credential (anyone who captured it, e.g. off a URL query string, could log
// in forever without ever knowing the real password) and, since it was
// unsalted, a leaked admins table would crack against a rainbow table in
// seconds. Now: the client sends the raw password over HTTPS (like the
// passcode flow already did correctly), and it's salted+hashed here with
// scrypt, same as server/lib/passcode.js.
//
// `password_hash` stores "salt:hash". Accounts created before this fix are
// stored as a bare unsalted SHA-256 hex digest (64 chars, no colon) — the
// legacy branch below verifies those the one time by reproducing that same
// transform, then immediately upgrades the stored value to the new salted
// format so the weak path is never used again for that account.

const crypto = require('crypto');

function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyAgainstStored(password, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [salt, hash] = stored.split(':');
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Legacy unsalted format.
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  const a = Buffer.from(legacy, 'hex');
  const b = Buffer.from(stored, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function verifyAdminCredentials(pool, username, password) {
  if (!username || !password) return false;
  const { rows } = await pool.query('SELECT password_hash FROM admins WHERE username = $1', [username]);
  if (!rows[0]) return false;
  const stored = rows[0].password_hash;
  const ok = verifyAgainstStored(password, stored);
  if (ok && !stored.includes(':')) {
    await pool.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [hashAdminPassword(password), username]);
  }
  return ok;
}

module.exports = { verifyAdminCredentials, hashAdminPassword };

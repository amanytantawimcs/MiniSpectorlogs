// In-memory session tokens minted at login (User ID + passcode, or admin
// username + password). No DB table needed — sessions just prove "this
// request really came from a logged-in identity" so write routes can check
// permissions instead of trusting whatever the client claims. Lost on server
// restart, which just means an affected user logs in again — acceptable for
// this app's scale and matches the passcode-not-password auth model already
// in use. `type` distinguishes a regular user session from an admin session
// so admin-only routes can't be reached with an ordinary user's token.

const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const sessions = new Map(); // token -> { userId, type, createdAt }

function createSession(userId, type = 'user') {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: String(userId), type, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > TTL_MS) { sessions.delete(token); return null; }
  return s;
}

module.exports = { createSession, getSession };

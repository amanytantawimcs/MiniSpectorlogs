// In-memory session tokens minted at login (User ID + passcode verified).
// No DB table needed — sessions just prove "this request really came from
// a logged-in user" so write routes can check project membership role
// instead of trusting whatever the client claims. Lost on server restart,
// which just means an affected user logs in again — acceptable for this
// app's scale and matches the passcode-not-password auth model already in use.

const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const sessions = new Map(); // token -> { userId, createdAt }

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: String(userId), createdAt: Date.now() });
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

// Thin fetch client — the only module that talks to the backend.
// Same origin as the page, so no base URL or CORS config needed.

import { showToast } from './ui.js';
import { state } from './state.js';

// Session token minted server-side at login (see routes/users.js). Sent on
// every request — as a header (covers GET/DELETE) and merged into the body
// for anything that sends one (covers navigator.sendBeacon calls, which
// can't set custom headers) — so write routes can verify the caller is
// actually logged in instead of trusting whatever the client claims.
let sessionToken = null;
export function setSessionToken(token) { sessionToken = token; }
export function getSessionToken() { return sessionToken; }

// Separate token/header for the admin panel — kept independent of the
// regular user session so the two can never be confused with each other.
let adminSessionToken = null;
export function setAdminSessionToken(token) { adminSessionToken = token; }
export function clearAdminSessionToken() { adminSessionToken = null; }

// Failed-save retry queue (localStorage-backed, survives a reload). Without
// this, a save that fails because the network is briefly down just shows a
// toast and is gone — no retry, no record that it needs to happen. Only
// genuine network failures get queued (a 4xx/5xx from a reachable server is
// a real rejection, not something blindly retrying would fix). Keyed by
// project_code+mode so a backlog of failed autosaves for the same project
// collapses to just the latest snapshot instead of replaying stale ones.
//
// Tagged with queuedByUserId: this app can run on a shared vessel/office
// computer where different people log in with their own User ID over time.
// Without the tag, a flush triggered while Person B is logged in would
// resend Person A's still-queued edit under Person B's session — silently
// misattributing a save that never touched Person B's screen. Scoping flush
// to the currently logged-in user means each person's queued work only ever
// goes out while THEY are the one signed in, and it also means a queued item
// can't be read out and inspected by simply being on the same shared browser
// under a different login — flushOfflineQueue() ignores anything that isn't
// the current user's own.
const QUEUE_KEY = 'mcs_offline_queue';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function writeQueue(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); } catch (e) { /* storage full/unavailable — best effort */ }
}
function enqueueFailedSave(payload) {
  const items = readQueue().filter(it => !(it.payload.project_code === payload.project_code && it.payload.mode === payload.mode));
  items.push({ payload, queuedAt: Date.now(), queuedByUserId: state.currentUserId });
  writeQueue(items);
}

export function getOfflineQueueSize() {
  return readQueue().filter(it => it.queuedByUserId === state.currentUserId).length;
}

let flushing = false;
export async function flushOfflineQueue() {
  if (flushing) return;
  flushing = true;
  try {
    let flushedAny = false;
    while (true) {
      const remaining = readQueue();
      const next = remaining.find(it => it.queuedByUserId === state.currentUserId);
      if (!next) break; // nothing left that belongs to whoever is currently logged in
      const r = await request('/projects', { method: 'POST', body: JSON.stringify(next.payload) });
      if (!r.ok) break; // still offline, or now a real rejection — stop, leave the rest queued
      writeQueue(remaining.filter(it => it !== next));
      flushedAny = true;
    }
    if (flushedAny) showToast('Queued changes synced.', 'success');
  } finally {
    flushing = false;
  }
}

async function request(path, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    if (adminSessionToken) headers['X-Admin-Session-Token'] = adminSessionToken;
    let body = options.body;
    if (body) body = JSON.stringify({ ...JSON.parse(body), sessionToken });
    const res = await fetch('/api' + path, { ...options, headers, body });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: {}, networkError: true };
  }
}

export const api = {
  getUserName: async (userId) => {
    const r = await request('/users/' + encodeURIComponent(userId));
    if (!r.ok) return { success: false };
    return { success: true, name: r.data.name, role: r.data.role, hasPasscode: r.data.hasPasscode };
  },

  setPasscode: async (userId, passcode) => {
    const r = await request('/users/' + encodeURIComponent(userId) + '/passcode', {
      method: 'POST', body: JSON.stringify({ passcode }),
    });
    if (r.ok && r.data.token) setSessionToken(r.data.token);
    return { success: r.ok, error: r.data.error };
  },

  verifyPasscode: async (userId, passcode) => {
    const r = await request('/users/' + encodeURIComponent(userId) + '/verify-passcode', {
      method: 'POST', body: JSON.stringify({ passcode }),
    });
    if (r.ok && r.data.token) setSessionToken(r.data.token);
    return { success: r.ok, error: r.data.error };
  },

  // Admin-only now (see server/routes/users.js) — sent via the admin session
  // token like the other admin-gated calls, not by anyone who just knows a
  // User ID.
  resetPasscode: async (userId) => {
    const r = await request('/users/' + encodeURIComponent(userId) + '/reset-passcode', { method: 'POST' });
    return { success: r.ok, error: r.data.error, unauthorized: r.status === 401 };
  },

  pushProject: async (payload) => {
    const r = await request('/projects', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) {
      if (r.networkError) {
        const alreadyQueued = readQueue().some(it => it.payload.project_code === payload.project_code && it.payload.mode === payload.mode);
        enqueueFailedSave(payload);
        if (!alreadyQueued) showToast('Offline — save queued, will retry automatically.', 'warn');
      }
      return { success: false, error: r.data.error || 'Request failed', offline: r.networkError || false };
    }
    return { success: true, updated_at: r.data.updated_at };
  },

  pullProject: async (projectCode) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode));
    if (r.status === 404) return { success: false, notFound: true, error: 'Not found' };
    if (!r.ok) return { success: false, error: r.data.error || 'Request failed', offline: r.networkError || false };
    return { success: true, project: r.data.project };
  },

  lockSimulation: async (projectCode) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode) + '/lock-simulation', { method: 'POST' });
    return { success: r.ok };
  },

  // Server now identifies the caller from the session token (see requireAuth
  // in server/lib/auth.js), not a userId query param the client could claim.
  getProjectsOverview: async () => {
    const r = await request('/projects/overview');
    if (!r.ok) return { success: false, error: r.data.error || 'Request failed', projects: [] };
    return { success: true, projects: r.data.projects || [] };
  },

  listProjects: async (filters = {}) => {
    const qs = filters.mode ? ('?mode=' + encodeURIComponent(filters.mode)) : '';
    const r = await request('/projects' + qs);
    if (!r.ok) return { success: false, projects: [] };
    return { success: true, projects: r.data.projects || [] };
  },

  checkProjectAccess: async (projectCode, userId) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode) + '/access/' + encodeURIComponent(userId));
    if (!r.ok) return { allowed: true, role: 'operator' };
    return r.data;
  },

  getProjectMembers: async (projectCode) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode) + '/members');
    if (!r.ok) return { success: false, members: [] };
    return { success: true, members: r.data.members || [] };
  },

  setProjectMember: async (projectCode, userId, role, addedBy) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode) + '/members', {
      method: 'POST', body: JSON.stringify({ userId, role, addedBy }),
    });
    return { success: r.ok, error: r.data.error };
  },

  removeProjectMember: async (projectCode, userId) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode) + '/members/' + encodeURIComponent(userId), { method: 'DELETE' });
    return { success: r.ok };
  },

  logSyncAction: async (entry) => {
    const r = await request('/sync-log', { method: 'POST', body: JSON.stringify(entry) });
    return { success: r.ok };
  },

  saveSessionMeta: async (meta) => {
    const r = await request('/session-meta', { method: 'POST', body: JSON.stringify(meta) });
    return { success: r.ok };
  },

  checkAdminExists: async () => {
    const r = await request('/admin/exists');
    if (!r.ok) return { success: false };
    return { exists: !!r.data.exists };
  },

  // `password` is sent raw over HTTPS in the body (same as regular passcode
  // login) — the server salts+hashes it. Previously the browser computed an
  // unsalted SHA-256 itself and sent THAT as the "password", which meant the
  // hash was a permanent bearer credential rather than a real hash.
  adminLogin: async (username, password) => {
    const r = await request('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!r.ok) return { success: false, error: r.data.error || 'Invalid credentials' };
    setAdminSessionToken(r.data.token);
    return { success: true };
  },

  setupAdmin: async (username, password) => {
    const r = await request('/admin/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!r.ok) return { success: false, error: r.data.error || 'Setup failed' };
    setAdminSessionToken(r.data.token);
    return { success: true };
  },

  getLoginLog: async () => {
    const r = await request('/admin/login-log');
    if (!r.ok) return { success: false, logs: [], unauthorized: r.status === 401 };
    return { success: true, logs: r.data.logs || [] };
  },

  // Auth is now the admin session token (sent as a header by request()), not
  // credentials re-sent on every call — the old version put them in the URL
  // query string, visible in the Network tab and browser history.
  getUsers: async () => {
    const r = await request('/users');
    if (!r.ok) return { success: false, users: [], unauthorized: r.status === 401 };
    return { success: true, users: r.data.users || [] };
  },

  addUser: async (user) => {
    const r = await request('/users', { method: 'POST', body: JSON.stringify(user) });
    return { success: r.ok, error: r.data.error, unauthorized: r.status === 401 };
  },

  deleteUser: async (userId) => {
    const r = await request('/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    return { success: r.ok, unauthorized: r.status === 401 };
  },
};

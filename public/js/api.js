// Thin fetch client — the only module that talks to the backend.
// Same origin as the page, so no base URL or CORS config needed.

async function request(path, options = {}) {
  try {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
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
    return { success: r.ok, error: r.data.error };
  },

  verifyPasscode: async (userId, passcode) => {
    const r = await request('/users/' + encodeURIComponent(userId) + '/verify-passcode', {
      method: 'POST', body: JSON.stringify({ passcode }),
    });
    return { success: r.ok, error: r.data.error };
  },

  resetPasscode: async (userId, adminUsername, adminPasswordHash) => {
    const r = await request('/users/' + encodeURIComponent(userId) + '/reset-passcode', {
      method: 'POST', body: JSON.stringify({ adminUsername, adminPasswordHash }),
    });
    return { success: r.ok, error: r.data.error };
  },

  pushProject: async (payload) => {
    const r = await request('/projects', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) return { success: false, error: r.data.error || 'Request failed', offline: r.networkError || false };
    return { success: true, updated_at: r.data.updated_at };
  },

  pullProject: async (projectCode) => {
    const r = await request('/projects/' + encodeURIComponent(projectCode));
    if (r.status === 404) return { success: false, notFound: true, error: 'Not found' };
    if (!r.ok) return { success: false, error: r.data.error || 'Request failed', offline: r.networkError || false };
    return { success: true, project: r.data.project };
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

  adminLogin: async (username, passwordHash) => {
    const r = await request('/admin/login', { method: 'POST', body: JSON.stringify({ username, passwordHash }) });
    if (!r.ok) return { success: false, error: r.data.error || 'Invalid credentials' };
    return { success: true };
  },

  setupAdmin: async (username, passwordHash) => {
    const r = await request('/admin/setup', { method: 'POST', body: JSON.stringify({ username, passwordHash }) });
    if (!r.ok) return { success: false, error: r.data.error || 'Setup failed' };
    return { success: true };
  },

  getUsers: async () => {
    const r = await request('/users');
    if (!r.ok) return { success: false, users: [] };
    return { success: true, users: r.data.users || [] };
  },

  addUser: async (user) => {
    const r = await request('/users', { method: 'POST', body: JSON.stringify(user) });
    return { success: r.ok, error: r.data.error };
  },

  deleteUser: async (userId) => {
    const r = await request('/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    return { success: r.ok };
  },
};

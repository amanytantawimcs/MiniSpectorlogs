import { api, clearAdminSessionToken } from './api.js';
import { showToast, escapeHtml, notImplemented } from './ui.js';

// Actual auth is the admin session token held inside api.js (minted by the
// server at login). This is just a display/UX flag — "am I currently showing
// the admin panel as logged in" — not a security boundary.
let isAdminLoggedIn = false;

async function showAdminLogin() {
  const modal = document.getElementById('admin-login-modal');
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  document.getElementById('admin-login-form').classList.remove('hidden');
  document.getElementById('admin-setup-form').classList.add('hidden');
  document.getElementById('admin-modal-title').textContent = 'Admin Login';
  document.getElementById('admin-login-error').classList.add('hidden');

  const check = await api.checkAdminExists();
  if (!check.exists) {
    document.getElementById('admin-login-form').classList.add('hidden');
    document.getElementById('admin-setup-form').classList.remove('hidden');
    document.getElementById('admin-modal-title').textContent = 'Create Admin Account';
  }
  setTimeout(() => {
    const loginHidden = document.getElementById('admin-login-form').classList.contains('hidden');
    const target = loginHidden ? document.getElementById('setup-username') : document.getElementById('admin-username');
    target?.focus();
  }, 100);
}

function hideAdminLogin() {
  const modal = document.getElementById('admin-login-modal');
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function doAdminLogin() {
  const username = document.getElementById('admin-username')?.value?.trim();
  const password = document.getElementById('admin-password')?.value;
  const errEl = document.getElementById('admin-login-error');
  if (!username || !password) { errEl.textContent = 'Enter username and password.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  const result = await api.adminLogin(username, password);
  if (result.success) {
    isAdminLoggedIn = true;
    hideAdminLogin();
    openAdminPanel();
  } else {
    errEl.textContent = result.error || 'Invalid credentials.';
    errEl.classList.remove('hidden');
    document.getElementById('admin-password').value = '';
  }
}

async function doAdminSetup() {
  const username = document.getElementById('setup-username')?.value?.trim();
  const password = document.getElementById('setup-password')?.value;
  const errEl = document.getElementById('admin-setup-error');
  if (!username || !password) { errEl.textContent = 'Fill in both fields.'; errEl.classList.remove('hidden'); return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  const result = await api.setupAdmin(username, password);
  if (result.success) {
    isAdminLoggedIn = true;
    hideAdminLogin();
    openAdminPanel();
  } else {
    errEl.textContent = result.error || 'Setup failed.';
    errEl.classList.remove('hidden');
  }
}

function openAdminPanel() {
  document.getElementById('admin-panel-screen').classList.remove('hidden');
  document.getElementById('admin-panel-screen').style.display = 'flex';
  showAdminTab('users');
}

// Entry point for the "Admin Management" sidebar item — visible to the two
// privileged User IDs and to anyone with users.is_admin set (see
// nav-admin-mgmt-item in index.html, gated in navigation.js). They already
// proved who they are via their own regular login, so this skips the
// separate admin username/password modal entirely. isAdminLoggedIn just
// marks the panel's write actions (add/reset/delete/promote user) as
// allowed to proceed; server-side those calls are authorized by the user's
// own session token, not an admin one (see requireAdminAuth in
// server/lib/auth.js).
function openAdminManagement() {
  isAdminLoggedIn = true;
  openAdminPanel();
}

function exitAdminPanel() {
  document.getElementById('admin-panel-screen').classList.add('hidden');
  document.getElementById('admin-panel-screen').style.display = 'none';
  isAdminLoggedIn = false;
  clearAdminSessionToken();
}

function handleAdminSessionExpired() {
  showToast('Admin session expired — log in again.', 'error');
  exitAdminPanel();
  showAdminLogin();
}

function showAdminTab(tab) {
  ['users', 'projects', 'activity'].forEach(t => {
    const content = document.getElementById('admin-content-' + t);
    const btn = document.getElementById('admin-tab-btn-' + t);
    if (!content || !btn) return;
    if (t === tab) {
      content.classList.remove('hidden');
      btn.style.background = 'rgba(243,145,36,0.1)';
      btn.style.border = '1px solid rgba(243,145,36,0.3)';
      btn.style.color = '#f39124';
    } else {
      content.classList.add('hidden');
      btn.style.background = 'transparent';
      btn.style.border = '1px solid transparent';
      btn.style.color = '#9AB0C8';
    }
  });
  if (tab === 'users') renderAdminUsersTab();
  if (tab === 'projects') renderAdminProjectsTab();
  if (tab === 'activity') renderAdminActivityTab();
}

// Loaded lists are cached client-side so the search bars on each admin tab
// can filter instantly without a round trip — filtering never touches the
// server or the underlying data, it just re-renders the already-fetched rows.
let cachedUsers = [];
let cachedActivity = [];
let cachedAdminProjects = [];

function usersRowsHtml(list) {
  if (list.length === 0) return `<tr><td colspan="4" class="text-center py-6 text-sm" style="color:#6C88A6">No users found.</td></tr>`;
  return list.map(u => `
      <tr style="border-bottom:1px solid rgba(120,166,212,0.16);">
          <td class="px-4 py-3 font-mono text-xs" style="color:#9AB0C8">${escapeHtml(String(u.id))}</td>
          <td class="px-4 py-3" style="color:#E9F0F8">${escapeHtml(u.name || '')}</td>
          <td class="px-4 py-3">
              ${u.is_admin ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:rgba(243,145,36,0.15);color:#f39124">ADMIN</span>` : ''}
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
              <button onclick="adminSetUserAdmin('${escapeHtml(String(u.id))}', ${!u.is_admin})" class="text-xs ${u.is_admin ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-[#f39124] hover:text-[#ffb14f] hover:bg-[#f39124]/10'} transition-colors px-2 py-1 rounded mr-1">${u.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
              <button onclick="adminResetPasscode('${escapeHtml(String(u.id))}')" class="text-xs text-[#459fd9] hover:text-[#7cc0ee] transition-colors px-2 py-1 rounded hover:bg-[#459fd9]/10 mr-1">Reset Passcode</button>
              <button onclick="adminDeleteUser('${escapeHtml(String(u.id))}')" class="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-900/20">Remove</button>
          </td>
      </tr>`).join('');
}

function filterAdminUsers(query) {
  const q = query.trim().toLowerCase();
  const filtered = !q ? cachedUsers : cachedUsers.filter(u =>
    String(u.id).toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
  const tbody = document.getElementById('admin-users-tbody');
  if (tbody) tbody.innerHTML = usersRowsHtml(filtered);
}

async function renderAdminUsersTab() {
  const el = document.getElementById('admin-content-users');
  if (!el) return;
  el.innerHTML = `<div class="text-sm py-8 text-center" style="color:#6C88A6">Loading users...</div>`;
  const result = await api.getUsers();
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  cachedUsers = result.users || [];
  el.innerHTML = `
    <div class="max-w-3xl">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold" style="color:#E9F0F8">User Accounts</h2>
        </div>
        <div class="mb-4">
            <input id="admin-users-search" type="text" placeholder="Search by ID or name..." autocomplete="off"
                oninput="filterAdminUsers(this.value)" class="w-full max-w-sm">
        </div>
        <div class="rcard mb-4">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">User ID</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Name</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Access</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody id="admin-users-tbody">${usersRowsHtml(cachedUsers)}</tbody>
            </table>
        </div>
        <div class="rcard p-4">
            <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color:#9AB0C8">Add User</p>
            <div class="flex gap-3">
                <input id="new-user-id" type="text" placeholder="User ID (e.g. 105)" autocomplete="off" class="flex-1">
                <input id="new-user-name" type="text" placeholder="Full Name" autocomplete="off" class="flex-1"
                    onkeydown="if(event.key==='Enter') adminAddUser()">
                <button onclick="adminAddUser()" class="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 whitespace-nowrap"
                    style="background:#f39124;">Add User</button>
            </div>
            <p class="text-xs mt-2" style="color:#6C88A6">New users set their own passcode the first time they log in.</p>
            <p id="admin-user-error" class="text-red-400 text-xs mt-2 hidden"></p>
        </div>
    </div>`;
}

async function adminAddUser() {
  if (!isAdminLoggedIn) { handleAdminSessionExpired(); return; }
  const id = document.getElementById('new-user-id')?.value?.trim();
  const name = document.getElementById('new-user-name')?.value?.trim();
  const err = document.getElementById('admin-user-error');
  if (!id || !name) { err.textContent = 'Both ID and name are required.'; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  const result = await api.addUser({ id, name });
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (result.success) { renderAdminUsersTab(); }
  else { err.textContent = result.error || 'Failed to add user.'; err.classList.remove('hidden'); }
}

async function adminSetUserAdmin(userId, makeAdmin) {
  if (!isAdminLoggedIn) { handleAdminSessionExpired(); return; }
  const verb = makeAdmin ? 'grant' : 'revoke';
  if (!confirm(`${makeAdmin ? 'Grant' : 'Revoke'} Admin panel access ${makeAdmin ? 'to' : 'from'} User ID ${userId}?`)) return;
  const result = await api.setUserAdmin(userId, makeAdmin);
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (result.success) { showToast(`Admin access ${makeAdmin ? 'granted' : 'revoked'} for ${userId}.`, 'success'); renderAdminUsersTab(); }
  else showToast(result.error || `Failed to ${verb} admin access.`, 'error');
}

async function adminResetPasscode(userId) {
  if (!isAdminLoggedIn) { handleAdminSessionExpired(); return; }
  if (!confirm(`Reset the passcode for User ID ${userId}? They'll set a new one next time they log in.`)) return;
  const result = await api.resetPasscode(userId);
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (result.success) showToast(`Passcode reset for ${userId}.`, 'success');
  else showToast(result.error || 'Failed to reset passcode.', 'error');
}

async function adminDeleteUser(userId) {
  if (!isAdminLoggedIn) { handleAdminSessionExpired(); return; }
  if (!confirm(`Remove user "${userId}"? This does not remove them from existing projects.`)) return;
  const result = await api.deleteUser(userId);
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (result.success === false) { showToast(result.error || 'Failed to remove user.', 'error'); return; }
  renderAdminUsersTab();
}

function formatLoginTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function activityRowsHtml(list) {
  if (list.length === 0) return `<tr><td colspan="3" class="text-center py-6 text-sm" style="color:#6C88A6">No logins found.</td></tr>`;
  return list.map(l => `
      <tr style="border-bottom:1px solid rgba(120,166,212,0.16);">
          <td class="px-4 py-3" style="color:#E9F0F8">${escapeHtml(l.user_name || l.user_id || 'Unknown')}</td>
          <td class="px-4 py-3">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="${l.role === 'admin' ? 'background:rgba(243,145,36,0.15);color:#f39124' : 'background:rgba(69,159,217,0.15);color:#459fd9'}">${l.role === 'admin' ? 'ADMIN' : 'USER'}</span>
          </td>
          <td class="px-4 py-3 text-xs" style="color:#9AB0C8">${formatLoginTime(l.logged_in_at)}</td>
      </tr>`).join('');
}

function filterAdminActivity(query) {
  const q = query.trim().toLowerCase();
  const filtered = !q ? cachedActivity : cachedActivity.filter(l =>
    (l.user_name || '').toLowerCase().includes(q) || String(l.user_id || '').toLowerCase().includes(q));
  const tbody = document.getElementById('admin-activity-tbody');
  if (tbody) tbody.innerHTML = activityRowsHtml(filtered);
}

async function renderAdminActivityTab() {
  const el = document.getElementById('admin-content-activity');
  if (!el) return;
  el.innerHTML = `<div class="text-sm py-8 text-center" style="color:#6C88A6">Loading activity...</div>`;
  const result = await api.getLoginLog();
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  cachedActivity = result.logs || [];
  el.innerHTML = `
    <div class="max-w-2xl">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold" style="color:#E9F0F8">Login Activity</h2>
            <span class="text-xs" style="color:#6C88A6">Most recent ${cachedActivity.length}</span>
        </div>
        <div class="mb-4">
            <input id="admin-activity-search" type="text" placeholder="Search by name or ID..." autocomplete="off"
                oninput="filterAdminActivity(this.value)" class="w-full max-w-sm">
        </div>
        <div class="rcard mb-4">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Name / ID</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Account</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Signed In</th>
                    </tr>
                </thead>
                <tbody id="admin-activity-tbody">${activityRowsHtml(cachedActivity)}</tbody>
            </table>
        </div>
    </div>`;
}

function projectsRowsHtml(list) {
  if (list.length === 0) return `<tr><td colspan="6" class="text-center py-8 text-sm" style="color:#6C88A6">No projects found.</td></tr>`;
  return list.map(p => `
      <tr style="border-bottom:1px solid rgba(120,166,212,0.16);">
          <td class="px-4 py-3 font-mono text-xs" style="color:#9AB0C8">${escapeHtml(p.project_code)}</td>
          <td class="px-4 py-3" style="color:#E9F0F8">${escapeHtml(p.project_name || '—')}</td>
          <td class="px-4 py-3 whitespace-nowrap">
              <span class="text-[10px] font-bold px-2 py-1 rounded" style="${p.mode === 'simulation' ? 'background:rgba(234,179,8,0.15);color:#facc15;' : 'background:rgba(69,159,217,0.15);color:#459fd9;'}">${p.mode === 'simulation' ? 'SIMULATION' : 'OPERATION'}</span>
              ${p.is_sim_locked ? '<span class="text-[10px] font-bold px-2 py-1 rounded ml-1" style="background:rgba(34,197,94,0.15);color:#22c55e;">PUSHED</span>' : ''}
          </td>
          <td class="px-4 py-3" style="color:#9AB0C8">${escapeHtml(p.created_by || '—')}</td>
          <td class="px-4 py-3 text-xs whitespace-nowrap" style="color:#6C88A6">${p.updated_at ? new Date(p.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
              <button onclick="adminDeleteProject('${escapeHtml(p.project_code)}')" class="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-900/20">Remove</button>
          </td>
      </tr>`).join('');
}

// Deletes a project and everything tied to it — permanent, no undo. A plain
// confirm() is too weak for something this destructive (matches the whole
// project's dive/maintenance/HSE/standby/fault logs and simulation data,
// not just one row), so this requires typing the exact project code back,
// the same weight of confirmation GitHub-style repo deletion uses.
async function adminDeleteProject(projectCode) {
  if (!isAdminLoggedIn) { handleAdminSessionExpired(); return; }
  const typed = prompt(
    `This permanently deletes project "${projectCode}" and everything in it — crew, shift logs, dive logs, maintenance, HSE reports, standby logs, faults, and its simulation data if it has one. This cannot be undone.\n\nType the project code to confirm:`
  );
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== projectCode.toUpperCase()) {
    showToast('Project code did not match — nothing was deleted.', 'warn');
    return;
  }
  const result = await api.deleteProject(projectCode);
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (result.success) { showToast(`Project "${projectCode}" deleted.`, 'success'); renderAdminProjectsTab(); }
  else showToast(result.error || 'Failed to delete project.', 'error');
}

function filterAdminProjects(query) {
  const q = query.trim().toLowerCase();
  const filtered = !q ? cachedAdminProjects : cachedAdminProjects.filter(p =>
    (p.project_code || '').toLowerCase().includes(q) ||
    (p.project_name || '').toLowerCase().includes(q) ||
    (p.created_by || '').toLowerCase().includes(q));
  const tbody = document.getElementById('admin-projects-tbody');
  if (tbody) tbody.innerHTML = projectsRowsHtml(filtered);
}

async function renderAdminProjectsTab() {
  const el = document.getElementById('admin-content-projects');
  if (!el) return;
  el.innerHTML = `<div class="text-sm py-8 text-center" style="color:#6C88A6">Loading projects...</div>`;
  const result = await api.getAdminProjects();
  if (result.unauthorized) { handleAdminSessionExpired(); return; }
  if (!result.success) {
    el.innerHTML = `<div class="text-red-400 text-sm py-8 text-center">${escapeHtml(result.error || 'Failed to load projects.')}</div>`;
    return;
  }
  cachedAdminProjects = result.projects || [];
  el.innerHTML = `
    <div class="max-w-4xl">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold" style="color:#E9F0F8">All Projects</h2>
            <span class="text-xs" style="color:#6C88A6">${cachedAdminProjects.length} total</span>
        </div>
        <div class="mb-4">
            <input id="admin-projects-search" type="text" placeholder="Search by code, name, or creator..." autocomplete="off"
                oninput="filterAdminProjects(this.value)" class="w-full max-w-sm">
        </div>
        <div class="rcard mb-4">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Project Code</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Name</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Status</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Created By</th>
                        <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Last Updated</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody id="admin-projects-tbody">${projectsRowsHtml(cachedAdminProjects)}</tbody>
            </table>
        </div>
    </div>`;
}

export function installAdmin() {
  window.showAdminLogin = showAdminLogin;
  window.hideAdminLogin = hideAdminLogin;
  window.doAdminLogin = doAdminLogin;
  window.doAdminSetup = doAdminSetup;
  window.openAdminManagement = openAdminManagement;
  window.exitAdminPanel = exitAdminPanel;
  window.showAdminTab = showAdminTab;
  window.adminAddUser = adminAddUser;
  window.adminDeleteUser = adminDeleteUser;
  window.adminSetUserAdmin = adminSetUserAdmin;
  window.adminResetPasscode = adminResetPasscode;
  window.filterAdminUsers = filterAdminUsers;
  window.filterAdminActivity = filterAdminActivity;
  window.filterAdminProjects = filterAdminProjects;
  window.adminDeleteProject = adminDeleteProject;
}

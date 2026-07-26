import { api } from './api.js';
import { showToast, escapeHtml, notImplemented } from './ui.js';

// In-memory only — never persisted. Lets the admin panel re-authenticate
// sensitive actions (like resetting a user's passcode) without a session/token.
let adminCreds = null;

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  const hash = await hashPassword(password);
  const result = await api.adminLogin(username, hash);
  if (result.success) {
    adminCreds = { username, passwordHash: hash };
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
  const hash = await hashPassword(password);
  const result = await api.setupAdmin(username, hash);
  if (result.success) {
    adminCreds = { username, passwordHash: hash };
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

function exitAdminPanel() {
  document.getElementById('admin-panel-screen').classList.add('hidden');
  document.getElementById('admin-panel-screen').style.display = 'none';
  adminCreds = null;
}

function showAdminTab(tab) {
  ['users', 'projects'].forEach(t => {
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
      btn.style.color = '#9ca3af';
    }
  });
  if (tab === 'users') renderAdminUsersTab();
  if (tab === 'projects') renderAdminProjectsTab();
}

async function renderAdminUsersTab() {
  const el = document.getElementById('admin-content-users');
  if (!el) return;
  el.innerHTML = `<div class="text-gray-500 text-sm py-8 text-center">Loading users...</div>`;
  const result = await api.getUsers(adminCreds?.username, adminCreds?.passwordHash);
  const users = result.users || [];
  el.innerHTML = `
    <div class="max-w-2xl">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold text-white">User Accounts</h2>
        </div>
        <div class="rounded-xl overflow-hidden mb-4" style="border:1px solid rgba(55,65,81,0.6);">
            <table class="w-full text-sm">
                <thead>
                    <tr style="background:rgba(31,41,55,0.8);border-bottom:1px solid rgba(55,65,81,0.5);">
                        <th class="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">User ID</th>
                        <th class="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Name</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody>
                    ${users.length === 0 ? `<tr><td colspan="3" class="text-center text-gray-600 py-6 text-sm">No users yet.</td></tr>` :
                        users.map(u => `
                        <tr style="border-bottom:1px solid rgba(55,65,81,0.3);">
                            <td class="px-4 py-3 font-mono text-gray-300 text-xs">${escapeHtml(String(u.id))}</td>
                            <td class="px-4 py-3 text-white">${escapeHtml(u.name || '')}</td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">
                                <button onclick="adminDeleteUser('${escapeHtml(String(u.id))}')" class="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-900/20">Remove</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div class="rounded-xl p-4" style="background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);">
            <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Add User</p>
            <div class="flex gap-3">
                <input id="new-user-id" type="text" placeholder="User ID (e.g. 105)" autocomplete="off"
                    class="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-gray-600 outline-none"
                    style="background:rgba(0,0,0,0.3);border:1px solid rgba(55,65,81,0.7);"
                    onfocus="this.style.borderColor='#f39124'" onblur="this.style.borderColor='rgba(55,65,81,0.7)'">
                <input id="new-user-name" type="text" placeholder="Full Name" autocomplete="off"
                    class="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-gray-600 outline-none"
                    style="background:rgba(0,0,0,0.3);border:1px solid rgba(55,65,81,0.7);"
                    onfocus="this.style.borderColor='#f39124'" onblur="this.style.borderColor='rgba(55,65,81,0.7)'"
                    onkeydown="if(event.key==='Enter') adminAddUser()">
                <button onclick="adminAddUser()" class="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 whitespace-nowrap"
                    style="background:#f39124;">Add User</button>
            </div>
            <p class="text-gray-600 text-xs mt-2">New users set their own passcode the first time they log in.</p>
            <p id="admin-user-error" class="text-red-400 text-xs mt-2 hidden"></p>
        </div>
    </div>`;
}

async function adminAddUser() {
  if (!adminCreds) { showToast('Admin session expired — log in again.', 'error'); exitAdminPanel(); showAdminLogin(); return; }
  const id = document.getElementById('new-user-id')?.value?.trim();
  const name = document.getElementById('new-user-name')?.value?.trim();
  const err = document.getElementById('admin-user-error');
  if (!id || !name) { err.textContent = 'Both ID and name are required.'; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  const result = await api.addUser({ id, name }, adminCreds.username, adminCreds.passwordHash);
  if (result.success) { renderAdminUsersTab(); }
  else { err.textContent = result.error || 'Failed to add user.'; err.classList.remove('hidden'); }
}

async function adminDeleteUser(userId) {
  if (!adminCreds) { showToast('Admin session expired — log in again.', 'error'); exitAdminPanel(); showAdminLogin(); return; }
  if (!confirm(`Remove user "${userId}"? This does not remove them from existing projects.`)) return;
  const result = await api.deleteUser(userId, adminCreds.username, adminCreds.passwordHash);
  if (result.success === false) { showToast(result.error || 'Failed to remove user.', 'error'); return; }
  renderAdminUsersTab();
}

function renderAdminProjectsTab() {
  const el = document.getElementById('admin-content-projects');
  if (!el) return;
  el.innerHTML = `<div class="text-gray-600 text-sm py-8 text-center">Project access control — coming in a later update.</div>`;
}

export function installAdmin() {
  window.showAdminLogin = showAdminLogin;
  window.hideAdminLogin = hideAdminLogin;
  window.doAdminLogin = doAdminLogin;
  window.doAdminSetup = doAdminSetup;
  window.exitAdminPanel = exitAdminPanel;
  window.showAdminTab = showAdminTab;
  window.adminAddUser = adminAddUser;
  window.adminDeleteUser = adminDeleteUser;
}

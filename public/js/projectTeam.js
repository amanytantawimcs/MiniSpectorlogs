// Project Team tab (Operation + Simulation share this one module): lets
// whoever set up a project pick exactly who else can edit it. Mirrors the
// server's assertCanWrite() semantics (server/lib/auth.js) so the UI never
// promises something the API won't actually enforce:
//   - no team added yet  -> project stays open, anyone logged in can edit
//   - team has 1+ people -> only listed people can edit; everyone else who
//     opens the project (Join flow) lands as a read-only viewer
//
// Operation's #tab-team and Simulation's #sim-setup-team panel each call
// renderProjectTeam(containerId, projectCode) with their own container id
// and whatever holds their project code.

import { state } from './state.js';
import { api } from './api.js';
import { showToast, escapeHtml } from './ui.js';

let searchDebounce = null;
let lastSearchResults = [];

// Registered once at module load rather than per-render — the search box
// and results dropdown are looked up fresh on every click instead of
// captured in a closure, so this stays correct across re-renders without
// piling up duplicate listeners.
document.addEventListener('click', (e) => {
  const resultsBox = document.getElementById('team-search-results');
  const searchInput = document.getElementById('team-search-input');
  if (resultsBox && !resultsBox.contains(e.target) && e.target !== searchInput) resultsBox.classList.add('hidden');
});

function unsavedNoticeHTML() {
  return `<div class="rcard">
    <div class="p-6 text-center" style="color:#6C88A6;font-size:13px;">
      Save the project once (set a Project Code and save) before you can manage who's on the team.
    </div>
  </div>`;
}

function explainerHTML(hasTeam) {
  return hasTeam
    ? `<div class="mb-4" style="font-size:12.5px;color:#9AB0C8;">Only the people listed below can edit this project. Anyone else who opens it — including with the project code — sees it as a read-only viewer.</div>`
    : `<div class="mb-4" style="font-size:12.5px;color:#9AB0C8;">This project is currently open — anyone logged in can edit it. Add people below to restrict editing to just them; everyone else will still be able to view the project, read-only.</div>`;
}

function memberRowHTML(m, readOnly) {
  const isSelf = String(m.user_id) === String(state.currentUserId);
  const displayName = m.name || `User ${m.user_id}`;
  return `<div class="team-member-row" data-user-id="${escapeHtml(m.user_id)}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(16,27,44,0.5);border:1px solid rgba(120,166,212,0.12);margin-bottom:6px;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;color:#E9F0F8;">${escapeHtml(displayName)}${isSelf ? ' <span style="color:#6C88A6;font-weight:500;">(you)</span>' : ''}</div>
      <div style="font-size:11px;color:#6C88A6;">ID ${escapeHtml(m.user_id)}</div>
    </div>
    ${readOnly
      ? `<span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${m.role === 'viewer' ? '#6C88A6' : '#459fd9'};">${m.role === 'viewer' ? 'Viewer' : 'Operator'}</span>`
      : `<select class="team-role-select rfield" data-user-id="${escapeHtml(m.user_id)}" style="width:120px;height:32px;font-size:12px;padding:0 8px;">
          <option value="operator" ${m.role !== 'viewer' ? 'selected' : ''}>Operator</option>
          <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
        </select>
        <button type="button" class="team-remove-btn" data-user-id="${escapeHtml(m.user_id)}" title="Remove from team" style="background:rgba(239,68,68,0.1);border:none;width:30px;height:30px;border-radius:8px;color:#ef4444;cursor:pointer;font-size:0.95rem;flex-shrink:0;">✕</button>`
    }
  </div>`;
}

// projectCode is passed in explicitly rather than always read from
// state.currentProjectCode: Simulation mode tracks its in-progress project
// code on simState.projectData.code until the project is actually saved,
// so each caller resolves the code that's right for its own mode.
export async function renderProjectTeam(containerId, projectCode) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!projectCode) {
    container.innerHTML = unsavedNoticeHTML();
    return;
  }

  container.innerHTML = `<div class="p-6" style="color:#6C88A6;font-size:13px;">Loading team…</div>`;
  const result = await api.getProjectMembers(projectCode);
  const members = result.members || [];
  const readOnly = state.currentUserRole === 'reviewer';

  container.innerHTML = `
    ${explainerHTML(members.length > 0)}
    ${readOnly ? '' : `
    <div class="rcard mb-4">
      <div class="flex items-center gap-3 px-5 py-3 border-b rcard-head">
        <span class="rcard-bar"></span>
        <span class="rcard-title">Add someone</span>
      </div>
      <div class="p-4" style="position:relative;">
        <input id="team-search-input" type="text" class="w-full rfield" placeholder="Search by name or User ID..." autocomplete="off"/>
        <div id="team-search-results" class="hidden" style="position:absolute;left:16px;right:16px;top:60px;background:#0C1727;border:1px solid rgba(120,166,212,0.24);border-radius:10px;max-height:220px;overflow-y:auto;z-index:20;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9);"></div>
      </div>
    </div>`}
    <div class="rcard">
      <div class="flex items-center gap-3 px-5 py-3 border-b rcard-head">
        <span class="rcard-bar"></span>
        <span class="rcard-title">Team</span>
        <span class="rcard-hint">${members.length} ${members.length === 1 ? 'person' : 'people'}</span>
      </div>
      <div class="p-4" id="team-member-list">
        ${members.length
          ? members.map(m => memberRowHTML(m, readOnly)).join('')
          : `<div style="padding:20px;text-align:center;color:#4b5563;font-style:italic;font-size:0.85rem;">No one added yet — this project is open to all logged-in users.</div>`}
      </div>
    </div>
  `;

  if (readOnly) return;

  const searchInput = document.getElementById('team-search-input');
  const resultsBox = document.getElementById('team-search-results');

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) { resultsBox.classList.add('hidden'); resultsBox.innerHTML = ''; return; }
    searchDebounce = setTimeout(async () => {
      const r = await api.searchUsers(q);
      const existingIds = new Set(members.map(m => String(m.user_id)));
      lastSearchResults = (r.users || []).filter(u => !existingIds.has(String(u.id)));
      if (!lastSearchResults.length) {
        resultsBox.innerHTML = `<div style="padding:10px 14px;font-size:12.5px;color:#6C88A6;">No matching users.</div>`;
      } else {
        resultsBox.innerHTML = lastSearchResults.map(u => `
          <div class="team-search-hit" data-user-id="${escapeHtml(u.id)}" style="padding:9px 14px;font-size:13px;color:#E9F0F8;cursor:pointer;border-bottom:1px solid rgba(120,166,212,0.08);">
            ${escapeHtml(u.name)} <span style="color:#6C88A6;font-size:11px;">· ID ${escapeHtml(u.id)}</span>
          </div>`).join('');
        resultsBox.querySelectorAll('.team-search-hit').forEach(hit => {
          hit.addEventListener('mouseenter', () => { hit.style.background = 'rgba(69,159,217,0.1)'; });
          hit.addEventListener('mouseleave', () => { hit.style.background = ''; });
          hit.addEventListener('click', async () => {
            const userId = hit.dataset.userId;
            resultsBox.classList.add('hidden');
            searchInput.value = '';
            const addRes = await api.setProjectMember(projectCode, userId, 'operator', state.currentUserName);
            if (addRes.success) { showToast('Added to project team.', 'success'); renderProjectTeam(containerId, projectCode); }
            else showToast('Could not add: ' + (addRes.error || 'unknown error'), 'error');
          });
        });
      }
      resultsBox.classList.remove('hidden');
    }, 250);
  });

  container.querySelectorAll('.team-role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const userId = sel.dataset.userId;
      const newRole = sel.value;
      const isSelf = String(userId) === String(state.currentUserId);
      if (isSelf && newRole === 'viewer') {
        const proceed = confirm('This removes your own edit access to this project — you will only be able to view it afterward. Continue?');
        if (!proceed) { sel.value = 'operator'; return; }
      }
      const r = await api.setProjectMember(projectCode, userId, newRole, state.currentUserName);
      if (r.success) { showToast('Role updated.', 'success'); renderProjectTeam(containerId, projectCode); }
      else { showToast('Could not update role: ' + (r.error || 'unknown error'), 'error'); renderProjectTeam(containerId, projectCode); }
    });
  });

  container.querySelectorAll('.team-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      const isSelf = String(userId) === String(state.currentUserId);
      const msg = isSelf
        ? 'This removes you from the project team — if other operators remain, you will lose edit access. Continue?'
        : 'Remove this person from the project team?';
      if (!confirm(msg)) return;
      const r = await api.removeProjectMember(projectCode, userId);
      if (r.success) { showToast('Removed from project team.', 'success'); renderProjectTeam(containerId, projectCode); }
      else showToast('Could not remove member.', 'error');
    });
  });
}

export function installProjectTeam() {
  window.renderProjectTeamOp = () => renderProjectTeam('team-container-op', state.currentProjectCode);
}

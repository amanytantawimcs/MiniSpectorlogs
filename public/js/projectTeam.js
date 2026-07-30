// Project Team tab (Operation + Simulation share this one module): lets
// whoever set up a project pick exactly who else can edit it. Mirrors the
// server's assertCanWrite() semantics (server/lib/auth.js) so the UI never
// promises something the API won't actually enforce:
//   - no team added yet  -> project stays open, anyone logged in can edit
//   - team has 1+ people -> only listed people can edit; everyone else who
//     opens the project (Join flow) lands as a read-only viewer
//
// Embedded directly in each mode's project-identity card: Operation's
// Project Details tab (#team-container-op) and Simulation's Mission Info
// "Project details" card (#team-container-sim). Each caller resolves
// whatever holds its own project code and calls
// renderProjectTeam(containerId, projectCode).

import { state } from './state.js';
import { api } from './api.js';
import { showToast, escapeHtml } from './ui.js';

let searchDebounce = null;
let lastSearchResults = [];

// People picked before the project has ever been saved — project_members
// rows need a real project_id, which doesn't exist yet. Held here instead
// and pushed to the server by flushPendingTeam() the moment the project is
// first saved (see the isFirstSave hooks in projectDetails.js/simulation
// core.js), so picking a team doesn't have to wait for a save round-trip.
let pendingMembers = [];

// Registered once at module load rather than per-render — the search box
// and results dropdown are looked up fresh on every click instead of
// captured in a closure, so this stays correct across re-renders without
// piling up duplicate listeners.
document.addEventListener('click', (e) => {
  const resultsBox = document.getElementById('team-search-results');
  const searchInput = document.getElementById('team-search-input');
  if (resultsBox && !resultsBox.contains(e.target) && e.target !== searchInput) resultsBox.classList.add('hidden');
});

function explainerHTML(hasTeam, isPending) {
  if (isPending) {
    return `<div class="mb-4" style="font-size:12.5px;color:#9AB0C8;">This project hasn't been saved yet — anyone you add here joins the team the moment you save.${hasTeam ? ' Once saved, only the people below can edit it; everyone else sees it read-only.' : ''}</div>`;
  }
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

  const isPending = !projectCode;
  let members;
  if (isPending) {
    members = pendingMembers;
  } else {
    container.innerHTML = `<div class="p-6" style="color:#6C88A6;font-size:13px;">Loading team…</div>`;
    const result = await api.getProjectMembers(projectCode);
    members = result.members || [];
  }
  const readOnly = state.currentUserRole === 'reviewer';

  container.innerHTML = `
    ${explainerHTML(members.length > 0, isPending)}
    <div class="grid grid-cols-1 ${readOnly ? '' : 'md:grid-cols-2'} gap-4 items-stretch">
      ${readOnly ? '' : `
      <div class="rcard">
        <div class="flex items-center gap-3 px-5 py-3 border-b rcard-head">
          <span class="rcard-bar"></span>
          <span class="rcard-title">Add someone</span>
        </div>
        <div class="p-4">
          <input id="team-search-input" type="text" class="w-full rfield" placeholder="Search by name or User ID..." autocomplete="off"/>
          <div id="team-search-results" class="hidden" style="margin-top:8px;background:#0C1727;border:1px solid rgba(120,166,212,0.24);border-radius:10px;max-height:220px;overflow-y:auto;"></div>
        </div>
      </div>`}
      <div class="rcard">
        <div class="flex items-center gap-3 px-5 py-3 border-b rcard-head">
          <span class="rcard-bar"></span>
          <span class="rcard-title">Team</span>
          <span class="rcard-hint">${members.length} ${members.length === 1 ? 'person' : 'people'}${isPending && members.length ? ' · pending save' : ''}</span>
        </div>
        <div class="p-4" id="team-member-list">
          ${members.length
            ? members.map(m => memberRowHTML(m, readOnly)).join('')
            : `<div style="padding:20px;text-align:center;color:#4b5563;font-style:italic;font-size:0.85rem;">No one added yet — this project is open to all logged-in users.</div>`}
        </div>
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
            const hitUser = lastSearchResults.find(u => String(u.id) === String(userId));
            resultsBox.classList.add('hidden');
            searchInput.value = '';
            if (isPending) {
              pendingMembers.push({ user_id: userId, name: hitUser?.name || userId, role: 'operator' });
              showToast('Added — will be saved with the project.', 'success');
              renderProjectTeam(containerId, projectCode);
              return;
            }
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
      if (isPending) {
        const m = pendingMembers.find(p => String(p.user_id) === String(userId));
        if (m) m.role = newRole;
        renderProjectTeam(containerId, projectCode);
        return;
      }
      const r = await api.setProjectMember(projectCode, userId, newRole, state.currentUserName);
      if (r.success) { showToast('Role updated.', 'success'); renderProjectTeam(containerId, projectCode); }
      else { showToast('Could not update role: ' + (r.error || 'unknown error'), 'error'); renderProjectTeam(containerId, projectCode); }
    });
  });

  container.querySelectorAll('.team-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      if (isPending) {
        pendingMembers = pendingMembers.filter(p => String(p.user_id) !== String(userId));
        renderProjectTeam(containerId, projectCode);
        return;
      }
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

// Called right after a project's first successful save (see the
// isFirstSave hooks in projectDetails.js and simulation/core.js) — pushes
// whatever was picked before the project existed server-side. Failed
// pushes are put back on the pending list rather than silently dropped, so
// they show up again (and can be retried) instead of just vanishing.
export async function flushPendingTeam(projectCode) {
  if (!pendingMembers.length) return;
  const toFlush = pendingMembers.splice(0, pendingMembers.length);
  const outcomes = await Promise.all(toFlush.map(async m => ({
    m, r: await api.setProjectMember(projectCode, m.user_id, m.role, state.currentUserName),
  })));
  const failed = outcomes.filter(o => !o.r.success);
  if (failed.length) {
    pendingMembers.push(...failed.map(o => o.m));
    showToast(`${failed.length} team member(s) could not be saved — try adding them again.`, 'error');
  }
}

// Guards against a leftover staged pick from an abandoned new-project
// attempt bleeding into a different, already-existing project opened later
// in the same session (module state, so it otherwise outlives one attempt).
export function clearPendingTeam() {
  pendingMembers = [];
}

export function installProjectTeam() {
  window.renderProjectTeamOp = () => renderProjectTeam('team-container-op', state.currentProjectCode);
}

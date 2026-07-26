import { state } from './state.js';
import { showToast } from './ui.js';
import { api } from './api.js';
import { collectAllData, populateUI } from './projectData.js';

export const ROLE_COLORS_MAP = {
  'ROV Supervisor': '#f39124', 'ROV Operator': '#459fd9', 'ROV Technician': '#10b981',
  'CSWIP 3.4U Ispector': '#8b5cf6', 'PRC Engineer': '#f59e0b', 'Inspection Engineer': '#ef4444',
};
const CREW_ROLES = ['ROV Supervisor', 'ROV Operator', 'ROV Technician', 'CSWIP 3.4U Ispector', 'PRC Engineer', 'Inspection Engineer'];

export function getInitials(n) {
  const w = n.trim().split(' ').filter(Boolean);
  return w.length >= 2 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (n.trim().substring(0, 2).toUpperCase() || '?');
}

function updateCrewEmptyState() {
  const container = document.getElementById('crew-container');
  const empty = document.getElementById('crew-empty-state');
  if (empty) empty.style.display = container.children.length ? 'none' : '';
}

function addCrewRow(name = '', role = 'ROV Supervisor', shift = 'Day', signOn = '', signOff = '') {
  if (state.currentUserRole === 'reviewer') return;
  const container = document.getElementById('crew-container');
  if (!container) return;
  const empty = document.getElementById('crew-empty-state');
  if (empty) empty.style.display = 'none';

  const isCustom = shift !== 'Day' && shift !== 'Night' && shift !== '';
  const color = ROLE_COLORS_MAP[role] || '#6b7280';
  const initials = name ? getInitials(name) : '?';
  const iStyle = 'background:#0f172a;border:1px solid #1e293b;color:white;padding:0 10px;border-radius:8px;width:100%;outline:none;height:36px;font-size:0.82rem;';

  const div = document.createElement('div');
  div.className = 'crew-row';
  div.style.cssText = 'display:grid;grid-template-columns:52px 1fr 1fr 110px 130px 130px 44px;gap:8px;align-items:center;padding:8px;border-radius:10px;margin-bottom:4px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.04);';

  div.innerHTML = `
    <div style="display:flex;justify-content:center;">
      <div class="crew-avatar" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;background:${color}22;color:${color};border:1px solid ${color}55;flex-shrink:0;">
        <span class="crew-avatar-text">${initials}</span>
      </div>
    </div>
    <div><input type="text" class="crew-name-input" style="${iStyle}" placeholder="Full Name..." value="${name}"></div>
    <div><select class="crew-role-select" style="${iStyle}cursor:pointer;">
      ${CREW_ROLES.map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${r}</option>`).join('')}
    </select></div>
    <div>
      <select class="crew-shift-select" style="${iStyle}cursor:pointer;${isCustom ? 'display:none;' : ''}">
        <option value="Day" ${!isCustom && shift === 'Day' ? 'selected' : ''}>Day</option>
        <option value="Night" ${!isCustom && shift === 'Night' ? 'selected' : ''}>Night</option>
        <option value="Custom" ${isCustom ? 'selected' : ''}>Custom...</option>
      </select>
      <input type="text" class="crew-shift-input" style="${iStyle}${isCustom ? '' : 'display:none;'}" placeholder="Shift type..." value="${isCustom ? shift : ''}">
    </div>
    <div><input type="date" class="crew-signon-input" style="${iStyle}color:#94a3b8;" value="${signOn}"></div>
    <div><input type="date" class="crew-signoff-input" style="${iStyle}color:#94a3b8;" value="${signOff}"></div>
    <div style="display:flex;justify-content:center;">
      <button type="button" class="crew-remove-btn" style="background:rgba(239,68,68,0.1);border:none;width:32px;height:32px;border-radius:8px;color:#ef4444;cursor:pointer;font-size:1rem;">✕</button>
    </div>`;

  const nameInput = div.querySelector('.crew-name-input');
  const avatarText = div.querySelector('.crew-avatar-text');
  const avatar = div.querySelector('.crew-avatar');
  const roleSelect = div.querySelector('.crew-role-select');
  const shiftSelect = div.querySelector('.crew-shift-select');
  const shiftInput = div.querySelector('.crew-shift-input');

  nameInput.addEventListener('input', () => { avatarText.textContent = nameInput.value ? getInitials(nameInput.value) : '?'; });
  roleSelect.addEventListener('change', () => {
    const c = ROLE_COLORS_MAP[roleSelect.value] || '#6b7280';
    avatar.style.background = c + '22'; avatar.style.color = c; avatar.style.border = `1px solid ${c}55`;
  });
  shiftSelect.addEventListener('change', () => {
    const custom = shiftSelect.value === 'Custom';
    shiftSelect.style.display = custom ? 'none' : '';
    shiftInput.style.display = custom ? '' : 'none';
    if (custom) shiftInput.focus();
  });
  div.querySelector('.crew-remove-btn').addEventListener('click', () => { div.remove(); updateCrewEmptyState(); });

  container.appendChild(div);
}

function showSyncIndicator(syncState) {
  const wrap = document.getElementById('sync-status');
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!wrap || !dot || !label) return;
  const states = {
    synced: { dot: '#22c55e', text: '#4ade80', label: 'Cloud synced' },
    offline: { dot: '#f59e0b', text: '#fbbf24', label: 'Offline' },
    saving: { dot: '#459fd9', text: '#60a5fa', label: 'Saving…' },
  };
  const s = states[syncState] || states.offline;
  wrap.style.display = 'flex';
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${s.dot};flex-shrink:0;`;
  label.style.color = s.text;
  label.textContent = s.label;
}

async function saveProject({ silent } = {}) {
  if (state.currentUserRole === 'reviewer') return;
  const data = collectAllData();
  const projectCode = data.projectCode;
  if (!projectCode) {
    if (!silent) showToast('Set a Project Code before saving.', 'warn');
    return;
  }
  state.currentProjectCode = projectCode;
  showSyncIndicator('saving');
  const result = await api.pushProject({
    project_code: projectCode,
    mode: 'operation',
    created_by: state.currentUserName,
    project_name: data.projectName || projectCode,
    data,
  });
  if (result.success) {
    state.isDirty = false;
    showSyncIndicator('synced');
    if (!silent) {
      const ind = document.getElementById('save-indicator');
      if (ind) { ind.classList.remove('hidden'); setTimeout(() => ind.classList.add('hidden'), 3000); }
      else showToast('Saved!', 'success');
    }
    api.logSyncAction({ project_code: projectCode, device_role: state.currentDeviceRole || 'vessel', user_name: state.currentUserName, action: 'update', meta: { mode: 'operation' } });
  } else {
    showSyncIndicator('offline');
    if (!silent) showToast('Save failed: ' + (result.error || 'unknown error'), 'error');
  }
}

export function startProjectAutoSave() {
  if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
  state.autoSaveTimer = setInterval(() => {
    if (state.currentMode !== 'operation' || state.currentUserRole === 'reviewer') return;
    if (!document.getElementById('projectCode')?.value) return;
    saveProject({ silent: true });
  }, 60 * 1000);
}

// Best-effort save on tab close/refresh — sendBeacon fires even as the page
// unloads, unlike a normal fetch which can get cancelled mid-flight.
export function flushSaveOnUnload() {
  if (state.currentMode !== 'operation' || state.currentUserRole === 'reviewer') return;
  const data = collectAllData();
  const projectCode = data.projectCode;
  if (!projectCode) return;
  const payload = JSON.stringify({
    project_code: projectCode,
    mode: 'operation',
    created_by: state.currentUserName,
    project_name: data.projectName || projectCode,
    data,
  });
  navigator.sendBeacon('/api/projects', new Blob([payload], { type: 'application/json' }));
}

export function installProjectDetails() {
  window.addCrewRow = addCrewRow;
  window.__addCrewRow = addCrewRow; // used by projectData.js populateUI()
  window.manualSyncToCloud = () => saveProject();

  document.getElementById('btn-save-pc')?.addEventListener('click', () => saveProject());

  document.getElementById('btn-load-pc')?.addEventListener('click', async () => {
    const code = prompt('Enter the project code to load:');
    if (!code) return;
    const result = await api.pullProject(code.trim().toUpperCase());
    if (!result.success) { showToast('Project not found.', 'error'); return; }
    state.currentProjectCode = result.project.project_code;
    populateUI(result.project.data);
    showToast('Project loaded.', 'success');
  });
}

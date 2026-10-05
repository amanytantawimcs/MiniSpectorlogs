import { state, getDeviceId } from './state.js';
import { showToast } from './ui.js';
import { api, getSessionToken, rememberLastProjectCode } from './api.js';
import { noteSavedUpdatedAt } from './staleCheck.js';
import { recordSave, isUnchangedSinceSave } from './historyChanges.js';
import { collectAllData } from './projectData.js';
import { renderProjectTeam, flushPendingTeam } from './projectTeam.js';

export const ROLE_COLORS_MAP = {
  'ROV Supervisor': '#f39124', 'ROV Operator': '#459fd9', 'ROV Technician': '#10b981',
  'CSWIP 3.4U Ispector': '#8b5cf6', 'PRC Engineer': '#f59e0b', 'Inspection Engineer': '#ef4444',
};
export const CREW_ROLES = ['ROV Supervisor', 'ROV Operator', 'ROV Technician', 'CSWIP 3.4U Ispector', 'PRC Engineer', 'Inspection Engineer'];

export function getInitials(n) {
  const w = n.trim().split(' ').filter(Boolean);
  return w.length >= 2 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (n.trim().substring(0, 2).toUpperCase() || '?');
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

// Tracks the last project_code we've already warned about via the 20s
// autosave, so a user who doesn't immediately fix a code collision isn't
// shown the same toast every 20 seconds — one warning per distinct code.
let lastCodeTakenWarned = null;

export async function saveProject({ silent } = {}) {
  if (state.currentUserRole === 'reviewer') return;
  const data = collectAllData();
  const projectCode = data.projectCode;
  if (!projectCode) {
    if (!silent) showToast('Set a Project Code before saving.', 'warn');
    return;
  }
  if (silent && isUnchangedSinceSave('operation', data)) return;
  // Only re-render the embedded Project Team section on the save that first
  // gives this project a code — not on every 20s autosave after that, which
  // would otherwise wipe out an in-progress search the user is typing there.
  // Also doubles as the "is this a brand-new project" signal for createOnly
  // below: state.currentProjectCode is only ever set by Join, Load Project,
  // a sim→operation sync, or a previous successful save here — never
  // speculatively, so !state.currentProjectCode reliably means "nothing has
  // confirmed this project_code is ours yet."
  const isFirstSave = !state.currentProjectCode;
  showSyncIndicator('saving');
  const result = await api.pushProject({
    project_code: projectCode,
    mode: 'operation',
    created_by: state.currentUserName,
    project_name: data.projectName || projectCode,
    data,
    createOnly: isFirstSave,
  });
  if (result.success) {
    state.currentProjectCode = projectCode;
    state.isDirty = false;
    noteSavedUpdatedAt(result.updated_at);
    if (isFirstSave) {
      await flushPendingTeam(projectCode);
      renderProjectTeam('team-container-op', projectCode);
      // Remember this brand-new project as "last active" too — otherwise only
      // Join sets this, and refreshing right after creating a project would
      // lose the session-restore's ability to rejoin it (see tryRestoreSession()
      // in auth.js).
      rememberLastProjectCode(projectCode);
    }
    showSyncIndicator('synced');
    if (!silent) {
      const ind = document.getElementById('save-indicator');
      if (ind) { ind.classList.remove('hidden'); setTimeout(() => ind.classList.add('hidden'), 3000); }
      else showToast('Saved!', 'success');
    }
    recordSave({ mode: 'operation', section: 'Operation', projectCode, data });
  } else if (result.codeTaken) {
    // Always surfaced, even on a silent autosave — a code collision needs
    // the user to act (pick a different code), unlike a transient offline
    // failure that autosave will just quietly retry. Throttled to once per
    // distinct code so an unfixed collision doesn't re-toast every 20s.
    showSyncIndicator('offline');
    if (lastCodeTakenWarned !== projectCode) {
      lastCodeTakenWarned = projectCode;
      showToast(`Project code "${projectCode}" is already in use by another project. Choose a different code, or use Join Project to open the existing one.`, 'error');
    }
  } else {
    showSyncIndicator('offline');
    if (!silent) showToast('Save failed: ' + (result.error || 'unknown error'), 'error');
  }
}

export function startProjectAutoSave() {
  if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
  state.autoSaveTimer = setInterval(() => {
    if (state.currentMode !== 'operation' || state.currentUserRole === 'reviewer') return;
    if (!state.currentProjectCode) return;
    saveProject({ silent: true });
  }, 20 * 1000);
}

// Best-effort save on tab close/refresh — sendBeacon fires even as the page
// unloads, unlike a normal fetch which can get cancelled mid-flight.
export function flushSaveOnUnload() {
  if (state.currentMode !== 'operation' || state.currentUserRole === 'reviewer') return;
  const data = collectAllData();
  const projectCode = data.projectCode;
  if (!projectCode) return;
  const payload = JSON.stringify({
    device_id: getDeviceId(),
    project_code: projectCode,
    mode: 'operation',
    created_by: state.currentUserName,
    project_name: data.projectName || projectCode,
    data,
    sessionToken: getSessionToken(),
    // sendBeacon has no response to read, so a collision here can't show a
    // warning — but createOnly still stops it from silently upserting into
    // someone else's project on the way out the door.
    createOnly: !state.currentProjectCode,
  });
  navigator.sendBeacon('/api/projects', new Blob([payload], { type: 'application/json' }));
}

export function installProjectDetails() {
}

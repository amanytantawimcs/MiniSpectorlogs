// Simulation workspace shell: Step 2 (ROV tabs, sub-tab switching, progress
// bar/badges), scope loading, and the collect/load pair that mirrors
// collectAllData()/populateUI() from the Operation side.

import { state } from '../state.js';
import { api, getSessionToken } from '../api.js';
import { noteSavedUpdatedAt } from '../staleCheck.js';
import { showToast, setActiveNavItem } from '../ui.js';
import { simState } from './state.js';
import { MINISPECTOR_FIXED_SENSORS, DEFAULT_SYSTEM_IPS } from './config.js';
import { scopeName } from './scopeCatalog.js';
import { sensorReadinessItems } from './sensors.js';
import { renderProjectTeam, flushPendingTeam } from '../projectTeam.js';

let syncDebounceTimer = null;
let autoSaveTimer = null;
let lastSavedAt = null;

function formatAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
}

function updateSaveIndicator() {
  const wrap = document.getElementById('sim-save-status');
  const txt = document.getElementById('sim-save-text');
  if (!wrap || !txt) return;
  if (!lastSavedAt) { wrap.classList.remove('show'); return; }
  txt.textContent = `Saved ${formatAgo(lastSavedAt)}`;
  wrap.classList.add('show');
}

export function loadFreshScope(scopeBundle) {
  simState.shared.sensors = scopeBundle.sensors.map(s => ({
    name: s.name, note: s.note || '', status: s.status,
    included: s.status === 'required', model: '', serialNo: '', qty: 1,
    calibrated: false, tested: false, custom: false, rovAssignment: 'Shared',
  }));
}

export function mergeWithNewScope(scopeBundle) {
  const existingByName = {};
  (simState.shared.sensors || []).forEach(s => { existingByName[s.name] = s; });

  const merged = scopeBundle.sensors.map(s => {
    const existing = existingByName[s.name];
    delete existingByName[s.name];
    return {
      name: s.name, note: s.note || '', status: s.status,
      included: s.status === 'required' ? true : (existing ? !!existing.included : false),
      model: existing?.model || '', serialNo: existing?.serialNo || '', qty: existing?.qty || 1,
      calibrated: existing ? !!existing.calibrated : false, tested: existing ? !!existing.tested : false,
      custom: false, rovAssignment: existing?.rovAssignment || 'Shared',
      ...(existing?.instances ? { instances: existing.instances.map(inst => ({ ...inst })) } : {}),
    };
  });
  Object.values(existingByName).forEach(s => {
    const hasInstanceWork = Array.isArray(s.instances) && s.instances.some(inst => inst.model || inst.calibrated || inst.tested);
    if (s.custom || s.model || s.calibrated || s.tested || hasInstanceWork) merged.push({ ...s, custom: true, status: 'custom' });
  });
  simState.shared.sensors = merged;
}

export function collectSimState() {
  return {
    type: 'simulation',
    reportDate: new Date().toISOString().split('T')[0],
    projectName: simState.projectData.name,
    projectCode: simState.projectData.code,
    projectScope: simState.projectData.description,
    projectAsset: simState.projectData.asset,
    projectWeatherWindow: simState.projectData.weatherWindow,
    scopeId: simState.selectedScope,
    scopeName: scopeName(simState.selectedScope),
    rovs: [...simState.selectedROVs.entries()].map(([num, role]) => ({
      rovNumber: num, role, serial: simState.rovSerials.get(num) || '', description: simState.rovDescriptions.get(num) || '',
    })),
    sensors: simState.shared.sensors,
    rovSensors: Object.fromEntries(Object.entries(simState.shared.rovSensors || {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])),
    sysarch: {
      machines: (simState.shared.sysarch?.machines || []).map(m => ({ ...m })),
      equipment: (simState.shared.sysarch?.equipment || []).map(e => ({ ...e })),
      simStatus: (simState.shared.sysarch?.simStatus || []).map(s => ({ ...s })),
      deliverables: { ...(simState.shared.sysarch?.deliverables || {}) },
      systemIPs: (simState.shared.sysarch?.systemIPs || []).map(p => ({ ...p })),
    },
    issues: (simState.shared.issues || []).map(i => ({ ...i })),
    thrusters: (simState.shared.thrusters || []).map(t => ({ ...t })),
    approvalStatus: simState.approval.status,
    approvalHistory: simState.approval.history,
  };
}

export function loadSimulationState(data, isSimLocked) {
  simState.projectData = {
    name: data.projectName || '', code: data.projectCode || '', description: data.projectScope || '',
    asset: data.projectAsset || '', weatherWindow: data.projectWeatherWindow || '',
  };
  simState.selectedScope = data.scopeId || null;
  simState.approval = { status: data.approvalStatus || 'draft', history: data.approvalHistory || [] };
  simState.locked = !!isSimLocked;

  simState.selectedROVs = new Map();
  simState.rovSerials = new Map();
  simState.rovDescriptions = new Map();
  (data.rovs || []).forEach(r => {
    simState.selectedROVs.set(r.rovNumber, r.role || 'main');
    if (r.serial) simState.rovSerials.set(r.rovNumber, r.serial);
    if (r.description) simState.rovDescriptions.set(r.rovNumber, r.description);
  });

  simState.shared = {
    sensors: data.sensors || [],
    rovSensors: Object.fromEntries(Object.entries(data.rovSensors || {}).map(([k, v]) => [k, (v || []).map(s => ({ ...s }))])),
    issues: (data.issues || []).map(i => ({ ...i })),
    thrusters: (data.thrusters || []).map(t => ({ ...t })),
    sysarch: {
      diagramDataUrl: data.sysarch?.diagramDataUrl || null,
      machines: (data.sysarch?.machines || []).map(m => ({ ...m })),
      equipment: (data.sysarch?.equipment || []).map(e => ({ ...e })),
      simStatus: (data.sysarch?.simStatus || []).map(s => ({ ...s })),
      deliverables: data.sysarch?.deliverables ? { ...data.sysarch.deliverables } : {},
      systemIPs: (data.sysarch?.systemIPs || DEFAULT_SYSTEM_IPS).map(p => ({ ...p })),
    },
  };
  for (const [num] of simState.selectedROVs.entries()) {
    if (!simState.shared.rovSensors[num]) {
      simState.shared.rovSensors[num] = MINISPECTOR_FIXED_SENSORS.map(s => ({
        name: s.name, category: s.category, model: '', serial: '', qty: 1,
        calibrated: false, calibratedDate: '', tested: false, testedDate: '', fixed: true,
      }));
    }
  }

  document.getElementById('sim-step-1').classList.add('hidden');
  document.getElementById('sim-step-2').classList.remove('hidden');
  simState.activeROV = Math.min(...simState.selectedROVs.keys());
  window.__updateSimUnitsBadge?.();
  renderWorkspaceShell();
}

export function renderWorkspaceShell() {
  switchSimSubTab(simState.activeSubTab || 'sensors');
}

const SUBTAB_NAV_IDS = { sensors: 'sim-nav-sensors', sysarch: 'sim-nav-topology' };
const SUBTAB_TITLES = { sensors: 'Sensors and equipment', sysarch: 'Topology' };

export function switchSimSubTab(tab) {
  simState.activeSubTab = tab;
  document.querySelectorAll('.sim-subtab').forEach(btn => {
    btn.classList.remove('border-orange-500', 'text-white');
    btn.classList.add('border-transparent', 'text-gray-400');
  });
  const active = document.getElementById(`sim-subtab-${tab}`);
  if (active) { active.classList.add('border-orange-500', 'text-white'); active.classList.remove('border-transparent', 'text-gray-400'); }

  // Keep the sidebar's Sensors/Topology/Readiness nav items in sync regardless
  // of whether this was triggered from the sidebar or the in-workspace toolbar.
  const navEl = document.getElementById(SUBTAB_NAV_IDS[tab]);
  setActiveNavItem(navEl, '#nav-simulation-section .nav-item');
  const titleEl = document.getElementById('page-title');
  if (titleEl && SUBTAB_TITLES[tab]) titleEl.innerText = SUBTAB_TITLES[tab];

  renderSimContent();
}

export async function renderSimContent() {
  const area = document.getElementById('sim-content-area');
  if (!area) return;
  if (simState.activeSubTab === 'sysarch') {
    const { renderSysArchContent } = await import('./sysarch.js');
    renderSysArchContent(area);
  } else {
    const { renderSensorsContent } = await import('./sensors.js');
    renderSensorsContent(area);
  }
  // Sensors/Topology have dozens of individual inline inputs/toggles with no
  // single choke point to gate — locking interaction here, once, covers all
  // of them instead of threading a disabled-state through every builder.
  // The server already rejects a reviewer's writes (assertCanWrite), this
  // just stops the UI from pretending the edit did anything.
  const readOnly = state.currentUserRole === 'reviewer';
  area.style.pointerEvents = readOnly ? 'none' : '';
  area.style.opacity = readOnly ? '0.6' : '';
  updateSimTabBadges();
  updateSimProgress();
}

// Sets both the visible badge text and the accessible name (aria-label +
// data-tooltip, read by the collapsed icon-rail tooltip) from one string so
// the two can never drift apart.
export function labelNavItem(navId, text) {
  const el = document.getElementById(navId);
  if (!el) return;
  el.setAttribute('aria-label', text);
  el.setAttribute('data-tooltip', text);
}

function updateSimTabBadges() {
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const sensorItems = sensors.flatMap(sensorReadinessItems);
  const machines = simState.shared.sysarch?.machines || [];
  const equip = simState.shared.sysarch?.equipment || [];
  const sEl = document.getElementById('sim-badge-sensors');
  const aEl = document.getElementById('sim-badge-sysarch');
  if (sEl) sEl.innerText = sensorItems.length;
  if (aEl) aEl.innerText = machines.length + equip.length;

  // Sensors & Equipment sidebar badge: ready/total, same `sensorItems` list
  // the toolbar badge above already uses — one source of truth, can't
  // disagree. Each unit of a Qty > 1 sensor line counts as its own item.
  const sensorsReady = sensorItems.filter(s => s.calibrated && s.tested && s.model).length;
  const navSensorsBadge = document.getElementById('sim-nav-badge-sensors');
  if (navSensorsBadge) navSensorsBadge.textContent = `${sensorsReady}/${sensorItems.length}`;
  labelNavItem('sim-nav-sensors', `Sensors and equipment — ${sensorsReady}/${sensorItems.length} ready`);
}

function updateSimProgress() {
  const bar = document.getElementById('sim-progress-bar');
  if (!bar) return;
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const sensorItems = sensors.flatMap(sensorReadinessItems);
  if (sensorItems.length === 0) { bar.style.width = '0%'; return; }
  const ready = sensorItems.filter(s => s.calibrated && s.tested && s.model).length;
  bar.style.width = Math.round((ready / sensorItems.length) * 100) + '%';
}

export async function saveSimulation({ silent } = {}) {
  if (!simState.projectData.code) {
    if (!silent) showToast('Enter a Project Code before saving.', 'warn');
    return;
  }
  const result = await api.pushProject({
    project_code: simState.projectData.code,
    mode: 'simulation',
    created_by: state.currentUserName,
    project_name: simState.projectData.name || simState.projectData.code,
    data: collectSimState(),
  });
  if (result.success) {
    // Same reasoning as projectDetails.js's isFirstSave: only refresh the
    // embedded Project Team section on the save that first persists this
    // project server-side, not on every 20s autosave after that, which
    // would otherwise wipe out an in-progress search mid-keystroke.
    const isFirstSave = !lastSavedAt;
    lastSavedAt = Date.now();
    noteSavedUpdatedAt(result.updated_at);
    if (isFirstSave) { await flushPendingTeam(simState.projectData.code); renderProjectTeam('team-container-sim', simState.projectData.code); }
    updateSaveIndicator();
    if (!silent) showToast('Simulation saved.', 'success');
  } else if (!silent) {
    showToast('Save failed: ' + (result.error || 'unknown error'), 'error');
  }
  return result;
}

// Debounced push — fires 2s after the last mutation, so a second joined
// device sees fresh data quickly without saving on every keystroke.
export function scheduleSimSync() {
  if (!simState.projectData.code) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => saveSimulation({ silent: true }), 2000);
}

export function startSimAutoSave() {
  stopSimAutoSave();
  autoSaveTimer = setInterval(() => {
    if (state.currentMode !== 'simulation' || !simState.selectedScope) return;
    saveSimulation({ silent: true });
  }, 20 * 1000);
}

export function stopSimAutoSave() {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
}

// Best-effort save on tab close/refresh, mirrors flushSaveOnUnload() in projectDetails.js.
export function flushSimOnUnload() {
  if (state.currentMode !== 'simulation' || !simState.projectData.code) return;
  const payload = JSON.stringify({
    project_code: simState.projectData.code,
    mode: 'simulation',
    created_by: state.currentUserName,
    project_name: simState.projectData.name || simState.projectData.code,
    data: collectSimState(),
    sessionToken: getSessionToken(),
  });
  navigator.sendBeacon('/api/projects', new Blob([payload], { type: 'application/json' }));
}

// The sidebar nav items are plain divs (styling/markup predates this pass),
// so give them button semantics + keyboard activation once at startup rather
// than rewriting every onclick site to a <button>.
function installSimNavKeyboardSupport() {
  document.querySelectorAll('#nav-simulation-section .nav-item').forEach(el => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      el.click();
    });
  });
}

export function installSimCore() {
  window.switchSimSubTab = switchSimSubTab;
  setInterval(updateSaveIndicator, 15 * 1000);
  installSimNavKeyboardSupport();
}

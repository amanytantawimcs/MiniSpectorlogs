// Simulation workspace shell: Step 2 (ROV tabs, sub-tab switching, progress
// bar/badges), scope loading, and the collect/load pair that mirrors
// collectAllData()/populateUI() from the Operation side.

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../ui.js';
import { simState } from './state.js';
import { OPERATION_SCOPES, MINISPECTOR_FIXED_SENSORS, DEFAULT_SYSTEM_IPS } from './config.js';

let syncDebounceTimer = null;
let autoSaveTimer = null;

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
    };
  });
  Object.values(existingByName).forEach(s => {
    if (s.custom || s.model || s.calibrated || s.tested) merged.push({ ...s, custom: true, status: 'custom' });
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
    scopeId: simState.selectedScope,
    scopeName: OPERATION_SCOPES[simState.selectedScope]?.name || '',
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
  simState.projectData = { name: data.projectName || '', code: data.projectCode || '', description: data.projectScope || '' };
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
        name: s.name, category: s.category, model: '', qty: 1, calibrated: false, tested: false, fixed: true,
      }));
    }
  }

  document.getElementById('sim-step-1').classList.add('hidden');
  document.getElementById('sim-step-2').classList.remove('hidden');
  simState.activeROV = Math.min(...simState.selectedROVs.keys());
  renderWorkspaceShell();
}

export function renderWorkspaceShell() {
  renderSimROVTabs();
  switchSimSubTab(simState.activeSubTab || 'sensors');
}

function renderSimROVTabs() {
  const container = document.getElementById('sim-rov-tabs');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';
  [...simState.selectedROVs.entries()].sort((a, b) => a[0] - b[0]).forEach(([num, role]) => {
    const isMain = role === 'main';
    const tab = document.createElement('div');
    tab.className = `px-4 py-3 text-sm font-bold border-b-2 ${isMain ? 'border-orange-500 text-white' : 'border-gray-600 text-gray-400'} whitespace-nowrap flex items-center cursor-pointer hover:text-white transition-colors`;
    tab.innerHTML = `MS-${num}<span style="background:${isMain ? '#f39124' : '#374151'};color:${isMain ? 'white' : '#9ca3af'};font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px;letter-spacing:0.05em;">${isMain ? 'MAIN' : 'STBY'}</span>`;
    tab.addEventListener('click', () => switchSimROV(num));
    container.appendChild(tab);
  });
}

function switchSimROV(num) {
  simState.activeROV = num;
  renderSimROVTabs();
  if (simState.activeSubTab === 'sensors') renderSimContent();
}

export function switchSimSubTab(tab) {
  simState.activeSubTab = tab;
  document.querySelectorAll('.sim-subtab').forEach(btn => {
    btn.classList.remove('border-orange-500', 'text-white');
    btn.classList.add('border-transparent', 'text-gray-400');
  });
  const active = document.getElementById(`sim-subtab-${tab}`);
  if (active) { active.classList.add('border-orange-500', 'text-white'); active.classList.remove('border-transparent', 'text-gray-400'); }
  renderSimContent();
}

export async function renderSimContent() {
  const area = document.getElementById('sim-content-area');
  if (!area) return;
  if (simState.activeSubTab === 'sysarch') {
    const { renderSysArchContent } = await import('./sysarch.js');
    renderSysArchContent(area);
  } else if (simState.activeSubTab === 'readiness') {
    const { renderReadinessContent } = await import('./readiness.js');
    renderReadinessContent(area);
  } else {
    const { renderSensorsContent } = await import('./sensors.js');
    renderSensorsContent(area);
  }
  updateSimTabBadges();
  updateSimProgress();
}

function updateSimTabBadges() {
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const machines = simState.shared.sysarch?.machines || [];
  const equip = simState.shared.sysarch?.equipment || [];
  const sEl = document.getElementById('sim-badge-sensors');
  const aEl = document.getElementById('sim-badge-sysarch');
  const rEl = document.getElementById('sim-badge-readiness');
  if (sEl) sEl.innerText = sensors.length;
  if (aEl) aEl.innerText = machines.length + equip.length;
  if (rEl) {
    const allActive = [...sensors, ...Object.values(simState.shared.rovSensors || {}).flat()];
    const tot = allActive.length;
    const rdy = allActive.filter(s => s.calibrated && s.tested && s.model).length;
    const pct = tot > 0 ? Math.round(rdy / tot * 100) : 0;
    rEl.innerText = pct + '%';
    rEl.style.background = pct === 100 ? 'rgba(34,197,94,0.2)' : pct >= 60 ? 'rgba(243,145,36,0.2)' : 'rgba(239,68,68,0.2)';
    rEl.style.color = pct === 100 ? '#22c55e' : pct >= 60 ? '#f39124' : '#f87171';
  }
}

function updateSimProgress() {
  const bar = document.getElementById('sim-progress-bar');
  if (!bar) return;
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  if (sensors.length === 0) { bar.style.width = '0%'; return; }
  const ready = sensors.filter(s => s.calibrated && s.tested && s.model).length;
  bar.style.width = Math.round((ready / sensors.length) * 100) + '%';
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

export function installSimCore() {
  window.switchSimSubTab = switchSimSubTab;
}

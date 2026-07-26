// Step 1 of the Simulation flow: Mission Info + MiniSpector (ROV) grid.
// Ported from the old app's setup wizard, rewritten to use addEventListener on
// dynamically-built elements instead of inline onclick strings.

import { state } from '../state.js';
import { showToast } from '../ui.js';
import { simState, resetSimState } from './state.js';
import { OPERATION_SCOPES, MINISPECTOR_FIXED_SENSORS } from './config.js';
import { loadFreshScope, mergeWithNewScope, renderWorkspaceShell } from './core.js';

function rovHasDiveLogs(num) {
  const logs = state.currentReportData.diveLogs || [];
  return logs.some(d => {
    const val = (d.rov || d.rovName || '').toLowerCase();
    return val.includes(`minispector ${num}`) || val.includes(`ms-${num}`) || val === String(num);
  });
}

function updateScopePreview(scopeId) {
  const preview = document.getElementById('sim-scope-preview');
  const reqEl = document.getElementById('scope-preview-required');
  const optEl = document.getElementById('scope-preview-optional');
  if (!preview || !scopeId || !OPERATION_SCOPES[scopeId]) {
    preview?.classList.add('hidden');
    return;
  }
  const scope = OPERATION_SCOPES[scopeId];
  const required = scope.sensors.filter(s => s.status === 'required').map(s => s.name);
  const optional = scope.sensors.filter(s => s.status === 'optional').map(s => s.name);
  reqEl.innerText = required.join(' · ') || '—';
  optEl.innerText = optional.join(' · ') || 'None';
  preview.classList.remove('hidden');
}

function renderROVChips() {
  const container = document.getElementById('sim-rov-chips');
  if (!container) return;
  container.innerHTML = '';
  for (let num = 1; num <= 12; num++) {
    const role = simState.selectedROVs.get(num);
    const selected = role !== undefined;
    const isMain = role === 'main';

    const chip = document.createElement('div');
    chip.className = `relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
      selected ? 'border-orange-500 bg-orange-500/10 shadow-md shadow-orange-500/10'
               : 'border-yellow-500/50 bg-gray-800/50 hover:bg-yellow-500/5'
    }`;

    chip.innerHTML = `
      ${selected ? `<button type="button" class="rov-remove-btn absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 hover:bg-red-500/30 text-gray-500 hover:text-red-400 text-[10px] font-bold transition-all leading-none">&#215;</button>` : ''}
      <div class="w-14 h-14 rounded-lg flex items-center justify-center transition-all ${selected ? 'bg-orange-500/20' : 'bg-yellow-500/10'}">
        <img src="assets/rov_icon.png" class="w-10 h-10 object-contain" onerror="this.style.display='none'">
      </div>
      <span class="text-xs font-bold tracking-wide ${selected ? 'text-orange-300' : 'text-white'}">MS-${num}</span>
      ${selected
        ? `<button type="button" class="rov-role-btn text-[9px] font-bold px-2.5 py-0.5 rounded-full transition-all ${isMain ? 'bg-orange-500 text-white cursor-default' : 'bg-gray-700 text-gray-400 hover:bg-blue-500/20 hover:text-blue-300 cursor-pointer'}" title="${isMain ? 'Main unit' : 'Click to promote to Main'}">${isMain ? 'MAIN' : 'STANDBY'}</button>`
        : `<span class="text-[9px] text-white/60 font-medium">Available</span>`}
    `;

    chip.addEventListener('click', () => toggleSimROV(num));
    chip.querySelector('.rov-remove-btn')?.addEventListener('click', (e) => { e.stopPropagation(); removeROV(num); });
    chip.querySelector('.rov-role-btn')?.addEventListener('click', (e) => { e.stopPropagation(); if (!isMain) setROVRole(num); });

    container.appendChild(chip);
  }
}

function updateBeginBtn() {
  const count = simState.selectedROVs.size;
  const label = document.getElementById('sim-selected-label');
  const btn = document.getElementById('btn-begin-sim');
  const mainNum = [...simState.selectedROVs.entries()].find(([, r]) => r === 'main')?.[0];
  if (label) {
    label.innerText = count === 0
      ? 'Select an operation scope and at least one MiniSpector to begin'
      : `${count} MiniSpector${count > 1 ? 's' : ''} selected · Main: MS-${mainNum || '?'}${simState.selectedScope ? '' : ' · (scope required)'}`;
  }
  if (btn) btn.disabled = count === 0 || !simState.selectedScope;
}

function toggleSimROV(num) {
  if (simState.selectedROVs.has(num)) {
    removeROV(num);
    return;
  }
  const role = simState.selectedROVs.size === 0 ? 'main' : 'standby';
  simState.selectedROVs.set(num, role);
  if (!simState.shared.rovSensors[num]) {
    simState.shared.rovSensors[num] = MINISPECTOR_FIXED_SENSORS.map(s => ({
      name: s.name, category: s.category, model: '', qty: 1, calibrated: false, tested: false, fixed: true,
    }));
  }
  renderROVChips();
  updateBeginBtn();
}

function removeROV(num) {
  if (rovHasDiveLogs(num)) {
    showToast(`MS-${num} has dive logs recorded against it and cannot be removed. Edit or delete those entries first.`, 'error');
    return;
  }
  const wasMain = simState.selectedROVs.get(num) === 'main';
  simState.selectedROVs.delete(num);
  simState.rovSerials.delete(num);
  simState.rovDescriptions.delete(num);
  delete simState.shared.rovSensors[num];
  if (wasMain && simState.selectedROVs.size > 0) {
    const nextMain = [...simState.selectedROVs.keys()].sort((a, b) => a - b)[0];
    simState.selectedROVs.set(nextMain, 'main');
  }
  renderROVChips();
  updateBeginBtn();
}

function setROVRole(num) {
  if (!simState.selectedROVs.has(num) || simState.selectedROVs.get(num) === 'main') return;
  if (rovHasDiveLogs(num)) {
    showToast(`MS-${num} has dive logs recorded against it. Its role cannot be changed until those are removed.`, 'error');
    return;
  }
  for (const k of simState.selectedROVs.keys()) simState.selectedROVs.set(k, 'standby');
  simState.selectedROVs.set(num, 'main');
  renderROVChips();
  updateBeginBtn();
}

export function showSimSetupTab(tab) {
  ['mission', 'units'].forEach(t => {
    document.getElementById(`sim-setup-${t}`)?.classList.toggle('hidden', t !== tab);
  });
  document.getElementById('sim-step1-footer')?.classList.toggle('hidden', tab !== 'units');
  if (tab === 'units') renderROVChips();
}

function beginSimulation() {
  if (!simState.selectedScope || !OPERATION_SCOPES[simState.selectedScope]) {
    showToast('Please select an operation scope first.', 'warn');
    return;
  }
  if (simState.selectedROVs.size === 0) {
    showToast('Please add at least one MiniSpector unit.', 'warn');
    return;
  }

  simState.projectData = {
    name: document.getElementById('sim-project-name')?.value.trim() || '',
    code: document.getElementById('sim-project-code')?.value.trim() || '',
    description: document.getElementById('sim-project-desc')?.value.trim() || '',
  };

  const scopeBundle = OPERATION_SCOPES[simState.selectedScope];
  const scopeChanged = simState.shared.scopeId && simState.shared.scopeId !== simState.selectedScope;
  const hasWork = Array.isArray(simState.shared.sensors) && simState.shared.sensors.some(s => s.model || s.calibrated || s.tested);

  if (scopeChanged && hasWork) {
    const keep = confirm(
      `You changed the scope from "${OPERATION_SCOPES[simState.shared.scopeId]?.name || 'previous'}" to "${scopeBundle.name}".\n\n` +
      `You have existing sensor data (models, calibration, testing).\n\n` +
      `Click OK to KEEP your work and merge with the new scope.\nClick Cancel to RESET and start fresh.`
    );
    if (keep) mergeWithNewScope(scopeBundle); else loadFreshScope(scopeBundle);
  } else if (!simState.shared.scopeId || scopeChanged) {
    if (!(hasWork && !scopeChanged)) loadFreshScope(scopeBundle);
  }
  simState.shared.scopeId = simState.selectedScope;

  const mainEntry = [...simState.selectedROVs.entries()].find(([, r]) => r === 'main');
  simState.activeROV = mainEntry ? mainEntry[0] : [...simState.selectedROVs.keys()].sort((a, b) => a - b)[0];

  document.getElementById('sim-step-1').classList.add('hidden');
  document.getElementById('sim-step-2').classList.remove('hidden');

  renderWorkspaceShell();
}

function simGoBack() {
  document.getElementById('sim-step-2').classList.add('hidden');
  document.getElementById('sim-step-1').classList.remove('hidden');
  const nameEl = document.getElementById('sim-project-name');
  const codeEl = document.getElementById('sim-project-code');
  const descEl = document.getElementById('sim-project-desc');
  if (nameEl) nameEl.value = simState.projectData.name;
  if (codeEl) codeEl.value = simState.projectData.code;
  if (descEl) descEl.value = simState.projectData.description;
  showSimSetupTab('units');
}

export function initSimROVGrid() {
  resetSimState();

  document.getElementById('sim-step-1').classList.remove('hidden');
  document.getElementById('sim-step-2').classList.add('hidden');

  ['sim-project-name', 'sim-project-code', 'sim-project-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const scopeDropdown = document.getElementById('sim-scope-dropdown');
  if (scopeDropdown) {
    scopeDropdown.value = '';
    scopeDropdown.onchange = () => {
      const val = parseInt(scopeDropdown.value, 10);
      const newScope = val || null;

      if (simState.selectedScope !== null && newScope !== simState.selectedScope) {
        const hasData = (simState.shared.sensors?.length > 0)
          || (simState.shared.sysarch?.machines?.length > 0)
          || (simState.shared.sysarch?.equipment?.length > 0)
          || (simState.selectedROVs.size > 0);
        if (hasData) {
          const confirmed = confirm('Changing the scope will reset all sensors, machines, equipment, and ROV selections you have configured.\n\nAre you sure?');
          if (!confirmed) { scopeDropdown.value = simState.selectedScope ?? ''; return; }
          simState.shared = { sensors: [], rovSensors: {}, sysarch: { diagramDataUrl: null, machines: [], equipment: [], simStatus: [], deliverables: {}, systemIPs: [] }, issues: [], thrusters: [] };
          simState.selectedROVs = new Map();
          renderROVChips();
        }
      }
      simState.selectedScope = newScope;
      updateScopePreview(newScope);
      updateBeginBtn();
    };
  }

  document.getElementById('sim-scope-preview')?.classList.add('hidden');
  showSimSetupTab('mission');
  renderROVChips();
  updateBeginBtn();
}

export function installSimSetup() {
  window.showSimSetupTab = showSimSetupTab;
  window.beginSimulation = beginSimulation;
  window.simGoBack = simGoBack;
}

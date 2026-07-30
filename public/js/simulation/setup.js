// Step 1 of the Simulation flow: Mission Info (project details + a
// searchable, editable operation-scope catalog) and MiniSpectors (a fleet
// picker with role assignment and auto-assign).

import { state } from '../state.js';
import { showToast, escapeHtml } from '../ui.js';
import { simState, resetSimState } from './state.js';
import { MINISPECTOR_FIXED_SENSORS, SENSOR_HARDWARE } from './config.js';
import { getAllBundles, findScope, scopeName, addCustomBundle } from './scopeCatalog.js';
import { loadFreshScope, mergeWithNewScope, renderWorkspaceShell, switchSimSubTab, labelNavItem } from './core.js';
import { renderProjectTeam } from '../projectTeam.js';

const SENSOR_ALL = Object.keys(SENSOR_HARDWARE);
const ROV_SVG = '<img src="assets/rov_icon.png" alt="MiniSpector"/>';
const FLEET_SIZE = 12;

// Scope-editing scratch state (what's shown/edited in the catalog detail
// panel). simState.selectedScope only ever holds a catalog id (or null for
// a blank/unsaved bundle) — this holds the live req/opt arrays being edited.
let scopeSelectedId = null;
let scopeWorking = null;
let scopeDirty = false;
let scopeSearchEl = null;
let scopeFamEl = null;

function rovHasDiveLogs(num) {
  const logs = state.currentReportData.diveLogs || [];
  return logs.some(d => {
    const val = (d.rov || d.rovName || '').toLowerCase();
    return val.includes(`minispector ${num}`) || val.includes(`ms-${num}`) || val === String(num);
  });
}

function cloneBundle(b) {
  return { id: b.id, fam: b.fam, name: b.name, req: b.req.slice(), opt: b.opt.slice() };
}

function syncScopeWorkingFromState() {
  const found = simState.selectedScope ? findScope(simState.selectedScope) : null;
  if (found) {
    scopeSelectedId = simState.selectedScope;
    scopeWorking = { id: found.id, fam: found.fam, name: found.name, req: found.req.slice(), opt: found.opt.slice() };
    scopeDirty = false;
  } else {
    scopeSelectedId = null;
    scopeWorking = null;
    scopeDirty = false;
  }
}

/* ---------------- Operation scope catalog ---------------- */

function renderScopeCatalog() {
  const term = (scopeSearchEl?.value || '').trim().toLowerCase();
  const fam = scopeFamEl?.value || '';
  const all = getAllBundles();
  const list = all.filter(b => {
    if (fam && b.fam !== fam) return false;
    if (!term) return true;
    return (b.name + ' ' + b.id + ' ' + b.req.join(' ') + ' ' + b.opt.join(' ')).toLowerCase().indexOf(term) > -1;
  });

  const countEl = document.getElementById('scope-cat-count');
  if (countEl) countEl.textContent = `${list.length} of ${all.length} bundles`;

  const catEl = document.getElementById('scope-catalog');
  if (!catEl) return;
  if (!list.length) {
    catEl.innerHTML = '<p class="scope-empty">No bundle matches that. Try a sensor name, or start a blank bundle.</p>';
    return;
  }

  const fams = [];
  list.forEach(b => { if (fams.indexOf(b.fam) < 0) fams.push(b.fam); });
  let html = '';
  fams.forEach(f => {
    html += `<p class="scope-fam-label">${escapeHtml(f)}</p><div class="scope-bundles-grid">`;
    list.filter(b => b.fam === f).forEach(b => {
      html += `<button type="button" class="scope-bundle-btn" aria-pressed="${b.id === scopeSelectedId}" data-id="${escapeHtml(b.id)}">
        <div class="row"><span class="scope-bundle-mark"><svg xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></span>
        <span><h4>${escapeHtml(b.name)}</h4></span></div>
        ${b.custom ? '<span class="scope-bundle-tag">custom</span>' : ''}</button>`;
    });
    html += '</div>';
  });
  catEl.innerHTML = html;
  catEl.querySelectorAll('.scope-bundle-btn').forEach(el => {
    el.addEventListener('click', () => pickBundle(el.dataset.id));
  });
}

function pickBundle(id) {
  if (scopeDirty && !confirm('You have unsaved sensor changes. Discard them?')) return;
  const found = getAllBundles().find(b => b.id === id);
  if (!found) return;
  scopeSelectedId = id;
  scopeWorking = cloneBundle(found);
  scopeDirty = false;
  simState.selectedScope = id;
  renderScopeCatalog();
  renderScopeDetail();
  renderUnitGrid();
  updateBeginBtn();
}

function chipList(names, kind) {
  if (!names.length) return '<span class="scope-empty">None</span>';
  return names.map(s => `<span class="scope-sensor-chip ${kind === 'req' ? 'req' : ''}">${escapeHtml(s)}
    <button type="button" data-rm="${escapeHtml(s)}" data-kind="${kind}" aria-label="Remove ${escapeHtml(s)}">
      <svg xmlns="http://www.w3.org/2000/svg" style="width:11px;height:11px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button></span>`).join('');
}

function sensorOptions(used) {
  return SENSOR_ALL.filter(s => used.indexOf(s) < 0).map(s => `<option>${escapeHtml(s)}</option>`).join('');
}

function renderScopeDetail() {
  const detEl = document.getElementById('scope-detail');
  if (!detEl) return;
  if (!scopeWorking) {
    detEl.innerHTML = '<div style="padding:24px;text-align:center"><p class="scope-empty">Pick a bundle above to see and edit its sensor loadout.</p></div>';
    return;
  }
  const used = scopeWorking.req.concat(scopeWorking.opt);
  detEl.innerHTML = `<div class="scope-detail">
    <div class="scope-detail-head"><h4>${escapeHtml(scopeWorking.name)}</h4><span class="code">${escapeHtml(scopeWorking.id)} &middot; ${escapeHtml(scopeWorking.fam)}</span>
      <div class="scope-detail-acts">
        <button type="button" id="scope-reset-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors">Reset</button>
        <button type="button" id="scope-save-as-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style="background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.35);">Save as new bundle</button>
      </div>
    </div>
    <div class="scope-sensor-cols">
      <div class="scope-scol"><h5>Required sensors<b>${scopeWorking.req.length}</b></h5><div class="scope-sensors">${chipList(scopeWorking.req, 'req')}</div>
        <div class="scope-addrow"><select id="scope-add-req" aria-label="Add required sensor"><option value="">Add required sensor…</option>${sensorOptions(used)}</select></div></div>
      <div class="scope-scol"><h5>Optional sensors<b>${scopeWorking.opt.length || 'none'}</b></h5><div class="scope-sensors">${chipList(scopeWorking.opt, 'opt')}</div>
        <div class="scope-addrow"><select id="scope-add-opt" aria-label="Add optional sensor"><option value="">Add optional sensor…</option>${sensorOptions(used)}</select></div></div>
    </div>
    <div class="scope-dirty-bar${scopeDirty ? ' on' : ''}">
      <span>Edited from the catalog version. Save it as a new bundle to keep these changes.</span>
      <div class="acts"><button type="button" id="scope-revert-btn" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors">Revert</button>
      <button type="button" id="scope-save-dirty-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#f39124] hover:bg-orange-400 transition-colors">Save as new bundle</button></div>
    </div>
  </div>`;

  detEl.querySelectorAll('[data-rm]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.kind === 'req' ? 'req' : 'opt';
      scopeWorking[k] = scopeWorking[k].filter(s => s !== b.dataset.rm);
      scopeDirty = true;
      renderScopeDetail();
      renderUnitGrid();
      updateBeginBtn();
    });
  });
  const addReq = document.getElementById('scope-add-req');
  const addOpt = document.getElementById('scope-add-opt');
  if (addReq) addReq.onchange = function () {
    if (this.value) { scopeWorking.req.push(this.value); scopeDirty = true; renderScopeDetail(); renderUnitGrid(); updateBeginBtn(); }
  };
  if (addOpt) addOpt.onchange = function () {
    if (this.value) { scopeWorking.opt.push(this.value); scopeDirty = true; renderScopeDetail(); }
  };
  const resetBtn = document.getElementById('scope-reset-btn');
  const saveAsBtn = document.getElementById('scope-save-as-btn');
  const revertBtn = document.getElementById('scope-revert-btn');
  const saveDirtyBtn = document.getElementById('scope-save-dirty-btn');
  if (resetBtn) resetBtn.onclick = revertScope;
  if (saveAsBtn) saveAsBtn.onclick = openBundleSheet;
  if (revertBtn) revertBtn.onclick = revertScope;
  if (saveDirtyBtn) saveDirtyBtn.onclick = openBundleSheet;
}

function revertScope() {
  if (!scopeSelectedId) {
    scopeWorking = null; scopeDirty = false; simState.selectedScope = null;
    renderScopeDetail(); renderUnitGrid(); updateBeginBtn();
    return;
  }
  const found = getAllBundles().find(b => b.id === scopeSelectedId);
  scopeWorking = cloneBundle(found); scopeDirty = false;
  renderScopeDetail(); renderUnitGrid(); updateBeginBtn();
  showToast('Reverted to the catalog version', 'info');
}

function openBundleSheet() {
  document.getElementById('bundle-name').value = scopeWorking.name === 'Untitled bundle' ? '' : scopeWorking.name + ' (edited)';
  document.getElementById('bundle-fam').value = scopeWorking.fam;
  document.getElementById('bundle-note').value = '';
  document.getElementById('bundle-summary').textContent = `${scopeWorking.req.length} required · ${scopeWorking.opt.length} optional sensors will be saved.`;
  const sheet = document.getElementById('bundle-sheet');
  sheet.style.display = 'flex';
  document.getElementById('bundle-name').focus();
}
function closeBundleSheet() {
  document.getElementById('bundle-sheet').style.display = 'none';
}

/* ---------------- MiniSpectors (unit picker) ---------------- */

function updateUnitsBadge() {
  const badge = document.getElementById('sim-units-badge');
  const count = simState.selectedROVs.size;
  if (badge) badge.textContent = count;
  labelNavItem('sim-nav-units', `MiniSpectors — ${count} selected`);
}

function addUnit(num) {
  const role = simState.selectedROVs.size === 0 ? 'main' : 'standby';
  simState.selectedROVs.set(num, role);
  if (!simState.shared.rovSensors[num]) {
    simState.shared.rovSensors[num] = MINISPECTOR_FIXED_SENSORS.map(s => ({
      name: s.name, category: s.category, model: '', serial: '', qty: 1,
      calibrated: false, calibratedDate: '', tested: false, testedDate: '', fixed: true,
    }));
  }
  renderUnitGrid();
  updateBeginBtn();
  updateUnitsBadge();
}

function removeUnit(num) {
  if (rovHasDiveLogs(num)) {
    showToast(`MiniSpector-${num} has dive logs recorded against it and cannot be removed. Edit or delete those entries first.`, 'error');
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
  renderUnitGrid();
  updateBeginBtn();
  updateUnitsBadge();
}

function toggleUnit(num) {
  if (simState.selectedROVs.has(num)) removeUnit(num); else addUnit(num);
}

function promoteUnit(num) {
  if (!simState.selectedROVs.has(num) || simState.selectedROVs.get(num) === 'main') return;
  if (rovHasDiveLogs(num)) {
    showToast(`MiniSpector-${num} has dive logs recorded against it. Its role cannot be changed until those are removed.`, 'error');
    return;
  }
  for (const k of simState.selectedROVs.keys()) simState.selectedROVs.set(k, 'standby');
  simState.selectedROVs.set(num, 'main');
  renderUnitGrid();
  updateBeginBtn();
  showToast(`MiniSpector-${num} is now main`, 'success');
}

function clearUnits(silent) {
  const kept = [];
  [...simState.selectedROVs.keys()].forEach(num => {
    if (rovHasDiveLogs(num)) { kept.push(num); return; }
    simState.selectedROVs.delete(num);
    simState.rovSerials.delete(num);
    simState.rovDescriptions.delete(num);
    delete simState.shared.rovSensors[num];
  });
  if (simState.selectedROVs.size > 0) {
    const nextMain = [...simState.selectedROVs.keys()].sort((a, b) => a - b)[0];
    simState.selectedROVs.set(nextMain, 'main');
  }
  renderUnitGrid();
  updateBeginBtn();
  updateUnitsBadge();
  if (!silent && kept.length) showToast(`Kept MiniSpector-${kept.join(', MiniSpector-')} — they have dive logs recorded.`, 'warn');
}

function renderUnitGrid() {
  const container = document.getElementById('sim-rov-chips');
  if (!container) return;
  const nums = Array.from({ length: FLEET_SIZE }, (_, i) => i + 1);

  const hintEl = document.getElementById('units-hint');
  if (hintEl) hintEl.textContent = `${nums.length} of ${nums.length} shown`;

  container.innerHTML = nums.map(num => {
    const role = simState.selectedROVs.get(num) || null;
    const colour = role === 'main' ? '#f39124' : (role === 'standby' ? '#459fd9' : '#6b7280');
    return `<div class="unit-card" data-role="${role || ''}">
      ${role ? `<span class="unit-role-badge ${role}">${role}</span>` : ''}
      <button type="button" data-hit="${num}" style="all:unset;display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;cursor:pointer;">
        <span class="unit-glyph" style="color:${colour}">${ROV_SVG}</span>
        <h4>MiniSpector-${num}</h4>
      </button>
      ${role === 'standby' ? `<button type="button" class="unit-promote-btn" data-promote="${num}">Make main</button>` : ''}
    </div>`;
  }).join('');

  container.querySelectorAll('[data-hit]').forEach(b => b.addEventListener('click', () => toggleUnit(Number(b.dataset.hit))));
  container.querySelectorAll('[data-promote]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); promoteUnit(Number(b.dataset.promote)); }));
}

/* ---------------- shared footer / navigation ---------------- */

function updateDescCount() {
  const desc = document.getElementById('sim-project-desc');
  const countEl = document.getElementById('sim-desc-count');
  if (desc && countEl) countEl.textContent = `${desc.value.length} / 280`;
}

function updateBeginBtn() {
  const count = simState.selectedROVs.size;
  const btn = document.getElementById('btn-begin-sim');
  const hasScope = !!(scopeWorking && scopeWorking.req.length);
  if (btn) btn.disabled = count === 0 || !hasScope;
}

export function showSimSetupTab(tab) {
  ['mission', 'units', 'team'].forEach(t => {
    document.getElementById(`sim-setup-${t}`)?.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'units') renderUnitGrid();
  if (tab === 'team') renderProjectTeam('team-container-sim');
}

function beginSimulation() {
  if (!document.getElementById('sim-project-code')?.value.trim()) {
    showToast('Project code is required.', 'warn');
    return;
  }
  if (!scopeWorking || !scopeWorking.req.length) {
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
    asset: document.getElementById('sim-project-asset')?.value || '',
    weatherWindow: document.getElementById('sim-project-weather')?.value || '',
  };

  const scopeBundle = {
    sensors: [
      ...scopeWorking.req.map(name => ({ name, status: 'required' })),
      ...scopeWorking.opt.map(name => ({ name, status: 'optional' })),
    ],
  };
  const scopeChanged = simState.shared.scopeId && simState.shared.scopeId !== simState.selectedScope;
  const hasWork = Array.isArray(simState.shared.sensors) && simState.shared.sensors.some(s =>
    s.model || s.calibrated || s.tested || (Array.isArray(s.instances) && s.instances.some(inst => inst.model || inst.calibrated || inst.tested))
  );

  if (scopeChanged && hasWork) {
    const keep = confirm(
      `You changed the scope from "${scopeName(simState.shared.scopeId) || 'previous'}" to "${scopeWorking.name}".\n\n` +
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

// Sidebar entry point for the Sensors & Equipment / Topology / System
// Readiness workspace tabs. If the wizard (scope + units) hasn't been
// completed yet, this reuses beginSimulation()'s own validation/toasts
// instead of duplicating the "scope required" / "unit required" checks —
// on success it proceeds straight into the requested tab; on failure it
// falls back to the Mission Info panel where the user can fix what's missing.
function goToWorkspaceSubTab(tab, navId) {
  const step2 = document.getElementById('sim-step-2');
  const alreadyIn = step2 && !step2.classList.contains('hidden');
  if (!alreadyIn) beginSimulation();

  const nowIn = step2 && !step2.classList.contains('hidden');
  if (!nowIn) {
    window.showTab('simulation', document.getElementById('sim-nav-mission'));
    showSimSetupTab('mission');
    return;
  }
  window.showTab('simulation', document.getElementById(navId));
  switchSimSubTab(tab);
}

function simGoBack() {
  document.getElementById('sim-step-2').classList.add('hidden');
  document.getElementById('sim-step-1').classList.remove('hidden');
  const nameEl = document.getElementById('sim-project-name');
  const codeEl = document.getElementById('sim-project-code');
  const descEl = document.getElementById('sim-project-desc');
  const assetEl = document.getElementById('sim-project-asset');
  const weatherEl = document.getElementById('sim-project-weather');
  if (nameEl) nameEl.value = simState.projectData.name;
  if (codeEl) codeEl.value = simState.projectData.code;
  if (descEl) descEl.value = simState.projectData.description;
  if (assetEl) assetEl.value = simState.projectData.asset || '';
  if (weatherEl) weatherEl.value = simState.projectData.weatherWindow || '';
  updateDescCount();
  syncScopeWorkingFromState();
  renderScopeCatalog();
  renderScopeDetail();
  showSimSetupTab('units');
}

export function initSimROVGrid() {
  resetSimState();

  document.getElementById('sim-step-1').classList.remove('hidden');
  document.getElementById('sim-step-2').classList.add('hidden');

  ['sim-project-name', 'sim-project-code', 'sim-project-desc', 'sim-project-asset', 'sim-project-weather'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateDescCount();

  if (scopeSearchEl) scopeSearchEl.value = '';
  if (scopeFamEl) scopeFamEl.value = '';
  syncScopeWorkingFromState();

  showSimSetupTab('mission');
  renderScopeCatalog();
  renderScopeDetail();
  renderUnitGrid();
  updateBeginBtn();
  updateUnitsBadge();
}

export function installSimSetup() {
  window.showSimSetupTab = showSimSetupTab;
  window.beginSimulation = beginSimulation;
  window.simGoBack = simGoBack;
  window.goToWorkspaceSubTab = goToWorkspaceSubTab;
  window.__updateSimUnitsBadge = updateUnitsBadge;

  scopeSearchEl = document.getElementById('scope-search');
  scopeFamEl = document.getElementById('scope-fam-filter');
  scopeSearchEl?.addEventListener('input', renderScopeCatalog);
  scopeFamEl?.addEventListener('change', renderScopeCatalog);

  document.getElementById('scope-blank-btn')?.addEventListener('click', () => {
    if (scopeDirty && !confirm('You have unsaved sensor changes. Discard them?')) return;
    scopeSelectedId = null;
    scopeWorking = { id: 'DRAFT', fam: 'Custom', name: 'Untitled bundle', req: [], opt: [] };
    scopeDirty = true;
    simState.selectedScope = null;
    renderScopeCatalog();
    renderScopeDetail();
    updateBeginBtn();
    document.getElementById('scope-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('sim-project-desc')?.addEventListener('input', updateDescCount);
  document.getElementById('sim-gen-code')?.addEventListener('click', () => {
    const alphabet = 'ABCDEFGHJKLMNPRSTVWXZ';
    let s = '';
    for (let i = 0; i < 3; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    const codeEl = document.getElementById('sim-project-code');
    if (codeEl) codeEl.value = `${s}-${Math.floor(Math.random() * 900) + 100}-26`;
  });

  document.getElementById('units-clear-btn')?.addEventListener('click', () => clearUnits(false));

  const sheet = document.getElementById('bundle-sheet');
  document.getElementById('bundle-cancel')?.addEventListener('click', closeBundleSheet);
  sheet?.addEventListener('click', (e) => { if (e.target === sheet) closeBundleSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet && sheet.style.display === 'flex') closeBundleSheet(); });
  document.getElementById('bundle-confirm')?.addEventListener('click', () => {
    const name = document.getElementById('bundle-name').value.trim();
    if (!name) { document.getElementById('bundle-name').focus(); return; }
    const fam = document.getElementById('bundle-fam').value.trim() || 'Custom';
    const shared = document.getElementById('bundle-share').checked;
    const nb = addCustomBundle({
      name, fam, req: scopeWorking.req, opt: scopeWorking.opt,
      note: document.getElementById('bundle-note').value.trim(), shared,
    });
    if (scopeFamEl && scopeFamEl.value && scopeFamEl.value !== fam) scopeFamEl.value = '';
    scopeSelectedId = nb.id;
    scopeWorking = cloneBundle(nb);
    scopeDirty = false;
    simState.selectedScope = nb.id;
    closeBundleSheet();
    renderScopeCatalog();
    renderScopeDetail();
    renderUnitGrid();
    updateBeginBtn();
    showToast(shared ? 'Saved and published to the shared catalog' : 'Saved to your private bundles', 'success');
  });
}

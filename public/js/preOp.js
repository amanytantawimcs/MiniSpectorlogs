// Bridges Simulation into Operation: keeps the preOpData snapshot synced
// from the current simulation (see syncSimulationIntoOperation() below) and
// renders the read-mostly Pre-Op tab (per-ROV fixed sensors, sensor packing
// list, machines, equipment, thrusters, system IPs, flagged issues) plus an
// operation-time additions form for anything not covered by the simulation.

import { escapeHtml, showToast, renderSectionCard, calBadge, tstBadge, rdyBadge } from './ui.js';
import { api } from './api.js';
import { state } from './state.js';
import { saveProject } from './projectDetails.js';
import { addSensorRow, showSensorTables } from './sensorTable.js';
import { simState } from './simulation/state.js';
import { PREOP_CHECKLIST } from './simulation/config.js';
import { scopeName } from './simulation/scopeCatalog.js';
import { noteSavedUpdatedAt } from './staleCheck.js';
import { deriveAutoEquipment } from './projectDataLog.js';

// Bridges the shared DOM-based renderSectionCard() into this file's
// string-concatenation table-building flow. Collapsed by default — this
// tab stacks up to seven tables (per-ROV sensors, packing list, machines,
// equipment, thrusters, system IPs, issues), most of which are just for
// reference once Pre-Op is underway.
function sectionWrap(dotColor, title, subtitle, body) {
  return renderSectionCard(dotColor, title, subtitle, body, { collapsed: true }).outerHTML;
}
// Color comes from the global `th { color: #9AB0C8; background: #16233A; }` rule.
const thL = 'px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider';
const thC = 'px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider';

// Keeps Operation's Pre-Op snapshot up to date with the current simulation.
// Runs every time someone crosses from a Simulation tab into an Operation
// tab (see sidebarUX.js's crossing guard) rather than as a one-time manual
// push, so it merges into whatever preOpData already exists instead of
// replacing it outright: operation-side-only data (manual "additions", the
// sign-off checklist, the locked flag) survives a re-sync — only the fields
// actually mirrored from the simulation get refreshed. Doesn't touch
// state.currentReportData.finalSetup — ensureFinalSetup() (finalSetup.js)
// already only builds it once and incrementally merges new additions after
// that, so leaving it alone here is what keeps Final Setup's own edits
// (opNotes, revisions, sign-off) from being wiped on every crossing.
// Doesn't touch sidebar/header visibility or navigate anywhere either —
// the crossing guard (sidebarUX.js) owns that, and the click that triggered
// this is about to navigate to whatever the user actually clicked, not
// necessarily Pre-Op.
// Project Code and Operation Scope aren't required just to work in Equipment
// setup/Topology (see beginSimulation()'s comment in simulation/setup.js),
// but a real project identity is required by the time anything actually
// crosses into Operation — that's the first point data would otherwise get
// synced/saved under an empty or ambiguous project. Called synchronously by
// sidebarUX.js's crossing guard, before the confirm() prompt, so a doomed
// crossing never even asks "are you sure?".
export function canSyncToOperation() {
  if (!simState.projectData.code) {
    showToast('Enter a Project Code before moving to Operations.', 'warn');
    return false;
  }
  if (!simState.selectedScope) {
    showToast('Select an Operation Scope before moving to Operations.', 'warn');
    return false;
  }
  return true;
}

export async function syncSimulationIntoOperation() {
  if (state.currentUserRole === 'reviewer') return;
  if (!canSyncToOperation()) return;
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const machines = simState.shared.sysarch?.machines || [];
  const existing = state.preOpData;

  state.preOpData = {
    pushedAt: new Date().toISOString(),
    projectName: simState.projectData.name,
    projectCode: simState.projectData.code,
    scopeName: scopeName(simState.selectedScope),
    rovs: [...simState.selectedROVs.entries()].map(([num, role]) => ({ rovNumber: num, role, serial: simState.rovSerials.get(num) || '', description: simState.rovDescriptions.get(num) || '' })),
    rovSensors: Object.fromEntries(Object.entries(simState.shared.rovSensors || {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])),
    sensors: sensors.map(s => ({ name: s.name, model: s.model || '', qty: s.qty || 1, serialNo: s.serialNo || '', calibrated: s.calibrated, tested: s.tested, status: 'confirmed', note: s.note || '', origin: 'simulation' })),
    machines: machines.map(m => ({ name: m.name || '', model: m.software || '', ip: m.ip || '', status: m.activated || 'Activated', origin: 'simulation' })),
    equipment: (simState.shared.sysarch?.equipment || []).map(e => ({ item: e.item || '', serial: e.serial || '', category: e.category || '', qty: e.qty || 0, batch: e.batch || '', rovAssignment: e.rovAssignment || 'Shared', comments: e.comments || '', origin: 'simulation' })),
    issues: (simState.shared.issues || []).map(i => ({ title: i.title || '', description: i.description || '', severity: i.severity || 'medium', status: i.status || 'open' })),
    thrusters: (simState.shared.thrusters || []).map(t => ({ ...t })),
    systemIPs: (simState.shared.sysarch?.systemIPs || []).map(p => ({ ...p })),
    setEquipment: {
      main: { ...(simState.shared.sysarch?.setEquipment?.main || {}) },
      backup: { ...(simState.shared.sysarch?.setEquipment?.backup || {}) },
    },
    // Operation-side-only fields — preserved across re-syncs, not reset.
    additions: existing?.additions || { sensors: [], machines: [] },
    signOff: existing?.signOff || PREOP_CHECKLIST.map(item => ({ label: item, checked: false })),
    locked: existing?.locked || false,
  };

  if (state.preOpData.projectCode) state.currentProjectCode = state.preOpData.projectCode;
  state.currentProjectName = state.preOpData.projectName || '';

  renderProjectSimInfo();

  const camBody = document.getElementById('camLightBody');
  const sensorBody = document.getElementById('sensorBody');
  if (camBody) camBody.innerHTML = '';
  if (sensorBody) sensorBody.innerHTML = '';
  showSensorTables();
  state.preOpData.sensors.forEach(s => {
    const isCam = s.name.toLowerCase().includes('camera') || s.name.toLowerCase().includes('light');
    addSensorRow(isCam ? 'camLightBody' : 'sensorBody', {
      name: s.name, model: s.model, status: (s.calibrated && s.tested) ? 'OK' : 'Fault',
      cal: s.calibrated ? new Date().toISOString().split('T')[0] : '', notes: s.note,
    });
  });

  // Save immediately instead of waiting for the 20s operation autosave tick —
  // otherwise projects.mode stays 'simulation' server-side for a while after
  // syncing, and a second device pulling the project in that window sees
  // stale simulation data instead of what was just synced.
  await saveProject({ silent: true });
  if (simState.projectData.code) {
    const lockResult = await api.lockSimulation(simState.projectData.code);
    noteSavedUpdatedAt(lockResult.updated_at);
  }
  simState.locked = true;
}

export function renderProjectSimInfo() {
  if (!state.preOpData) return;
  const badge = document.getElementById('project-sim-badge');
  const roster = document.getElementById('project-rov-roster');
  const tags = document.getElementById('project-rov-tags');
  if (badge) badge.classList.remove('hidden');
  if (roster && tags && state.preOpData.rovs?.length > 0) {
    tags.innerHTML = state.preOpData.rovs.map(r =>
      `<span style="font-size:0.75rem;font-weight:700;padding:4px 12px;border-radius:20px;${r.role === 'main' ? 'background:rgba(243,145,36,0.15);color:#f39124;border:1px solid rgba(243,145,36,0.3)' : 'background:rgba(120,166,212,0.15);color:#9AB0C8;border:1px solid rgba(120,166,212,0.2)'}">MS-${r.rovNumber} · ${r.role.toUpperCase()}</span>`
    ).join('');
    roster.classList.remove('hidden');
  }
}

// ── Packing List & Final Setup shell ──────────────────────────────────
// The two tabs share one sidebar item with a two-button sub-tab bar (see
// index.html's #tab-preopfinal), mirroring Operation Logs/Checklists'
// pattern. renderPreOpFinalHeader() is the shared identity block (project
// name/code/scope/ROV badges) both tabs used to render separately — pulled
// out here so switching between them doesn't repeat it; renderPreOpTab()
// and finalSetup.js's renderFinalSetupTab() now only render what's
// specific to each.
let preOpFinalActiveTab = 'preop';

export function renderPreOpFinalHeader() {
  const el = document.getElementById('preopfinal-header');
  if (!el) return;
  if (!state.preOpData) { el.innerHTML = ''; return; }
  const preOpData = state.preOpData;
  const syncedDate = preOpData.pushedAt ? new Date(preOpData.pushedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  el.innerHTML = `
  <div class="rounded-2xl mb-5 overflow-hidden" style="border:1px solid rgba(243,145,36,0.25);background:linear-gradient(135deg,rgba(243,145,36,0.06) 0%,rgba(16,27,44,0.8) 100%);">
    <div class="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
      <div>
        <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-0.5">Packing List &amp; Final Setup</p>
        <p class="text-lg font-bold text-[#D3DAE3] leading-tight">${escapeHtml(preOpData.projectName || '—')}</p>
        <p class="text-xs text-[#6C88A6] mt-0.5">${escapeHtml(preOpData.projectCode || '')} · ${escapeHtml(preOpData.scopeName || '')} · Synced ${syncedDate}</p>
      </div>
      <div class="flex gap-2 flex-wrap justify-end">
        ${preOpData.rovs.map(r => `<span class="text-xs font-bold px-2.5 py-1 rounded-lg ${r.role === 'main' ? 'text-[#f39124] border border-[rgba(243,145,36,0.4)] bg-[rgba(243,145,36,0.08)]' : 'text-[#9AB0C8] border border-[rgba(120,166,212,0.16)] bg-[#101B2C]'}">MS-${r.rovNumber} · ${r.role.toUpperCase()}</span>`).join('')}
      </div>
    </div>
  </div>`;
}

function switchPreOpFinalSubTab(tab) {
  preOpFinalActiveTab = tab;
  ['preop', 'finalsetup'].forEach(t => {
    document.getElementById(`preopfinal-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`preopfinal-subtab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'preop') renderPreOpTab();
  else window.renderFinalSetupTab?.();
}

function enterPreOpFinal() {
  renderPreOpFinalHeader();
  switchPreOpFinalSubTab(preOpFinalActiveTab);
}

export function renderPreOpTab() {
  const container = document.getElementById('preop-content');
  if (!container || !state.preOpData) return;
  const preOpData = state.preOpData;
  const isLocked = preOpData.locked;

  const allSensors = [...preOpData.sensors, ...preOpData.additions.sensors];
  const allMachines = [...preOpData.machines, ...preOpData.additions.machines];
  const allEquipment = preOpData.equipment || [];
  const allFixed = Object.entries(preOpData.rovSensors || {}).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .flatMap(([num, arr]) => arr.map(s => ({ ...s, rovNum: parseInt(num, 10) })));
  const sensorsReady = [...allSensors, ...allFixed].filter(s => s.calibrated && s.tested).length;
  const sensorsTotal = allSensors.length + allFixed.length;
  const sensorsCheck = sensorsTotal - sensorsReady;

  let html = `
  <div class="rounded-2xl mb-5 overflow-hidden" style="border:1px solid rgba(243,145,36,0.25);background:linear-gradient(135deg,rgba(243,145,36,0.06) 0%,rgba(16,27,44,0.8) 100%);">
    <div class="flex items-center justify-end px-6 py-3">
      <button type="button" onclick="exportWord('ProjectDataLog.docx')" style="padding:5px 14px;border-radius:8px;font-size:10.5px;font-weight:700;cursor:pointer;background:rgba(120,166,212,0.1);color:#9AB0C8;border:1px solid rgba(120,166,212,0.25);">Export Project Data Log</button>
    </div>
    <div class="grid grid-cols-5" style="border-top:1px solid rgba(120,166,212,0.16);">
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(120,166,212,0.16);">
        <p class="text-2xl font-bold" style="color:#f39124">${sensorsReady}<span class="text-sm text-[#6C88A6] font-normal">/${sensorsTotal}</span></p>
        <p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Sensors Ready</p>
        ${sensorsCheck > 0 ? `<p class="text-[10px] mt-0.5" style="color:#f39124">${sensorsCheck} need check</p>` : '<p class="text-[10px] mt-0.5" style="color:#459fd9">All verified</p>'}
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(120,166,212,0.16);">
        <p class="text-2xl font-bold text-[#459fd9]">${allMachines.length}</p>
        <p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Machines</p>
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(120,166,212,0.16);">
        <p class="text-2xl font-bold" style="color:#459fd9">${allEquipment.length}</p>
        <p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Hardware Items</p>
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(120,166,212,0.16);">
        <p class="text-2xl font-bold" style="color:#f39124">${(preOpData.thrusters || []).length}</p>
        <p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Thrusters</p>
      </div>
      <div class="px-4 py-4 text-center">
        <p class="text-2xl font-bold" style="color:#459fd9">${(preOpData.systemIPs || []).length}</p>
        <p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">System IPs</p>
      </div>
    </div>
  </div>`;

  const rovNums = [...new Set(allFixed.map(s => s.rovNum))].sort((a, b) => a - b);
  rovNums.forEach(num => {
    const rovRole = preOpData.rovs.find(r => r.rovNumber === num)?.role || 'main';
    const list = allFixed.filter(s => s.rovNum === num);
    const rows = list.map((s, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
      <td class="px-4 py-2.5"><span class="text-sm font-medium text-[#D3DAE3]">${escapeHtml(s.name)}</span> <span class="text-[9px] text-[#6C88A6]">fixed</span></td>
      <td class="px-4 py-2.5 text-xs text-[#9AB0C8]">${escapeHtml(s.model || '—')}</td>
      <td class="px-4 py-2.5 text-center text-sm font-semibold text-[#9AB0C8]">${s.qty || 1}</td>
      <td class="px-4 py-2.5 text-center">${calBadge(s.calibrated)}</td>
      <td class="px-4 py-2.5 text-center">${tstBadge(s.tested)}</td>
      <td class="px-4 py-2.5 text-center">${rdyBadge(s.calibrated && s.tested)}</td>
    </tr>`).join('');
    html += sectionWrap('#f39124', `MS-${num} Standard Equipment`, `${rovRole.toUpperCase()} · ${list.length} fixed sensors`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal.</th><th class="${thC}">Test</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  });

  const sensorRows = allSensors.map((s, i) => `<tr>
    <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
    <td class="px-4 py-2.5"><span class="text-sm font-medium text-[#D3DAE3]">${escapeHtml(s.name)}</span> <span class="text-[9px] text-[#6C88A6]">${s.origin === 'simulation' ? 'sim' : 'op'}</span></td>
    <td class="px-4 py-2.5 text-xs text-[#9AB0C8]">${escapeHtml(s.model || '—')}</td>
    <td class="px-4 py-2.5 text-center text-sm font-semibold text-[#9AB0C8]">${s.qty || 1}</td>
    <td class="px-4 py-2.5 text-center">${calBadge(s.calibrated)}</td>
    <td class="px-4 py-2.5 text-center">${tstBadge(s.tested)}</td>
    <td class="px-4 py-2.5 text-center">${rdyBadge(s.calibrated && s.tested)}</td>
  </tr>`).join('');
  html += sectionWrap('#10b981', 'Sensor Packing List', `${allSensors.length} items · ${sensorsReady} verified`,
    `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal.</th><th class="${thC}">Test</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${sensorRows || `<tr><td colspan="7" class="px-4 py-6 text-center text-[#6C88A6] text-sm">No sensors</td></tr>`}</tbody></table>`);

  if (allMachines.length > 0) {
    const rows = allMachines.map((m, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
      <td class="px-4 py-2.5"><span class="text-sm font-medium text-[#D3DAE3]">${escapeHtml(m.name)}</span> <span class="text-[9px] text-[#6C88A6]">${m.origin === 'simulation' ? 'sim' : 'op'}</span></td>
      <td class="px-4 py-2.5 text-xs text-[#9AB0C8]">${escapeHtml(m.model || '—')}</td>
      <td class="px-4 py-2.5 text-xs font-mono text-[#9AB0C8]">${escapeHtml(m.ip || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(243,145,36,0.15);color:#f39124;border:1px solid rgba(243,145,36,0.2)">${escapeHtml(m.status || 'OK')}</span></td>
    </tr>`).join('');
    html += sectionWrap('#459fd9', 'Machines & Computers', `${allMachines.length} units`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Machine</th><th class="${thL}">Software</th><th class="${thL}">IP</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  }

  if (allEquipment.length > 0) {
    const rows = allEquipment.map((e, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-[#D3DAE3]">${escapeHtml(e.item || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="inline-block px-2.5 py-0.5 rounded text-xs font-bold" style="background:rgba(69,159,217,0.15);color:#459fd9">${e.qty || 0}</span></td>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6]">${escapeHtml(e.comments || '—')}</td>
    </tr>`).join('');
    html += sectionWrap('#459fd9', 'Hardware & Consumables', `${allEquipment.length} line items`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Item</th><th class="${thC}">QTY</th><th class="${thL}">Notes</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  }

  const allThrusters = preOpData.thrusters || [];
  if (allThrusters.length > 0) {
    const rows = allThrusters.map((t, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-[#D3DAE3]">${escapeHtml(t.number || '—')}</td>
      <td class="px-4 py-2.5 text-xs font-mono text-[#9AB0C8]">${escapeHtml(t.serial || '—')}</td>
    </tr>`).join('');
    html += sectionWrap('#f39124', 'Thrusters List', `${allThrusters.length} units`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Thruster No.</th><th class="${thL}">Serial</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  }

  // Same derivation feeding the Project Data Log export's Equipment IDs
  // table (see deriveAutoEquipment in projectDataLog.js) — shown here too
  // since this is where the underlying data (ROV serials, PTZ/GVI/UT/FMD
  // assignment, thrusters, Topology's Equipment IDs card) actually lives.
  const auto = deriveAutoEquipment(preOpData);
  const eqRows = [
    ['MiniSpector', auto.main.minispector, auto.backup.minispector],
    ['Power Supply', auto.main.powerSupply, auto.backup.powerSupply],
    ['Tether', auto.main.tether, auto.backup.tether],
    ['On Deck Station', auto.main.onDeckStation, auto.backup.onDeckStation],
    ['HCU', auto.main.hcu, auto.backup.hcu],
    ['Tablet', auto.main.tablet, auto.backup.tablet],
    ['PTZ', auto.main.ptz, auto.backup.ptz],
    ['GVI (Pencil Camera)', auto.main.gvi, auto.backup.gvi],
    ['UT', auto.main.ut, auto.backup.ut],
    ['FMD', auto.main.fmd, auto.backup.fmd],
    ['Brush', auto.main.brush, auto.backup.brush],
  ].map(([label, main, backup]) => `<tr>
    <td class="px-4 py-2.5 text-sm font-medium text-[#D3DAE3]">${escapeHtml(label)}</td>
    <td class="px-4 py-2.5 text-xs font-mono text-[#9AB0C8]">${escapeHtml(main || '—')}</td>
    <td class="px-4 py-2.5 text-xs font-mono text-[#9AB0C8]">${escapeHtml(backup || '—')}</td>
  </tr>`).join('');
  const thrusterList = (list) => list.length ? list.map(t => `${escapeHtml(t.number || '—')}: ${escapeHtml(t.serial || '—')}`).join(', ') : '—';
  html += sectionWrap('#459fd9', 'Equipment IDs — Main Set / Backup Set', 'from Topology & Packing List',
    `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL}">Item</th><th class="${thL}">Main Set ID</th><th class="${thL}">Backup Set ID</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${eqRows}</tbody></table>
     <div class="px-4 py-3 text-xs" style="color:#9AB0C8;border-top:1px solid rgba(120,166,212,0.16)">
       <p><span class="font-bold text-[#6C88A6] uppercase tracking-wider text-[10px]">Thrusters — Main:</span> ${thrusterList(auto.thrustersMain)}</p>
       <p class="mt-1"><span class="font-bold text-[#6C88A6] uppercase tracking-wider text-[10px]">Thrusters — Backup:</span> ${thrusterList(auto.thrustersBackup)}</p>
     </div>`);

  const allSystemIPs = preOpData.systemIPs || [];
  if (allSystemIPs.length > 0) {
    let lastCat = null;
    const rows = allSystemIPs.map((dev) => {
      const hasIP = dev.hasIP !== false, hasPort = dev.hasPort !== false;
      let catRow = '';
      if (dev.category !== lastCat) { lastCat = dev.category; catRow = `<tr style="background:rgba(12,23,39,0.7);"><td colspan="3" class="px-4 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#459fd9">${escapeHtml(dev.category)}</span></td></tr>`; }
      return catRow + `<tr>
        <td class="px-4 py-2 text-sm text-[#D3DAE3]">${escapeHtml(dev.name)}</td>
        <td class="px-4 py-2 text-xs font-mono text-[#9AB0C8] text-center">${hasIP ? escapeHtml(dev.ip || '—') : '<span class="text-[#6C88A6]">—</span>'}</td>
        <td class="px-4 py-2 text-xs font-mono text-[#9AB0C8] text-center">${hasPort ? escapeHtml(dev.port || '—') : '<span class="text-[#6C88A6]">—</span>'}</td>
      </tr>`;
    }).join('');
    html += sectionWrap('#459fd9', 'System IPs', `${allSystemIPs.length} devices`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL}">Device</th><th class="${thC}">IP</th><th class="${thC}">Port</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  }

  const allIssues = preOpData.issues || [];
  if (allIssues.length > 0) {
    const sevStyle = { high: 'bg-red-500/15 text-red-400 border-red-500/20', medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20', low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' };
    const rows = allIssues.map((iss, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-[#6C88A6] w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-[#D3DAE3]">${escapeHtml(iss.title || '—')}</td>
      <td class="px-4 py-2.5 text-xs text-[#9AB0C8]">${escapeHtml(iss.description || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${sevStyle[iss.severity] || sevStyle.medium}">${(iss.severity || 'medium').toUpperCase()}</span></td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${iss.status === 'open' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}">${(iss.status || 'open').toUpperCase()}</span></td>
    </tr>`).join('');
    html += sectionWrap('#ef4444', 'Flagged Issues', `${allIssues.length} from simulation`,
      `<table class="w-full"><thead><tr style="background:#16233A;"><th class="${thL} w-8">#</th><th class="${thL}">Issue</th><th class="${thL}">Description</th><th class="${thC}">Severity</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-[rgba(120,166,212,0.16)]">${rows}</tbody></table>`);
  }

  if (!isLocked) {
    html += `
    <div class="rounded-2xl p-5 mt-1" style="border:1px dashed rgba(243,145,36,0.3);background:rgba(243,145,36,0.03);">
      <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-4">+ Operation-Time Additions</p>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs font-bold text-[#6C88A6] block mb-2">Add Sensor</label>
          <div class="flex gap-2">
            <input type="text" id="preop-add-sensor-name" placeholder="Sensor name" class="flex-1 bg-[#0C1727] border border-[rgba(120,166,212,0.16)] rounded-lg px-3 py-2 text-sm text-[#D3DAE3] placeholder-[#6C88A6] outline-none">
            <input type="text" id="preop-add-sensor-model" placeholder="Model" class="w-28 bg-[#0C1727] border border-[rgba(120,166,212,0.16)] rounded-lg px-3 py-2 text-sm text-[#D3DAE3] placeholder-[#6C88A6] outline-none">
            <button type="button" id="preop-add-sensor-btn" class="px-3 py-2 text-xs font-bold rounded-lg text-[#D3DAE3]" style="background:#f39124;">+ Add</button>
          </div>
        </div>
        <div>
          <label class="text-xs font-bold text-[#6C88A6] block mb-2">Add Machine</label>
          <div class="flex gap-2">
            <input type="text" id="preop-add-machine-name" placeholder="Machine name" class="flex-1 bg-[#0C1727] border border-[rgba(120,166,212,0.16)] rounded-lg px-3 py-2 text-sm text-[#D3DAE3] placeholder-[#6C88A6] outline-none">
            <input type="text" id="preop-add-machine-model" placeholder="Model" class="w-28 bg-[#0C1727] border border-[rgba(120,166,212,0.16)] rounded-lg px-3 py-2 text-sm text-[#D3DAE3] placeholder-[#6C88A6] outline-none">
            <button type="button" id="preop-add-machine-btn" class="px-3 py-2 text-xs font-bold rounded-lg text-[#D3DAE3]" style="background:#f39124;">+ Add</button>
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button type="button" id="preop-lock-btn" class="px-4 py-2 text-xs font-bold rounded-lg text-[#0A111C]" style="background:#f39124;">Confirm &amp; Lock Pre-Op</button>
      </div>
    </div>`;
  }

  container.innerHTML = html;

  document.getElementById('preop-add-sensor-btn')?.addEventListener('click', preOpAddSensor);
  document.getElementById('preop-add-machine-btn')?.addEventListener('click', preOpAddMachine);
  document.getElementById('preop-lock-btn')?.addEventListener('click', confirmAndLockPreOp);
}

function preOpAddSensor() {
  if (!state.preOpData || state.preOpData.locked) return;
  const nameEl = document.getElementById('preop-add-sensor-name');
  const modelEl = document.getElementById('preop-add-sensor-model');
  const name = nameEl?.value.trim();
  if (!name) return;
  state.preOpData.additions.sensors.push({ name, model: modelEl?.value.trim() || '', qty: 1, calibrated: false, tested: false, origin: 'operation' });
  renderPreOpTab();
  showToast(`"${name}" added as operation-time sensor.`, 'success');
}

function preOpAddMachine() {
  if (!state.preOpData || state.preOpData.locked) return;
  const nameEl = document.getElementById('preop-add-machine-name');
  const modelEl = document.getElementById('preop-add-machine-model');
  const name = nameEl?.value.trim();
  if (!name) return;
  state.preOpData.additions.machines.push({ name, model: modelEl?.value.trim() || '', ip: '', status: 'OK', origin: 'operation' });
  renderPreOpTab();
  showToast(`"${name}" added as operation-time machine.`, 'success');
}

function confirmAndLockPreOp() {
  if (!state.preOpData) return;
  if (!confirm('This will lock the Pre-Operation checklist.\nNo further changes can be made.\n\nAre you sure?')) return;
  state.preOpData.locked = true;
  state.preOpData.lockedAt = new Date().toISOString();
  renderPreOpTab();
  showToast('Pre-Operation confirmed and locked!', 'success');
}

export function installPreOp() {
  window.renderPreOpTab = renderPreOpTab;
  window.__renderProjectSimInfo = renderProjectSimInfo;
  window.switchPreOpFinalSubTab = switchPreOpFinalSubTab;
  window.enterPreOpFinal = enterPreOpFinal;
}

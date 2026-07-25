// Bridges a pushed simulation into Operation mode: builds the preOpData
// snapshot, pre-fills Project Details, and renders the read-mostly Pre-Op
// tab (per-ROV fixed sensors, sensor packing list, machines, equipment,
// thrusters, system IPs, flagged issues) plus an operation-time additions
// form for anything not covered by the simulation.

import { escapeHtml, showToast } from './ui.js';
import { api } from './api.js';
import { state } from './state.js';
import { enterDashboard, showTab } from './navigation.js';
import { startProjectAutoSave } from './projectDetails.js';
import { addSensorRow, showSensorTables } from './sensorTable.js';
import { simState } from './simulation/state.js';
import { OPERATION_SCOPES, PREOP_CHECKLIST } from './simulation/config.js';

function calBadge(ok) {
  return ok ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3)">✓ CAL</span>`
    : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">✗ CAL</span>`;
}
function tstBadge(ok) {
  return ok ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.3)">✓ TST</span>`
    : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">✗ TST</span>`;
}
function rdyBadge(ok) {
  return ok ? `<span style="padding:2px 10px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3)">READY</span>`
    : `<span style="padding:2px 10px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">CHECK</span>`;
}
function sectionWrap(dotColor, title, subtitle, body) {
  return `<div class="rounded-2xl mb-4 overflow-hidden" style="border:1px solid rgba(55,65,81,0.7);background:rgba(17,24,39,0.6);">
    <div class="flex items-center gap-2.5 px-5 py-3" style="background:rgba(31,41,55,0.8);border-bottom:1px solid rgba(55,65,81,0.5);">
      <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}80;"></span>
      <span class="text-xs font-bold text-gray-200 uppercase tracking-wider flex-1">${title}</span>
      <span class="text-[10px] text-gray-600">${subtitle}</span>
    </div>
    <div class="overflow-x-auto">${body}</div>
  </div>`;
}
const thL = 'px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500';
const thC = 'px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500';

export async function pushToOperation() {
  if (state.currentUserRole === 'reviewer') return;
  if (simState.approval.status !== 'approved') {
    showToast('Simulation must be approved before pushing to Operation.', 'warn');
    return;
  }
  const sensors = (simState.shared.sensors || []).filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const machines = simState.shared.sysarch?.machines || [];
  const notReady = sensors.filter(s => !s.calibrated || !s.tested);

  let msg = `Push to Operation will transfer ${sensors.length} sensor(s) and ${machines.length} machine(s), and pre-fill Project Details.\n`;
  if (notReady.length > 0) msg += `\n⚠ ${notReady.length} sensor(s) not fully verified.\n`;
  if (state.preOpData) msg += '\n⚠ Simulation was already pushed once — this replaces the previous Pre-Op data.\n';
  msg += '\nProceed?';
  if (!confirm(msg)) return;

  state.preOpData = {
    pushedAt: new Date().toISOString(),
    projectName: simState.projectData.name,
    projectCode: simState.projectData.code,
    scopeName: OPERATION_SCOPES[simState.selectedScope]?.name || '',
    rovs: [...simState.selectedROVs.entries()].map(([num, role]) => ({ rovNumber: num, role, serial: simState.rovSerials.get(num) || '', description: simState.rovDescriptions.get(num) || '' })),
    rovSensors: Object.fromEntries(Object.entries(simState.shared.rovSensors || {}).map(([k, v]) => [k, v.map(s => ({ ...s }))])),
    sensors: sensors.map(s => ({ name: s.name, model: s.model || '', qty: s.qty || 1, serialNo: s.serialNo || '', calibrated: s.calibrated, tested: s.tested, status: 'confirmed', note: s.note || '', origin: 'simulation' })),
    machines: machines.map(m => ({ name: m.name || '', model: m.software || '', ip: m.ip || '', status: m.activated || 'Activated', origin: 'simulation' })),
    equipment: (simState.shared.sysarch?.equipment || []).map(e => ({ item: e.item || '', serial: e.serial || '', category: e.category || '', qty: e.qty || 0, batch: e.batch || '', rovAssignment: e.rovAssignment || 'Shared', comments: e.comments || '', origin: 'simulation' })),
    issues: (simState.shared.issues || []).map(i => ({ title: i.title || '', description: i.description || '', severity: i.severity || 'medium', status: i.status || 'open' })),
    thrusters: (simState.shared.thrusters || []).map(t => ({ ...t })),
    systemIPs: (simState.shared.sysarch?.systemIPs || []).map(p => ({ ...p })),
    additions: { sensors: [], machines: [] },
    signOff: PREOP_CHECKLIST.map(item => ({ label: item, checked: false })),
    locked: false,
  };

  state.currentMode = 'operation';
  document.getElementById('nav-simulation-section').classList.add('hidden');
  document.getElementById('nav-operation-sections').classList.remove('hidden');
  document.getElementById('header-operation-buttons')?.classList.remove('hidden');
  const contentArea = document.getElementById('main-content-area');
  if (contentArea) { contentArea.style.padding = ''; contentArea.style.overflow = ''; contentArea.style.position = ''; }

  enterDashboard();
  startProjectAutoSave();

  const pName = document.getElementById('projectName');
  const pCode = document.getElementById('projectCode');
  if (pName) pName.value = state.preOpData.projectName || '';
  if (pCode) pCode.value = state.preOpData.projectCode || '';
  if (state.preOpData.projectCode) state.currentProjectCode = state.preOpData.projectCode;

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

  document.getElementById('nav-finalsetup-item')?.classList.remove('hidden');
  const preOpNav = document.getElementById('nav-preop-item');
  showTab('preop', preOpNav);
  renderPreOpTab();

  const fixedTotal = Object.values(state.preOpData.rovSensors || {}).reduce((s, a) => s + a.length, 0);
  showToast(`Simulation pushed — ${state.preOpData.rovs.length} ROV(s), ${fixedTotal} fixed + ${state.preOpData.sensors.length} mission sensors loaded.`, 'success');

  if (simState.projectData.code) await api.lockSimulation(simState.projectData.code);
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
      `<span style="font-size:0.75rem;font-weight:700;padding:4px 12px;border-radius:20px;${r.role === 'main' ? 'background:rgba(243,145,36,0.15);color:#f39124;border:1px solid rgba(243,145,36,0.3)' : 'background:rgba(107,114,128,0.15);color:#9ca3af;border:1px solid rgba(107,114,128,0.2)'}">MS-${r.rovNumber} · ${r.role.toUpperCase()}</span>`
    ).join('');
    roster.classList.remove('hidden');
  }
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
  const pushedDate = preOpData.pushedAt ? new Date(preOpData.pushedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  let html = `
  <div class="rounded-2xl mb-5 overflow-hidden" style="border:1px solid rgba(243,145,36,0.25);background:linear-gradient(135deg,rgba(243,145,36,0.06) 0%,rgba(31,41,55,0.8) 100%);">
    <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color:rgba(243,145,36,0.15);">
      <div>
        <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-0.5">Packing List &amp; Equipment</p>
        <p class="text-lg font-bold text-white leading-tight">${escapeHtml(preOpData.projectName || '—')}</p>
        <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(preOpData.projectCode || '')} · ${escapeHtml(preOpData.scopeName || '')} · Pushed ${pushedDate}</p>
      </div>
      <div class="flex gap-2 flex-wrap justify-end">
        ${preOpData.rovs.map(r => `<span class="text-xs font-bold px-2.5 py-1 rounded-lg ${r.role === 'main' ? 'text-[#f39124] border border-[rgba(243,145,36,0.4)] bg-[rgba(243,145,36,0.08)]' : 'text-gray-400 border border-gray-600 bg-gray-800'}">MS-${r.rovNumber} · ${r.role.toUpperCase()}</span>`).join('')}
      </div>
    </div>
    <div class="grid grid-cols-5" style="border-top:1px solid rgba(55,65,81,0.4);">
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(55,65,81,0.4);">
        <p class="text-2xl font-bold" style="color:#f39124">${sensorsReady}<span class="text-sm text-gray-500 font-normal">/${sensorsTotal}</span></p>
        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Sensors Ready</p>
        ${sensorsCheck > 0 ? `<p class="text-[10px] mt-0.5" style="color:#f39124">${sensorsCheck} need check</p>` : '<p class="text-[10px] mt-0.5" style="color:#459fd9">All verified</p>'}
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(55,65,81,0.4);">
        <p class="text-2xl font-bold text-[#459fd9]">${allMachines.length}</p>
        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Machines</p>
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(55,65,81,0.4);">
        <p class="text-2xl font-bold" style="color:#459fd9">${allEquipment.length}</p>
        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Hardware Items</p>
      </div>
      <div class="px-4 py-4 text-center" style="border-right:1px solid rgba(55,65,81,0.4);">
        <p class="text-2xl font-bold" style="color:#f39124">${(preOpData.thrusters || []).length}</p>
        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Thrusters</p>
      </div>
      <div class="px-4 py-4 text-center">
        <p class="text-2xl font-bold" style="color:#459fd9">${(preOpData.systemIPs || []).length}</p>
        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">System IPs</p>
      </div>
    </div>
  </div>`;

  const rovNums = [...new Set(allFixed.map(s => s.rovNum))].sort((a, b) => a - b);
  rovNums.forEach(num => {
    const rovRole = preOpData.rovs.find(r => r.rovNumber === num)?.role || 'main';
    const list = allFixed.filter(s => s.rovNum === num);
    const rows = list.map((s, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
      <td class="px-4 py-2.5"><span class="text-sm font-medium text-gray-100">${escapeHtml(s.name)}</span> <span class="text-[9px] text-gray-600">fixed</span></td>
      <td class="px-4 py-2.5 text-xs text-gray-400">${escapeHtml(s.model || '—')}</td>
      <td class="px-4 py-2.5 text-center text-sm font-semibold text-gray-300">${s.qty || 1}</td>
      <td class="px-4 py-2.5 text-center">${calBadge(s.calibrated)}</td>
      <td class="px-4 py-2.5 text-center">${tstBadge(s.tested)}</td>
      <td class="px-4 py-2.5 text-center">${rdyBadge(s.calibrated && s.tested)}</td>
    </tr>`).join('');
    html += sectionWrap('#f39124', `MS-${num} Standard Equipment`, `${rovRole.toUpperCase()} · ${list.length} fixed sensors`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal.</th><th class="${thC}">Test</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  });

  const sensorRows = allSensors.map((s, i) => `<tr>
    <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
    <td class="px-4 py-2.5"><span class="text-sm font-medium text-gray-100">${escapeHtml(s.name)}</span> <span class="text-[9px] text-gray-600">${s.origin === 'simulation' ? 'sim' : 'op'}</span></td>
    <td class="px-4 py-2.5 text-xs text-gray-400">${escapeHtml(s.model || '—')}</td>
    <td class="px-4 py-2.5 text-center text-sm font-semibold text-gray-300">${s.qty || 1}</td>
    <td class="px-4 py-2.5 text-center">${calBadge(s.calibrated)}</td>
    <td class="px-4 py-2.5 text-center">${tstBadge(s.tested)}</td>
    <td class="px-4 py-2.5 text-center">${rdyBadge(s.calibrated && s.tested)}</td>
  </tr>`).join('');
  html += sectionWrap('#10b981', 'Sensor Packing List', `${allSensors.length} items · ${sensorsReady} verified`,
    `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal.</th><th class="${thC}">Test</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-gray-800/60">${sensorRows || `<tr><td colspan="7" class="px-4 py-6 text-center text-gray-600 text-sm">No sensors</td></tr>`}</tbody></table>`);

  if (allMachines.length > 0) {
    const rows = allMachines.map((m, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
      <td class="px-4 py-2.5"><span class="text-sm font-medium text-gray-100">${escapeHtml(m.name)}</span> <span class="text-[9px] text-gray-600">${m.origin === 'simulation' ? 'sim' : 'op'}</span></td>
      <td class="px-4 py-2.5 text-xs text-gray-400">${escapeHtml(m.model || '—')}</td>
      <td class="px-4 py-2.5 text-xs font-mono text-gray-400">${escapeHtml(m.ip || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full" style="background:rgba(243,145,36,0.15);color:#f39124;border:1px solid rgba(243,145,36,0.2)">${escapeHtml(m.status || 'OK')}</span></td>
    </tr>`).join('');
    html += sectionWrap('#459fd9', 'Machines & Computers', `${allMachines.length} units`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Machine</th><th class="${thL}">Software</th><th class="${thL}">IP</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  }

  if (allEquipment.length > 0) {
    const rows = allEquipment.map((e, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-gray-100">${escapeHtml(e.item || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="inline-block px-2.5 py-0.5 rounded text-xs font-bold" style="background:rgba(69,159,217,0.15);color:#459fd9">${e.qty || 0}</span></td>
      <td class="px-4 py-2.5 text-xs text-gray-500">${escapeHtml(e.comments || '—')}</td>
    </tr>`).join('');
    html += sectionWrap('#459fd9', 'Hardware & Consumables', `${allEquipment.length} line items`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Item</th><th class="${thC}">QTY</th><th class="${thL}">Notes</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  }

  const allThrusters = preOpData.thrusters || [];
  if (allThrusters.length > 0) {
    const rows = allThrusters.map((t, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-gray-100">${escapeHtml(t.number || '—')}</td>
      <td class="px-4 py-2.5 text-xs font-mono text-gray-400">${escapeHtml(t.serial || '—')}</td>
    </tr>`).join('');
    html += sectionWrap('#f39124', 'Thrusters List', `${allThrusters.length} units`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Thruster No.</th><th class="${thL}">Serial</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  }

  const allSystemIPs = preOpData.systemIPs || [];
  if (allSystemIPs.length > 0) {
    let lastCat = null;
    const rows = allSystemIPs.map((dev) => {
      const hasIP = dev.hasIP !== false, hasPort = dev.hasPort !== false;
      let catRow = '';
      if (dev.category !== lastCat) { lastCat = dev.category; catRow = `<tr style="background:rgba(17,24,39,0.7);"><td colspan="3" class="px-4 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#459fd9">${escapeHtml(dev.category)}</span></td></tr>`; }
      return catRow + `<tr>
        <td class="px-4 py-2 text-sm text-gray-200">${escapeHtml(dev.name)}</td>
        <td class="px-4 py-2 text-xs font-mono text-gray-400 text-center">${hasIP ? escapeHtml(dev.ip || '—') : '<span class="text-gray-600">—</span>'}</td>
        <td class="px-4 py-2 text-xs font-mono text-gray-400 text-center">${hasPort ? escapeHtml(dev.port || '—') : '<span class="text-gray-600">—</span>'}</td>
      </tr>`;
    }).join('');
    html += sectionWrap('#459fd9', 'System IPs', `${allSystemIPs.length} devices`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL}">Device</th><th class="${thC}">IP</th><th class="${thC}">Port</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  }

  const allIssues = preOpData.issues || [];
  if (allIssues.length > 0) {
    const sevStyle = { high: 'bg-red-500/15 text-red-400 border-red-500/20', medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20', low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' };
    const rows = allIssues.map((iss, i) => `<tr>
      <td class="px-4 py-2.5 text-xs text-gray-600 w-8">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-gray-100">${escapeHtml(iss.title || '—')}</td>
      <td class="px-4 py-2.5 text-xs text-gray-400">${escapeHtml(iss.description || '—')}</td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${sevStyle[iss.severity] || sevStyle.medium}">${(iss.severity || 'medium').toUpperCase()}</span></td>
      <td class="px-4 py-2.5 text-center"><span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${iss.status === 'open' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}">${(iss.status || 'open').toUpperCase()}</span></td>
    </tr>`).join('');
    html += sectionWrap('#ef4444', 'Flagged Issues', `${allIssues.length} from simulation`,
      `<table class="w-full"><thead><tr style="background:rgba(0,0,0,0.3);"><th class="${thL} w-8">#</th><th class="${thL}">Issue</th><th class="${thL}">Description</th><th class="${thC}">Severity</th><th class="${thC}">Status</th></tr></thead><tbody class="divide-y divide-gray-800/60">${rows}</tbody></table>`);
  }

  if (!isLocked) {
    html += `
    <div class="rounded-2xl p-5 mt-1" style="border:1px dashed rgba(243,145,36,0.3);background:rgba(243,145,36,0.03);">
      <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-4">+ Operation-Time Additions</p>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs font-bold text-gray-500 block mb-2">Add Sensor</label>
          <div class="flex gap-2">
            <input type="text" id="preop-add-sensor-name" placeholder="Sensor name" class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none">
            <input type="text" id="preop-add-sensor-model" placeholder="Model" class="w-28 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none">
            <button type="button" id="preop-add-sensor-btn" class="px-3 py-2 text-xs font-bold rounded-lg text-white" style="background:#f39124;">+ Add</button>
          </div>
        </div>
        <div>
          <label class="text-xs font-bold text-gray-500 block mb-2">Add Machine</label>
          <div class="flex gap-2">
            <input type="text" id="preop-add-machine-name" placeholder="Machine name" class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none">
            <input type="text" id="preop-add-machine-model" placeholder="Model" class="w-28 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none">
            <button type="button" id="preop-add-machine-btn" class="px-3 py-2 text-xs font-bold rounded-lg text-white" style="background:#f39124;">+ Add</button>
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button type="button" id="preop-lock-btn" class="px-4 py-2 text-xs font-bold rounded-lg text-gray-900" style="background:#f39124;">Confirm &amp; Lock Pre-Op</button>
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
  window.pushToOperation = pushToOperation;
  window.__renderProjectSimInfo = renderProjectSimInfo;
}

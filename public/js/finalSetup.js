// Final Setup tab: field confirmation checklist built from state.preOpData.
// Once locked, further edits require "Log Operational Change" — an
// append-only revision log (matches the old app's audit-trail behavior).

import { escapeHtml, showToast } from './ui.js';
import { state } from './state.js';

function ensureFinalSetup() {
  if (state.currentReportData.finalSetup?._initialized) return state.currentReportData.finalSetup;
  const preOpData = state.preOpData;
  const allSensors = [
    ...(preOpData.sensors || []).map(s => ({ ...s, _type: 'mission' })),
    ...Object.entries(preOpData.rovSensors || {}).flatMap(([num, arr]) => arr.map(s => ({ ...s, rovNum: parseInt(num, 10), _type: 'fixed' }))),
  ];
  state.currentReportData.finalSetup = {
    _initialized: true,
    activeROVNum: preOpData.rovs.find(r => r.role === 'main')?.rovNumber ?? preOpData.rovs[0]?.rovNumber ?? null,
    sensors: allSensors.map(s => ({ ...s, confirmed: !!(s.calibrated && s.tested), opNote: '' })),
    thrusters: (preOpData.thrusters || []).map(t => ({ ...t, position: '', confirmed: false })),
    systemIPs: (preOpData.systemIPs || []).map(d => ({ ...d })),
    notes: '',
    lockedAt: null,
    revisions: [],
    _pendingChange: false,
  };
  return state.currentReportData.finalSetup;
}

function fsSection(dotColor, title, subtitle, bodyEl) {
  const wrap = document.createElement('div');
  wrap.className = 'rounded-2xl mb-4 overflow-hidden';
  wrap.style.cssText = 'border:1px solid rgba(55,65,81,0.7);background:rgba(17,24,39,0.6);';
  const header = document.createElement('div');
  header.className = 'flex items-center gap-2.5 px-5 py-3';
  header.style.cssText = 'background:rgba(31,41,55,0.8);border-bottom:1px solid rgba(55,65,81,0.5);';
  header.innerHTML = `<span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}80;"></span><span class="text-xs font-bold text-gray-200 uppercase tracking-wider flex-1">${title}</span><span class="text-[10px] text-gray-600">${subtitle}</span>`;
  const body = document.createElement('div');
  body.className = 'p-4';
  body.appendChild(bodyEl);
  wrap.append(header, body);
  return wrap;
}

const thL = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500';
const thC = 'px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500';

function checkbox(confirmed, disabled, onToggle) {
  const div = document.createElement('div');
  div.style.cssText = `width:20px;height:20px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;transition:all 0.15s;cursor:${disabled ? 'default' : 'pointer'};` +
    (confirmed ? 'background:rgba(243,145,36,0.15);border:2px solid #f39124;color:#f39124' : 'background:rgba(31,41,55,0.6);border:2px solid rgba(55,65,81,0.6);color:transparent');
  div.textContent = '✓';
  if (!disabled) div.addEventListener('click', onToggle);
  return div;
}
function calBadge(ok) { return ok ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(243,145,36,0.12);color:#f39124;">✓ CAL</span>` : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;">✗ CAL</span>`; }
function tstBadge(ok) { return ok ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(69,159,217,0.12);color:#459fd9;">✓ TST</span>` : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;">✗ TST</span>`; }

export function renderFinalSetupTab() {
  const el = document.getElementById('finalsetup-content');
  if (!el) return;

  if (!state.preOpData || !state.preOpData.rovs || state.preOpData.rovs.length === 0) {
    el.innerHTML = `<div class="flex flex-col items-center justify-center py-24 text-center">
      <p class="text-gray-500 font-semibold">No Pre-Operation Data</p>
      <p class="text-gray-600 text-sm mt-1">Push from Simulation to populate Final Setup.</p>
    </div>`;
    return;
  }

  const preOpData = state.preOpData;
  const fs = ensureFinalSetup();
  const isLocked = !!fs.lockedAt;
  const dis = isLocked;
  const inputStyleStr = isLocked
    ? 'background:rgba(17,24,39,0.4);color:#6b7280;border:1px solid rgba(55,65,81,0.3);cursor:not-allowed'
    : 'background:rgba(17,24,39,0.6);color:#e5e7eb;border:1px solid rgba(55,65,81,0.5)';

  const confirmedSensors = fs.sensors.filter(s => s.confirmed).length;
  const totalSensors = fs.sensors.length;
  const confirmedThrusters = fs.thrusters.filter(t => t.confirmed).length;
  const totalThrusters = fs.thrusters.length;
  const filledIPs = fs.systemIPs.filter(d => (d.hasIP !== false && d.ip) || (d.hasPort !== false && d.port)).length;
  const totalIPs = fs.systemIPs.length;

  el.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'rounded-2xl mb-5 overflow-hidden';
  header.style.cssText = 'border:1px solid rgba(243,145,36,0.25);background:linear-gradient(135deg,rgba(243,145,36,0.06) 0%,rgba(31,41,55,0.8) 100%);';
  const revCount = (fs.revisions || []).length;
  let headerButtonsHtml;
  if (fs._pendingChange) {
    headerButtonsHtml = `<div class="flex flex-col items-end gap-2">
      <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:6px;background:rgba(243,145,36,0.15);color:#f39124;">CHANGE IN PROGRESS</span>
      <div class="flex items-center gap-2">
        <input id="final-change-reason" type="text" placeholder="Reason for change…" style="background:rgba(17,24,39,0.8);color:#e5e7eb;border:1px solid rgba(243,145,36,0.4);border-radius:7px;padding:5px 10px;font-size:11px;outline:none;width:220px">
        <button type="button" id="final-commit-btn" style="padding:5px 14px;border-radius:7px;font-size:11px;font-weight:700;background:#f39124;color:#111827;border:none;cursor:pointer;">✓ Commit</button>
        <button type="button" id="final-cancel-btn" style="padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;background:rgba(55,65,81,0.6);color:#9ca3af;border:1px solid rgba(55,65,81,0.5);cursor:pointer;">✗ Cancel</button>
      </div>
    </div>`;
  } else if (isLocked) {
    const lockedDate = new Date(fs.lockedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    headerButtonsHtml = `<div class="flex flex-col items-end gap-2">
      <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:6px;background:rgba(69,159,217,0.15);color:#459fd9;">CONFIRMED ${lockedDate}${revCount > 0 ? ` · ${revCount} change${revCount > 1 ? 's' : ''}` : ''}</span>
      <button type="button" id="final-start-change-btn" style="padding:6px 16px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:rgba(243,145,36,0.1);color:#f39124;border:1px solid rgba(243,145,36,0.4)">Log Operational Change</button>
    </div>`;
  } else {
    headerButtonsHtml = `<div class="flex flex-col items-end gap-2">
      <button type="button" id="final-lock-btn" style="padding:6px 16px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:#f39124;color:#111827;border:none">Confirm &amp; Lock</button>
    </div>`;
  }
  header.innerHTML = `
    <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color:rgba(243,145,36,0.15);">
      <div>
        <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-0.5">Final Setup Configuration</p>
        <p class="text-lg font-bold text-white leading-tight">${escapeHtml(preOpData.projectName || '—')}</p>
        <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(preOpData.projectCode || '')} · ${escapeHtml(preOpData.scopeName || '')}</p>
      </div>
      ${headerButtonsHtml}
    </div>
    <div class="grid grid-cols-4" style="border-top:1px solid rgba(55,65,81,0.4);">
      <div class="px-4 py-3 text-center" style="border-right:1px solid rgba(55,65,81,0.4);"><p class="text-xl font-bold" style="color:#f39124">${confirmedSensors}<span class="text-sm text-gray-500 font-normal">/${totalSensors}</span></p><p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Sensors Confirmed</p></div>
      <div class="px-4 py-3 text-center" style="border-right:1px solid rgba(55,65,81,0.4);"><p class="text-xl font-bold" style="color:#f39124">${confirmedThrusters}<span class="text-sm text-gray-500 font-normal">/${totalThrusters}</span></p><p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Thrusters Confirmed</p></div>
      <div class="px-4 py-3 text-center" style="border-right:1px solid rgba(55,65,81,0.4);"><p class="text-xl font-bold" style="color:#459fd9">${filledIPs}<span class="text-sm text-gray-500 font-normal">/${totalIPs}</span></p><p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">IPs Configured</p></div>
      <div class="px-4 py-3 text-center"><p class="text-xl font-bold" style="color:${isLocked ? '#459fd9' : '#f39124'}">${isLocked ? '✓' : '—'}</p><p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">Setup Status</p></div>
    </div>`;
  el.appendChild(header);

  // 1. Operated Unit
  const rovBody = document.createElement('div');
  rovBody.className = 'flex gap-3 flex-wrap';
  preOpData.rovs.forEach(r => {
    const active = r.rovNumber === fs.activeROVNum;
    const isMain = r.role === 'main';
    const card = document.createElement('div');
    card.style.cssText = `cursor:${isLocked ? 'default' : 'pointer'};border-radius:12px;padding:16px 24px;border:1px solid ${active ? 'rgba(243,145,36,0.5)' : 'rgba(55,65,81,0.5)'};background:${active ? 'rgba(243,145,36,0.08)' : 'rgba(31,41,55,0.4)'};text-align:center;min-width:110px;`;
    card.innerHTML = `<div style="font-size:22px;font-weight:900;color:${active ? '#f39124' : '#6b7280'}">MS-${r.rovNumber}</div>
      <div style="font-size:9px;font-weight:700;margin-top:4px;padding:2px 8px;border-radius:4px;display:inline-block;background:${isMain ? 'rgba(243,145,36,0.15)' : 'rgba(55,65,81,0.5)'};color:${isMain ? '#f39124' : '#9ca3af'}">${r.role.toUpperCase()}</div>
      ${active ? `<div style="font-size:9px;color:#459fd9;margin-top:6px;font-weight:600">ACTIVE UNIT</div>` : ''}`;
    if (!isLocked) card.addEventListener('click', () => { fs.activeROVNum = r.rovNumber; renderFinalSetupTab(); });
    rovBody.appendChild(card);
  });
  el.appendChild(fsSection('#f39124', 'Operated Unit', 'Select the MiniSpector unit for this operation', rovBody));

  // 2. Active Sensors
  const sensorTable = document.createElement('table');
  sensorTable.className = 'w-full';
  sensorTable.innerHTML = `<thead><tr style="background:rgba(0,0,0,0.3)"><th class="${thC}" style="width:44px">✓</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal</th><th class="${thC}">Test</th><th class="${thL}">Op. Note</th></tr></thead>`;
  const sensorTbody = document.createElement('tbody');
  sensorTbody.className = 'divide-y divide-gray-800/60';
  const rovNums = [...new Set(fs.sensors.filter(s => s._type === 'fixed').map(s => s.rovNum))].sort((a, b) => a - b);
  const addSensorRow = (s, idx) => {
    const tr = document.createElement('tr');
    const tdCheck = document.createElement('td'); tdCheck.className = 'px-3 py-2.5 text-center';
    tdCheck.appendChild(checkbox(s.confirmed, isLocked, () => { s.confirmed = !s.confirmed; renderFinalSetupTab(); }));
    const tdName = document.createElement('td'); tdName.className = 'px-3 py-2.5 text-sm font-medium text-gray-100'; tdName.textContent = s.name;
    const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5 text-xs text-gray-400'; tdModel.textContent = s.model || '—';
    const tdQty = document.createElement('td'); tdQty.className = 'px-3 py-2.5 text-center text-sm text-gray-300'; tdQty.textContent = s.qty || 1;
    const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center'; tdCal.innerHTML = calBadge(s.calibrated);
    const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center'; tdTest.innerHTML = tstBadge(s.tested);
    const tdNote = document.createElement('td'); tdNote.className = 'px-3 py-2.5';
    const noteInput = document.createElement('input');
    noteInput.type = 'text'; noteInput.placeholder = 'Note…'; noteInput.value = s.opNote || ''; noteInput.disabled = isLocked;
    noteInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;width:100%;outline:none`;
    noteInput.addEventListener('input', () => { s.opNote = noteInput.value; });
    tdNote.appendChild(noteInput);
    tr.append(tdCheck, tdName, tdModel, tdQty, tdCal, tdTest, tdNote);
    sensorTbody.appendChild(tr);
  };
  rovNums.forEach(num => {
    const rovRole = preOpData.rovs.find(r => r.rovNumber === num)?.role || 'main';
    const catRow = document.createElement('tr');
    catRow.style.background = 'rgba(17,24,39,0.7)';
    catRow.innerHTML = `<td colspan="7" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#f39124">MS-${num} Standard Equipment · ${rovRole.toUpperCase()}</span></td>`;
    sensorTbody.appendChild(catRow);
    fs.sensors.filter(s => s._type === 'fixed' && s.rovNum === num).forEach(s => addSensorRow(s, fs.sensors.indexOf(s)));
  });
  const missionSensors = fs.sensors.filter(s => s._type === 'mission');
  if (missionSensors.length > 0) {
    const catRow = document.createElement('tr');
    catRow.style.background = 'rgba(17,24,39,0.7)';
    catRow.innerHTML = `<td colspan="7" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#459fd9">Mission Sensors</span></td>`;
    sensorTbody.appendChild(catRow);
    missionSensors.forEach(s => addSensorRow(s, fs.sensors.indexOf(s)));
  }
  if (fs.sensors.length === 0) sensorTbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-gray-600 text-sm">No sensors</td></tr>`;
  sensorTable.appendChild(sensorTbody);
  el.appendChild(fsSection('#f39124', 'Active Sensors', `${confirmedSensors}/${totalSensors} confirmed`, sensorTable));

  // 3. Thrusters
  if (fs.thrusters.length > 0) {
    const table = document.createElement('table');
    table.className = 'w-full';
    table.innerHTML = `<thead><tr style="background:rgba(0,0,0,0.3)"><th class="${thC}" style="width:44px">✓</th><th class="${thL}">Thruster No.</th><th class="${thL}">Serial</th><th class="${thL}">Position / Location</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-gray-800/60';
    fs.thrusters.forEach((t) => {
      const tr = document.createElement('tr');
      const tdCheck = document.createElement('td'); tdCheck.className = 'px-3 py-2.5 text-center';
      tdCheck.appendChild(checkbox(t.confirmed, isLocked, () => { t.confirmed = !t.confirmed; renderFinalSetupTab(); }));
      const tdNum = document.createElement('td'); tdNum.className = 'px-3 py-2.5 text-sm text-gray-200 font-mono'; tdNum.textContent = t.number || '—';
      const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2.5 text-xs text-gray-400 font-mono'; tdSerial.textContent = t.serial || '—';
      const tdPos = document.createElement('td'); tdPos.className = 'px-3 py-2.5';
      const posInput = document.createElement('input');
      posInput.type = 'text'; posInput.placeholder = 'e.g. Port Horizontal'; posInput.value = t.position || ''; posInput.disabled = isLocked;
      posInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;width:100%;outline:none`;
      posInput.addEventListener('input', () => { t.position = posInput.value; });
      tdPos.appendChild(posInput);
      tr.append(tdCheck, tdNum, tdSerial, tdPos);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    el.appendChild(fsSection('#f39124', 'Thrusters', `${confirmedThrusters}/${totalThrusters} confirmed`, table));
  }

  // 4. System Network
  if (fs.systemIPs.length > 0) {
    const table = document.createElement('table');
    table.className = 'w-full';
    table.innerHTML = `<thead><tr style="background:rgba(0,0,0,0.3)"><th class="${thL}">Device</th><th class="${thC}">IP Address</th><th class="${thC}">Port</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-gray-800/60';
    let lastCat = null;
    fs.systemIPs.forEach((dev) => {
      if (dev.category !== lastCat) {
        lastCat = dev.category;
        const catRow = document.createElement('tr');
        catRow.style.background = 'rgba(17,24,39,0.7)';
        catRow.innerHTML = `<td colspan="3" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#459fd9">${escapeHtml(dev.category)}</span></td>`;
        tbody.appendChild(catRow);
      }
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.className = 'px-3 py-2 text-sm text-gray-200'; tdName.style.minWidth = '200px'; tdName.textContent = dev.name;
      const tdIp = document.createElement('td'); tdIp.className = 'px-3 py-2'; tdIp.style.width = '160px';
      if (dev.hasIP !== false) {
        const ipInput = document.createElement('input');
        ipInput.type = 'text'; ipInput.placeholder = '0.0.0.0'; ipInput.value = dev.ip || ''; ipInput.disabled = isLocked;
        ipInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;font-family:monospace;width:100%;outline:none;text-align:center`;
        ipInput.addEventListener('input', () => { dev.ip = ipInput.value; });
        tdIp.appendChild(ipInput);
      } else tdIp.innerHTML = '<span class="text-gray-600 text-xs" style="display:block;text-align:center">—</span>';
      const tdPort = document.createElement('td'); tdPort.className = 'px-3 py-2'; tdPort.style.width = '100px';
      if (dev.hasPort !== false) {
        const portInput = document.createElement('input');
        portInput.type = 'text'; portInput.placeholder = '0000'; portInput.value = dev.port || ''; portInput.disabled = isLocked;
        portInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;font-family:monospace;width:100%;outline:none;text-align:center`;
        portInput.addEventListener('input', () => { dev.port = portInput.value; });
        tdPort.appendChild(portInput);
      } else tdPort.innerHTML = '<span class="text-gray-600 text-xs" style="display:block;text-align:center">—</span>';
      tr.append(tdName, tdIp, tdPort);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    el.appendChild(fsSection('#459fd9', 'System Network', `${filledIPs}/${totalIPs} IPs configured`, table));
  }

  // 5. Setup Notes
  const notesArea = document.createElement('textarea');
  notesArea.placeholder = 'Enter any setup notes, deviations from plan, or field observations…';
  notesArea.disabled = isLocked;
  notesArea.value = fs.notes || '';
  notesArea.style.cssText = `${inputStyleStr};border-radius:8px;padding:10px 12px;font-size:12px;width:100%;min-height:90px;outline:none;resize:vertical;line-height:1.5`;
  notesArea.addEventListener('input', () => { fs.notes = notesArea.value; });
  el.appendChild(fsSection('#6b7280', 'Setup Notes', 'Deviations, observations, last-minute changes', notesArea));

  // 6. Change History
  const revisions = fs.revisions || [];
  const allEntries = [{ at: fs.lockedAt || null, by: null, reason: null, isBaseline: true }, ...revisions].filter(e => e.isBaseline || e.at);
  if (allEntries.length > 0) {
    const historyCard = document.createElement('div');
    historyCard.className = 'rounded-2xl mb-4 overflow-hidden';
    historyCard.style.cssText = 'border:1px solid rgba(55,65,81,0.7);background:rgba(17,24,39,0.6);';
    const rowsHtml = allEntries.map((rev, idx) => {
      const isBaseline = !!rev.isBaseline;
      const dt = rev.at ? new Date(rev.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending';
      const dotColor = isBaseline ? '#f39124' : '#459fd9';
      const label = isBaseline ? 'Initial Confirmation' : `Change #${idx}`;
      const reasonTxt = isBaseline ? 'Setup confirmed for operation.' : escapeHtml(rev.reason || '—');
      const byTxt = rev.by ? `by ${escapeHtml(rev.by)}` : '';
      return `<div class="flex gap-3" style="position:relative;">
        <div class="flex flex-col items-center flex-shrink-0" style="width:20px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};margin-top:2px;flex-shrink:0"></div>
          ${idx < allEntries.length - 1 ? `<div style="width:1px;flex:1;background:rgba(55,65,81,0.6);margin-top:4px;min-height:24px"></div>` : ''}
        </div>
        <div class="pb-4" style="flex:1;min-width:0;">
          <div class="flex items-center gap-2 flex-wrap"><span style="font-size:10px;font-weight:700;color:${dotColor}">${label}</span>${byTxt ? `<span class="text-[10px] text-gray-600">${byTxt}</span>` : ''}<span class="text-[10px] text-gray-600 ml-auto">${dt}</span></div>
          <p class="text-xs text-gray-400 mt-0.5">${reasonTxt}</p>
        </div>
      </div>`;
    }).join('');
    historyCard.innerHTML = `<div class="flex items-center gap-2.5 px-5 py-3" style="background:rgba(31,41,55,0.8);border-bottom:1px solid rgba(55,65,81,0.5);">
      <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:#459fd9;"></span><span class="text-xs font-bold text-gray-200 uppercase tracking-wider flex-1">Change History</span>
      <span class="text-[10px] text-gray-600">${revisions.length} operational change${revisions.length !== 1 ? 's' : ''}</span>
    </div><div class="px-5 pt-4 pb-1">${rowsHtml}</div>`;
    el.appendChild(historyCard);
  }

  document.getElementById('final-lock-btn')?.addEventListener('click', lockFinalSetup);
  document.getElementById('final-start-change-btn')?.addEventListener('click', startFinalChange);
  document.getElementById('final-commit-btn')?.addEventListener('click', commitFinalChange);
  document.getElementById('final-cancel-btn')?.addEventListener('click', cancelFinalChange);
}

function lockFinalSetup() {
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs.lockedAt = new Date().toISOString();
  fs._pendingChange = false;
  showToast('Final setup confirmed and locked.', 'success');
  renderFinalSetupTab();
}

function startFinalChange() {
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs.lockedAt = null;
  fs._pendingChange = true;
  renderFinalSetupTab();
  document.getElementById('final-change-reason')?.focus();
}

function commitFinalChange() {
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  const reason = document.getElementById('final-change-reason')?.value?.trim() || 'No reason provided';
  if (!fs.revisions) fs.revisions = [];
  fs.revisions.push({ at: new Date().toISOString(), by: state.currentUserId || 'Operator', reason });
  fs._pendingChange = false;
  fs.lockedAt = new Date().toISOString();
  showToast('Operational change logged and setup re-confirmed.', 'success');
  renderFinalSetupTab();
}

function cancelFinalChange() {
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs._pendingChange = false;
  fs.lockedAt = new Date().toISOString();
  renderFinalSetupTab();
}

export function installFinalSetup() {
  window.renderFinalSetupTab = renderFinalSetupTab;
}

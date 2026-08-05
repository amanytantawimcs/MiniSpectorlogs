// Final Setup tab: field confirmation checklist built from state.preOpData.
// Once locked, further edits require "Log Operational Change" — an
// append-only revision log (matches the old app's audit-trail behavior).

import { escapeHtml, showToast, renderSectionCard, calBadge, tstBadge } from './ui.js';
import { state } from './state.js';

function ensureFinalSetup() {
  const preOpData = state.preOpData;
  // "+ Operation-Time Additions" (Packing List & Equipment tab) can grow
  // preOpData.additions.sensors at any point, including after Final Setup
  // has already been built once — _mergedAdditionsCount is a watermark so a
  // later call only appends the ones added since the last check, rather than
  // either missing them entirely or re-adding ones already merged in (name
  // matching would be unreliable here since two distinct additions, e.g. a
  // replacement part, can legitimately share a name).
  const additionsSensors = preOpData.additions?.sensors || [];
  if (state.currentReportData.finalSetup?._initialized) {
    const fs = state.currentReportData.finalSetup;
    const mergedCount = fs._mergedAdditionsCount || 0;
    if (additionsSensors.length > mergedCount) {
      additionsSensors.slice(mergedCount).forEach(s => {
        fs.sensors.push({ ...s, _type: 'operation', confirmed: !!(s.calibrated && s.tested), opNote: '' });
      });
      fs._mergedAdditionsCount = additionsSensors.length;
    }
    return fs;
  }
  const allSensors = [
    ...(preOpData.sensors || []).map(s => ({ ...s, _type: 'mission' })),
    ...Object.entries(preOpData.rovSensors || {}).flatMap(([num, arr]) => arr.map(s => ({ ...s, rovNum: parseInt(num, 10), _type: 'fixed' }))),
    ...additionsSensors.map(s => ({ ...s, _type: 'operation' })),
  ];
  state.currentReportData.finalSetup = {
    _initialized: true,
    _mergedAdditionsCount: additionsSensors.length,
    activeROVNum: preOpData.rovs.find(r => r.role === 'main')?.rovNumber ?? preOpData.rovs[0]?.rovNumber ?? null,
    sensors: allSensors.map(s => ({ ...s, confirmed: !!(s.calibrated && s.tested), opNote: '' })),
    thrusters: (preOpData.thrusters || []).map(t => ({ ...t, position: '', confirmed: false })),
    notes: '',
    lockedAt: null,
    revisions: [],
    _pendingChange: false,
  };
  return state.currentReportData.finalSetup;
}

// Color comes from the global `th { color: #9AB0C8; background: #16233A; }` rule.
const thL = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider';
const thC = 'px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider';

function checkbox(confirmed, disabled, onToggle) {
  const div = document.createElement('div');
  div.style.cssText = `width:20px;height:20px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;transition:all 0.15s;cursor:${disabled ? 'default' : 'pointer'};` +
    (confirmed ? 'background:rgba(243,145,36,0.15);border:2px solid #f39124;color:#f39124' : 'background:#0C1727;border:2px solid rgba(120,166,212,0.16);color:transparent');
  div.textContent = '✓';
  if (!disabled) div.addEventListener('click', onToggle);
  return div;
}

export function renderFinalSetupTab() {
  const el = document.getElementById('finalsetup-content');
  if (!el) return;

  if (!state.preOpData || !state.preOpData.rovs || state.preOpData.rovs.length === 0) {
    el.innerHTML = `<div class="flex flex-col items-center justify-center py-24 text-center">
      <p class="text-[#6C88A6] font-semibold">No Pre-Operation Data</p>
      <p class="text-[#6C88A6] text-sm mt-1">Push from Simulation to populate Final Setup.</p>
    </div>`;
    return;
  }

  const preOpData = state.preOpData;
  const fs = ensureFinalSetup();
  const isLocked = !!fs.lockedAt;
  // Reviewers (viewer-role project members) get the same read-only treatment
  // as a locked setup — same mechanism, just an additional reason for it.
  const readOnly = isLocked || state.currentUserRole === 'reviewer';
  const inputStyleStr = readOnly
    ? 'background:rgba(12,23,39,0.4);color:#6C88A6;border:1px solid rgba(120,166,212,0.16);cursor:not-allowed'
    : 'background:rgba(12,23,39,0.6);color:#E9F0F8;border:1px solid rgba(120,166,212,0.16)';

  const confirmedSensors = fs.sensors.filter(s => s.confirmed).length;
  const totalSensors = fs.sensors.length;
  const confirmedThrusters = fs.thrusters.filter(t => t.confirmed).length;
  const totalThrusters = fs.thrusters.length;

  // Checking a single sensor/thruster box re-renders this whole tab (see the
  // checkbox onToggle callbacks below), so the collapsed tables' open/closed
  // state has to be read back before the rebuild wipes it, or expanding one
  // to work through it would snap shut after the very first box ticked.
  const wasSensorsOpen = document.getElementById('final-sensors-card')?.open ?? false;
  const wasThrustersOpen = document.getElementById('final-thrusters-card')?.open ?? false;

  el.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'rounded-2xl mb-5 overflow-hidden';
  header.style.cssText = 'border:1px solid rgba(243,145,36,0.25);background:linear-gradient(135deg,rgba(243,145,36,0.06) 0%,rgba(16,27,44,0.8) 100%);';
  const revCount = (fs.revisions || []).length;
  let headerButtonsHtml;
  if (fs._pendingChange) {
    // Item/Main Set ID/Replacement ID are optional, structured alongside the
    // freeform reason — feeds the "Replacement Data Log" export (Date | Item
    // | Main Set ID | Replacement ID), matching the client's ROV Technical
    // Logbook. Not every logged change is a part swap, so these stay blank-able.
    headerButtonsHtml = `<div class="flex flex-col items-end gap-2">
      <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:6px;background:rgba(243,145,36,0.15);color:#f39124;">CHANGE IN PROGRESS</span>
      <div class="flex items-center gap-2 flex-wrap justify-end" style="max-width:520px">
        <input id="final-change-item" type="text" placeholder="Item (e.g. Tether, Thruster 3)…" style="background:rgba(12,23,39,0.8);color:#E9F0F8;border:1px solid rgba(243,145,36,0.4);border-radius:7px;padding:5px 10px;font-size:11px;outline:none;width:170px">
        <input id="final-change-old-id" type="text" placeholder="Main Set ID…" style="background:rgba(12,23,39,0.8);color:#E9F0F8;border:1px solid rgba(243,145,36,0.4);border-radius:7px;padding:5px 10px;font-size:11px;outline:none;width:110px">
        <input id="final-change-new-id" type="text" placeholder="Replacement ID…" style="background:rgba(12,23,39,0.8);color:#E9F0F8;border:1px solid rgba(243,145,36,0.4);border-radius:7px;padding:5px 10px;font-size:11px;outline:none;width:110px">
        <input id="final-change-reason" type="text" placeholder="Reason for change…" style="background:rgba(12,23,39,0.8);color:#E9F0F8;border:1px solid rgba(243,145,36,0.4);border-radius:7px;padding:5px 10px;font-size:11px;outline:none;width:180px">
        <button type="button" id="final-commit-btn" style="padding:5px 14px;border-radius:7px;font-size:11px;font-weight:700;background:#f39124;color:#0A111C;border:none;cursor:pointer;">✓ Commit</button>
        <button type="button" id="final-cancel-btn" style="padding:5px 12px;border-radius:7px;font-size:11px;font-weight:700;background:rgba(120,166,212,0.12);color:#9AB0C8;border:1px solid rgba(120,166,212,0.3);cursor:pointer;">✗ Cancel</button>
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
      <button type="button" id="final-lock-btn" style="padding:6px 16px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:#f39124;color:#0A111C;border:none">Confirm &amp; Lock</button>
    </div>`;
  }
  header.innerHTML = `
    <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color:rgba(243,145,36,0.15);">
      <div>
        <p class="text-[10px] font-bold text-[#f39124] uppercase tracking-widest mb-0.5">Final Setup Configuration</p>
        <p class="text-lg font-bold text-[#E9F0F8] leading-tight">${escapeHtml(preOpData.projectName || '—')}</p>
        <p class="text-xs text-[#6C88A6] mt-0.5">${escapeHtml(preOpData.projectCode || '')} · ${escapeHtml(preOpData.scopeName || '')}</p>
      </div>
      <div class="flex flex-col items-end gap-2">
        <div class="flex items-center gap-2">
          <button type="button" onclick="exportFinalSetupWord()" style="padding:5px 14px;border-radius:8px;font-size:10.5px;font-weight:700;cursor:pointer;background:rgba(120,166,212,0.1);color:#9AB0C8;border:1px solid rgba(120,166,212,0.25);">Export Report</button>
          <button type="button" onclick="exportWord('ReplacementDataLog.docx')" style="padding:5px 14px;border-radius:8px;font-size:10.5px;font-weight:700;cursor:pointer;background:rgba(120,166,212,0.1);color:#9AB0C8;border:1px solid rgba(120,166,212,0.25);">Export Replacement Data Log</button>
        </div>
        ${headerButtonsHtml}
      </div>
    </div>
    <div class="grid grid-cols-3" style="border-top:1px solid rgba(120,166,212,0.16);">
      <div class="px-4 py-3 text-center" style="border-right:1px solid rgba(120,166,212,0.16);"><p class="text-xl font-bold" style="color:#f39124">${confirmedSensors}<span class="text-sm text-[#6C88A6] font-normal">/${totalSensors}</span></p><p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Sensors Confirmed</p></div>
      <div class="px-4 py-3 text-center" style="border-right:1px solid rgba(120,166,212,0.16);"><p class="text-xl font-bold" style="color:#f39124">${confirmedThrusters}<span class="text-sm text-[#6C88A6] font-normal">/${totalThrusters}</span></p><p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Thrusters Confirmed</p></div>
      <div class="px-4 py-3 text-center"><p class="text-xl font-bold" style="color:${isLocked ? '#459fd9' : '#f39124'}">${isLocked ? '✓' : '—'}</p><p class="text-[10px] font-bold text-[#6C88A6] uppercase tracking-wider mt-0.5">Setup Status</p></div>
    </div>`;
  el.appendChild(header);

  // 1. Operated Unit
  const rovBody = document.createElement('div');
  rovBody.className = 'flex gap-3 flex-wrap';
  preOpData.rovs.forEach(r => {
    const active = r.rovNumber === fs.activeROVNum;
    const isMain = r.role === 'main';
    const card = document.createElement('div');
    card.style.cssText = `cursor:${readOnly ? 'default' : 'pointer'};border-radius:12px;padding:16px 24px;border:1px solid ${active ? 'rgba(243,145,36,0.5)' : 'rgba(120,166,212,0.16)'};background:${active ? 'rgba(243,145,36,0.08)' : 'rgba(16,27,44,0.4)'};text-align:center;min-width:110px;`;
    card.innerHTML = `<div style="font-size:22px;font-weight:900;color:${active ? '#f39124' : '#6C88A6'}">MS-${r.rovNumber}</div>
      <div style="font-size:9px;font-weight:700;margin-top:4px;padding:2px 8px;border-radius:4px;display:inline-block;background:${isMain ? 'rgba(243,145,36,0.15)' : 'rgba(120,166,212,0.16)'};color:${isMain ? '#f39124' : '#9AB0C8'}">${r.role.toUpperCase()}</div>
      ${active ? `<div style="font-size:9px;color:#459fd9;margin-top:6px;font-weight:600">ACTIVE UNIT</div>` : ''}`;
    if (!readOnly) card.addEventListener('click', () => { fs.activeROVNum = r.rovNumber; renderFinalSetupTab(); });
    rovBody.appendChild(card);
  });
  el.appendChild(renderSectionCard('#f39124', 'Operated Unit', 'Select the MiniSpector unit for this operation', rovBody, { padded: true }));

  // 2. Active Sensors
  const sensorTable = document.createElement('table');
  sensorTable.className = 'w-full';
  sensorTable.innerHTML = `<thead><tr style="background:rgba(0,0,0,0.3)"><th class="${thC}" style="width:44px">✓</th><th class="${thL}">Sensor</th><th class="${thL}">Model</th><th class="${thC}">QTY</th><th class="${thC}">Cal</th><th class="${thC}">Test</th><th class="${thL}">Op. Note</th></tr></thead>`;
  const sensorTbody = document.createElement('tbody');
  sensorTbody.className = 'divide-y divide-[rgba(120,166,212,0.16)]';
  const rovNums = [...new Set(fs.sensors.filter(s => s._type === 'fixed').map(s => s.rovNum))].sort((a, b) => a - b);
  const addSensorRow = (s, idx) => {
    const tr = document.createElement('tr');
    const tdCheck = document.createElement('td'); tdCheck.className = 'px-3 py-2.5 text-center';
    tdCheck.appendChild(checkbox(s.confirmed, readOnly, () => { s.confirmed = !s.confirmed; renderFinalSetupTab(); }));
    const tdName = document.createElement('td'); tdName.className = 'px-3 py-2.5 text-sm font-medium text-[#E9F0F8]'; tdName.textContent = s.name;
    const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5 text-xs text-[#9AB0C8]'; tdModel.textContent = s.model || '—';
    const tdQty = document.createElement('td'); tdQty.className = 'px-3 py-2.5 text-center text-sm text-[#9AB0C8]'; tdQty.textContent = s.qty || 1;
    const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center'; tdCal.innerHTML = calBadge(s.calibrated);
    const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center'; tdTest.innerHTML = tstBadge(s.tested);
    const tdNote = document.createElement('td'); tdNote.className = 'px-3 py-2.5';
    const noteInput = document.createElement('input');
    noteInput.type = 'text'; noteInput.placeholder = 'Note…'; noteInput.value = s.opNote || ''; noteInput.disabled = readOnly;
    noteInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;width:100%;outline:none`;
    noteInput.addEventListener('input', () => { s.opNote = noteInput.value; });
    tdNote.appendChild(noteInput);
    tr.append(tdCheck, tdName, tdModel, tdQty, tdCal, tdTest, tdNote);
    sensorTbody.appendChild(tr);
  };
  rovNums.forEach(num => {
    const rovRole = preOpData.rovs.find(r => r.rovNumber === num)?.role || 'main';
    const catRow = document.createElement('tr');
    catRow.style.background = 'rgba(12,23,39,0.7)';
    catRow.innerHTML = `<td colspan="7" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#f39124">MS-${num} Standard Equipment · ${rovRole.toUpperCase()}</span></td>`;
    sensorTbody.appendChild(catRow);
    fs.sensors.filter(s => s._type === 'fixed' && s.rovNum === num).forEach(s => addSensorRow(s, fs.sensors.indexOf(s)));
  });
  const missionSensors = fs.sensors.filter(s => s._type === 'mission');
  if (missionSensors.length > 0) {
    const catRow = document.createElement('tr');
    catRow.style.background = 'rgba(12,23,39,0.7)';
    catRow.innerHTML = `<td colspan="7" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#459fd9">Mission Sensors</span></td>`;
    sensorTbody.appendChild(catRow);
    missionSensors.forEach(s => addSensorRow(s, fs.sensors.indexOf(s)));
  }
  const operationSensors = fs.sensors.filter(s => s._type === 'operation');
  if (operationSensors.length > 0) {
    const catRow = document.createElement('tr');
    catRow.style.background = 'rgba(12,23,39,0.7)';
    catRow.innerHTML = `<td colspan="7" class="px-3 pt-3 pb-1"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#10b981">Operation-Time Additions</span></td>`;
    sensorTbody.appendChild(catRow);
    operationSensors.forEach(s => addSensorRow(s, fs.sensors.indexOf(s)));
  }
  if (fs.sensors.length === 0) sensorTbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-[#6C88A6] text-sm">No sensors</td></tr>`;
  sensorTable.appendChild(sensorTbody);
  el.appendChild(renderSectionCard('#f39124', 'Active Sensors', `${confirmedSensors}/${totalSensors} confirmed`, sensorTable, { padded: true, collapsed: true, startOpen: wasSensorsOpen, id: 'final-sensors-card' }));

  // 3. Thrusters
  if (fs.thrusters.length > 0) {
    const table = document.createElement('table');
    table.className = 'w-full';
    table.innerHTML = `<thead><tr style="background:rgba(0,0,0,0.3)"><th class="${thC}" style="width:44px">✓</th><th class="${thL}">Thruster No.</th><th class="${thL}">Serial</th><th class="${thL}">Position / Location</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-[rgba(120,166,212,0.16)]';
    fs.thrusters.forEach((t) => {
      const tr = document.createElement('tr');
      const tdCheck = document.createElement('td'); tdCheck.className = 'px-3 py-2.5 text-center';
      tdCheck.appendChild(checkbox(t.confirmed, readOnly, () => { t.confirmed = !t.confirmed; renderFinalSetupTab(); }));
      const tdNum = document.createElement('td'); tdNum.className = 'px-3 py-2.5 text-sm text-[#E9F0F8] font-mono'; tdNum.textContent = t.number || '—';
      const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2.5 text-xs text-[#9AB0C8] font-mono'; tdSerial.textContent = t.serial || '—';
      const tdPos = document.createElement('td'); tdPos.className = 'px-3 py-2.5';
      const posInput = document.createElement('input');
      posInput.type = 'text'; posInput.placeholder = 'e.g. Port Horizontal'; posInput.value = t.position || ''; posInput.disabled = readOnly;
      posInput.style.cssText = `${inputStyleStr};border-radius:6px;padding:4px 8px;font-size:11px;width:100%;outline:none`;
      posInput.addEventListener('input', () => { t.position = posInput.value; });
      tdPos.appendChild(posInput);
      tr.append(tdCheck, tdNum, tdSerial, tdPos);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    el.appendChild(renderSectionCard('#f39124', 'Thrusters', `${confirmedThrusters}/${totalThrusters} confirmed`, table, { padded: true, collapsed: true, startOpen: wasThrustersOpen, id: 'final-thrusters-card' }));
  }

  // 4. Setup Notes
  const notesArea = document.createElement('textarea');
  notesArea.placeholder = 'Enter any setup notes, deviations from plan, or field observations…';
  notesArea.disabled = readOnly;
  notesArea.value = fs.notes || '';
  notesArea.style.cssText = `${inputStyleStr};border-radius:8px;padding:10px 12px;font-size:12px;width:100%;min-height:90px;outline:none;resize:vertical;line-height:1.5`;
  notesArea.addEventListener('input', () => { fs.notes = notesArea.value; });
  el.appendChild(renderSectionCard('#6C88A6', 'Setup Notes', 'Deviations, observations, last-minute changes', notesArea, { padded: true }));

  // 6. Change History
  const revisions = fs.revisions || [];
  const allEntries = [{ at: fs.lockedAt || null, by: null, reason: null, isBaseline: true }, ...revisions].filter(e => e.isBaseline || e.at);
  if (allEntries.length > 0) {
    const historyCard = document.createElement('div');
    historyCard.className = 'rounded-2xl mb-4 overflow-hidden';
    historyCard.style.cssText = 'border:1px solid rgba(120,166,212,0.16);background:rgba(12,23,39,0.6);';
    const rowsHtml = allEntries.map((rev, idx) => {
      const isBaseline = !!rev.isBaseline;
      const dt = rev.at ? new Date(rev.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending';
      const dotColor = isBaseline ? '#f39124' : '#459fd9';
      const label = isBaseline ? 'Initial Confirmation' : `Change #${idx}`;
      const reasonTxt = isBaseline ? 'Setup confirmed for operation.' : escapeHtml(rev.reason || '—');
      const byTxt = rev.by ? `by ${escapeHtml(rev.by)}` : '';
      // A logged replacement (item + at least one ID typed in) gets its own
      // line — matches the Date | Item | Main Set ID | Replacement ID shape
      // the Replacement Data Log export reads from these same fields.
      const replacementTxt = (!isBaseline && rev.item)
        ? `<p class="text-xs mt-0.5" style="color:#f39124"><span class="font-semibold">${escapeHtml(rev.item)}</span>: ${escapeHtml(rev.mainSetId || '—')} → ${escapeHtml(rev.replacementId || '—')}</p>`
        : '';
      return `<div class="flex gap-3" style="position:relative;">
        <div class="flex flex-col items-center flex-shrink-0" style="width:20px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};margin-top:2px;flex-shrink:0"></div>
          ${idx < allEntries.length - 1 ? `<div style="width:1px;flex:1;background:rgba(120,166,212,0.6);margin-top:4px;min-height:24px"></div>` : ''}
        </div>
        <div class="pb-4" style="flex:1;min-width:0;">
          <div class="flex items-center gap-2 flex-wrap"><span style="font-size:10px;font-weight:700;color:${dotColor}">${label}</span>${byTxt ? `<span class="text-[10px] text-[#6C88A6]">${byTxt}</span>` : ''}<span class="text-[10px] text-[#6C88A6] ml-auto">${dt}</span></div>
          ${replacementTxt}
          <p class="text-xs text-[#9AB0C8] mt-0.5">${reasonTxt}</p>
        </div>
      </div>`;
    }).join('');
    historyCard.innerHTML = `<div class="flex items-center gap-2.5 px-5 py-3" style="background:rgba(16,27,44,0.8);border-bottom:1px solid rgba(120,166,212,0.16);">
      <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:#459fd9;"></span><span class="text-xs font-bold text-[#E9F0F8] uppercase tracking-wider flex-1">Change History</span>
      <span class="text-[10px] text-[#6C88A6]">${revisions.length} operational change${revisions.length !== 1 ? 's' : ''}</span>
    </div><div class="px-5 pt-4 pb-1">${rowsHtml}</div>`;
    el.appendChild(historyCard);
  }

  document.getElementById('final-lock-btn')?.addEventListener('click', lockFinalSetup);
  document.getElementById('final-start-change-btn')?.addEventListener('click', startFinalChange);
  document.getElementById('final-commit-btn')?.addEventListener('click', commitFinalChange);
  document.getElementById('final-cancel-btn')?.addEventListener('click', cancelFinalChange);
}

function lockFinalSetup() {
  if (state.currentUserRole === 'reviewer') return;
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs.lockedAt = new Date().toISOString();
  fs._pendingChange = false;
  showToast('Final setup confirmed and locked.', 'success');
  renderFinalSetupTab();
}

function startFinalChange() {
  if (state.currentUserRole === 'reviewer') return;
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs.lockedAt = null;
  fs._pendingChange = true;
  renderFinalSetupTab();
  document.getElementById('final-change-reason')?.focus();
}

function commitFinalChange() {
  if (state.currentUserRole === 'reviewer') return;
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  const reason = document.getElementById('final-change-reason')?.value?.trim() || 'No reason provided';
  const item = document.getElementById('final-change-item')?.value?.trim() || '';
  const mainSetId = document.getElementById('final-change-old-id')?.value?.trim() || '';
  const replacementId = document.getElementById('final-change-new-id')?.value?.trim() || '';
  if (!fs.revisions) fs.revisions = [];
  fs.revisions.push({ at: new Date().toISOString(), by: state.currentUserId || 'Operator', reason, item, mainSetId, replacementId });
  fs._pendingChange = false;
  fs.lockedAt = new Date().toISOString();
  showToast('Operational change logged and setup re-confirmed.', 'success');
  renderFinalSetupTab();
}

function cancelFinalChange() {
  if (state.currentUserRole === 'reviewer') return;
  const fs = state.currentReportData.finalSetup;
  if (!fs) return;
  fs._pendingChange = false;
  fs.lockedAt = new Date().toISOString();
  renderFinalSetupTab();
}

export function installFinalSetup() {
  window.renderFinalSetupTab = renderFinalSetupTab;
}

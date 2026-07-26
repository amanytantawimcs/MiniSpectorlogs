// "Topology" workspace sub-tab: machines & software, equipment & consumables
// (merged list — see rebuild note: replaces the old app's separate sysarch
// equipment + packing list), simulation status log, deliverables, system IPs,
// and issues (new in the rebuild — the old app tracked issues in its data
// model but never built any UI for them).

import { escapeHtml } from '../ui.js';
import { simState } from './state.js';
import { EQUIP_CATEGORIES, EQUIP_CAT_COLORS, HARDWARE_ITEMS, MACHINE_NAMES, SOFTWARE_LIST, DEFAULT_SYSTEM_IPS } from './config.js';
import { renderSimContent, scheduleSimSync } from './core.js';

function ensureSysarch() {
  const sa = simState.shared.sysarch;
  if (!sa.machines) sa.machines = [];
  if (!sa.equipment) sa.equipment = [];
  if (!sa.simStatus) sa.simStatus = [];
  if (!sa.deliverables) sa.deliverables = {};
  if (!sa.systemIPs || sa.systemIPs.length === 0) sa.systemIPs = DEFAULT_SYSTEM_IPS.map(p => ({ ...p }));
  if (!simState.shared.issues) simState.shared.issues = [];
  return sa;
}

// Collapse state lives outside any render call so it survives the full
// re-render that follows every edit (renderSimContent() rebuilds every
// card from scratch). Resets on page reload, which is fine — the ask was
// "collapsed by default", not "remember forever".
const collapsedState = {
  machines: true, equipment: true, simStatus: true, deliverables: true, systemIPs: true, issues: true,
};

function chevronSvg(collapsed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;
}

function card(title, color, key) {
  const el = document.createElement('div');
  el.className = 'mb-5 rounded-xl overflow-hidden';
  el.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b border-gray-700/50';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'flex items-center gap-3 cursor-pointer select-none';
  titleGroup.innerHTML = `<span class="collapse-chevron text-gray-400 flex items-center">${chevronSvg(collapsedState[key])}</span>` +
    `<span class="w-2 h-2 rounded-full" style="background:${color}"></span><span class="text-xs font-bold text-white uppercase tracking-widest">${title}</span>`;
  header.appendChild(titleGroup);

  const body = document.createElement('div');
  body.style.display = collapsedState[key] ? 'none' : '';

  titleGroup.addEventListener('click', () => {
    collapsedState[key] = !collapsedState[key];
    body.style.display = collapsedState[key] ? 'none' : '';
    titleGroup.querySelector('.collapse-chevron').innerHTML = chevronSvg(collapsedState[key]);
  });

  el.append(header, body);
  return { el, header, body };
}

function textCell(value, placeholder, onChange, mono) {
  const input = document.createElement('input');
  input.type = 'text'; input.value = value || ''; input.placeholder = placeholder || '';
  input.className = `w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none ${mono ? 'font-mono' : 'text-gray-200'}`;
  if (mono) input.style.color = '#459fd9';
  input.addEventListener('input', () => { onChange(input.value); scheduleSimSync(); });
  return input;
}

function addBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = label;
  btn.className = 'px-3 py-1 rounded-lg text-xs font-bold';
  btn.style.cssText = 'background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3);';
  btn.addEventListener('click', onClick);
  return btn;
}

function removeBtnCell(onClick) {
  const td = document.createElement('td'); td.className = 'px-3 py-2 text-center';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.innerHTML = '&times;'; btn.className = 'text-gray-500 hover:text-red-400 text-lg font-bold leading-none';
  btn.addEventListener('click', onClick);
  td.appendChild(btn);
  return td;
}

// ---- Machines & Software ----
function renderMachines(sa) {
  const { el, header, body } = card('Machines & Software', '#459fd9', 'machines');
  header.appendChild(addBtn('Add Machine', () => { sa.machines.push({ name: '', ip: '', software: '', version: '', activated: 'Activated', comments: '' }); renderSimContent(); scheduleSimSync(); }));

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-3 py-2 text-left">Machine</th><th class="px-3 py-2 text-left">IP</th><th class="px-3 py-2 text-left">Software</th>
    <th class="px-3 py-2 text-left">Version</th><th class="px-3 py-2 text-center">Status</th><th class="px-3 py-2 text-left">Comments</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  if (sa.machines.length === 0) tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-600 text-sm">No machines added yet</td></tr>`;
  sa.machines.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(55,65,81,0.3)';
    const tdName = document.createElement('td'); tdName.className = 'px-3 py-2';
    const nameInput = textCell(m.name, 'Machine name...', v => m.name = v);
    nameInput.setAttribute('list', 'sim-machine-names');
    tdName.appendChild(nameInput);
    const tdIp = document.createElement('td'); tdIp.className = 'px-3 py-2'; tdIp.appendChild(textCell(m.ip, 'IP address', v => m.ip = v, true));
    const tdSw = document.createElement('td'); tdSw.className = 'px-3 py-2';
    const swInput = textCell(m.software, 'Software...', v => m.software = v);
    swInput.setAttribute('list', 'sim-software-list');
    tdSw.appendChild(swInput);
    const tdVer = document.createElement('td'); tdVer.className = 'px-3 py-2'; tdVer.appendChild(textCell(m.version, 'Version', v => m.version = v));

    const tdStatus = document.createElement('td'); tdStatus.className = 'px-3 py-2 text-center';
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button';
    const ok = (m.activated || 'Activated') === 'Activated';
    statusBtn.textContent = ok ? 'Activated' : 'Need Activation';
    statusBtn.className = 'text-[10px] font-bold px-2.5 py-1 rounded';
    statusBtn.style.cssText = ok ? 'background:rgba(243,145,36,0.15);color:#f39124;' : 'background:rgba(234,179,8,0.15);color:#facc15;';
    statusBtn.addEventListener('click', () => { m.activated = ok ? 'Need Activation' : 'Activated'; renderSimContent(); scheduleSimSync(); });
    tdStatus.appendChild(statusBtn);

    const tdComments = document.createElement('td'); tdComments.className = 'px-3 py-2'; tdComments.appendChild(textCell(m.comments, 'Comments...', v => m.comments = v));

    tr.append(tdName, tdIp, tdSw, tdVer, tdStatus, tdComments);
    tr.appendChild(removeBtnCell(() => { sa.machines.splice(i, 1); renderSimContent(); scheduleSimSync(); }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  return el;
}

// ---- Equipment & Consumables (merged: replaces old sysarch.equipment + packingList) ----
function renderEquipment(sa) {
  const { el, header, body } = card('Equipment & Consumables', '#34d399', 'equipment');
  header.appendChild(addBtn('Add Item', () => { sa.equipment.push({ batch: '', category: EQUIP_CATEGORIES[0], item: '', serial: '', qty: 1, rovAssignment: 'Shared', comments: '' }); renderSimContent(); scheduleSimSync(); }));

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-3 py-2 text-left">Category</th><th class="px-3 py-2 text-left">Item</th><th class="px-3 py-2 text-left">Serial</th>
    <th class="px-3 py-2 text-center">Qty</th><th class="px-3 py-2 text-left">Batch</th><th class="px-3 py-2 text-left">Assignment</th>
    <th class="px-3 py-2 text-left">Comments</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  if (sa.equipment.length === 0) tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-600 text-sm">No equipment added yet</td></tr>`;
  const rovOpts = ['Shared', ...[...simState.selectedROVs.keys()].sort((a, b) => a - b).map(n => `MS-${n}`)];

  sa.equipment.forEach((eq, i) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(55,65,81,0.3)';

    const tdCat = document.createElement('td'); tdCat.className = 'px-3 py-2';
    const catSelect = document.createElement('select');
    catSelect.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none';
    catSelect.style.color = EQUIP_CAT_COLORS[eq.category] || '#9ca3af';
    EQUIP_CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; o.selected = c === eq.category; catSelect.appendChild(o); });
    catSelect.addEventListener('change', () => { eq.category = catSelect.value; scheduleSimSync(); renderSimContent(); });
    tdCat.appendChild(catSelect);

    const tdItem = document.createElement('td'); tdItem.className = 'px-3 py-2';
    const itemInput = textCell(eq.item, 'Item name...', v => eq.item = v);
    itemInput.setAttribute('list', 'sim-hardware-items');
    tdItem.appendChild(itemInput);

    const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2'; tdSerial.appendChild(textCell(eq.serial, 'S/N...', v => eq.serial = v, true));

    const tdQty = document.createElement('td'); tdQty.className = 'px-3 py-2 text-center';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = eq.qty || 1;
    qtyInput.className = 'w-14 bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1 text-xs text-center text-white outline-none';
    qtyInput.addEventListener('input', () => { eq.qty = parseInt(qtyInput.value, 10) || 1; scheduleSimSync(); });
    tdQty.appendChild(qtyInput);

    const tdBatch = document.createElement('td'); tdBatch.className = 'px-3 py-2'; tdBatch.appendChild(textCell(eq.batch, 'Batch', v => eq.batch = v));

    const tdAss = document.createElement('td'); tdAss.className = 'px-3 py-2';
    const assSelect = document.createElement('select');
    assSelect.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none';
    rovOpts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; opt.selected = o === (eq.rovAssignment || 'Shared'); assSelect.appendChild(opt); });
    assSelect.addEventListener('change', () => { eq.rovAssignment = assSelect.value; scheduleSimSync(); });
    tdAss.appendChild(assSelect);

    const tdComments = document.createElement('td'); tdComments.className = 'px-3 py-2'; tdComments.appendChild(textCell(eq.comments, 'Comments...', v => eq.comments = v));

    tr.append(tdCat, tdItem, tdSerial, tdQty, tdBatch, tdAss, tdComments);
    tr.appendChild(removeBtnCell(() => { sa.equipment.splice(i, 1); renderSimContent(); scheduleSimSync(); }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  return el;
}

// ---- Simulation Status (test scenario log) ----
function renderSimStatus(sa) {
  const { el, header, body } = card('Simulation Status', '#fbbf24', 'simStatus');
  header.appendChild(addBtn('Add Entry', () => { sa.simStatus.push({ machine: '', scenario: '', expected: '', completion: 0, status: 'Passed', comments: '' }); renderSimContent(); scheduleSimSync(); }));

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-3 py-2 text-left">Machine</th><th class="px-3 py-2 text-left">Scenario</th><th class="px-3 py-2 text-left">Expected</th>
    <th class="px-3 py-2 text-center">% Complete</th><th class="px-3 py-2 text-center">Status</th><th class="px-3 py-2 text-left">Comments</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  if (sa.simStatus.length === 0) tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-600 text-sm">No test scenarios logged yet</td></tr>`;
  const statusStyles = { Passed: 'background:rgba(243,145,36,0.15);color:#f39124;', Warning: 'background:rgba(234,179,8,0.15);color:#facc15;', Failed: 'background:rgba(239,68,68,0.15);color:#f87171;' };
  const cycle = { Passed: 'Warning', Warning: 'Failed', Failed: 'Passed' };

  sa.simStatus.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(55,65,81,0.3)';
    const tdMachine = document.createElement('td'); tdMachine.className = 'px-3 py-2'; tdMachine.appendChild(textCell(s.machine, 'Machine', v => s.machine = v));
    const tdScenario = document.createElement('td'); tdScenario.className = 'px-3 py-2'; tdScenario.appendChild(textCell(s.scenario, 'Scenario', v => s.scenario = v));
    const tdExpected = document.createElement('td'); tdExpected.className = 'px-3 py-2'; tdExpected.appendChild(textCell(s.expected, 'Expected result', v => s.expected = v));

    const tdPct = document.createElement('td'); tdPct.className = 'px-3 py-2 text-center';
    const pctInput = document.createElement('input');
    pctInput.type = 'number'; pctInput.min = '0'; pctInput.max = '100'; pctInput.value = s.completion || 0;
    pctInput.className = 'w-16 bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1 text-xs text-center text-white outline-none';
    pctInput.addEventListener('input', () => { s.completion = Math.max(0, Math.min(100, parseInt(pctInput.value, 10) || 0)); scheduleSimSync(); });
    tdPct.appendChild(pctInput);

    const tdStatus = document.createElement('td'); tdStatus.className = 'px-3 py-2 text-center';
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button'; statusBtn.textContent = s.status || 'Passed';
    statusBtn.className = 'text-[10px] font-bold px-2.5 py-1 rounded';
    statusBtn.style.cssText = statusStyles[s.status || 'Passed'];
    statusBtn.addEventListener('click', () => { s.status = cycle[s.status || 'Passed']; renderSimContent(); scheduleSimSync(); });
    tdStatus.appendChild(statusBtn);

    const tdComments = document.createElement('td'); tdComments.className = 'px-3 py-2'; tdComments.appendChild(textCell(s.comments, 'Comments...', v => s.comments = v));

    tr.append(tdMachine, tdScenario, tdExpected, tdPct, tdStatus, tdComments);
    tr.appendChild(removeBtnCell(() => { sa.simStatus.splice(i, 1); renderSimContent(); scheduleSimSync(); }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  return el;
}

// ---- Deliverables ----
function renderDeliverables(sa) {
  const del = sa.deliverables;
  const { el, body } = card('Deliverables', '#a78bfa', 'deliverables');
  const content = document.createElement('div');
  content.className = 'p-5 grid grid-cols-2 gap-6';

  const left = document.createElement('div'); left.className = 'space-y-3';
  const toField = document.createElement('div');
  const toLabel = document.createElement('label'); toLabel.className = 'text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1'; toLabel.textContent = 'Delivered To';
  const toInput = textCell(del.deliveredTo, 'Recipient name...', v => del.deliveredTo = v);
  toField.append(toLabel, toInput);

  const dateField = document.createElement('div');
  const dateLabel = document.createElement('label'); dateLabel.className = 'text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1'; dateLabel.textContent = 'Date';
  const dateInput = document.createElement('input');
  dateInput.type = 'date'; dateInput.value = del.date || '';
  dateInput.className = 'w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none';
  dateInput.addEventListener('change', () => { del.date = dateInput.value; scheduleSimSync(); });
  dateField.append(dateLabel, dateInput);

  left.append(toField, dateField);
  [['walletHDD', 'Wallet HDD'], ['otherHDD', 'Other HDD'], ['flashDrives', 'Memory Flash Drives']].forEach(([key, label]) => {
    const row = document.createElement('div'); row.className = 'flex items-center gap-3';
    const lbl = document.createElement('span'); lbl.className = 'text-xs text-gray-300 w-36'; lbl.textContent = label;
    const num = document.createElement('input');
    num.type = 'number'; num.min = '0'; num.value = del[key] || 0;
    num.className = 'w-16 text-center bg-gray-900/60 border border-gray-700 rounded-lg text-sm text-white py-1 outline-none';
    num.addEventListener('input', () => { del[key] = parseInt(num.value, 10) || 0; scheduleSimSync(); });
    row.append(lbl, num);
    left.appendChild(row);
  });

  const right = document.createElement('div');
  const notesHeader = document.createElement('div'); notesHeader.className = 'flex items-center justify-between mb-2';
  notesHeader.innerHTML = `<p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notes</p>`;
  const addNoteBtn = addBtn('+ Note', () => { if (!del.notes) del.notes = []; del.notes.push(''); renderSimContent(); scheduleSimSync(); });
  notesHeader.appendChild(addNoteBtn);
  right.appendChild(notesHeader);
  (del.notes || []).forEach((n, i) => {
    const row = document.createElement('div'); row.className = 'flex gap-2 mb-2';
    const input = textCell(n, 'Note...', v => del.notes[i] = v);
    row.appendChild(input);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.innerHTML = '&times;'; removeBtn.className = 'text-gray-500 hover:text-red-400 text-lg font-bold leading-none px-2';
    removeBtn.addEventListener('click', () => { del.notes.splice(i, 1); renderSimContent(); scheduleSimSync(); });
    row.appendChild(removeBtn);
    right.appendChild(row);
  });

  content.append(left, right);
  body.appendChild(content);
  return el;
}

// ---- System IPs ----
function renderSystemIPs(sa) {
  const { el, header, body } = card('System IPs', '#60a5fa', 'systemIPs');
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-3 py-2 text-left">Category</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">IP</th><th class="px-3 py-2 text-left">Port</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  let lastCat = null;
  sa.systemIPs.forEach((ip, i) => {
    if (ip.category !== lastCat) {
      const catRow = document.createElement('tr');
      catRow.innerHTML = `<td colspan="5" class="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-600">${escapeHtml(ip.category)}</td>`;
      tbody.appendChild(catRow);
      lastCat = ip.category;
    }
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(55,65,81,0.3)';
    const tdName = document.createElement('td'); tdName.className = 'px-3 py-2'; tdName.appendChild(textCell(ip.name, 'Device name', v => ip.name = v));
    const tdCat = document.createElement('td'); tdCat.style.display = 'none';
    const tdIp = document.createElement('td'); tdIp.className = 'px-3 py-2';
    if (ip.hasIP) tdIp.appendChild(textCell(ip.ip, 'IP address', v => ip.ip = v, true)); else tdIp.innerHTML = '<span class="text-gray-600 text-xs">—</span>';
    const tdPort = document.createElement('td'); tdPort.className = 'px-3 py-2';
    if (ip.hasPort) tdPort.appendChild(textCell(ip.port, 'Port', v => ip.port = v, true)); else tdPort.innerHTML = '<span class="text-gray-600 text-xs">—</span>';
    tr.append(tdCat, tdName, tdIp, tdPort);
    tr.appendChild(removeBtnCell(() => { sa.systemIPs.splice(i, 1); renderSimContent(); scheduleSimSync(); }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  return el;
}

// ---- Issues (new — see rebuild note above) ----
function renderIssues() {
  const issues = simState.shared.issues;
  const { el, header, body } = card('Issues', '#f87171', 'issues');
  header.appendChild(addBtn('Add Issue', () => { issues.push({ title: '', description: '', severity: 'medium', status: 'open' }); renderSimContent(); scheduleSimSync(); }));

  if (issues.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-center text-gray-600 py-8 text-sm';
    empty.textContent = 'No issues flagged.';
    body.appendChild(empty);
    return el;
  }

  const list = document.createElement('div'); list.className = 'p-4 space-y-3';
  issues.forEach((issue, i) => {
    const row = document.createElement('div');
    row.className = 'rounded-lg p-3';
    row.style.cssText = 'background:rgba(17,24,39,0.5);border:1px solid rgba(55,65,81,0.4);';

    const topRow = document.createElement('div'); topRow.className = 'flex gap-2 mb-2';
    const titleInput = textCell(issue.title, 'Issue title...', v => issue.title = v);
    titleInput.className += ' font-semibold';
    const sevSelect = document.createElement('select');
    sevSelect.className = 'bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none';
    ['low', 'medium', 'high'].forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1); o.selected = s === issue.severity; sevSelect.appendChild(o); });
    sevSelect.addEventListener('change', () => { issue.severity = sevSelect.value; scheduleSimSync(); });
    const statusSelect = document.createElement('select');
    statusSelect.className = 'bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none';
    ['open', 'resolved'].forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1); o.selected = s === issue.status; statusSelect.appendChild(o); });
    statusSelect.addEventListener('change', () => { issue.status = statusSelect.value; scheduleSimSync(); });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.innerHTML = '&times;'; removeBtn.className = 'text-gray-500 hover:text-red-400 text-lg font-bold leading-none px-1';
    removeBtn.addEventListener('click', () => { issues.splice(i, 1); renderSimContent(); scheduleSimSync(); });
    topRow.append(titleInput, sevSelect, statusSelect, removeBtn);

    const descInput = document.createElement('textarea');
    descInput.rows = 2; descInput.placeholder = 'Description...'; descInput.value = issue.description || '';
    descInput.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-gray-200 outline-none resize-none';
    descInput.addEventListener('input', () => { issue.description = descInput.value; scheduleSimSync(); });

    row.append(topRow, descInput);
    list.appendChild(row);
  });
  body.appendChild(list);
  return el;
}

export function renderSysArchContent(area) {
  const sa = ensureSysarch();
  area.innerHTML = '';

  const datalists = document.createElement('div');
  datalists.innerHTML = `
    <datalist id="sim-machine-names">${MACHINE_NAMES.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
    <datalist id="sim-software-list">${SOFTWARE_LIST.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
    <datalist id="sim-hardware-items">${HARDWARE_ITEMS.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
  `;

  const wrap = document.createElement('div');
  wrap.className = 'max-w-5xl mx-auto pb-6';
  const title = document.createElement('h3');
  title.className = 'text-xl font-bold text-white mb-5';
  title.textContent = 'Topology';
  wrap.appendChild(title);

  wrap.append(renderMachines(sa), renderEquipment(sa), renderSimStatus(sa), renderDeliverables(sa), renderSystemIPs(sa), renderIssues());

  area.appendChild(datalists);
  area.appendChild(wrap);
}

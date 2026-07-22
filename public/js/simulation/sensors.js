// "Sensors & Equipment" workspace sub-tab: MiniSpector fleet, mission sensors
// (required + custom + optional), per-ROV fixed sensors (calibration wired up
// here — the old app never connected this, see rebuild notes), and thrusters.

import { escapeHtml } from '../ui.js';
import { simState } from './state.js';
import { OPERATION_SCOPES, SENSOR_HARDWARE, SENSOR_CATEGORIES, CAT_ORDER } from './config.js';
import { renderSimContent, scheduleSimSync } from './core.js';

function rovOptions() {
  return ['Shared', ...[...simState.selectedROVs.keys()].sort((a, b) => a - b).map(n => `MS-${n}`)];
}

function buildAssignmentSelect(current, onChange) {
  const select = document.createElement('select');
  select.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs outline-none focus:border-[#459fd9] transition-colors';
  select.style.color = current !== 'Shared' ? '#f39124' : '#9ca3af';
  rovOptions().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o; opt.selected = o === current;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function buildToggle(active, color, onToggle) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;';
  wrap.innerHTML = `<div style="width:40px;height:20px;border-radius:9999px;background:${active ? color : '#4b5563'};position:relative;transition:background 0.2s;">
    <div style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:white;border-radius:50%;transform:${active ? 'translateX(20px)' : 'translateX(0)'};transition:transform 0.2s;"></div>
  </div>`;
  wrap.addEventListener('click', onToggle);
  return wrap;
}

function buildModelCell(sensor, onChange) {
  const hardware = SENSOR_HARDWARE[sensor.name] || [];
  if (hardware.length === 0 || (sensor.model && !hardware.includes(sensor.model))) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500 outline-none placeholder-gray-600 transition-colors';
    input.placeholder = hardware.length ? 'Custom model / S/N...' : 'Model / S/N...';
    input.value = sensor.model || '';
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }
  const select = document.createElement('select');
  select.className = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#459fd9] outline-none transition-colors';
  select.innerHTML = `<option value=""${sensor.model ? '' : ' selected'}>Select model...</option>` +
    hardware.map(h => `<option value="${escapeHtml(h)}"${h === sensor.model ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('') +
    `<option value="__custom__">Custom...</option>`;
  select.addEventListener('change', () => {
    onChange(select.value === '__custom__' ? ' ' : select.value);
  });
  return select;
}

function renderFleetSection() {
  const entries = [...simState.selectedROVs.entries()].sort((a, b) => a[0] - b[0]);
  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  if (entries.length === 0) {
    card.innerHTML = `<div class="text-center text-gray-600 py-8 text-sm">No MiniSpectors selected — go back to Step 1.</div>`;
    return card;
  }
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-6 py-3.5 border-b border-gray-700/50';
  header.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:#f39124"></span><span class="text-xs font-bold text-white uppercase tracking-widest">MiniSpector Fleet</span>`;
  card.appendChild(header);

  entries.forEach(([num, role], idx) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-5 py-3 flex-wrap';
    row.style.background = idx % 2 === 0 ? 'rgba(17,24,39,0.35)' : 'rgba(17,24,39,0.15)';

    const label = document.createElement('span');
    label.className = 'font-bold text-white text-sm shrink-0';
    label.style.minWidth = '55px';
    label.textContent = `MS-${num}`;

    const serialInput = document.createElement('input');
    serialInput.type = 'text';
    serialInput.placeholder = 'Serial No.';
    serialInput.value = simState.rovSerials.get(num) || '';
    serialInput.className = 'bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs font-mono focus:border-[#459fd9] outline-none placeholder-gray-600 shrink-0';
    serialInput.style.cssText += 'width:150px;color:#459fd9';
    serialInput.addEventListener('input', () => { simState.rovSerials.set(num, serialInput.value); scheduleSimSync(); });

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.placeholder = 'Description (optional)...';
    descInput.value = simState.rovDescriptions.get(num) || '';
    descInput.className = 'flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:border-orange-400 outline-none placeholder-gray-600';
    descInput.addEventListener('input', () => { simState.rovDescriptions.set(num, descInput.value); scheduleSimSync(); });

    const roleBadge = document.createElement('span');
    roleBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0';
    roleBadge.style.cssText = role === 'main' ? 'background:rgba(243,145,36,0.2);color:#f39124;' : 'background:rgba(69,159,217,0.18);color:#459fd9;';
    roleBadge.textContent = role === 'main' ? 'MAIN' : 'STANDBY';

    row.append(label, serialInput, descInput, roleBadge);
    card.appendChild(row);
  });
  return card;
}

function renderSensorsTable() {
  const sensors = simState.shared.sensors || [];
  const active = sensors.filter(s => s.status !== 'optional' || s.custom);
  const scope = OPERATION_SCOPES[simState.selectedScope];

  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-6 py-3.5 border-b border-gray-700/50';
  header.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:#f39124"></span>
    <span class="text-xs font-bold text-white uppercase tracking-widest">Sensors</span>
    <span class="text-xs text-gray-600">${active.length} item${active.length !== 1 ? 's' : ''} — scope: <span style="color:#f39124">${escapeHtml(scope?.name || '–')}</span></span>`;
  card.appendChild(header);

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;min-width:740px;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-4 py-2 text-left">#</th><th class="px-4 py-2 text-left">Sensor</th><th class="px-3 py-2 text-left">Model</th>
    <th class="px-3 py-2 text-left">Serial No.</th><th class="px-3 py-2 text-center">Qty</th>
    <th class="px-3 py-2 text-center">Calibrated</th><th class="px-3 py-2 text-center">Tested</th>
    <th class="px-3 py-2 text-left">Assignment</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  if (active.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-600 text-sm">No sensors — select a scope or add a custom sensor below</td></tr>`;
  }
  active.forEach((sensor, i) => {
    const idx = sensors.indexOf(sensor);
    const tr = document.createElement('tr');
    tr.style.cssText = `background:${i % 2 === 0 ? 'rgba(17,24,39,0.45)' : 'rgba(17,24,39,0.15)'};border-bottom:1px solid rgba(55,65,81,0.25)`;

    const tdNum = document.createElement('td'); tdNum.className = 'px-4 py-2.5 text-xs text-gray-500 font-mono text-center'; tdNum.textContent = i + 1;
    const tdName = document.createElement('td'); tdName.className = 'px-4 py-2.5 text-sm text-gray-200';
    tdName.textContent = sensor.name;
    if (sensor.custom) tdName.innerHTML += ` <span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(249,115,22,0.15);color:#fb923c;">CUSTOM</span>`;

    const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5';
    tdModel.appendChild(buildModelCell(sensor, (v) => { sensor.model = v; scheduleSimSync(); if (v === ' ') renderSimContent(); }));

    const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2.5';
    const serialInput = document.createElement('input');
    serialInput.type = 'text'; serialInput.placeholder = 'S/N...'; serialInput.value = sensor.serialNo || '';
    serialInput.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs font-mono outline-none';
    serialInput.style.color = '#459fd9';
    serialInput.addEventListener('input', () => { sensor.serialNo = serialInput.value; scheduleSimSync(); });
    tdSerial.appendChild(serialInput);

    const tdQty = document.createElement('td'); tdQty.className = 'px-3 py-2.5 text-center';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = sensor.qty || 1;
    qtyInput.className = 'w-14 bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1 text-xs text-center text-white outline-none';
    qtyInput.addEventListener('input', () => { sensor.qty = parseInt(qtyInput.value, 10) || 1; scheduleSimSync(); });
    tdQty.appendChild(qtyInput);

    const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center';
    tdCal.appendChild(buildToggle(sensor.calibrated, '#f39124', () => { sensor.calibrated = !sensor.calibrated; scheduleSimSync(); renderSimContent(); }));

    const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center';
    tdTest.appendChild(buildToggle(sensor.tested, '#459fd9', () => { sensor.tested = !sensor.tested; scheduleSimSync(); renderSimContent(); }));

    const tdAss = document.createElement('td'); tdAss.className = 'px-3 py-2.5';
    tdAss.appendChild(buildAssignmentSelect(sensor.rovAssignment || 'Shared', (v) => { sensor.rovAssignment = v; scheduleSimSync(); }));

    const tdRemove = document.createElement('td'); tdRemove.className = 'px-3 py-2.5 text-center';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'text-gray-600 hover:text-red-400 text-lg font-bold leading-none'; removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => { sensors.splice(idx, 1); renderSimContent(); scheduleSimSync(); });
    tdRemove.appendChild(removeBtn);

    tr.append(tdNum, tdName, tdModel, tdSerial, tdQty, tdCal, tdTest, tdAss, tdRemove);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  const addRow = document.createElement('div');
  addRow.className = 'flex gap-2.5 px-4 py-3 border-t border-gray-700/40 items-center';
  const addInput = document.createElement('input');
  addInput.type = 'text'; addInput.placeholder = 'Add a custom sensor...';
  addInput.className = 'flex-1 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-white outline-none placeholder-gray-600';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.textContent = 'Add Sensor';
  addBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap';
  addBtn.style.cssText = 'background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3);';
  const doAdd = () => {
    const name = addInput.value.trim();
    if (!name) return;
    if (name.length > 80) { addInput.style.borderColor = '#ef4444'; return; }
    if (sensors.find(s => s.name.toLowerCase() === name.toLowerCase())) { addInput.style.borderColor = '#ef4444'; return; }
    sensors.push({ name, note: '', status: 'custom', included: true, model: '', serialNo: '', qty: 1, calibrated: false, tested: false, custom: true, rovAssignment: 'Shared' });
    addInput.value = ''; addInput.style.borderColor = '';
    renderSimContent(); scheduleSimSync();
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  addRow.append(addInput, addBtn);
  card.appendChild(addRow);

  return card;
}

function renderOptionalSensors() {
  const sensors = simState.shared.sensors || [];
  const optional = sensors.filter(s => s.status === 'optional' && !s.custom)
    .sort((a, b) => (CAT_ORDER[SENSOR_CATEGORIES[a.name]] ?? 9) - (CAT_ORDER[SENSOR_CATEGORIES[b.name]] ?? 9));
  if (optional.length === 0) return null;

  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  card.innerHTML = `<div class="flex items-center gap-3 px-6 py-3.5 border-b border-gray-700/50"><span class="w-2 h-2 rounded-full" style="background:#6b7280"></span><span class="text-xs font-bold text-white uppercase tracking-widest">Optional Sensors</span></div>`;

  let lastCat = null;
  optional.forEach(sensor => {
    const idx = sensors.indexOf(sensor);
    const cat = SENSOR_CATEGORIES[sensor.name] || 'Other';
    if (cat !== lastCat) {
      const catHeader = document.createElement('div');
      catHeader.className = 'px-5 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-600';
      catHeader.textContent = cat;
      card.appendChild(catHeader);
      lastCat = cat;
    }
    const row = document.createElement('div');
    row.className = `flex items-center gap-3 px-5 py-2.5 border-b border-gray-700/30 ${sensor.included ? '' : 'opacity-50'}`;

    const toggle = buildToggle(sensor.included, '#459fd9', () => { sensor.included = !sensor.included; scheduleSimSync(); renderSimContent(); });
    const name = document.createElement('span'); name.className = 'text-sm text-gray-200 flex-1'; name.textContent = sensor.name;
    row.append(toggle, name);

    if (sensor.included) {
      const modelWrap = document.createElement('div'); modelWrap.style.width = '180px';
      modelWrap.appendChild(buildModelCell(sensor, (v) => { sensor.model = v; scheduleSimSync(); if (v === ' ') renderSimContent(); }));
      const calWrap = document.createElement('div');
      calWrap.appendChild(buildToggle(sensor.calibrated, '#f39124', () => { sensor.calibrated = !sensor.calibrated; scheduleSimSync(); renderSimContent(); }));
      const testWrap = document.createElement('div');
      testWrap.appendChild(buildToggle(sensor.tested, '#459fd9', () => { sensor.tested = !sensor.tested; scheduleSimSync(); renderSimContent(); }));
      row.append(modelWrap, calWrap, testWrap);
    }
    card.appendChild(row);
  });
  return card;
}

// Per-ROV fixed sensors (cameras, PRC) — calibration wired up here, unlike the
// old app where this existed in the data model but had no working UI.
function renderFixedSensorsSection() {
  const entries = [...simState.selectedROVs.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  const activeNum = simState.selectedROVs.has(simState.activeROV) ? simState.activeROV : entries[0][0];

  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-6 py-3.5 border-b border-gray-700/50';
  header.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:#a78bfa"></span><span class="text-xs font-bold text-white uppercase tracking-widest">Fixed Unit Sensors — MS-${activeNum}</span>`;
  card.appendChild(header);

  const fixed = simState.shared.rovSensors[activeNum] || [];
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-4 py-2 text-left">Sensor</th><th class="px-3 py-2 text-left">Model</th>
    <th class="px-3 py-2 text-center">Calibrated</th><th class="px-3 py-2 text-center">Tested</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  fixed.forEach((sensor, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `background:${i % 2 === 0 ? 'rgba(17,24,39,0.45)' : 'rgba(17,24,39,0.15)'};border-bottom:1px solid rgba(55,65,81,0.25)`;
    const tdName = document.createElement('td'); tdName.className = 'px-4 py-2.5 text-sm text-gray-200'; tdName.textContent = sensor.name;
    const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5';
    const modelInput = document.createElement('input');
    modelInput.type = 'text'; modelInput.value = sensor.model || ''; modelInput.placeholder = 'Model...';
    modelInput.className = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder-gray-600';
    modelInput.addEventListener('input', () => { sensor.model = modelInput.value; scheduleSimSync(); });
    tdModel.appendChild(modelInput);
    const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center';
    tdCal.appendChild(buildToggle(sensor.calibrated, '#f39124', () => { sensor.calibrated = !sensor.calibrated; scheduleSimSync(); renderSimContent(); }));
    const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center';
    tdTest.appendChild(buildToggle(sensor.tested, '#459fd9', () => { sensor.tested = !sensor.tested; scheduleSimSync(); renderSimContent(); }));
    tr.append(tdName, tdModel, tdCal, tdTest);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function renderThrustersSection() {
  const thrusters = simState.shared.thrusters || [];
  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b border-gray-700/50';
  header.innerHTML = `<div class="flex items-center gap-3"><span class="w-2 h-2 rounded-full" style="background:#459fd9"></span><span class="text-xs font-bold text-white uppercase tracking-widest">Thrusters</span></div>`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.textContent = 'Add Thruster';
  addBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold';
  addBtn.style.cssText = 'background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.3);';
  addBtn.addEventListener('click', () => { thrusters.push({ number: '', serial: '', rovAssignment: 'Shared' }); renderSimContent(); scheduleSimSync(); });
  header.appendChild(addBtn);
  card.appendChild(header);

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-4 py-2 text-left">Thruster No.</th><th class="px-4 py-2 text-left">Serial</th>
    <th class="px-4 py-2 text-left">Assignment</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  if (thrusters.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-600 text-sm">No thrusters added</td></tr>`;
  }
  thrusters.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `background:${i % 2 === 0 ? 'rgba(17,24,39,0.25)' : 'rgba(17,24,39,0.08)'};border-bottom:1px solid rgba(55,65,81,0.3)`;
    const tdNum = document.createElement('td'); tdNum.className = 'px-4 py-3';
    const numInput = document.createElement('input');
    numInput.type = 'text'; numInput.value = t.number || ''; numInput.placeholder = 'T-01';
    numInput.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-3 py-1.5 text-xs text-white outline-none';
    numInput.addEventListener('input', () => { t.number = numInput.value; scheduleSimSync(); });
    tdNum.appendChild(numInput);

    const tdSerial = document.createElement('td'); tdSerial.className = 'px-4 py-3';
    const serialInput = document.createElement('input');
    serialInput.type = 'text'; serialInput.value = t.serial || ''; serialInput.placeholder = 'S/N...';
    serialInput.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-3 py-1.5 text-xs font-mono outline-none';
    serialInput.style.color = '#459fd9';
    serialInput.addEventListener('input', () => { t.serial = serialInput.value; scheduleSimSync(); });
    tdSerial.appendChild(serialInput);

    const tdAss = document.createElement('td'); tdAss.className = 'px-4 py-3';
    tdAss.appendChild(buildAssignmentSelect(t.rovAssignment || 'Shared', (v) => { t.rovAssignment = v; scheduleSimSync(); }));

    const tdRemove = document.createElement('td'); tdRemove.className = 'px-4 py-3 text-center';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.innerHTML = '&times;'; removeBtn.className = 'text-gray-500 hover:text-red-400 text-xl font-bold leading-none';
    removeBtn.addEventListener('click', () => { thrusters.splice(i, 1); renderSimContent(); scheduleSimSync(); });
    tdRemove.appendChild(removeBtn);

    tr.append(tdNum, tdSerial, tdAss, tdRemove);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

export function renderSensorsContent(area) {
  area.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-5xl mx-auto pb-6';
  const title = document.createElement('h3');
  title.className = 'text-xl font-bold text-white mb-5';
  title.textContent = 'Sensors & Equipment';
  wrap.appendChild(title);

  wrap.appendChild(renderFleetSection());
  wrap.appendChild(renderSensorsTable());
  const optional = renderOptionalSensors();
  if (optional) wrap.appendChild(optional);
  const fixed = renderFixedSensorsSection();
  if (fixed) wrap.appendChild(fixed);
  wrap.appendChild(renderThrustersSection());

  area.appendChild(wrap);
}

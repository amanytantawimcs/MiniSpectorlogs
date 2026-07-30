// "Sensors & Equipment" workspace sub-tab: MiniSpector fleet, mission sensors
// (required + custom + optional), per-ROV fixed sensors (calibration wired up
// here — the old app never connected this, see rebuild notes), and thrusters.

import { escapeHtml, showToast, renderLockedNotice } from '../ui.js';
import { simState } from './state.js';
import { SENSOR_HARDWARE, SENSOR_CATEGORIES, CAT_ORDER } from './config.js';
import { findScope } from './scopeCatalog.js';
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

// Calibrated/Tested cell for the fixed-sensors table: a toggle plus a
// double-click-to-reveal date field. Updates its own DOM in place (rather
// than going through the usual renderSimContent() full re-render) so the
// browser's dblclick detection — which requires two clicks on the *same*
// element within its timing window — doesn't get broken by the node being
// torn down and rebuilt between the two clicks.
function buildDateToggleCell(sensor, field, color, onAfterToggle) {
  const dateField = field + 'Date';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:3px;';

  const pill = document.createElement('div');
  pill.style.cssText = `width:40px;height:20px;border-radius:9999px;cursor:pointer;background:${sensor[field] ? color : '#4b5563'};position:relative;transition:background 0.2s;`;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;top:2px;left:2px;width:16px;height:16px;background:white;border-radius:50%;transition:transform 0.2s;transform:${sensor[field] ? 'translateX(20px)' : 'translateX(0)'};`;
  pill.appendChild(knob);
  pill.addEventListener('click', () => {
    sensor[field] = !sensor[field];
    pill.style.background = sensor[field] ? color : '#4b5563';
    knob.style.transform = sensor[field] ? 'translateX(20px)' : 'translateX(0)';
    scheduleSimSync();
    onAfterToggle?.();
  });
  wrap.appendChild(pill);

  const dateLabel = document.createElement('span');
  dateLabel.style.cssText = 'font-size:9.5px;font-family:ui-monospace,monospace;color:#6C88A6;white-space:nowrap;';
  dateLabel.textContent = sensor[dateField] || '— set date —';
  wrap.appendChild(dateLabel);

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = sensor[dateField] || '';
  dateInput.style.cssText = 'display:none;width:120px;margin-top:2px;background:#0C1727;border:1px solid rgba(120,166,212,0.3);border-radius:6px;color:#E9F0F8;font-size:10px;padding:2px 4px;';
  dateInput.addEventListener('click', e => e.stopPropagation());
  dateInput.addEventListener('change', () => {
    sensor[dateField] = dateInput.value;
    dateLabel.textContent = dateInput.value || '— set date —';
    scheduleSimSync();
  });
  dateInput.addEventListener('blur', () => { dateInput.style.display = 'none'; });
  wrap.appendChild(dateInput);

  wrap.addEventListener('dblclick', (e) => {
    e.preventDefault();
    dateInput.style.display = 'block';
    dateInput.focus();
    if (dateInput.showPicker) { try { dateInput.showPicker(); } catch { /* unsupported browser */ } }
  });

  return wrap;
}

// Per-unit rows for a Qty > 1 sensor line: each unit gets its own
// model/serial/calibrated/tested, migrated lazily from the old flat
// single-instance fields so already-saved missions don't lose data.
export function ensureSensorInstances(sensor) {
  const qty = Math.max(1, sensor.qty || 1);
  if (!Array.isArray(sensor.instances)) {
    sensor.instances = [{
      model: sensor.model || '', serialNo: sensor.serialNo || '',
      calibrated: !!sensor.calibrated, calibratedDate: sensor.calibratedDate || '',
      tested: !!sensor.tested, testedDate: sensor.testedDate || '',
    }];
  }
  while (sensor.instances.length < qty) sensor.instances.push({ model: '', serialNo: '', calibrated: false, calibratedDate: '', tested: false, testedDate: '' });
  while (sensor.instances.length > qty) sensor.instances.pop();
  return sensor.instances;
}

// Readiness/badge counting unit for a sensor line: qty-capable sensors
// (required + custom, i.e. the main Sensors table) count as one item per
// unit; optional-but-not-yet-custom sensors have no qty UI and stay a
// single item, matching what's actually editable on screen.
export function sensorReadinessItems(sensor) {
  if (sensor.status === 'optional' && !sensor.custom) return [sensor];
  return ensureSensorInstances(sensor);
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
  card.className = 'rcard mb-5';
  if (entries.length === 0) {
    card.innerHTML = `<div class="text-center text-gray-600 py-8 text-sm">No MiniSpectors selected — go back to Step 1.</div>`;
    return card;
  }
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-6 py-3.5 border-b rcard-head';
  header.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:#f39124"></span><span class="text-xs font-bold text-white uppercase tracking-widest">MiniSpector Fleet</span>`;
  card.appendChild(header);

  entries.forEach(([num, role], idx) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-5 py-3 flex-wrap';
    row.style.background = idx % 2 === 0 ? 'rgba(17,24,39,0.35)' : 'rgba(17,24,39,0.15)';

    const label = document.createElement('span');
    label.className = 'font-bold text-white text-sm shrink-0';
    label.style.minWidth = '55px';
    label.textContent = `MiniSpector-${num}`;

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
  const scope = findScope(simState.selectedScope);

  const card = document.createElement('div');
  card.className = 'rcard mb-5';
  
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-6 py-3.5 border-b rcard-head';
  header.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:#f39124"></span>
    <span class="text-xs font-bold text-white uppercase tracking-widest">Sensors</span>
    <span class="text-xs text-gray-600">${active.length} item${active.length !== 1 ? 's' : ''} — scope: <span style="color:#f39124">${escapeHtml(scope?.name || '–')}</span></span>`;
  card.appendChild(header);

  const tableWrap = document.createElement('div');
  tableWrap.style.overflowX = 'auto';
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;min-width:740px;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:#16233A;color:#9AB0C8;" class="text-[9px] uppercase font-semibold">
    <th class="px-4 py-2 text-left">Sensor</th><th class="px-3 py-2 text-left">Model</th>
    <th class="px-3 py-2 text-left">Serial No.</th><th class="px-3 py-2 text-center">Qty</th>
    <th class="px-3 py-2 text-center">Calibrated</th><th class="px-3 py-2 text-center">Tested</th>
    <th class="px-3 py-2 text-left">Assignment</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  if (active.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-600 text-sm">No sensors — select a scope or add a custom sensor below</td></tr>`;
  }
  active.forEach((sensor, i) => {
    const idx = sensors.indexOf(sensor);
    const qty = Math.max(1, sensor.qty || 1);
    const instances = ensureSensorInstances(sensor);
    const rowBg = i % 2 === 0 ? 'rgba(17,24,39,0.45)' : 'rgba(17,24,39,0.15)';

    instances.forEach((instance, unitIdx) => {
      const tr = document.createElement('tr');
      tr.style.cssText = `background:${rowBg};border-bottom:1px solid rgba(55,65,81,0.25)`;

      if (unitIdx === 0) {
        const tdName = document.createElement('td');
        tdName.className = 'px-4 py-2.5 text-sm text-gray-200 align-top';
        tdName.rowSpan = qty;
        tdName.textContent = sensor.name;
        if (qty > 1) tdName.innerHTML += ` <span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(69,159,217,0.15);color:#459fd9;">×${qty}</span>`;
        if (sensor.custom) tdName.innerHTML += ` <span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(249,115,22,0.15);color:#fb923c;">CUSTOM</span>`;
        tr.appendChild(tdName);
      }

      const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5';
      tdModel.appendChild(buildModelCell({ name: sensor.name, model: instance.model }, (v) => { instance.model = v; scheduleSimSync(); if (v === ' ') renderSimContent(); }));
      tr.appendChild(tdModel);

      const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2.5';
      const serialInput = document.createElement('input');
      serialInput.type = 'text'; serialInput.placeholder = qty > 1 ? `S/N (unit ${unitIdx + 1})...` : 'S/N...'; serialInput.value = instance.serialNo || '';
      serialInput.className = 'w-full bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs font-mono outline-none';
      serialInput.style.color = '#459fd9';
      serialInput.addEventListener('input', () => { instance.serialNo = serialInput.value; scheduleSimSync(); });
      tdSerial.appendChild(serialInput);
      tr.appendChild(tdSerial);

      if (unitIdx === 0) {
        const tdQty = document.createElement('td'); tdQty.className = 'px-3 py-2.5 text-center align-top'; tdQty.rowSpan = qty;
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = qty;
        qtyInput.className = 'w-14 bg-gray-900/50 border border-gray-700/50 rounded-md px-2 py-1 text-xs text-center text-white outline-none';
        qtyInput.addEventListener('input', () => {
          sensor.qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          ensureSensorInstances(sensor);
          scheduleSimSync(); renderSimContent();
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);
      }

      const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center';
      tdCal.appendChild(buildDateToggleCell(instance, 'calibrated', '#f39124'));
      tr.appendChild(tdCal);

      const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center';
      tdTest.appendChild(buildDateToggleCell(instance, 'tested', '#459fd9'));
      tr.appendChild(tdTest);

      if (unitIdx === 0) {
        const tdAss = document.createElement('td'); tdAss.className = 'px-3 py-2.5 align-top'; tdAss.rowSpan = qty;
        tdAss.appendChild(buildAssignmentSelect(sensor.rovAssignment || 'Shared', (v) => { sensor.rovAssignment = v; scheduleSimSync(); }));
        tr.appendChild(tdAss);

        const tdRemove = document.createElement('td'); tdRemove.className = 'px-3 py-2.5 text-center align-top'; tdRemove.rowSpan = qty;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; removeBtn.className = 'text-gray-600 hover:text-red-400 text-lg font-bold leading-none'; removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => { sensors.splice(idx, 1); renderSimContent(); scheduleSimSync(); });
        tdRemove.appendChild(removeBtn);
        tr.appendChild(tdRemove);
      }

      tbody.appendChild(tr);
    });
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
  card.className = 'rcard mb-5';
  card.innerHTML = `<div class="flex items-center gap-3 px-6 py-3.5 border-b rcard-head"><span class="w-2 h-2 rounded-full" style="background:#6b7280"></span><span class="text-xs font-bold text-white uppercase tracking-widest">Optional Sensors</span></div>`;

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
// Remembers which unit's table is on screen across re-renders (module-level,
// display-only — same "current focus" idea as simState.activeROV, which this
// also updates so other panels that read it stay in sync).
let fixedSensorsUnit = null;

function renderFixedSensorsSection() {
  const entries = [...simState.selectedROVs.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  if (!simState.selectedROVs.has(fixedSensorsUnit)) {
    fixedSensorsUnit = simState.selectedROVs.has(simState.activeROV) ? simState.activeROV : entries[0][0];
  }
  const activeNum = fixedSensorsUnit;

  const card = document.createElement('div');
  card.className = 'rcard mb-5';
  
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b rcard-head flex-wrap gap-3';

  const left = document.createElement('div');
  left.className = 'flex items-center gap-3';
  left.innerHTML = `<span class="rcard-bar"></span><span class="rcard-title">Fixed unit sensors</span><span class="text-xs" style="color:#6C88A6">Permanently mounted, logged per unit</span>`;
  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-2 flex-wrap';

  if (entries.length > 1) {
    const tabs = document.createElement('div');
    tabs.className = 'fixedsens-tabs';
    entries.forEach(([num, role]) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'fixedsens-tab' + (num === activeNum ? ' active' : '');
      tab.innerHTML = `MiniSpector-${num}${role ? `<span class="fixedsens-role-badge ${role}">${role}</span>` : ''}`;
      tab.addEventListener('click', () => { fixedSensorsUnit = num; simState.activeROV = num; renderSimContent(); });
      tabs.appendChild(tab);
    });
    right.appendChild(tabs);
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy to other unit' + (entries.length > 2 ? 's' : '');
  copyBtn.className = 'fixedsens-copy-btn';
  copyBtn.disabled = entries.length < 2;
  copyBtn.addEventListener('click', () => {
    const source = simState.shared.rovSensors[activeNum] || [];
    entries.forEach(([num]) => {
      if (num === activeNum) return;
      const target = simState.shared.rovSensors[num] || [];
      source.forEach(s => {
        const match = target.find(t => t.name === s.name);
        if (match) {
          match.model = s.model; match.serial = s.serial;
          match.calibrated = s.calibrated; match.calibratedDate = s.calibratedDate;
          match.tested = s.tested; match.testedDate = s.testedDate;
        }
      });
    });
    scheduleSimSync();
    showToast(`Copied to ${entries.length - 1} other unit${entries.length > 2 ? 's' : ''}`, 'success');
    renderSimContent();
  });
  right.appendChild(copyBtn);

  header.appendChild(right);
  card.appendChild(header);

  const fixed = simState.shared.rovSensors[activeNum] || [];
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse';
  table.innerHTML = `<thead><tr style="background:#16233A;color:#9AB0C8;" class="text-[9px] uppercase font-semibold">
    <th class="px-4 py-2 text-left">Sensor</th><th class="px-3 py-2 text-left">Model</th>
    <th class="px-3 py-2 text-left">Serial No.</th>
    <th class="px-3 py-2 text-center">Calibrated</th><th class="px-3 py-2 text-center">Tested</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  fixed.forEach((sensor, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `background:${i % 2 === 0 ? 'rgba(17,24,39,0.45)' : 'rgba(17,24,39,0.15)'};border-bottom:1px solid rgba(55,65,81,0.25)`;
    const tdName = document.createElement('td'); tdName.className = 'px-4 py-2.5 text-sm text-gray-200';
    const dot = document.createElement('span');
    dot.className = 'fixedsens-dot'; dot.style.background = sensor.calibrated ? '#f39124' : '#4b5563';
    const nameWrap = document.createElement('span'); nameWrap.className = 'inline-flex items-center';
    nameWrap.appendChild(dot); nameWrap.append(sensor.name);
    tdName.appendChild(nameWrap);

    const tdModel = document.createElement('td'); tdModel.className = 'px-3 py-2.5';
    const modelInput = document.createElement('input');
    modelInput.type = 'text'; modelInput.value = sensor.model || ''; modelInput.placeholder = 'Model...';
    modelInput.className = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder-gray-600';
    modelInput.addEventListener('input', () => { sensor.model = modelInput.value; scheduleSimSync(); });
    tdModel.appendChild(modelInput);

    const tdSerial = document.createElement('td'); tdSerial.className = 'px-3 py-2.5';
    const serialInput = document.createElement('input');
    serialInput.type = 'text'; serialInput.value = sensor.serial || ''; serialInput.placeholder = 'S/N...';
    serialInput.className = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs font-mono outline-none placeholder-gray-600';
    serialInput.style.color = '#459fd9';
    serialInput.addEventListener('input', () => { sensor.serial = serialInput.value; scheduleSimSync(); });
    tdSerial.appendChild(serialInput);

    const tdCal = document.createElement('td'); tdCal.className = 'px-3 py-2.5 text-center';
    tdCal.appendChild(buildDateToggleCell(sensor, 'calibrated', '#f39124', () => { dot.style.background = sensor.calibrated ? '#f39124' : '#4b5563'; }));
    const tdTest = document.createElement('td'); tdTest.className = 'px-3 py-2.5 text-center';
    tdTest.appendChild(buildDateToggleCell(sensor, 'tested', '#459fd9'));
    tr.append(tdName, tdModel, tdSerial, tdCal, tdTest);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function kpi(value, label, color) {
  const div = document.createElement('div');
  div.style.cssText = `flex:1;min-width:0;background:${color}14;border:1px solid ${color}33;border-radius:10px;padding:10px 14px;`;
  div.innerHTML = `<div style="font-size:22px;font-weight:800;color:${color};line-height:1;">${value}</div>
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:3px">${label}</div>`;
  return div;
}

// Readiness rollup — formerly its own "System Readiness" tab (with an
// approval gate and the Push to Operation button); the approval cycle and
// dedicated tab are gone, and Push to Operation now lives in the top header
// bar (visible on the Topology tab, see switchSimSubTab() in core.js)
// instead of here — this card is just the stats now.
function renderReadinessCard() {
  const sensors = simState.shared.sensors || [];
  const scopeActive = sensors.filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const scopeActiveItems = scopeActive.flatMap(sensorReadinessItems);
  const fixedAll = Object.values(simState.shared.rovSensors || {}).flat();
  const active = [...scopeActiveItems, ...fixedAll];
  const total = active.length;

  const card = document.createElement('div');
  card.className = 'rcard mb-5';

  const calibrated = active.filter(s => s.calibrated).length;
  const tested = active.filter(s => s.tested).length;
  const noModel = active.filter(s => !s.model || s.model.trim() === '').length;
  const ready = active.filter(s => s.calibrated && s.tested && s.model && s.model.trim() !== '').length;
  const percent = total > 0 ? Math.round((ready / total) * 100) : 0;
  const barColor = percent === 100 ? '#22c55e' : percent >= 60 ? '#f39124' : '#ef4444';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b rcard-head';
  header.innerHTML = `<span class="text-xs font-bold text-white uppercase tracking-widest">Overall Readiness</span>
    <span style="font-size:22px;font-weight:800;color:${barColor};">${percent}%</span>`;
  card.appendChild(header);

  const barWrap = document.createElement('div');
  barWrap.className = 'px-6 pt-4 pb-1';
  barWrap.innerHTML = `<div style="height:7px;background:rgba(55,65,81,0.6);border-radius:9999px;overflow:hidden;">
      <div style="width:${percent}%;height:100%;background:${barColor};border-radius:9999px;"></div>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:5px;">${total === 0 ? 'No active sensors yet' : percent === 100 ? 'All sensors fully configured and ready' : `${ready} of ${total} sensors fully configured`}</div>`;
  card.appendChild(barWrap);

  const kpiRow = document.createElement('div');
  kpiRow.style.cssText = 'display:flex;gap:10px;padding:12px 24px 16px;flex-wrap:wrap;';
  kpiRow.append(
    kpi(ready, 'Ready', '#f39124'),
    kpi(calibrated, 'Calibrated', '#f39124'),
    kpi(tested, 'Tested', '#459fd9'),
    kpi(noModel, 'No Model', noModel === 0 ? '#f39124' : '#f87171'),
    kpi(total, 'Total Active', '#9ca3af'),
  );
  card.appendChild(kpiRow);

  return card;
}

function renderThrustersSection() {
  const thrusters = simState.shared.thrusters || [];
  const card = document.createElement('div');
  card.className = 'rcard mb-5';
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b rcard-head';
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
  table.innerHTML = `<thead><tr style="background:#16233A;color:#9AB0C8;" class="text-[9px] uppercase font-semibold">
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
  wrap.className = 'mx-auto pb-6';
  wrap.style.maxWidth = '1400px';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'mb-6';
  titleWrap.innerHTML = `<h3 class="text-2xl font-bold text-white tracking-tight">Sensors and equipment</h3>
    <p class="text-gray-400 mt-1 text-sm">Log every sensor going in the water, with its model, serial and certificate.</p>`;
  wrap.appendChild(titleWrap);
  if (simState.locked) wrap.appendChild(renderLockedNotice());

  wrap.appendChild(renderFleetSection());
  const fixed = renderFixedSensorsSection();
  if (fixed) wrap.appendChild(fixed);
  wrap.appendChild(renderSensorsTable());
  const optional = renderOptionalSensors();
  if (optional) wrap.appendChild(optional);
  wrap.appendChild(renderThrustersSection());
  wrap.appendChild(renderReadinessCard());

  area.appendChild(wrap);
}

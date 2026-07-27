// Generic CRUD engine for the operational logs (dive/standby/maintenance/HSE/
// fault) driven by LOG_CONFIGS. Replaces the old app's five copy-pasted
// modal-build + save + render blocks with one implementation.

import { escapeHtml, showToast } from './ui.js';
import { state } from './state.js';
import { LOG_CONFIGS } from './logConfigs.js';
import { openShiftModal, saveShiftModal, removeShift, renderShiftLog } from './shiftLog.js';
import { renderInfographics } from './dashboard.js';

let modalSection = null;
let modalIndex = -1;

function pad(n) { return n < 10 ? '0' + n : String(n); }

function nextAutoId(config, section, existingId) {
  if (existingId) return existingId;
  const count = state.currentReportData[section].length + 1;
  return config.idPrefix + pad(count);
}

function fieldRow(field, value) {
  const id = 'm_f_' + field.key;
  const label = `<label class="text-xs font-semibold" style="color:#9AB0C8">${escapeHtml(field.label)}</label>`;
  if (field.type === 'textarea') {
    return `<div>${label}<textarea id="${id}">${escapeHtml(value || '')}</textarea></div>`;
  }
  if (field.type === 'select') {
    const opts = field.options.map(o => `<option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(field.optionLabels?.[o] || o)}</option>`).join('');
    return `<div>${label}<select id="${id}">${opts}</select></div>`;
  }
  if (field.type === 'duration') {
    return `<div>${label}<input id="${id}" value="${escapeHtml(value || '')}" readonly style="color:#6C88A6"></div>`;
  }
  if (field.type === 'photos') {
    return `<div class="pt-3 mt-2" style="border-top:1px solid rgba(120,166,212,0.16)">
      ${label}
      <input type="file" id="${id}" multiple class="block w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold" style="color:#9AB0C8" >
      <p class="text-[10px] mt-1" style="color:#6C88A6">${value?.length ? `Current: ${value.map(p => p.name).join(', ')}` : 'No photos selected'}</p>
    </div>`;
  }
  const disabled = field.disabled ? ' disabled style="opacity:0.5;cursor:not-allowed"' : '';
  return `<div>${label}<input id="${id}" type="${field.type}" value="${escapeHtml(value || '')}"${disabled}></div>`;
}

// Groups fields into 2-column rows the way the old app's modal markup did
// (id+rov together, dates paired, etc) rather than one field per line.
function pairFields(fields) {
  const pairKeys = new Set(['num,rov', 'id,by', 'date,startTime', 'endDate,endTime', 'status,tech', 'parts,remaining']);
  const html = [];
  let i = 0;
  while (i < fields.length) {
    const a = fields[i];
    const b = fields[i + 1];
    const pairKey = b ? `${a.key},${b.key}` : null;
    const twoColTypes = ['text', 'date', 'time', 'select'].includes(a.type) && b && ['text', 'date', 'time', 'select'].includes(b.type);
    if (pairKey && pairKeys.has(pairKey) && twoColTypes) {
      html.push(`<div class="grid-2">${fieldRow(a, currentEntryValue(a))}${fieldRow(b, currentEntryValue(b))}</div>`);
      i += 2;
    } else {
      html.push(fieldRow(a, currentEntryValue(a)));
      i += 1;
    }
  }
  return html.join('');
}

let currentEntry = {};
function currentEntryValue(field) {
  if (field.auto && !currentEntry[field.key]) {
    return nextAutoId(LOG_CONFIGS[modalSection], modalSection, currentEntry[field.key]);
  }
  return currentEntry[field.key];
}

export function openModal(section, index = -1) {
  if (state.currentUserRole === 'reviewer') { showToast('View only — editing is not available in review mode.', 'warn'); return; }
  modalSection = section;
  modalIndex = index;
  if (section === 'shiftLogs') { openShiftModal(index); return; }

  const config = LOG_CONFIGS[section];
  if (!config) return;

  currentEntry = index > -1 ? state.currentReportData[section][index] : {};

  document.getElementById('modal-title').textContent = config.title;
  document.getElementById('entry-modal').style.display = 'flex';
  const container = document.getElementById('modal-content-area');
  container.innerHTML = pairFields(config.fields);

  const durationField = config.fields.find(f => f.type === 'duration');
  if (durationField) setupAutoCalc(durationField.durationGroup.map(k => 'm_f_' + k), 'm_f_' + durationField.key);

  const endDateField = config.fields.find(f => f.fallbackFrom);
  if (endDateField && !currentEntry[endDateField.key]) {
    const el = document.getElementById('m_f_' + endDateField.key);
    if (el) el.value = currentEntry[endDateField.fallbackFrom] || '';
  }
}

function setupAutoCalc([startDateId, startTimeId, endDateId, endTimeId], durationId) {
  const calc = () => {
    const sDate = document.getElementById(startDateId)?.value;
    const sTime = document.getElementById(startTimeId)?.value;
    const eDate = document.getElementById(endDateId)?.value;
    const eTime = document.getElementById(endTimeId)?.value;
    const durEl = document.getElementById(durationId);
    if (!durEl || !sDate || !sTime || !eDate || !eTime) return;
    const diffMs = new Date(`${eDate}T${eTime}`) - new Date(`${sDate}T${sTime}`);
    if (diffMs < 0) { durEl.value = 'Check Dates'; return; }
    const totalMins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMins / 60), mins = totalMins % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} hrs`);
    if (mins > 0) parts.push(`${mins} mins`);
    durEl.value = parts.join(' ') || '0 mins';
  };
  [startDateId, startTimeId, endDateId, endTimeId].forEach(id => document.getElementById(id)?.addEventListener('input', calc));
}

export function closeModal() {
  document.getElementById('entry-modal').style.display = 'none';
}

function saveModal() {
  if (modalSection === 'shiftLogs') { saveShiftModal(modalIndex); closeModal(); return; }

  const config = LOG_CONFIGS[modalSection];
  if (!config) return;
  const getV = (id) => document.getElementById(id)?.value ?? '';

  const newEntry = {};
  config.fields.forEach(field => {
    if (field.type === 'photos') {
      const fileInput = document.getElementById('m_f_' + field.key);
      let photos = (modalIndex > -1 && currentEntry.photos) ? currentEntry.photos : [];
      if (fileInput?.files.length > 0) {
        photos = Array.from(fileInput.files).map(f => ({ name: f.name, path: f.path, type: f.type }));
      }
      newEntry.photos = photos;
    } else {
      newEntry[field.key] = getV('m_f_' + field.key);
    }
  });

  if (modalIndex === -1) state.currentReportData[modalSection].push(newEntry);
  else state.currentReportData[modalSection][modalIndex] = newEntry;

  state.isDirty = true;
  renderGrids();
  renderInfographics();
  closeModal();
}

function removeLog(section, index) {
  if (state.currentUserRole === 'reviewer') return;
  if (section === 'shiftLogs') { if (confirm('Are you sure you want to delete this entry?')) removeShift(index); return; }
  if (!confirm('Are you sure you want to delete this entry?')) return;
  state.currentReportData[section].splice(index, 1);
  state.isDirty = true;
  renderGrids();
  renderInfographics();
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function openStandbySelector() {
  const el = document.getElementById('standby-selector-modal');
  if (el) el.style.display = 'flex';
}

function closeStandbySelector() {
  const el = document.getElementById('standby-selector-modal');
  if (el) el.style.display = 'none';
}

function triggerQuickStandby(category) {
  if (state.currentUserRole === 'reviewer') return;
  const now = new Date();
  const count = state.currentReportData.standbyLogs.length + 1;
  state.currentReportData.standbyLogs.push({
    id: 'SB' + pad2(count),
    date: now.toISOString().split('T')[0],
    startTime: now.toTimeString().substring(0, 5),
    endDate: '', endTime: '', duration: 'In Progress',
    category, desc: '', by: '',
  });
  state.isDirty = true;
  renderGrids();
  renderInfographics();
  closeStandbySelector();
}

function triggerQuickDive() {
  if (state.currentUserRole === 'reviewer') return;
  const now = new Date();
  const count = state.currentReportData.diveLogs.length + 1;
  state.currentReportData.diveLogs.push({
    num: 'DL' + pad2(count),
    date: now.toISOString().split('T')[0],
    startTime: now.toTimeString().substring(0, 5),
    endDate: '', endTime: '', depth: '', duration: 'In Progress',
    purpose: '', area: '', issues: '', client: '', notes: '',
  });
  state.isDirty = true;
  renderGrids();
  renderInfographics();
}

function emptyState(msg) { return `<p class="text-gray-500 italic text-center py-8">${msg}</p>`; }

function formatColumn(section, col, log) {
  if (col.key === '_time') return `${escapeHtml(log.startTime || '')} - ${escapeHtml(log.endTime || '')}`;
  if (col.key === '_depth') return `${escapeHtml(log.depth || '')} KM`;
  if (col.key === '_desc') {
    const d = log.desc || '';
    return escapeHtml(d.length > 60 ? d.substring(0, 60) + '...' : d);
  }
  if (col.key === '_status') {
    const closed = log.status === 'Closed';
    return `<span class="px-2 py-1 rounded text-xs font-bold ${closed ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}">${escapeHtml(log.status || 'Open')}</span>`;
  }
  if (col.key === '_photos') return log.photos?.length ? `<span class="italic" style="color:#459fd9">${log.photos.length} file(s)</span>` : `<span class="italic" style="color:#6C88A6">None</span>`;
  const val = log[col.key] ?? '';
  const text = val === '' && col.fallback ? col.fallback : escapeHtml(String(val));
  return col.accent ? `<span class="${col.accent}">${text}</span>` : text;
}

function renderLogTable(section) {
  const config = LOG_CONFIGS[section];
  const container = document.getElementById(config.containerId);
  if (!container) return;
  const logs = state.currentReportData[section] || [];
  if (logs.length === 0) { container.innerHTML = emptyState(config.emptyMessage); return; }

  container.innerHTML = `
    <div class="rcard" style="overflow-x:auto">
      <table class="w-full text-left text-sm" style="color:#E9F0F8">
        <thead class="text-xs uppercase font-bold" style="background:#16233A;color:#9AB0C8">
          <tr>${config.columns.map(c => `<th class="px-4 py-3">${escapeHtml(c.label)}</th>`).join('')}<th class="px-4 py-3 text-right">Actions</th></tr>
        </thead>
        <tbody>
          ${logs.map((log, i) => `
          <tr style="border-bottom:1px solid rgba(120,166,212,0.16)">
            ${config.columns.map(c => `<td class="px-4 py-3">${formatColumn(section, c, log)}</td>`).join('')}
            <td class="px-4 py-3 text-right">
              <button type="button" class="log-edit-btn mr-3 px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.3)" data-section="${section}" data-idx="${i}">Edit</button>
              <button type="button" class="log-del-btn px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)" data-section="${section}" data-idx="${i}">Del</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll('.log-edit-btn').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.section, parseInt(btn.dataset.idx, 10))));
  container.querySelectorAll('.log-del-btn').forEach(btn => btn.addEventListener('click', () => removeLog(btn.dataset.section, parseInt(btn.dataset.idx, 10))));
}

export function renderGrids() {
  Object.keys(LOG_CONFIGS).forEach(renderLogTable);
}

export function installLogs() {
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.removeLog = removeLog;
  window.openStandbySelector = openStandbySelector;
  window.closeStandbySelector = closeStandbySelector;
  window.triggerQuickStandby = triggerQuickStandby;
  window.triggerQuickDive = triggerQuickDive;
  window.__renderLogs = () => { renderGrids(); renderShiftLog(); };
  document.getElementById('modal-save-btn')?.addEventListener('click', saveModal);
}

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

// Small inline icon set for section headers — kept local (not ui.js) since
// nothing outside the sectioned log modal uses them.
const SECTION_ICONS = {
  id: '<circle cx="12" cy="5" r="2.2"/><line x1="12" y1="7.2" x2="12" y2="21"/><path d="M5 12a7 7 0 0 0 14 0"/><line x1="5" y1="12" x2="5" y2="15"/><line x1="19" y1="12" x2="19" y2="15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  gauge: '<rect x="10" y="3" width="4" height="12" rx="2"/><circle cx="12" cy="17.5" r="3.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.6 4.9L3 17.3 5.7 20l6.1-6.1a4 4 0 0 0 4.9-5.6l-2.6 2.6-2-2 2.6-2.6z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".5" fill="currentColor"/>',
};

function sectionIcon(name) {
  const path = SECTION_ICONS[name] || SECTION_ICONS.id;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function fieldRow(field, value) {
  const id = 'm_f_' + field.key;
  const marker = field.required ? '<span class="req">*</span>' : '<span class="opt">optional</span>';
  const label = `<label>${escapeHtml(field.label)} ${marker}</label>`;
  const errorMsg = `<span class="log-error-msg">${escapeHtml(field.label)} is required</span>`;

  if (field.type === 'textarea') {
    return `<div class="log-field" data-field="${field.key}">${label}<textarea id="${id}">${escapeHtml(value || '')}</textarea>${errorMsg}</div>`;
  }
  if (field.type === 'select') {
    let options = field.options;
    if (field.dynamicOptionsFrom) {
      // Recomputed on every modal open rather than baked into the config —
      // e.g. Issue Report's "Dive #" needs to always reflect whatever Dive
      // Log entries currently exist, including ones added after this modal
      // last opened.
      options = (state.currentReportData[field.dynamicOptionsFrom] || [])
        .map(r => r[field.dynamicOptionsKey])
        .filter(Boolean);
      // Keep a previously-saved value selectable even if it no longer
      // matches any current entry (that dive was renumbered/deleted since)
      // instead of silently dropping it the next time this is saved.
      if (value && !options.includes(value)) options = [value, ...options];
    }
    const placeholder = field.dynamicOptionsFrom && !value
      ? `<option value="" selected>${options.length ? 'Select a dive…' : 'No dives recorded yet'}</option>`
      : '';
    const opts = options.map(o => `<option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(field.optionLabels?.[o] || o)}</option>`).join('');
    return `<div class="log-field" data-field="${field.key}">${label}<select id="${id}">${placeholder}${opts}</select>${errorMsg}</div>`;
  }
  if (field.type === 'duration') {
    // Rendered as a signature "readout" box rather than a plain input — the
    // input itself stays real (still what setupAutoCalc/saveModal read/write),
    // just visually swapped for a bigger, glanceable value.
    return `<div class="log-duration-readout" data-field="${field.key}">
      <div class="log-readout-label"><span class="log-readout-dot"></span>${escapeHtml(field.label)}</div>
      <div class="log-readout-value" id="${id}-display">${escapeHtml(value || '—')}</div>
      <input id="${id}" type="hidden" value="${escapeHtml(value || '')}">
    </div>`;
  }
  if (field.type === 'photos') {
    return `<div class="log-field" data-field="${field.key}" style="padding-top:8px;border-top:1px solid rgba(120,166,212,0.16)">
      ${label}
      <input type="file" id="${id}" multiple class="block w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold" style="color:#9AB0C8" >
      <p class="text-[10px] mt-1" style="color:#6C88A6">${value?.length ? `Current: ${value.map(p => p.name).join(', ')}` : 'No photos selected'}</p>
    </div>`;
  }
  const disabled = field.disabled ? ' disabled style="opacity:0.5;cursor:not-allowed"' : '';
  return `<div class="log-field" data-field="${field.key}">${label}<input id="${id}" type="${field.type}" value="${escapeHtml(value || '')}"${disabled}>${errorMsg}</div>`;
}

let currentEntry = {};
function currentEntryValue(field) {
  if (field.auto && !currentEntry[field.key]) {
    return nextAutoId(LOG_CONFIGS[modalSection], modalSection, currentEntry[field.key]);
  }
  return currentEntry[field.key];
}

// Builds the section cards (icon + title, one or more field-grid rows, and
// an optional duration readout) that make up a log entry modal's body.
function renderSections(config) {
  return config.sections.map(section => {
    const rowsHtml = section.rows.map(row => {
      const cols = row.cols || 2;
      return `<div class="log-grid${cols === 3 ? ' cols-3' : ''}">${row.fields.map(key => {
        const field = config.fields.find(f => f.key === key);
        return fieldRow(field, currentEntryValue(field));
      }).join('')}</div>`;
    }).join('');
    // Duration readout renders full-width below the grid rows, not as a
    // grid cell — it's a signature wide element in this design, not a form field.
    const durationHtml = section.durationField
      ? fieldRow(config.fields.find(f => f.key === section.durationField), currentEntryValue(config.fields.find(f => f.key === section.durationField)))
      : '';
    return `<div class="log-section">
      <div class="log-section-head">${sectionIcon(section.icon)}<h4>${escapeHtml(section.title)}</h4></div>
      ${rowsHtml}${durationHtml}
    </div>`;
  }).join('');
}

function updateModalProgress() {
  const config = LOG_CONFIGS[modalSection];
  if (!config) return;
  const total = config.fields.length;
  let filled = 0;
  config.fields.forEach(field => {
    const el = document.getElementById('m_f_' + field.key);
    if (el && String(el.value || '').trim() !== '') filled++;
  });
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const text = document.getElementById('modal-progress-text');
  const fill = document.getElementById('modal-progress-fill');
  if (text) text.textContent = `${filled} / ${total} fields`;
  if (fill) fill.style.width = pct + '%';
}

export function openModal(section, index = -1) {
  if (state.currentUserRole === 'reviewer') { showToast('View only — editing is not available in review mode.', 'warn'); return; }
  modalSection = section;
  modalIndex = index;
  const progressChip = document.querySelector('.log-progress-chip');
  if (section === 'shiftLogs') {
    if (progressChip) progressChip.style.display = 'none';
    openShiftModal(index);
    return;
  }
  if (progressChip) progressChip.style.display = '';

  const config = LOG_CONFIGS[section];
  if (!config) return;

  currentEntry = index > -1 ? state.currentReportData[section][index] : {};

  document.getElementById('modal-title').textContent = config.title;
  document.getElementById('modal-subtitle').textContent = index > -1 ? 'Editing existing entry' : 'MiniSpector Log — Operations';
  document.getElementById('entry-modal').style.display = 'flex';
  const container = document.getElementById('modal-content-area');
  container.innerHTML = renderSections(config);

  const durationField = config.fields.find(f => f.type === 'duration');
  if (durationField) setupAutoCalc(durationField.durationGroup.map(k => 'm_f_' + k), 'm_f_' + durationField.key);

  const endDateField = config.fields.find(f => f.fallbackFrom);
  if (endDateField && !currentEntry[endDateField.key]) {
    const el = document.getElementById('m_f_' + endDateField.key);
    if (el) el.value = currentEntry[endDateField.fallbackFrom] || '';
  }

  container.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', updateModalProgress);
    el.addEventListener('change', updateModalProgress);
  });
  updateModalProgress();
}

function setupAutoCalc([startDateId, startTimeId, endDateId, endTimeId], durationId) {
  const calc = () => {
    const sDate = document.getElementById(startDateId)?.value;
    const sTime = document.getElementById(startTimeId)?.value;
    const eDate = document.getElementById(endDateId)?.value;
    const eTime = document.getElementById(endTimeId)?.value;
    const durEl = document.getElementById(durationId);
    const durDisplay = document.getElementById(durationId + '-display');
    if (!durEl || !sDate || !sTime || !eDate || !eTime) return;
    const diffMs = new Date(`${eDate}T${eTime}`) - new Date(`${sDate}T${sTime}`);
    if (diffMs < 0) { durEl.value = 'Check Dates'; if (durDisplay) durDisplay.textContent = 'Check Dates'; return; }
    const totalMins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMins / 60), mins = totalMins % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} hrs`);
    if (mins > 0) parts.push(`${mins} mins`);
    durEl.value = parts.join(' ') || '0 mins';
    if (durDisplay) durDisplay.textContent = durEl.value;
    updateModalProgress();
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

  document.querySelectorAll('#modal-content-area .log-field.invalid').forEach(el => el.classList.remove('invalid'));
  let firstInvalid = null;
  config.fields.forEach(field => {
    if (!field.required) return;
    if (getV('m_f_' + field.key).trim() !== '') return;
    const wrap = document.querySelector(`#modal-content-area .log-field[data-field="${field.key}"]`);
    wrap?.classList.add('invalid');
    if (!firstInvalid) firstInvalid = wrap;
  });
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.querySelector('input, select, textarea')?.focus();
    return;
  }

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

function mutedDash(text) { return `<span class="log-muted-dash">${escapeHtml(text)}</span>`; }

function formatColumn(section, col, log) {
  if (col.key === '_time') {
    const end = log.endTime ? escapeHtml(log.endTime) : mutedDash('—');
    return log.startTime ? `${escapeHtml(log.startTime)} – ${end}` : mutedDash('—');
  }
  if (col.key === '_depth') return log.depth ? `${escapeHtml(log.depth)}<span class="log-muted-dash"> m</span>` : mutedDash('—');
  if (col.key === '_desc') {
    const d = log.desc || '';
    return d ? escapeHtml(d.length > 60 ? d.substring(0, 60) + '...' : d) : mutedDash('—');
  }
  if (col.key === '_status') {
    const closed = log.status === 'Closed';
    return `<span class="px-2 py-1 rounded text-xs font-bold ${closed ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}">${escapeHtml(log.status || 'Open')}</span>`;
  }
  if (col.key === '_photos') return log.photos?.length ? `<span class="italic" style="color:#459fd9">${log.photos.length} file(s)</span>` : `<span class="italic" style="color:#6C88A6">None</span>`;
  const val = log[col.key] ?? '';
  // "In Progress"/"Check Dates" (see triggerQuickDive/triggerQuickStandby and
  // setupAutoCalc) read as live-status badges instead of plain duration text.
  if (col.key === 'duration' && val === 'In Progress') return `<span class="log-status-badge log-status-progress"><span class="dot"></span>In Progress</span>`;
  if (col.key === 'duration' && val === 'Check Dates') return `<span class="log-status-badge log-status-check">Check Dates</span>`;
  if (val === '') return mutedDash(col.fallback || '—');
  const text = escapeHtml(String(val));
  return col.accent ? `<span class="${col.accent}">${text}</span>` : text;
}

function renderLogTable(section) {
  const config = LOG_CONFIGS[section];
  const container = document.getElementById(config.containerId);
  if (!container) return;
  const logs = state.currentReportData[section] || [];

  updateLogSummary(section, logs);

  if (logs.length === 0) { container.innerHTML = emptyState(config.emptyMessage); return; }

  container.innerHTML = `
    <div class="log-table-wrap">
      <table>
        <thead>
          <tr>${config.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th class="actions-col">Actions</th></tr>
        </thead>
        <tbody>
          ${logs.map((log, i) => `
          <tr>
            ${config.columns.map(c => `<td>${formatColumn(section, c, log)}</td>`).join('')}
            <td>
              <div class="log-row-actions">
                <button type="button" class="log-edit-btn log-icon-btn" title="Edit" data-section="${section}" data-idx="${i}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button type="button" class="log-del-btn log-icon-btn danger" title="Delete" data-section="${section}" data-idx="${i}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z"/></svg>
                </button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll('.log-edit-btn').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.section, parseInt(btn.dataset.idx, 10))));
  container.querySelectorAll('.log-del-btn').forEach(btn => btn.addEventListener('click', () => removeLog(btn.dataset.section, parseInt(btn.dataset.idx, 10))));
}

// Toolbar live-status line for each log tab (mirrors Dive Log's "N dives
// logged · M in progress") — "In Progress" tracking only applies to the two
// log types with a quick-start flow (triggerQuickDive/triggerQuickStandby).
const LOG_SUMMARY_CONFIG = {
  diveLogs: { elId: 'dive-log-summary', singular: 'dive logged', plural: 'dives logged', empty: 'No dives recorded', trackInProgress: true },
  standbyLogs: { elId: 'standby-log-summary', singular: 'standby entry logged', plural: 'standby entries logged', empty: 'No standby time recorded', trackInProgress: true },
  maintenanceLogs: { elId: 'maint-log-summary', singular: 'maintenance entry logged', plural: 'maintenance entries logged', empty: 'No maintenance recorded' },
  issueReports: { elId: 'issue-log-summary', singular: 'issue logged', plural: 'issues logged', empty: 'No issues recorded' },
};

function updateLogSummary(section, logs) {
  const cfg = LOG_SUMMARY_CONFIG[section];
  if (!cfg) return;
  const el = document.getElementById(cfg.elId);
  if (!el) return;
  if (logs.length === 0) { el.textContent = cfg.empty; return; }
  let text = `${logs.length} ${logs.length !== 1 ? cfg.plural : cfg.singular}`;
  if (cfg.trackInProgress) {
    const inProgress = logs.filter(l => l.duration === 'In Progress').length;
    if (inProgress) text += ` · ${inProgress} in progress`;
  }
  el.textContent = text;
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

// Generic renderer + state engine driven by CHECKLISTS config (checklistConfig.js).
// mobilization/startup/shutdown/demob are completed once per job; preOp/postOp
// are perDive — tracked separately per dive number (keyed off diveLogs' `num`).

import { state } from './state.js';
import { escapeHtml } from './ui.js';
import { CHECKLISTS } from './checklistConfig.js';

const BADGE_MAP = {
  mobilization: 'cl-badge-mobilization',
  startup: 'cl-badge-startup',
  preOp: 'cl-badge-preop',
  postOp: 'cl-badge-postop',
  shutdown: 'cl-badge-shutdown',
  demob: 'cl-badge-demob',
};

function ensureChecklistsState() {
  if (!state.currentReportData.checklists) {
    state.currentReportData.checklists = { mobilization: {}, startup: {}, preOp: {}, postOp: {}, shutdown: {}, demob: {} };
  }
}

function clGetState(type, diveKey, itemId) {
  ensureChecklistsState();
  const cl = CHECKLISTS[type];
  const map = state.currentReportData.checklists[type] || {};
  if (cl && cl.perDive) return (map[diveKey] || {})[itemId] || { checked: false, obs: '', reading: '' };
  return map[itemId] || { checked: false, obs: '', reading: '' };
}

function clEnsureItem(type, diveKey, itemId) {
  ensureChecklistsState();
  if (!state.currentReportData.checklists[type]) state.currentReportData.checklists[type] = {};
  const cl = CHECKLISTS[type];
  const bucket = cl && cl.perDive
    ? (state.currentReportData.checklists[type][diveKey] ??= {})
    : state.currentReportData.checklists[type];
  if (!bucket[itemId]) bucket[itemId] = { checked: false, obs: '', reading: '' };
  return bucket[itemId];
}

function clCheck(type, diveKey, itemId, val) {
  if (state.currentUserRole === 'reviewer') return;
  clEnsureItem(type, diveKey, itemId).checked = val;
  state.isDirty = true;
  renderChecklistsTab();
}
function clSetObs(type, diveKey, itemId, val) {
  if (state.currentUserRole === 'reviewer') return;
  clEnsureItem(type, diveKey, itemId).obs = val;
  state.isDirty = true;
  updateChecklistBadge();
}
function clSetReading(type, diveKey, itemId, val) {
  if (state.currentUserRole === 'reviewer') return;
  clEnsureItem(type, diveKey, itemId).reading = val;
  state.isDirty = true;
}

function clCountType(type) {
  const cl = CHECKLISTS[type];
  if (!cl || cl.perDive) return { done: 0, total: 0 };
  const map = state.currentReportData.checklists?.[type] || {};
  let done = 0, total = 0;
  cl.sections.forEach(s => s.items.forEach(item => { total++; if (map[item.id]?.checked) done++; }));
  return { done, total };
}

function clCountDive(type, diveKey) {
  const cl = CHECKLISTS[type];
  if (!cl) return { done: 0, total: 0 };
  const map = cl.perDive ? ((state.currentReportData.checklists?.[type] || {})[diveKey] || {}) : (state.currentReportData.checklists?.[type] || {});
  let done = 0, total = 0;
  cl.sections.forEach(s => s.items.forEach(item => { total++; if (map[item.id]?.checked) done++; }));
  return { done, total };
}

function updateChecklistBadge() {
  Object.entries(BADGE_MAP).forEach(([type, badgeId]) => {
    const el = document.getElementById(badgeId);
    if (!el) return;
    const { done, total } = CHECKLISTS[type]?.perDive
      ? clCountDive(type, state.activeChecklistDiveKeys[type] || '1')
      : clCountType(type);
    el.textContent = `${done}/${total}`;
    el.className = 'nav-tag flex-shrink-0';
    const complete = done === total && total > 0;
    el.style.color = complete ? '#22c55e' : '';
    el.style.borderColor = complete ? 'rgba(34,197,94,0.4)' : '';
  });
}

function setChecklistType(type) {
  state.activeChecklistType = type;
}

function switchChecklistDive(type, key) {
  state.activeChecklistDiveKeys[type] = key;
  renderChecklistsTab();
}

function addChecklistDive(type) {
  if (state.currentUserRole === 'reviewer') return;
  const map = state.currentReportData.checklists?.[type] || {};
  const existingNos = Object.keys(map).map(Number).filter(n => !isNaN(n) && n > 0);
  const next = existingNos.length > 0 ? Math.max(...existingNos) + 1 : (Object.keys(map).length + 2);
  state.activeChecklistDiveKeys[type] = String(next);
  renderChecklistsTab();
}

function clResetChecklist(type, diveKey) {
  if (state.currentUserRole === 'reviewer') return;
  if (!confirm('Reset all items in this checklist? This cannot be undone.')) return;
  ensureChecklistsState();
  const cl = CHECKLISTS[type];
  if (cl && cl.perDive) {
    if (state.currentReportData.checklists[type]) delete state.currentReportData.checklists[type][diveKey];
  } else {
    state.currentReportData.checklists[type] = {};
  }
  state.isDirty = true;
  renderChecklistsTab();
}

export function renderChecklistsTab() {
  const container = document.getElementById('cl-container');
  if (!container) return;
  ensureChecklistsState();

  const readOnly = state.currentUserRole === 'reviewer';
  const type = state.activeChecklistType;
  const cl = CHECKLISTS[type];
  const isPerDive = !!cl.perDive;
  const diveKey = isPerDive ? (state.activeChecklistDiveKeys[type] || '1') : '';

  let diveBarHtml = '';
  if (isPerDive) {
    const map = state.currentReportData.checklists[type] || {};
    const savedKeys = Object.keys(map);
    const logKeys = (state.currentReportData.diveLogs || []).map(d => String(d.num || '')).filter(Boolean);
    const allKeys = [...new Set([...savedKeys, ...logKeys, diveKey])].sort((a, b) => Number(a) - Number(b));

    diveBarHtml = `
    <div class="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style="background:rgba(69,159,217,0.08);border:1px solid rgba(69,159,217,0.2);">
        <span class="text-xs font-bold uppercase tracking-wider" style="color:#9AB0C8">Dive No.</span>
        <select id="cl-dive-select" class="text-sm rounded-lg px-2 py-1.5 cursor-pointer">
            ${allKeys.map(k => `<option value="${escapeHtml(k)}" ${k === diveKey ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
        </select>
        ${readOnly ? '' : `<button id="cl-add-dive-btn" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:bg-[#459fd9]/10" style="color:#459fd9;border:1px solid rgba(69,159,217,0.3);">+ New Dive</button>`}
    </div>`;
  }

  const { done: totalDone, total: totalItems } = isPerDive ? clCountDive(type, diveKey) : clCountType(type);
  const pct = totalItems > 0 ? Math.round(totalDone / totalItems * 100) : 0;
  const allDone = pct === 100 && totalItems > 0;

  const sectionsHtml = cl.sections.map(section => {
    const secDone = section.items.filter(item => clGetState(type, diveKey, item.id).checked).length;
    const secTotal = section.items.length;

    const itemsHtml = section.items.map((item, idx) => {
      const st = clGetState(type, diveKey, item.id);
      const ckId = `cl_${type}_${diveKey}_${item.id}`;
      return `
      <div class="flex gap-3 items-start py-2.5 px-3 rounded-lg transition-colors hover:bg-white/[0.03] ${st.checked ? 'opacity-55' : ''}">
          <div class="flex-shrink-0 mt-[3px]">
              <input type="checkbox" id="${ckId}" data-item-id="${item.id}" ${st.checked ? 'checked' : ''} ${readOnly ? 'disabled' : ''} class="cl-check-input w-4 h-4 rounded cursor-pointer accent-[#f39124]">
          </div>
          <div class="flex-1 min-w-0">
              <label for="${ckId}" class="block text-sm leading-relaxed cursor-pointer select-none" style="${st.checked ? 'text-decoration:line-through;color:#6C88A6' : 'color:#E9F0F8'}">
                  <span class="text-xs mr-1" style="color:#6C88A6">${idx + 1}.</span>${escapeHtml(item.label)}
              </label>
              ${item.reading ? `<div class="mt-2 flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-semibold text-[#f39124]">${escapeHtml(item.readingLabel)}:</span>
                  <input type="text" value="${escapeHtml(st.reading || '')}" placeholder="${escapeHtml(item.readingHint || 'Enter reading...')}" ${readOnly ? 'disabled' : ''}
                         data-item-id="${item.id}" class="cl-reading-input rounded-lg px-2.5 py-1 text-sm w-40 focus:outline-none" style="background:#0C1727;border:1px solid rgba(120,166,212,0.16);color:#E9F0F8">
              </div>` : ''}
          </div>
          <div class="flex-shrink-0 min-w-[140px]">
              <input type="text" value="${escapeHtml(st.obs || '')}" placeholder="Observation..." data-item-id="${item.id}" ${readOnly ? 'disabled' : ''}
                     class="cl-obs-input w-full text-xs py-0.5 transition-colors focus:outline-none" style="background:transparent;color:#9AB0C8;border:none;border-bottom:1px solid rgba(120,166,212,0.16)">
          </div>
      </div>`;
    }).join('');

    return `
    <div class="mb-3 rounded-xl overflow-hidden" style="border:1px solid rgba(120,166,212,0.16);">
        <div class="flex items-center justify-between px-4 py-2.5" style="background:rgba(243,145,36,0.07);border-bottom:1px solid rgba(243,145,36,0.15);">
            <span class="text-xs font-bold uppercase tracking-wider text-[#f39124]">${escapeHtml(section.title)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full" style="${secDone === secTotal ? 'background:rgba(34,197,94,0.15);color:#22c55e' : 'background:rgba(120,166,212,0.15);color:#9AB0C8'}">${secDone}/${secTotal}</span>
        </div>
        ${section.note ? `<div class="mx-3 mt-2 px-3 py-2 rounded-lg text-xs leading-relaxed" style="color:#fbbf24;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);">⚠ ${escapeHtml(section.note)}</div>` : ''}
        <div class="px-1 py-1">${itemsHtml}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
  <div class="flex items-center justify-between mb-4">
      <div>
          <h3 class="text-lg font-bold" style="color:#E9F0F8">${escapeHtml(cl.title)} Checklist</h3>
          <p class="text-xs mt-0.5" style="color:#6C88A6">${isPerDive ? 'Completed per dive — select dive number below' : 'Completed once per job/session'}</p>
      </div>
      <div class="flex items-center gap-4">
          ${readOnly ? '' : `<button id="cl-reset-btn" type="button" class="px-3 py-1.5 text-xs rounded-lg hover:border-red-500/50 hover:text-red-400 transition-colors" style="border:1px solid rgba(120,166,212,0.16);color:#9AB0C8">Reset</button>`}
          <div class="text-right">
              <div class="text-sm font-bold" style="color:${allDone ? '#22c55e' : '#E9F0F8'}">${totalDone} / ${totalItems}</div>
              <div class="text-xs" style="color:#6C88A6">${pct}% complete</div>
          </div>
      </div>
  </div>
  <div class="h-1.5 rounded-full mb-5 overflow-hidden" style="background:#0C1727">
      <div class="h-full rounded-full transition-all duration-300" style="width:${pct}%;background:${allDone ? '#10b981' : '#f39124'};"></div>
  </div>
  ${diveBarHtml}
  <div class="space-y-3">${sectionsHtml}</div>
  `;

  container.querySelectorAll('.cl-check-input').forEach(el =>
    el.addEventListener('change', () => clCheck(type, diveKey, el.dataset.itemId, el.checked)));
  container.querySelectorAll('.cl-obs-input').forEach(el =>
    el.addEventListener('input', () => clSetObs(type, diveKey, el.dataset.itemId, el.value)));
  container.querySelectorAll('.cl-reading-input').forEach(el =>
    el.addEventListener('input', () => clSetReading(type, diveKey, el.dataset.itemId, el.value)));

  document.getElementById('cl-dive-select')?.addEventListener('change', (e) => switchChecklistDive(type, e.target.value));
  document.getElementById('cl-add-dive-btn')?.addEventListener('click', () => addChecklistDive(type));
  document.getElementById('cl-reset-btn')?.addEventListener('click', () => clResetChecklist(type, diveKey));

  updateChecklistBadge();
}

export function installChecklists() {
  window.setChecklistType = setChecklistType;
  window.renderChecklistsTab = renderChecklistsTab;
  window.__refreshChecklists = renderChecklistsTab;
}

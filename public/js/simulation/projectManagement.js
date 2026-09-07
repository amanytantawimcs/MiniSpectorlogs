// "Project management" modal, opened from an icon in the simulation
// workspace header (not a sidebar/sub-tab destination — see
// openProjectManagement() below): the Project Team (operators who can edit
// this project — moved here from Mission Info, see projectTeam.js) and a
// read-only Project History feed built from sync_log
// (server/routes/sync.js), which every save already writes to via
// core.js's maybeLogHistory(). Deliberately coarse — "who edited what
// section, when" — not a field-level diff; see core.js's comment on
// currentSimSection for why.

import { api } from '../api.js';
import { escapeHtml } from '../ui.js';
import { simState } from './state.js';
import { renderProjectTeam } from '../projectTeam.js';
import { exportProjectHistory } from '../export.js';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Single source of truth for turning a raw sync_log row into the
// person/section/what/when shown in the feed — reused as-is by the Excel
// export below so the file always matches what's on screen (including
// whatever filter is applied).
function historyRowData(entry) {
  const section = entry.meta?.section || '';
  const person = entry.user_name || 'Someone';
  const what = section ? `updated ${section}` : (entry.action === 'create' ? 'created the project' : entry.action === 'join' ? 'joined the project' : 'made an update');
  return { person, section, what, when: formatWhen(entry.synced_at) };
}

function historyRowHTML(entry) {
  const { person, section, what, when } = historyRowData(entry);
  const whatHtml = section ? `updated <strong>${escapeHtml(section)}</strong>` : escapeHtml(what);
  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border-bottom:1px solid rgba(120,166,212,0.1);">
    <div style="flex:1;min-width:0;font-size:13px;color:#D3DAE3;">
      <strong>${escapeHtml(person)}</strong> ${whatHtml}
    </div>
    <div style="font-size:11px;color:#6C88A6;white-space:nowrap;">${escapeHtml(when)}</div>
  </div>`;
}

// Options for a <select> filter: unique, non-empty values from the full log,
// alphabetically sorted, with the currently-selected value (if any) kept even
// if it would otherwise disappear from view (e.g. a person filter selected
// before switching to a section with no entries from them).
function filterOptionsHTML(values, selected) {
  const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (selected && !unique.includes(selected)) unique.push(selected);
  return unique.map(v => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
}

async function renderHistoryCard(projectCode, projectName) {
  const card = document.createElement('div');
  card.className = 'rcard mb-5';
  card.innerHTML = `<div class="flex items-center gap-3 px-6 py-3.5 border-b rcard-head">
      <span class="rcard-bar"></span><span class="rcard-title">Project history</span>
      <span class="text-xs" style="color:#6C88A6">Who edited this project, and when</span>
    </div>
    <div class="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap" style="border-color:rgba(120,166,212,0.12);">
      <select id="history-filter-user" class="rfield" style="height:34px;font-size:12.5px;padding:0 10px;min-width:150px;">
        <option value="">All people</option>
      </select>
      <select id="history-filter-section" class="rfield" style="height:34px;font-size:12.5px;padding:0 10px;min-width:160px;">
        <option value="">All sections</option>
      </select>
      <button type="button" id="history-export-btn" class="rbtn-orange-outline flex items-center gap-2" style="height:34px;padding:0 12px;font-size:12.5px;margin-left:auto;" disabled>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m-9 7h12a2 2 0 002-2V6a2 2 0 00-2-2H8.5L4 8.5V19a2 2 0 002 2z"/></svg>
        Export
      </button>
    </div>
    <div id="project-history-list" class="p-2">
      <div class="p-6 text-center text-sm" style="color:#6C88A6">Loading history…</div>
    </div>`;

  const userSelect = card.querySelector('#history-filter-user');
  const sectionSelect = card.querySelector('#history-filter-section');
  const exportBtn = card.querySelector('#history-export-btn');
  let fullLog = [];

  const filteredLog = () => fullLog.filter(entry =>
    (!userSelect.value || entry.user_name === userSelect.value) &&
    (!sectionSelect.value || (entry.meta?.section || '') === sectionSelect.value));

  const render = () => {
    const list = card.querySelector('#project-history-list');
    if (!list) return; // card was re-rendered/torn down before this ran
    const rows = filteredLog();
    list.innerHTML = rows.length
      ? rows.map(historyRowHTML).join('')
      : `<div class="p-6 text-center text-sm" style="color:#6C88A6">${fullLog.length ? 'No history matches this filter.' : 'No history yet — edits will start showing up here.'}</div>`;
    exportBtn.disabled = rows.length === 0;
  };

  userSelect.addEventListener('change', () => {
    sectionSelect.innerHTML = '<option value="">All sections</option>' + filterOptionsHTML(fullLog.map(e => e.meta?.section), sectionSelect.value);
    render();
  });
  sectionSelect.addEventListener('change', () => {
    userSelect.innerHTML = '<option value="">All people</option>' + filterOptionsHTML(fullLog.map(e => e.user_name), userSelect.value);
    render();
  });
  exportBtn.addEventListener('click', () => {
    exportProjectHistory(projectCode, projectName, filteredLog().map(historyRowData));
  });

  if (projectCode) {
    api.getSyncLog(projectCode).then(({ log }) => {
      if (!card.isConnected) return; // card was torn down before this resolved
      fullLog = log || [];
      userSelect.innerHTML = '<option value="">All people</option>' + filterOptionsHTML(fullLog.map(e => e.user_name), '');
      sectionSelect.innerHTML = '<option value="">All sections</option>' + filterOptionsHTML(fullLog.map(e => e.meta?.section), '');
      render();
    });
  } else {
    render();
  }
  return card;
}

export async function renderProjectManagementContent(area) {
  area.innerHTML = '';
  const wrap = document.createElement('div');

  const subtitle = document.createElement('p');
  subtitle.className = 'text-gray-400 mb-5 text-sm';
  subtitle.textContent = 'Manage who can edit this project, and see its recent edit history.';
  wrap.appendChild(subtitle);

  // renderProjectTeam builds its own rcard (a <details> disclosure) directly
  // inside this container — no extra card wrapper needed here, that would
  // just nest a card inside a card.
  const teamContainer = document.createElement('div');
  teamContainer.id = 'team-container-sim';
  teamContainer.className = 'mb-5';
  wrap.appendChild(teamContainer);

  const projectCode = simState.projectData.code;
  wrap.appendChild(await renderHistoryCard(projectCode, simState.projectData.name));

  area.appendChild(wrap);
  renderProjectTeam('team-container-sim', projectCode);
}

export function openProjectManagement() {
  const modal = document.getElementById('project-mgmt-modal');
  const body = document.getElementById('project-mgmt-modal-body');
  if (!modal || !body) return;
  modal.style.display = 'flex';
  renderProjectManagementContent(body);
}

export function closeProjectManagement() {
  const modal = document.getElementById('project-mgmt-modal');
  if (modal) modal.style.display = 'none';
}

export function installProjectManagement() {
  window.openProjectManagement = openProjectManagement;
  window.closeProjectManagement = closeProjectManagement;
}

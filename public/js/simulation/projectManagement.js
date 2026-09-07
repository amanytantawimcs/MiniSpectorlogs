// "Project management" workspace sub-tab: the Project Team (operators who
// can edit this project — moved here from Mission Info, see
// projectTeam.js) and a read-only Project History feed built from
// sync_log (server/routes/sync.js), which every save already writes to via
// core.js's maybeLogHistory(). Deliberately coarse — "who edited what
// section, when" — not a field-level diff; see core.js's comment on
// currentSimSection for why.

import { api } from '../api.js';
import { escapeHtml } from '../ui.js';
import { simState } from './state.js';
import { renderProjectTeam } from '../projectTeam.js';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function historyRowHTML(entry) {
  const section = entry.meta?.section;
  const who = entry.user_name || 'Someone';
  const what = section ? `updated <strong>${escapeHtml(section)}</strong>` : (entry.action === 'create' ? 'created the project' : entry.action === 'join' ? 'joined the project' : 'made an update');
  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border-bottom:1px solid rgba(120,166,212,0.1);">
    <div style="flex:1;min-width:0;font-size:13px;color:#D3DAE3;">
      <strong>${escapeHtml(who)}</strong> ${what}
    </div>
    <div style="font-size:11px;color:#6C88A6;white-space:nowrap;">${escapeHtml(formatWhen(entry.synced_at))}</div>
  </div>`;
}

async function renderHistoryCard(projectCode) {
  const card = document.createElement('div');
  card.className = 'rcard mb-5';
  card.innerHTML = `<div class="flex items-center gap-3 px-6 py-3.5 border-b rcard-head">
      <span class="rcard-bar"></span><span class="rcard-title">Project history</span>
      <span class="text-xs" style="color:#6C88A6">Who edited this project, and when</span>
    </div>
    <div id="project-history-list" class="p-2">
      <div class="p-6 text-center text-sm" style="color:#6C88A6">Loading history…</div>
    </div>`;

  if (projectCode) {
    api.getSyncLog(projectCode).then(({ log }) => {
      const list = card.querySelector('#project-history-list');
      if (!list) return; // card was re-rendered/torn down before this resolved
      list.innerHTML = (log && log.length)
        ? log.map(historyRowHTML).join('')
        : `<div class="p-6 text-center text-sm" style="color:#6C88A6">No history yet — edits will start showing up here.</div>`;
    });
  }
  return card;
}

export async function renderProjectManagementContent(area) {
  area.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mx-auto pb-6';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mb-6';
  titleWrap.innerHTML = `<h3 class="text-2xl font-bold text-white tracking-tight">Project management</h3>
    <p class="text-gray-400 mt-1 text-sm">Manage who can edit this project, and see its recent edit history.</p>`;
  wrap.appendChild(titleWrap);

  // renderProjectTeam builds its own rcard (a <details> disclosure) directly
  // inside this container — no extra card wrapper needed here, that would
  // just nest a card inside a card.
  const teamContainer = document.createElement('div');
  teamContainer.id = 'team-container-sim';
  teamContainer.className = 'mb-5';
  wrap.appendChild(teamContainer);

  const projectCode = simState.projectData.code;
  wrap.appendChild(await renderHistoryCard(projectCode));

  area.appendChild(wrap);
  renderProjectTeam('team-container-sim', projectCode);
}

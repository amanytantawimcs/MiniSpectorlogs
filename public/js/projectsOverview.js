// "All Projects" tab — visible only to the two privileged user IDs in
// APPROVER_IDS (simulation/config.js). Cross-project directory: every
// project in the database regardless of who created it, with its mode
// (operation/simulation) and creator, via GET /api/projects/overview
// (server-side gated on the same two IDs, not just hidden client-side).
import { api } from './api.js';
import { escapeHtml } from './ui.js';

export async function renderProjectsOverviewTab() {
  const el = document.getElementById('projects-overview-content');
  if (!el) return;
  el.innerHTML = `<div class="text-sm py-8 text-center" style="color:#6C88A6">Loading projects...</div>`;

  const result = await api.getProjectsOverview();
  if (!result.success) {
    el.innerHTML = `<div class="text-red-400 text-sm py-8 text-center">${escapeHtml(result.error || 'Failed to load projects.')}</div>`;
    return;
  }

  const projects = result.projects || [];
  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold" style="color:#E9F0F8">All Projects</h2>
        <span class="text-xs" style="color:#6C88A6">${projects.length} total</span>
    </div>
    <div class="rcard">
        <table class="w-full text-sm">
            <thead>
                <tr>
                    <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Project Code</th>
                    <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Name</th>
                    <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Status</th>
                    <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Created By</th>
                    <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider">Last Updated</th>
                </tr>
            </thead>
            <tbody>
                ${projects.length === 0 ? `<tr><td colspan="5" class="text-center py-8 text-sm" style="color:#6C88A6">No projects yet.</td></tr>` :
                    projects.map(p => `
                    <tr style="border-bottom:1px solid rgba(120,166,212,0.16);">
                        <td class="px-4 py-3 font-mono text-xs" style="color:#9AB0C8">${escapeHtml(p.project_code)}</td>
                        <td class="px-4 py-3" style="color:#E9F0F8">${escapeHtml(p.project_name || '—')}</td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <span class="text-[10px] font-bold px-2 py-1 rounded" style="${p.mode === 'simulation' ? 'background:rgba(234,179,8,0.15);color:#facc15;' : 'background:rgba(69,159,217,0.15);color:#459fd9;'}">${p.mode === 'simulation' ? 'SIMULATION' : 'OPERATION'}</span>
                            ${p.is_sim_locked ? '<span class="text-[10px] font-bold px-2 py-1 rounded ml-1" style="background:rgba(34,197,94,0.15);color:#22c55e;">PUSHED</span>' : ''}
                        </td>
                        <td class="px-4 py-3" style="color:#9AB0C8">${escapeHtml(p.created_by || '—')}</td>
                        <td class="px-4 py-3 text-xs whitespace-nowrap" style="color:#6C88A6">${p.updated_at ? new Date(p.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                    </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export function installProjectsOverview() {
  window.renderProjectsOverviewTab = renderProjectsOverviewTab;
}

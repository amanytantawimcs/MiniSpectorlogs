// Simulation approval workflow: submit for review, approve/reject (gated to
// APPROVER_IDS for now — see config.js note about moving this to a DB role),
// and the Approvals nav tab listing everything awaiting/past review.

import { escapeHtml, showToast } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { simState } from './state.js';
import { APPROVER_IDS } from './config.js';
import { renderSimContent, saveSimulation } from './core.js';

function isApprover() {
  return state.currentUserProjectRole === 'approver' || APPROVER_IDS.includes(String(state.currentUserId));
}

async function submitSimForApproval() {
  if (!simState.projectData.code) {
    showToast('Save the simulation with a project code first.', 'warn');
    return;
  }
  if (simState.approval.status === 'submitted') {
    showToast('Already submitted for approval.', 'info');
    return;
  }
  simState.approval.status = 'submitted';
  simState.approval.history.push({ action: 'submitted', by: state.currentUserName || state.currentUserId, at: new Date().toISOString() });
  await saveSimulation();
  showToast('Submitted for approval.', 'success');
  updateApprovalBadge();
  renderSimContent();
}

async function updateApprovalBadge() {
  const badges = [document.getElementById('sim-approval-badge'), document.getElementById('sim-approval-badge-nav')];
  const navItem = document.getElementById('sim-nav-approvals');
  if (!isApprover()) { badges.forEach(b => b?.classList.add('hidden')); navItem?.classList.add('hidden'); return; }
  navItem?.classList.remove('hidden');
  const result = await api.listProjects({ mode: 'simulation' });
  const pending = (result.projects || []).filter(p => p.approval_status === 'submitted').length;
  badges.forEach(b => {
    if (!b) return;
    if (pending > 0) { b.textContent = pending; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  });
}

function statusBadge(s) {
  const map = {
    submitted: 'background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.3);|PENDING',
    approved: 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);|APPROVED',
    rejected: 'background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3);|REJECTED',
  };
  const [style, label] = (map[s] || '|').split('|');
  return `<span class="px-2 py-0.5 rounded text-[10px] font-bold" style="${style}">${label}</span>`;
}

async function approveSimulation(projectCode) {
  const result = await api.pullProject(projectCode);
  if (!result.success) { showToast('Failed to load simulation.', 'error'); return; }
  const d = result.project;
  const newHistory = [...(d.data?.approvalHistory || []), { action: 'approved', by: state.currentUserName || state.currentUserId, at: new Date().toISOString() }];
  const data = { ...d.data, approvalStatus: 'approved', approvalHistory: newHistory };
  const pushResult = await api.pushProject({ project_code: projectCode, mode: 'simulation', created_by: d.created_by, project_name: d.project_name, data });
  if (!pushResult.success) { showToast('Failed to save approval.', 'error'); return; }
  if (projectCode === simState.projectData.code) {
    simState.approval = { status: 'approved', history: newHistory };
    renderSimContent();
  }
  showToast(`Simulation "${projectCode}" approved.`, 'success');
  renderApprovalsTab();
}

function promptRejectSimulation(projectCode) {
  const comment = prompt('Reason for rejection (shown to submitter):');
  if (comment === null) return;
  rejectSimulation(projectCode, comment.trim() || 'No reason provided');
}

async function rejectSimulation(projectCode, comment) {
  const result = await api.pullProject(projectCode);
  if (!result.success) { showToast('Failed to load simulation.', 'error'); return; }
  const d = result.project;
  const newHistory = [...(d.data?.approvalHistory || []), { action: 'rejected', by: state.currentUserName || state.currentUserId, at: new Date().toISOString(), comment }];
  const data = { ...d.data, approvalStatus: 'rejected', approvalHistory: newHistory };
  const pushResult = await api.pushProject({ project_code: projectCode, mode: 'simulation', created_by: d.created_by, project_name: d.project_name, data });
  if (!pushResult.success) { showToast('Failed to save rejection.', 'error'); return; }
  if (projectCode === simState.projectData.code) {
    simState.approval = { status: 'rejected', history: newHistory };
    renderSimContent();
  }
  showToast(`Simulation "${projectCode}" rejected.`, 'success');
  renderApprovalsTab();
}

async function renderApprovalsTab() {
  const el = document.getElementById('approvals-content');
  if (!el) return;
  el.innerHTML = `<div class="flex items-center justify-center py-16 text-gray-500 text-sm">Loading...</div>`;

  if (!isApprover()) {
    el.innerHTML = `<div class="flex items-center justify-center py-16 text-gray-500 text-sm">You do not have permission to approve simulations.</div>`;
    return;
  }

  const result = await api.listProjects({ mode: 'simulation' });
  if (!result.success) {
    el.innerHTML = `<div class="flex items-center justify-center py-16 text-gray-500 text-sm">Could not load simulations. Check your connection.</div>`;
    return;
  }

  const all = result.projects.filter(p => p.approval_status && p.approval_status !== 'draft');
  if (all.length === 0) {
    el.innerHTML = `<div class="flex items-center justify-center py-16 text-gray-500 text-sm">No simulations submitted for approval.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-base font-bold text-white">Simulation Approvals</h2>
      <button type="button" id="approvals-refresh-btn" class="text-xs text-gray-400 hover:text-orange-400">Refresh</button>
    </div>
    ${all.map(p => {
      const status = p.approval_status;
      const history = p.approval_history || [];
      const sub = history.find(h => h.action === 'submitted');
      const lastRej = [...history].reverse().find(h => h.action === 'rejected');
      return `
      <div class="rounded-xl p-4 mb-3" style="background:rgba(31,41,55,0.8);border:1px solid rgba(55,65,81,0.6);">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              ${statusBadge(status)}
              <span class="text-sm font-bold text-white truncate">${escapeHtml(p.project_name || p.project_code)}</span>
            </div>
            <div class="text-[11px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>Code: <span class="text-gray-300 font-mono">${escapeHtml(p.project_code)}</span></span>
              ${sub ? `<span>Submitted by <span class="text-gray-300">${escapeHtml(sub.by)}</span> · ${new Date(sub.at).toLocaleDateString()}</span>` : ''}
            </div>
            ${lastRej?.comment ? `<div class="mt-1.5 text-[11px] text-red-400 italic">Rejection reason: ${escapeHtml(lastRej.comment)}</div>` : ''}
          </div>
          ${status === 'submitted' ? `
          <div class="flex gap-2 shrink-0">
            <button type="button" class="approve-btn px-3 py-1.5 text-xs font-bold rounded-lg" data-code="${escapeHtml(p.project_code)}" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);">Approve</button>
            <button type="button" class="reject-btn px-3 py-1.5 text-xs font-bold rounded-lg" data-code="${escapeHtml(p.project_code)}" style="background:rgba(248,113,113,0.12);color:#f87171;border:1px solid rgba(248,113,113,0.3);">Reject</button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}
  `;

  document.getElementById('approvals-refresh-btn')?.addEventListener('click', renderApprovalsTab);
  el.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', () => approveSimulation(btn.dataset.code)));
  el.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', () => promptRejectSimulation(btn.dataset.code)));

  updateApprovalBadge();
}

export function installApprovals() {
  window.submitSimForApproval = submitSimForApproval;
  window.renderApprovalsTab = renderApprovalsTab;
}

export { isApprover, updateApprovalBadge };

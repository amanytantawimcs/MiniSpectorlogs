// "System Readiness" workspace sub-tab — a read-only rollup of sensor
// calibration/testing progress, plus the approval & push-to-operation card.

import { escapeHtml } from '../ui.js';
import { simState } from './state.js';

function kpi(value, label, color) {
  const div = document.createElement('div');
  div.style.cssText = `flex:1;min-width:0;background:${color}14;border:1px solid ${color}33;border-radius:10px;padding:10px 14px;`;
  div.innerHTML = `<div style="font-size:22px;font-weight:800;color:${color};line-height:1;">${value}</div>
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:3px">${label}</div>`;
  return div;
}

function renderApprovalCard() {
  const s = simState.approval.status;
  const acMap = {
    draft: { color: '#6b7280', label: 'DRAFT', desc: 'Complete setup and submit for approval before pushing to Operation.' },
    submitted: { color: '#eab308', label: 'PENDING APPROVAL', desc: 'Awaiting reviewer approval.' },
    approved: { color: '#22c55e', label: 'APPROVED', desc: 'Simulation approved — ready to push to Operation.' },
    rejected: { color: '#f87171', label: 'REJECTED', desc: 'Simulation was rejected. Fix issues and re-submit.' },
  };
  const ac = acMap[s] || acMap.draft;
  const lastRejection = [...simState.approval.history].reverse().find(h => h.action === 'rejected');
  const isApproved = s === 'approved';

  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-6 py-3.5 border-b border-gray-700/50';
  header.innerHTML = `<span class="text-xs font-bold text-white uppercase tracking-widest">Approval &amp; Submission</span>
    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${ac.color}22;color:${ac.color};">${ac.label}</span>`;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'px-6 py-5 flex items-center justify-between gap-6 flex-wrap';

  const desc = document.createElement('p');
  desc.className = 'text-xs text-gray-400 flex-1';
  desc.style.minWidth = '200px';
  desc.textContent = ac.desc;
  body.appendChild(desc);

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-3';

  if (s === 'draft' || s === 'rejected') {
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.textContent = s === 'rejected' ? 'Re-submit for Approval' : 'Submit for Approval';
    submitBtn.className = 'px-4 py-2 rounded-lg text-xs font-bold';
    submitBtn.style.cssText = 'background:rgba(69,159,217,0.15);color:#459fd9;border:2px solid rgba(69,159,217,0.4);';
    submitBtn.addEventListener('click', async () => {
      const { submitSimForApproval } = await import('./approvals.js');
      submitSimForApproval();
    });
    actions.appendChild(submitBtn);
  } else if (s === 'submitted') {
    const pending = document.createElement('span');
    pending.className = 'px-4 py-2 rounded-lg text-xs font-bold';
    pending.style.cssText = 'background:rgba(234,179,8,0.12);color:#eab308;border:2px solid rgba(234,179,8,0.3);';
    pending.textContent = 'Awaiting Approval';
    actions.appendChild(pending);
  }

  const pushBtn = document.createElement('button');
  pushBtn.type = 'button';
  pushBtn.textContent = 'Push to Operation';
  pushBtn.className = 'px-4 py-2 rounded-lg text-xs font-bold';
  pushBtn.disabled = !isApproved;
  pushBtn.style.cssText = isApproved
    ? 'background:#f39124;color:#fff;border:2px solid #f39124;cursor:pointer;'
    : 'background:rgba(55,65,81,0.3);color:#4b5563;border:2px solid rgba(75,85,99,0.3);cursor:not-allowed;';
  pushBtn.addEventListener('click', async () => {
    const { pushToOperation } = await import('../preOp.js');
    pushToOperation();
  });
  actions.appendChild(pushBtn);

  body.appendChild(actions);
  card.appendChild(body);

  if (lastRejection?.comment) {
    const rej = document.createElement('div');
    rej.className = 'mx-6 mb-4 px-3 py-2 rounded-lg text-xs';
    rej.style.cssText = 'background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:rgba(248,113,113,0.8);';
    rej.innerHTML = `<strong>Rejected by ${escapeHtml(lastRejection.by || '')}</strong> — ${new Date(lastRejection.at).toLocaleString()}<br><em>${escapeHtml(lastRejection.comment)}</em>`;
    card.appendChild(rej);
  }

  if (simState.approval.history.length > 0) {
    const historyWrap = document.createElement('div');
    historyWrap.className = 'px-6 pb-4';
    historyWrap.innerHTML = `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4b5563;margin-bottom:8px;padding-top:8px;border-top:1px solid rgba(55,65,81,0.4);">Approval History</div>` +
      simState.approval.history.slice().reverse().slice(0, 6).map(h => `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid rgba(55,65,81,0.2);font-size:11px">
        <span style="font-family:monospace;color:#4b5563;width:90px;flex-shrink:0">${new Date(h.at).toLocaleDateString()}</span>
        <span style="font-weight:700;font-size:9px;text-transform:uppercase;${h.action === 'approved' ? 'color:#22c55e' : h.action === 'rejected' ? 'color:#f87171' : 'color:#eab308'}">${h.action}</span>
        <span style="color:#6b7280">${escapeHtml(h.by || '')}</span>
      </div>`).join('');
    card.appendChild(historyWrap);
  }

  return card;
}

export function renderReadinessContent(area) {
  const sensors = simState.shared.sensors || [];
  const scopeActive = sensors.filter(s => s.status === 'required' || (s.status === 'optional' && s.included) || s.custom);
  const fixedAll = Object.values(simState.shared.rovSensors || {}).flat();
  const active = [...scopeActive, ...fixedAll];
  const total = active.length;

  area.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'max-w-5xl mx-auto pb-6';
  const title = document.createElement('h3');
  title.className = 'text-xl font-bold text-white mb-5';
  title.textContent = 'System Readiness';
  wrap.appendChild(title);

  if (total === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-center text-gray-600 py-12 text-sm';
    empty.textContent = 'No active sensors yet — configure sensors in the Sensors & Equipment tab.';
    wrap.appendChild(empty);
    wrap.appendChild(renderApprovalCard());
    area.appendChild(wrap);
    return;
  }

  const calibrated = active.filter(s => s.calibrated).length;
  const tested = active.filter(s => s.tested).length;
  const noModel = active.filter(s => !s.model || s.model.trim() === '').length;
  const ready = active.filter(s => s.calibrated && s.tested && s.model && s.model.trim() !== '').length;
  const percent = Math.round((ready / total) * 100);
  const barColor = percent === 100 ? '#22c55e' : percent >= 60 ? '#f39124' : '#ef4444';

  const card = document.createElement('div');
  card.className = 'mb-5 rounded-xl overflow-hidden';
  card.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  card.innerHTML = `
    <div class="flex items-center justify-between px-6 py-3.5 border-b border-gray-700/50">
      <span class="text-xs font-bold text-white uppercase tracking-widest">Overall Readiness</span>
      <span style="font-size:22px;font-weight:800;color:${barColor};">${percent}%</span>
    </div>
    <div class="px-6 pt-4 pb-1">
      <div style="height:7px;background:rgba(55,65,81,0.6);border-radius:9999px;overflow:hidden;">
        <div style="width:${percent}%;height:100%;background:${barColor};border-radius:9999px;"></div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:5px;">${percent === 100 ? 'All sensors fully configured and ready' : `${ready} of ${total} sensors fully configured`}</div>
    </div>`;
  const kpiRow = document.createElement('div');
  kpiRow.style.cssText = 'display:flex;gap:10px;padding:12px 24px 16px;';
  kpiRow.append(
    kpi(ready, 'Ready', '#f39124'),
    kpi(calibrated, 'Calibrated', '#f39124'),
    kpi(tested, 'Tested', '#459fd9'),
    kpi(noModel, 'No Model', noModel === 0 ? '#f39124' : '#f87171'),
    kpi(total, 'Total Active', '#9ca3af'),
  );
  card.appendChild(kpiRow);
  wrap.appendChild(card);

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;';
  table.innerHTML = `<thead><tr style="background:rgba(5,8,18,0.9);color:#4b6070;" class="text-[9px] uppercase font-semibold">
    <th class="px-3 py-2 text-left">Sensor</th><th class="px-3 py-2 text-left">Model</th>
    <th class="px-3 py-2 text-center">Calibrated</th><th class="px-3 py-2 text-center">Tested</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  active.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `background:${i % 2 === 0 ? 'rgba(17,24,39,0.35)' : 'rgba(17,24,39,0.15)'};border-bottom:1px solid rgba(55,65,81,0.25)`;
    tr.innerHTML = `<td class="px-3 py-2 text-sm text-gray-200">${escapeHtml(s.name)}</td>
      <td class="px-3 py-2 text-xs text-gray-400">${escapeHtml(s.model || '—')}</td>
      <td class="px-3 py-2 text-center">${s.calibrated ? '<span style="color:#f39124">✓</span>' : '<span style="color:#4b5563">—</span>'}</td>
      <td class="px-3 py-2 text-center">${s.tested ? '<span style="color:#459fd9">✓</span>' : '<span style="color:#4b5563">—</span>'}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const tableCard = document.createElement('div');
  tableCard.className = 'rounded-xl overflow-hidden mb-5';
  tableCard.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  tableCard.appendChild(table);
  wrap.appendChild(tableCard);

  wrap.appendChild(renderApprovalCard());
  area.appendChild(wrap);
}

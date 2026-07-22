// "System Readiness" workspace sub-tab — a read-only rollup of sensor
// calibration/testing progress across mission sensors and per-ROV fixed sensors.

import { escapeHtml } from '../ui.js';
import { simState } from './state.js';

function kpi(value, label, color) {
  const div = document.createElement('div');
  div.style.cssText = `flex:1;min-width:0;background:${color}14;border:1px solid ${color}33;border-radius:10px;padding:10px 14px;`;
  div.innerHTML = `<div style="font-size:22px;font-weight:800;color:${color};line-height:1;">${value}</div>
    <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:3px">${label}</div>`;
  return div;
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
  tableCard.className = 'rounded-xl overflow-hidden';
  tableCard.style.cssText = 'background:rgba(31,41,55,0.6);border:1px solid rgba(55,65,81,0.5);';
  tableCard.appendChild(table);
  wrap.appendChild(tableCard);

  area.appendChild(wrap);
}

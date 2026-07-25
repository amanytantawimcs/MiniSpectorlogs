// Infographics / KPI dashboard — ported from the old renderer.js's
// renderInfographics(). Reads collectAllData() + state.preOpData (the
// snapshot pushed from simulation) and draws into the Chart.js canvases
// declared in index.html's #tab-infographics. Chart.js and are loaded
// globally via CDN script tags in index.html, not imported as modules.

import { state } from './state.js';
import { escapeHtml } from './ui.js';
import { collectAllData } from './projectData.js';

let chartUtil, chartReasons, chartCalibration, chartShiftPerf, chartDiveDepth;

function parseDurToHours(str) {
  if (!str) return 0;
  let m = 0;
  const hMatch = str.match(/(\d+)\s*hrs/);
  const mMatch = str.match(/(\d+)\s*mins/);
  if (hMatch) m += parseInt(hMatch[1], 10) * 60;
  if (mMatch) m += parseInt(mMatch[1], 10);
  return parseFloat((m / 60).toFixed(2));
}

export function renderInfographics() {
  const data = collectAllData();

  // ── Totals ────────────────────────────────────────────────────────
  let totalShiftHours = 0;
  const sDate = data.dailySummary.startDate;
  const eDate = data.dailySummary.endDate;
  if (sDate && eDate) {
    const startObj = new Date(sDate);
    const endObj = new Date(eDate);
    endObj.setDate(endObj.getDate() + 1);
    const diffMs = endObj - startObj;
    if (diffMs > 0) totalShiftHours = parseFloat((diffMs / 3600000).toFixed(2));
  }

  const totalDiveHours = parseDurToHours(data.totalDiveDuration);
  const totalStandbyHours = parseDurToHours(data.totalStandbyTime);
  const totalLoggedHours = totalDiveHours + totalStandbyHours;
  const operationalHours = totalShiftHours > 0
    ? Math.max(0, parseFloat((totalShiftHours - totalDiveHours - totalStandbyHours).toFixed(2)))
    : 0;

  const totalDiveCount = data.diveLogs.length;
  const utilizationPct = totalLoggedHours > 0 ? ((totalDiveHours / totalLoggedHours) * 100).toFixed(1) : '0';

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setText('op-total-dives', totalDiveCount);
  setText('op-total-standby', data.standbyLogs.length);
  setText('op-percentage', `${utilizationPct}%`);

  // ── Active / open logs feed ─────────────────────────────────────────
  const activeListContainer = document.getElementById('active-logs-list');
  let activeHTML = '';
  data.diveLogs.forEach(log => {
    if (!log.endTime || log.duration === 'In Progress') {
      activeHTML += `
        <div class="flex items-center justify-between bg-blue-900/20 border border-blue-500/30 p-2 rounded">
          <span class="font-bold text-blue-400 text-xs">${escapeHtml(log.num || 'DIV')}</span>
          <span class="text-white text-xs">${escapeHtml(log.rov || 'Dive')} In Progress</span>
          <span class="text-gray-400 text-[10px] animate-pulse">● Live</span>
        </div>`;
    }
  });
  data.standbyLogs.forEach(log => {
    if (!log.endTime || log.duration === 'In Progress') {
      activeHTML += `
        <div class="flex items-center justify-between bg-red-900/20 border border-red-500/30 p-2 rounded">
          <span class="font-bold text-red-400 text-xs">${escapeHtml(log.id || 'SB')}</span>
          <span class="text-white text-xs">${escapeHtml(log.category || 'Standby')}</span>
          <span class="text-gray-400 text-[10px] animate-pulse">● Live</span>
        </div>`;
    }
  });
  if (activeListContainer) {
    activeListContainer.innerHTML = activeHTML || `<p class="text-gray-500 italic text-xs text-center py-2">No active operations.</p>`;
  }

  // ── ROV live status badge ────────────────────────────────────────────
  const allLogs = [];
  data.diveLogs.forEach(l => {
    if (l.date && l.startTime) {
      const timestamp = l.endTime ? new Date(`${l.endDate || l.date}T${l.endTime}`) : new Date(`${l.date}T${l.startTime}`);
      allLogs.push({ type: 'DIVE', timestamp, isOpen: !l.endTime });
    }
  });
  data.standbyLogs.forEach(l => {
    if (l.date && l.startTime) {
      const timestamp = l.endTime ? new Date(`${l.endDate || l.date}T${l.endTime}`) : new Date(`${l.date}T${l.startTime}`);
      allLogs.push({ type: 'STANDBY', timestamp, isOpen: !l.endTime });
    }
  });
  allLogs.sort((a, b) => b.timestamp - a.timestamp);

  const rovStatusEl = document.getElementById('rov-status-badge');
  if (rovStatusEl) {
    if (allLogs.length > 0 && allLogs[0].type === 'DIVE' && allLogs[0].isOpen) {
      rovStatusEl.innerHTML = `<div style="text-align:center;padding:10px 0;border-radius:10px;font-weight:800;font-size:0.85rem;letter-spacing:0.1em;color:#fff;background:linear-gradient(135deg,#1d4ed8,#2563eb);box-shadow:0 0 18px rgba(37,99,235,0.45);" class="animate-pulse">&#x25CF; DEPLOYED</div>`;
    } else if (allLogs.length > 0 && allLogs[0].type === 'STANDBY' && allLogs[0].isOpen) {
      rovStatusEl.innerHTML = `<div style="text-align:center;padding:10px 0;border-radius:10px;font-weight:800;font-size:0.85rem;letter-spacing:0.1em;color:#fff;background:linear-gradient(135deg,#991b1b,#ef4444);box-shadow:0 0 18px rgba(239,68,68,0.35);" class="animate-pulse">&#x25CF; STANDBY</div>`;
    } else {
      rovStatusEl.innerHTML = `<div style="text-align:center;padding:10px 0;border-radius:10px;font-weight:700;font-size:0.85rem;letter-spacing:0.1em;color:#9ca3af;background:#1f2937;border:1px solid #374151;">&#x25CB; ON DECK</div>`;
    }
  }

  // ── Maintenance count ────────────────────────────────────────────────
  const totalMaintCount = data.maintenanceLogs.length;
  const maintEl = document.getElementById('op-total-maint');
  if (maintEl) {
    maintEl.innerText = totalMaintCount;
    maintEl.classList.remove('text-gray-400', 'text-white', 'text-red-500');
    maintEl.classList.add(totalMaintCount > 0 ? 'text-red-500' : 'text-white');
  }

  // ── A. Utilization chart (horizontal bar) ────────────────────────────
  const utilCanvas = document.getElementById('chartUtilization');
  if (utilCanvas) {
    const ctxUtil = utilCanvas.getContext('2d');
    if (chartUtil) chartUtil.destroy();

    const gradDive = ctxUtil.createLinearGradient(0, 0, 500, 0);
    gradDive.addColorStop(0, '#105ba4');
    gradDive.addColorStop(1, '#459fd9');
    const gradStandby = ctxUtil.createLinearGradient(0, 0, 500, 0);
    gradStandby.addColorStop(0, '#b45309');
    gradStandby.addColorStop(1, '#f59e0b');

    chartUtil = new Chart(ctxUtil, {
      type: 'bar',
      data: {
        labels: ['Dive Operations', 'Standby / Delays', 'Operational / Other'],
        datasets: [{
          label: 'Hours',
          data: [totalDiveHours, totalStandbyHours, operationalHours],
          backgroundColor: [gradDive, gradStandby, '#2d3748'],
          borderRadius: 8, barThickness: 28, borderWidth: 0,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#f9fafb', bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, padding: 12, cornerRadius: 8,
            displayColors: false, callbacks: { label: ctx => `${ctx.raw} hrs` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#6b7280', font: { family: 'Inter', size: 11 } } },
          y: { grid: { display: false, drawBorder: false }, ticks: { color: '#d1d5db', font: { family: 'Inter', size: 12, weight: '600' } } },
        },
      },
    });
  }

  // ── B. Standby reasons (doughnut + custom legend) ────────────────────
  const reasonsMap = { 'Mechanical Fault': 0, 'Vessel Operations': 0, Weather: 0, 'Crew Change': 0, Maintenance: 0, 'Client Request': 0, Other: 0 };
  data.standbyLogs.forEach(log => {
    const hrs = parseDurToHours(log.duration);
    const cat = log.category || 'Other';
    if (Object.prototype.hasOwnProperty.call(reasonsMap, cat)) reasonsMap[cat] += hrs;
    else reasonsMap.Other += hrs;
  });
  const activeReasons = {};
  Object.keys(reasonsMap).forEach(key => { if (reasonsMap[key] > 0) activeReasons[key] = reasonsMap[key]; });
  if (Object.keys(activeReasons).length === 0) activeReasons['No Data'] = 1;

  const reasonsCanvas = document.getElementById('chartStandbyReasons');
  const reasonColors = ['#ef5353', '#3b82f6', '#f59e0b', '#10b981', '#e4f551', '#8b5cf6', '#6b7280'];
  if (reasonsCanvas) {
    const ctxReasons = reasonsCanvas.getContext('2d');
    if (chartReasons) chartReasons.destroy();
    chartReasons = new Chart(ctxReasons, {
      type: 'doughnut',
      data: {
        labels: Object.keys(activeReasons),
        datasets: [{ data: Object.values(activeReasons), backgroundColor: reasonColors, borderColor: '#1f2937', borderWidth: 2, hoverOffset: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } },
    });
  }

  const legendContainer = document.getElementById('standby-legend');
  if (legendContainer) {
    legendContainer.innerHTML = '';
    Object.keys(activeReasons).forEach((key, index) => {
      if (key === 'No Data') return;
      const color = reasonColors[index % reasonColors.length];
      const val = activeReasons[key];
      legendContainer.innerHTML += `
        <div class="legend-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="legend-dot" style="background:${color}"></span>
            <span style="font-size:0.75rem;color:#d1d5db;font-weight:500;">${escapeHtml(key)}</span>
          </div>
          <span style="font-size:0.75rem;font-weight:700;color:#f9fafb;font-family:monospace;">${val}h</span>
        </div>`;
    });
  }

  // ── C. Calibration compliance (half-doughnut gauge) ──────────────────
  let okSensorCount = 0;
  let calCompliantCount = 0;
  document.querySelectorAll('#camLightBody tr, #sensorBody tr').forEach(row => {
    const statusEl = row.querySelector('.row-status');
    const calEl = row.querySelector('.row-cal');
    if (statusEl?.checked) {
      okSensorCount++;
      if (calEl?.value) calCompliantCount++;
    }
  });
  const calPercent = okSensorCount > 0 ? Math.round((calCompliantCount / okSensorCount) * 100) : 0;
  setText('cal-percentage', `${calPercent}%`);

  const calCanvas = document.getElementById('chartCalibration');
  if (calCanvas) {
    const ctxCal = calCanvas.getContext('2d');
    if (chartCalibration) chartCalibration.destroy();
    chartCalibration = new Chart(ctxCal, {
      type: 'doughnut',
      data: {
        labels: ['Compliant', 'Non-Compliant'],
        datasets: [{ data: [calPercent, 100 - calPercent], backgroundColor: ['#10b981', '#374151'], borderWidth: 0, borderRadius: 20 }],
      },
      options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '80%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });
  }

  // ── D. Shift performance comparison ──────────────────────────────────
  const shiftLabels = [], shiftDiveH = [], shiftStandbyH = [], shiftOtherH = [];
  if (data.shiftLogs && data.shiftLogs.length > 0) {
    data.shiftLogs.forEach(shift => {
      shiftLabels.push(`Shift ${shift.shiftNo || '?'}`);
      let spanHours = 0;
      if (shift.startDate && shift.endDate) {
        const s = new Date(shift.startDate);
        const e = new Date(shift.endDate);
        e.setDate(e.getDate() + 1);
        spanHours = Math.max(0, (e - s) / 3600000);
      }
      const sStart = shift.startDate ? new Date(shift.startDate) : null;
      const sEnd = shift.endDate ? new Date(shift.endDate + 'T23:59:59') : null;
      const inRange = (logDate) => !sStart || !sEnd || !logDate || (new Date(logDate) >= sStart && new Date(logDate) <= sEnd);
      const diveH = data.diveLogs.filter(d => inRange(d.date)).reduce((s, d) => s + parseDurToHours(d.duration), 0);
      const standbyH = data.standbyLogs.filter(d => inRange(d.date)).reduce((s, d) => s + parseDurToHours(d.duration), 0);
      shiftDiveH.push(+diveH.toFixed(2));
      shiftStandbyH.push(+standbyH.toFixed(2));
      shiftOtherH.push(+(Math.max(0, spanHours - diveH - standbyH)).toFixed(2));
    });
  } else {
    shiftLabels.push('All Operations');
    shiftDiveH.push(totalDiveHours);
    shiftStandbyH.push(totalStandbyHours);
    shiftOtherH.push(operationalHours);
  }

  const shiftCanvas = document.getElementById('chartShiftPerf');
  if (shiftCanvas) {
    const ctxShift = shiftCanvas.getContext('2d');
    if (chartShiftPerf) chartShiftPerf.destroy();
    chartShiftPerf = new Chart(ctxShift, {
      type: 'bar',
      data: {
        labels: shiftLabels,
        datasets: [
          { label: 'Dive Operations', data: shiftDiveH, backgroundColor: '#459fd9', borderRadius: 6, borderWidth: 0 },
          { label: 'Standby / Delays', data: shiftStandbyH, backgroundColor: '#f59e0b', borderRadius: 6, borderWidth: 0 },
          { label: 'Operational / Other', data: shiftOtherH, backgroundColor: '#374151', borderRadius: 6, borderWidth: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12, boxHeight: 8, padding: 16 } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#f9fafb', bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, padding: 12, cornerRadius: 8,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} hrs` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 }, callback: v => `${v}h` } },
        },
      },
    });
  }

  // ── E. Dive depth profile ─────────────────────────────────────────────
  const depthLabels = data.diveLogs.map(d => d.num || 'DIV');
  const depthValues = data.diveLogs.map(d => { const v = parseFloat(d.depth); return isNaN(v) ? 0 : v; });
  const depthColors = depthValues.map(v => (v > 200 ? '#ef4444' : v > 100 ? '#f39124' : '#06b6d4'));

  const depthCanvas = document.getElementById('chartDiveDepth');
  if (depthCanvas) {
    const ctxDepth = depthCanvas.getContext('2d');
    if (chartDiveDepth) chartDiveDepth.destroy();
    chartDiveDepth = new Chart(ctxDepth, {
      type: 'bar',
      data: {
        labels: depthLabels,
        datasets: [{ label: 'Depth (m)', data: depthValues, backgroundColor: depthColors, borderRadius: 6, borderWidth: 0, barThickness: depthLabels.length > 12 ? undefined : 28 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#f9fafb', bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, padding: 12, cornerRadius: 8,
            callbacks: { label: ctx => `Depth: ${ctx.raw} m` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 45 } },
          y: {
            reverse: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#6b7280', font: { size: 11 }, callback: v => `${v}m` },
            title: { display: true, text: '← Deeper', color: '#4b5563', font: { size: 10 } },
          },
        },
      },
    });
  }

  // ── F. Pre-Op readiness panel (from pushed simulation, if any) ────────
  renderPreOpReadinessPanel();
}

function renderPreOpReadinessPanel() {
  const preOpBody = document.getElementById('preop-readiness-body');
  if (!preOpBody) return;
  const preOpData = state.preOpData;

  if (!preOpData) {
    preOpBody.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:160px;padding:24px;text-align:center;">
        <div style="width:44px;height:44px;border-radius:50%;background:rgba(31,41,55,0.8);display:flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid #374151;">
          <svg width="20" height="20" fill="none" stroke="#4b5563" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </div>
        <p style="font-size:12px;font-weight:600;color:#6b7280;margin:0;">No simulation data</p>
        <p style="font-size:11px;color:#4b5563;margin-top:4px;line-height:1.5;">Run a simulation and push<br>to operation to see readiness here.</p>
      </div>`;
    return;
  }

  const povSensors = preOpData.sensors || [];
  const povROVs = preOpData.rovs || [];
  const sTotal = povSensors.length;
  const sCal = povSensors.filter(s => s.calibrated).length;
  const sTested = povSensors.filter(s => s.tested).length;
  const sReady = povSensors.filter(s => s.calibrated && s.tested && s.model?.trim()).length;
  const sPct = sTotal > 0 ? Math.round((sReady / sTotal) * 100) : 0;
  const sColor = sPct >= 60 ? '#f39124' : '#ef4444';

  const equip = preOpData.equipment || [];
  const eOK = equip.filter(e => (e.status || 'OK') === 'OK').length;
  const eFault = equip.filter(e => e.status === 'FAULT').length;
  const eMissing = equip.filter(e => e.status === 'MISSING').length;
  const eTotal = equip.length;

  const rovChips = povROVs.map(r =>
    `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;${r.role === 'main' ? 'background:rgba(243,145,36,0.15);color:#f39124;border:1px solid rgba(243,145,36,0.3)' : 'background:rgba(55,65,81,0.5);color:#9ca3af;border:1px solid #374151'}">MS-${escapeHtml(String(r.rovNumber))} ${r.role.toUpperCase()}</span>`
  ).join(' ');

  const pushedDate = preOpData.pushedAt
    ? new Date(preOpData.pushedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  preOpBody.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;">
      <div>
        <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">ROVs Deployed</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${rovChips || '<span style="font-size:11px;color:#4b5563">—</span>'}</div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Sensor Readiness</div>
          <span style="font-size:16px;font-weight:800;color:${sColor};letter-spacing:-0.5px;">${sPct}%</span>
        </div>
        <div style="height:5px;background:rgba(55,65,81,0.6);border-radius:9999px;overflow:hidden;margin-bottom:6px;">
          <div style="width:${sPct}%;height:100%;background:${sColor};border-radius:9999px;"></div>
        </div>
        <div style="display:flex;gap:10px;">
          <span style="font-size:10px;color:#f39124;">✓ ${sCal} calibrated</span>
          <span style="font-size:10px;color:#459fd9;">✓ ${sTested} tested</span>
          <span style="font-size:10px;color:#6b7280;">${sTotal} total</span>
        </div>
      </div>
      ${eTotal > 0 ? `
      <div>
        <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Equipment (${eTotal} items)</div>
        <div style="display:flex;gap:6px;">
          <div style="flex:1;text-align:center;background:rgba(243,145,36,0.1);border:1px solid rgba(243,145,36,0.2);border-radius:8px;padding:7px 4px;">
            <div style="font-size:18px;font-weight:800;color:#f39124;line-height:1;">${eOK}</div>
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:2px;">OK</div>
          </div>
          <div style="flex:1;text-align:center;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:7px 4px;">
            <div style="font-size:18px;font-weight:800;color:#f87171;line-height:1;">${eFault}</div>
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:2px;">Fault</div>
          </div>
          <div style="flex:1;text-align:center;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.2);border-radius:8px;padding:7px 4px;">
            <div style="font-size:18px;font-weight:800;color:#facc15;line-height:1;">${eMissing}</div>
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:2px;">Missing</div>
          </div>
        </div>
      </div>` : ''}
      <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;">
        <span style="font-size:10px;color:#4b5563;">Pushed from simulation · ${pushedDate}</span>
      </div>
    </div>`;
}

export function installDashboard() {
  window.renderInfographics = renderInfographics;
}

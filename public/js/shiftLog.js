// Shift log — kept separate from the generic logs.js engine because it has
// real differences from the other 5 logs: crew checkboxes pulled from the
// live Crew roster, a summary strip instead of a table, and it syncs the
// Project Details "current shift" fields (startDate/endDate/weather/...).

import { escapeHtml } from './ui.js';
import { state } from './state.js';
import { ROLE_COLORS_MAP, getInitials } from './projectDetails.js';

const WEATHER_OPTIONS = ['Clear / Sunny', 'Partly Cloudy', 'Overcast', 'Hazy', 'Fog / Mist', 'Light Rain / Drizzle', 'Heavy Rain', 'Thunderstorms', 'Squalls / High Winds'];
const VISIBILITY_OPTIONS = ['Excellent (> 10m)', 'Good (5 - 10m)', 'Moderate (3 - 5m)', 'Poor (1 - 3m)', 'Very Poor (< 1m)', 'No Visibility'];
const WEATHER_ICON = { 'Clear / Sunny': '☀️', 'Partly Cloudy': '⛅', Overcast: '☁️', Hazy: '🌫️', 'Fog / Mist': '🌫️', 'Light Rain / Drizzle': '🌦️', 'Heavy Rain': '🌧️', Thunderstorms: '⛈️', 'Squalls / High Winds': '💨' };

function getCrewRoster() {
  return Array.from(document.querySelectorAll('.crew-row')).map(row => ({
    name: row.querySelector('.crew-name-input')?.value.trim() || '',
    role: row.querySelector('.crew-role-select')?.value || '',
  })).filter(c => c.name);
}

function updateOperationalId() {
  const pCode = document.getElementById('projectCode')?.value.trim();
  const dateVal = document.getElementById('startDate')?.value;
  const opIdInput = document.getElementById('operationalIdAuto');
  if (!opIdInput) return;
  opIdInput.value = (pCode && dateVal) ? `${pCode}-MS-${dateVal.replaceAll('-', '')}` : '';
}

function syncShiftSummaryFields() {
  const shifts = state.currentReportData.shiftLogs || [];
  const starts = shifts.map(s => s.startDate).filter(Boolean).sort();
  const ends = shifts.map(s => s.endDate).filter(Boolean).sort();
  const last = shifts[shifts.length - 1] || {};
  const setH = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setH('startDate', starts[0] || '');
  setH('endDate', ends[ends.length - 1] || '');
  setH('shiftno', last.shiftNo || '');
  setH('weather', last.weather || '');
  setH('visibility', last.visibility || '');
  setH('temperature', last.temperature || '');
  updateOperationalId();
}

export function openShiftModal(index = -1) {
  if (state.currentUserRole === 'reviewer') return;
  const entry = index > -1 ? state.currentReportData.shiftLogs[index] : {};
  const nextNo = index > -1 ? entry.shiftNo : (state.currentReportData.shiftLogs.length + 1);
  const roster = getCrewRoster();
  const selectedCrew = entry.crew || [];

  const opt = (val, cur) => `<option value="${escapeHtml(val)}"${cur === val ? ' selected' : ''}>${escapeHtml(val)}</option>`;
  const crewSection = roster.length === 0
    ? `<p style="color:#6b7280;font-size:0.75rem;font-style:italic;padding:8px 0;">Add crew members in the Crew tab first, then they'll appear here.</p>`
    : roster.map(c => {
      const color = ROLE_COLORS_MAP[c.role] || '#6b7280';
      return `<label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;cursor:pointer;">
        <input type="checkbox" value="${escapeHtml(c.name)}" ${selectedCrew.includes(c.name) ? 'checked' : ''} style="width:15px;height:15px;accent-color:#459fd9;flex-shrink:0;">
        <div style="width:28px;height:28px;border-radius:50%;background:${color}22;color:${color};border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.68rem;flex-shrink:0;">${getInitials(c.name)}</div>
        <span style="font-size:0.82rem;color:#d1d5db;font-weight:500;flex:1;">${escapeHtml(c.name)}</span>
        <span style="font-size:0.68rem;color:${color};font-weight:600;">${escapeHtml(c.role)}</span>
      </label>`;
    }).join('');

  document.getElementById('modal-title').textContent = 'Shift Log Entry';
  document.getElementById('entry-modal').style.display = 'flex';
  document.getElementById('modal-content-area').innerHTML = `
    <div class="grid-2"><div><label class="text-xs text-gray-500">Shift No.</label><input id="m_sh_no" value="${escapeHtml(String(nextNo))}"></div><div></div></div>
    <div class="grid-2">
      <div><label class="text-xs text-gray-500">Start Date</label><input type="date" id="m_sh_start" value="${entry.startDate || ''}"></div>
      <div><label class="text-xs text-gray-500">End Date</label><input type="date" id="m_sh_end" value="${entry.endDate || ''}"></div>
    </div>
    <div class="grid-2">
      <div><label class="text-xs text-gray-500">Weather</label><select id="m_sh_weather"><option value="">— Select —</option>${WEATHER_OPTIONS.map(w => opt(w, entry.weather)).join('')}</select></div>
      <div><label class="text-xs text-gray-500">Visibility</label><select id="m_sh_vis"><option value="">— Select —</option>${VISIBILITY_OPTIONS.map(v => opt(v, entry.visibility)).join('')}</select></div>
    </div>
    <div><label class="text-xs text-gray-500">Temperature (°C)</label><input id="m_sh_temp" value="${escapeHtml(entry.temperature || '')}"></div>
    <div><label class="text-xs text-gray-500">Notes</label><textarea id="m_sh_notes">${escapeHtml(entry.notes || '')}</textarea></div>
    <div>
      <label class="text-xs text-gray-500" style="display:block;margin-bottom:6px;">Crew on this Shift</label>
      <div style="border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:4px;max-height:180px;overflow-y:auto;">${crewSection}</div>
    </div>`;
}

export function saveShiftModal(index) {
  const getV = (id) => document.getElementById(id)?.value ?? '';
  const checked = document.querySelectorAll('#modal-content-area input[type=checkbox]:checked');
  const newEntry = {
    shiftNo: getV('m_sh_no'), startDate: getV('m_sh_start'), endDate: getV('m_sh_end'),
    weather: getV('m_sh_weather'), visibility: getV('m_sh_vis'), temperature: getV('m_sh_temp'),
    notes: getV('m_sh_notes'), crew: Array.from(checked).map(cb => cb.value),
  };
  if (index === -1) state.currentReportData.shiftLogs.push(newEntry);
  else state.currentReportData.shiftLogs[index] = newEntry;
  state.isDirty = true;
  renderShiftLog();
}

export function removeShift(i) {
  if (state.currentUserRole === 'reviewer') return;
  state.currentReportData.shiftLogs.splice(i, 1);
  state.isDirty = true;
  renderShiftLog();
}

export function renderShiftLog() {
  const container = document.getElementById('shift-log-container');
  if (!container) return;
  const shifts = state.currentReportData.shiftLogs || [];
  if (shifts.length === 0) {
    container.innerHTML = `<p style="color:#4b5563;font-style:italic;text-align:center;padding:24px 0;font-size:0.875rem;">No shifts recorded yet. Click "+ Add Shift" to begin.</p>`;
    syncShiftSummaryFields();
    return;
  }

  const totalDays = shifts.reduce((sum, s) => {
    if (s.startDate && s.endDate) return sum + Math.max(0, (new Date(s.endDate) - new Date(s.startDate)) / 86400000) + 1;
    return sum;
  }, 0);

  container.innerHTML = `
    <div style="display:flex;gap:20px;margin-bottom:14px;padding:10px 14px;background:rgba(0,0,0,0.2);border-radius:10px;border:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:0.75rem;color:#6b7280;">Total Shifts: <strong style="color:#f9fafb;">${shifts.length}</strong></span>
      <span style="font-size:0.75rem;color:#6b7280;">Total Days Logged: <strong style="color:#f9fafb;">${totalDays}</strong></span>
      <span style="font-size:0.75rem;color:#6b7280;">Period: <strong style="color:#f9fafb;">${shifts[0]?.startDate || '—'} → ${shifts[shifts.length - 1]?.endDate || '—'}</strong></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;" id="shift-rows"></div>`;

  const rows = document.getElementById('shift-rows');
  const roster = getCrewRoster();
  shifts.forEach((sh, i) => {
    const dayCount = (sh.startDate && sh.endDate) ? Math.max(0, Math.round((new Date(sh.endDate) - new Date(sh.startDate)) / 86400000) + 1) : null;
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:14px;padding:14px 16px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.05);border-radius:12px;';
    row.innerHTML = `
      <div style="text-align:center;background:rgba(69,159,217,0.12);border:1px solid rgba(69,159,217,0.2);border-radius:10px;padding:8px 4px;">
        <div style="font-size:0.65rem;color:#459fd9;font-weight:700;text-transform:uppercase;">Shift</div>
        <div style="font-size:1.4rem;font-weight:800;color:#f9fafb;line-height:1.1;">${escapeHtml(String(sh.shiftNo))}</div>
        ${dayCount !== null ? `<div style="font-size:0.6rem;color:#6b7280;margin-top:2px;">${dayCount}d</div>` : ''}
      </div>
      <div>
        <div style="font-weight:600;color:#f9fafb;font-size:0.875rem;margin-bottom:4px;">${escapeHtml(sh.startDate || '—')} → ${escapeHtml(sh.endDate || '—')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${sh.weather ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,0.06);color:#9ca3af;">${WEATHER_ICON[sh.weather] || '🌡️'} ${escapeHtml(sh.weather)}</span>` : ''}
          ${sh.visibility ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,0.06);color:#9ca3af;">👁 ${escapeHtml(sh.visibility)}</span>` : ''}
          ${sh.temperature ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,0.06);color:#9ca3af;">🌡 ${escapeHtml(sh.temperature)}°C</span>` : ''}
        </div>
        ${sh.crew?.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${sh.crew.map(n => { const r = roster.find(c => c.name === n); const col = ROLE_COLORS_MAP[r?.role] || '#6b7280'; return `<span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:20px;background:${col}18;color:${col};border:1px solid ${col}33;">${escapeHtml(n)}</span>`; }).join('')}</div>` : ''}
        ${sh.notes ? `<div style="font-size:0.72rem;color:#6b7280;margin-top:4px;font-style:italic;">${escapeHtml(sh.notes.substring(0, 80))}${sh.notes.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;">
        <button type="button" class="shift-edit-btn" style="font-size:0.72rem;font-weight:600;color:#60a5fa;cursor:pointer;padding:5px 10px;border-radius:6px;background:transparent;border:none;">Edit</button>
        <button type="button" class="shift-del-btn" style="font-size:0.72rem;font-weight:600;color:#f87171;cursor:pointer;padding:5px 10px;border-radius:6px;background:transparent;border:none;">Del</button>
      </div>`;
    row.querySelector('.shift-edit-btn').addEventListener('click', () => openShiftModal(i));
    row.querySelector('.shift-del-btn').addEventListener('click', () => removeShift(i));
    rows.appendChild(row);
  });

  syncShiftSummaryFields();
}

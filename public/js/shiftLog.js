// Shift log — kept separate from the generic logs.js engine because it has
// real differences from the other 5 logs: crew checkboxes pulled from the
// live Crew roster, a summary strip instead of a table, and it syncs the
// Project Details "current shift" fields (startDate/endDate/weather/...).
//
// Shifts run by hours, not calendar days (feedback point 12): each entry has
// a start and end date AND time, and its duration is worked out from them.
// A standard shift is SHIFT_HOURS long; the end time is filled in from the
// start time, and can still be changed.

import { escapeHtml, showToast } from './ui.js';
import { state } from './state.js';
import { ROLE_COLORS_MAP, getInitials } from './projectDetails.js';
import { renderInfographics } from './dashboard.js';
import { getCrewRoster } from './crewRoster.js';

export const SHIFT_HOURS = 12;

const WEATHER_OPTIONS = ['Clear / Sunny', 'Partly Cloudy', 'Overcast', 'Hazy', 'Fog / Mist', 'Light Rain / Drizzle', 'Heavy Rain', 'Thunderstorms', 'Squalls / High Winds'];
const VISIBILITY_OPTIONS = ['Excellent (> 10m)', 'Good (5 - 10m)', 'Moderate (3 - 5m)', 'Poor (1 - 3m)', 'Very Poor (< 1m)', 'No Visibility'];
const WEATHER_ICON = { 'Clear / Sunny': '☀️', 'Partly Cloudy': '⛅', Overcast: '☁️', Hazy: '🌫️', 'Fog / Mist': '🌫️', 'Light Rain / Drizzle': '🌦️', 'Heavy Rain': '🌧️', Thunderstorms: '⛈️', 'Squalls / High Winds': '💨' };

const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Hours between a shift's start and end. Null when either time is missing
// (entries saved before shifts recorded times) or the end is not after the start.
export function shiftDurationHours(sh) {
  if (!sh.startDate || !sh.startTime || !sh.endDate || !sh.endTime) return null;
  const hours = (new Date(`${sh.endDate}T${sh.endTime}`) - new Date(`${sh.startDate}T${sh.startTime}`)) / 3600000;
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

// Start + SHIFT_HOURS, as the date and time strings the inputs use.
function standardEndFrom(date, time) {
  const d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(d.getHours() + SHIFT_HOURS);
  return { date: fmtDate(d), time: fmtTime(d) };
}

function formatHours(hours) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function updateOperationalId() {
  const pCode = state.currentProjectCode;
  const dateVal = document.getElementById('startDate')?.value;
  const opIdInput = document.getElementById('operationalIdAuto');
  if (!opIdInput) return;
  opIdInput.value = (pCode && dateVal) ? `${pCode}-MS-${dateVal.replaceAll('-', '')}` : '';
}

function syncShiftSummaryFields() {
  const shifts = state.currentReportData.shiftLogs || [];
  // Earliest start and latest end across all shifts (date and time as one string, so they sort correctly).
  const starts = shifts.filter(s => s.startDate).map(s => `${s.startDate}T${s.startTime || '00:00'}`).sort();
  const ends = shifts.filter(s => s.endDate).map(s => `${s.endDate}T${s.endTime || '00:00'}`).sort();
  const last = shifts[shifts.length - 1] || {};
  const setH = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setH('startDate', starts[0]?.slice(0, 10) || '');
  setH('endDate', ends[ends.length - 1]?.slice(0, 10) || '');
  setH('shiftno', last.shiftNo || '');
  setH('weather', last.weather || '');
  setH('visibility', last.visibility || '');
  setH('temperature', last.temperature || '');
  updateOperationalId();
}

// The shift being edited (-1 for a new one). Set here, not passed in from logs.js:
// the Edit button opens this dialog directly, so logs.js never sees the index.
let editingIndex = -1;

export function openShiftModal(index = -1) {
  if (state.currentUserRole === 'reviewer') return;
  editingIndex = index;
  const shifts = state.currentReportData.shiftLogs || [];
  const entry = index > -1 ? shifts[index] : {};
  const nextNo = index > -1 ? entry.shiftNo : (shifts.length + 1);
  const roster = getCrewRoster();
  const selectedCrew = entry.crew || [];

  // A new shift starts where the last one ended, so shifts run back to back.
  const previous = index === -1 ? shifts[shifts.length - 1] : null;
  const startDate = entry.startDate ?? previous?.endDate ?? '';
  const startTime = entry.startTime ?? previous?.endTime ?? '';
  const endDate = entry.endDate ?? (startDate && startTime ? standardEndFrom(startDate, startTime)?.date : '') ?? '';
  const endTime = entry.endTime ?? (startDate && startTime ? standardEndFrom(startDate, startTime)?.time : '') ?? '';

  const opt = (val, cur) => `<option value="${escapeHtml(val)}"${cur === val ? ' selected' : ''}>${escapeHtml(val)}</option>`;
  const crewSection = roster.length === 0
    ? `<p style="color:#6C88A6;font-size:0.75rem;font-style:italic;padding:8px 0;">Add crew members in the Crew tab first, then they'll appear here.</p>`
    : roster.map(c => {
      const color = ROLE_COLORS_MAP[c.role] || '#6C88A6';
      return `<label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;cursor:pointer;">
        <input type="checkbox" value="${escapeHtml(c.name)}" ${selectedCrew.includes(c.name) ? 'checked' : ''} style="width:15px;height:15px;accent-color:#459fd9;flex-shrink:0;">
        <div style="width:28px;height:28px;border-radius:50%;background:${color}22;color:${color};border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.68rem;flex-shrink:0;">${getInitials(c.name)}</div>
        <span style="font-size:0.82rem;color:#D3DAE3;font-weight:500;flex:1;">${escapeHtml(c.name)}</span>
        <span style="font-size:0.68rem;color:${color};font-weight:600;">${escapeHtml(c.role)}</span>
      </label>`;
    }).join('');

  document.getElementById('modal-title').textContent = 'Shift Log Entry';
  document.getElementById('entry-modal').style.display = 'flex';
  document.getElementById('modal-content-area').innerHTML = `
    <div class="grid-2"><div><label class="text-xs font-semibold" style="color:#9AB0C8">Shift No.</label><input id="m_sh_no" value="${escapeHtml(String(nextNo))}"></div><div></div></div>
    <div class="grid-2">
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">Start Date</label><input type="date" id="m_sh_start" value="${escapeHtml(startDate)}"></div>
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">Start Time</label><input type="time" id="m_sh_start_time" value="${escapeHtml(startTime)}"></div>
    </div>
    <div class="grid-2">
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">End Date</label><input type="date" id="m_sh_end" value="${escapeHtml(endDate)}"></div>
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">End Time</label><input type="time" id="m_sh_end_time" value="${escapeHtml(endTime)}"></div>
    </div>
    <p id="m_sh_duration" style="font-size:0.75rem;color:#9AB0C8;margin:-4px 0 8px;"></p>
    <div class="grid-2">
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">Weather</label><select id="m_sh_weather"><option value="">— Select —</option>${WEATHER_OPTIONS.map(w => opt(w, entry.weather)).join('')}</select></div>
      <div><label class="text-xs font-semibold" style="color:#9AB0C8">Visibility</label><select id="m_sh_vis"><option value="">— Select —</option>${VISIBILITY_OPTIONS.map(v => opt(v, entry.visibility)).join('')}</select></div>
    </div>
    <div><label class="text-xs font-semibold" style="color:#9AB0C8">Temperature (°C)</label><input id="m_sh_temp" value="${escapeHtml(entry.temperature || '')}"></div>
    <div><label class="text-xs font-semibold" style="color:#9AB0C8">Notes</label><textarea id="m_sh_notes">${escapeHtml(entry.notes || '')}</textarea></div>
    <div>
      <label class="text-xs font-semibold" style="color:#9AB0C8;display:block;margin-bottom:6px;">Crew on this Shift</label>
      <div style="border:1px solid rgba(120,166,212,0.12);border-radius:10px;padding:4px;max-height:180px;overflow-y:auto;">${crewSection}</div>
    </div>`;

  // Changing the start moves the end to start + SHIFT_HOURS; the end can still be edited by hand.
  const startDateEl = document.getElementById('m_sh_start');
  const startTimeEl = document.getElementById('m_sh_start_time');
  const endDateEl = document.getElementById('m_sh_end');
  const endTimeEl = document.getElementById('m_sh_end_time');
  const showDuration = () => {
    const hours = shiftDurationHours({ startDate: startDateEl.value, startTime: startTimeEl.value, endDate: endDateEl.value, endTime: endTimeEl.value });
    const el = document.getElementById('m_sh_duration');
    if (!el) return;
    if (hours === null) el.textContent = '';
    else if (hours === SHIFT_HOURS) el.textContent = `Duration: ${SHIFT_HOURS} h`;
    else el.textContent = `Duration: ${formatHours(hours)} h (standard shift is ${SHIFT_HOURS} h)`;
  };
  const onStartChanged = () => {
    const end = startDateEl.value && startTimeEl.value ? standardEndFrom(startDateEl.value, startTimeEl.value) : null;
    if (end) { endDateEl.value = end.date; endTimeEl.value = end.time; }
    showDuration();
  };
  startDateEl.addEventListener('change', onStartChanged);
  startTimeEl.addEventListener('change', onStartChanged);
  endDateEl.addEventListener('change', showDuration);
  endTimeEl.addEventListener('change', showDuration);
  showDuration();
}

export function saveShiftModal() {
  const getV = (id) => document.getElementById(id)?.value ?? '';
  const checked = document.querySelectorAll('#modal-content-area input[type=checkbox]:checked');
  const times = {
    startDate: getV('m_sh_start'), startTime: getV('m_sh_start_time'),
    endDate: getV('m_sh_end'), endTime: getV('m_sh_end_time'),
  };
  if (!times.startDate || !times.startTime) { showToast('Enter the shift start date and time.', 'warn'); return false; }
  const hours = shiftDurationHours(times);
  if (hours === null) { showToast('The shift end must be after its start (enter the end date and time).', 'warn'); return false; }

  const newEntry = {
    shiftNo: getV('m_sh_no'), ...times, durationHours: hours,
    weather: getV('m_sh_weather'), visibility: getV('m_sh_vis'), temperature: getV('m_sh_temp'),
    notes: getV('m_sh_notes'), crew: Array.from(checked).map(cb => cb.value),
  };
  const shifts = state.currentReportData.shiftLogs;
  if (editingIndex === -1 || editingIndex >= shifts.length) shifts.push(newEntry);
  else shifts[editingIndex] = newEntry;
  editingIndex = -1;
  state.isDirty = true;
  renderShiftLog();
  renderInfographics();
  return true;
}

export function removeShift(i) {
  if (state.currentUserRole === 'reviewer') return;
  state.currentReportData.shiftLogs.splice(i, 1);
  state.isDirty = true;
  renderShiftLog();
  renderInfographics();
}

// "2026-10-05 18:00" for a shift edge; the time is left out for older entries that have none.
function edgeLabel(date, time) {
  if (!date) return '—';
  return time ? `${date} ${time}` : date;
}

export function renderShiftLog() {
  const container = document.getElementById('shift-log-container');
  if (!container) return;
  const shifts = state.currentReportData.shiftLogs || [];
  if (shifts.length === 0) {
    container.innerHTML = `<p style="color:#6C88A6;font-style:italic;text-align:center;padding:24px 0;font-size:0.875rem;">No shifts recorded yet. Click "+ Add Shift" to begin.</p>`;
    syncShiftSummaryFields();
    return;
  }

  const totalHours = shifts.reduce((sum, s) => sum + (shiftDurationHours(s) ?? 0), 0);
  const first = shifts[0];
  const last = shifts[shifts.length - 1];

  container.innerHTML = `
    <div style="display:flex;gap:20px;margin-bottom:14px;padding:10px 14px;background:rgba(16,27,44,0.5);border-radius:10px;border:1px solid rgba(120,166,212,0.16);">
      <span style="font-size:0.75rem;color:#6C88A6;">Total Shifts: <strong style="color:#D3DAE3;">${shifts.length}</strong></span>
      <span style="font-size:0.75rem;color:#6C88A6;">Total Hours Logged: <strong style="color:#D3DAE3;">${formatHours(totalHours)}</strong></span>
      <span style="font-size:0.75rem;color:#6C88A6;">Period: <strong style="color:#D3DAE3;">${escapeHtml(edgeLabel(first.startDate, first.startTime))} → ${escapeHtml(edgeLabel(last.endDate, last.endTime))}</strong></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;" id="shift-rows"></div>`;

  const rows = document.getElementById('shift-rows');
  const roster = getCrewRoster();
  shifts.forEach((sh, i) => {
    const hours = shiftDurationHours(sh);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:14px;padding:14px 16px;background:rgba(16,27,44,0.5);border:1px solid rgba(120,166,212,0.16);border-radius:12px;';
    row.innerHTML = `
      <div style="text-align:center;background:rgba(69,159,217,0.12);border:1px solid rgba(69,159,217,0.2);border-radius:10px;padding:8px 4px;">
        <div style="font-size:0.65rem;color:#459fd9;font-weight:700;text-transform:uppercase;">Shift</div>
        <div style="font-size:1.4rem;font-weight:800;color:#D3DAE3;line-height:1.1;">${escapeHtml(String(sh.shiftNo))}</div>
        ${hours !== null ? `<div style="font-size:0.6rem;color:#6C88A6;margin-top:2px;">${formatHours(hours)}h</div>` : ''}
      </div>
      <div>
        <div style="font-weight:600;color:#D3DAE3;font-size:0.875rem;margin-bottom:4px;">${escapeHtml(edgeLabel(sh.startDate, sh.startTime))} → ${escapeHtml(edgeLabel(sh.endDate, sh.endTime))}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${sh.weather ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(120,166,212,0.12);color:#9AB0C8;">${WEATHER_ICON[sh.weather] || '🌡️'} ${escapeHtml(sh.weather)}</span>` : ''}
          ${sh.visibility ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(120,166,212,0.12);color:#9AB0C8;">👁 ${escapeHtml(sh.visibility)}</span>` : ''}
          ${sh.temperature ? `<span style="font-size:0.68rem;padding:2px 8px;border-radius:20px;background:rgba(120,166,212,0.12);color:#9AB0C8;">🌡 ${escapeHtml(sh.temperature)}°C</span>` : ''}
        </div>
        ${sh.crew?.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${sh.crew.map(n => { const r = roster.find(c => c.name === n); const col = ROLE_COLORS_MAP[r?.role] || '#6C88A6'; return `<span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:20px;background:${col}18;color:${col};border:1px solid ${col}33;">${escapeHtml(n)}</span>`; }).join('')}</div>` : ''}
        ${sh.notes ? `<div style="font-size:0.72rem;color:#6C88A6;margin-top:4px;font-style:italic;">${escapeHtml(sh.notes.substring(0, 80))}${sh.notes.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;">
        <button type="button" class="shift-edit-btn" style="font-size:0.72rem;font-weight:600;color:#459fd9;cursor:pointer;padding:5px 10px;border-radius:6px;background:transparent;border:none;">Edit</button>
        <button type="button" class="shift-del-btn" style="font-size:0.72rem;font-weight:600;color:#f87171;cursor:pointer;padding:5px 10px;border-radius:6px;background:transparent;border:none;">Del</button>
      </div>`;
    row.querySelector('.shift-edit-btn').addEventListener('click', () => openShiftModal(i));
    row.querySelector('.shift-del-btn').addEventListener('click', () => removeShift(i));
    rows.appendChild(row);
  });

  syncShiftSummaryFields();
}

// Crew roster editor. The roster lives in state.crewRoster, is saved and loaded
// with the Operation project (projectData.js), and is read by the Shift Log.
// The editor is shown inside Project Management, so the roster is set up in
// one place. Edits change state directly, so closing the modal never loses them.

import { state } from './state.js';
import { escapeHtml } from './ui.js';
import { ROLE_COLORS_MAP, getInitials, CREW_ROLES } from './projectDetails.js';

const INPUT_STYLE = 'background:#0C1727;border:1px solid rgba(120,166,212,0.16);color:#D3DAE3;padding:0 10px;border-radius:8px;width:100%;outline:none;height:36px;font-size:0.82rem;';
const ROW_STYLE = 'display:grid;grid-template-columns:52px 1fr 1fr 110px 130px 130px 44px;gap:8px;align-items:center;padding:8px;border-radius:10px;margin-bottom:4px;background:rgba(16,27,44,0.5);border:1px solid rgba(120,166,212,0.12);';
const HEADER_LABEL = 'font-size:0.65rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;';

function newMember() {
  return { name: '', role: 'ROV Supervisor', shift: 'Day', signOn: '', signOff: '' };
}

// Roster for the Shift Log's crew checkboxes: named members only.
export function getCrewRoster() {
  return state.crewRoster
    .map(c => ({ name: (c.name || '').trim(), role: c.role || '' }))
    .filter(c => c.name);
}

function avatarStyle(role) {
  const color = ROLE_COLORS_MAP[role] || '#6b7280';
  return { color, css: `width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;background:${color}22;color:${color};border:1px solid ${color}55;flex-shrink:0;` };
}

function buildRow(member, index, readOnly, redraw) {
  const row = document.createElement('div');
  row.className = 'crew-row';
  row.style.cssText = ROW_STYLE;

  const isCustom = member.shift !== 'Day' && member.shift !== 'Night' && member.shift !== '';
  const { css } = avatarStyle(member.role);
  const disabled = readOnly ? 'disabled' : '';

  row.innerHTML = `
    <div style="display:flex;justify-content:center;">
      <div class="crew-avatar" style="${css}"><span class="crew-avatar-text">${escapeHtml(member.name ? getInitials(member.name) : '?')}</span></div>
    </div>
    <div><input type="text" class="crew-name-input" style="${INPUT_STYLE}" placeholder="Full Name..." value="${escapeHtml(member.name)}" ${disabled}></div>
    <div><select class="crew-role-select" style="${INPUT_STYLE}cursor:pointer;" ${disabled}>
      ${CREW_ROLES.map(r => `<option value="${escapeHtml(r)}" ${r === member.role ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
    </select></div>
    <div>
      <select class="crew-shift-select" style="${INPUT_STYLE}cursor:pointer;${isCustom ? 'display:none;' : ''}" ${disabled}>
        <option value="Day" ${!isCustom && member.shift !== 'Night' ? 'selected' : ''}>Day</option>
        <option value="Night" ${!isCustom && member.shift === 'Night' ? 'selected' : ''}>Night</option>
        <option value="Custom" ${isCustom ? 'selected' : ''}>Custom...</option>
      </select>
      <input type="text" class="crew-shift-input" style="${INPUT_STYLE}${isCustom ? '' : 'display:none;'}" placeholder="Shift type..." value="${isCustom ? escapeHtml(member.shift) : ''}" ${disabled}>
    </div>
    <div><input type="date" class="crew-signon-input" style="${INPUT_STYLE}color:#6C88A6;" value="${escapeHtml(member.signOn)}" ${disabled}></div>
    <div><input type="date" class="crew-signoff-input" style="${INPUT_STYLE}color:#6C88A6;" value="${escapeHtml(member.signOff)}" ${disabled}></div>
    <div style="display:flex;justify-content:center;">
      ${readOnly ? '' : `<button type="button" class="crew-remove-btn" style="background:rgba(239,68,68,0.1);border:none;width:32px;height:32px;border-radius:8px;color:#ef4444;cursor:pointer;font-size:1rem;">✕</button>`}
    </div>`;

  if (readOnly) return row;

  const q = (sel) => row.querySelector(sel);
  const changed = () => { state.isDirty = true; };

  q('.crew-name-input').addEventListener('input', (e) => {
    member.name = e.target.value;
    q('.crew-avatar-text').textContent = member.name ? getInitials(member.name) : '?';
    changed();
  });

  q('.crew-role-select').addEventListener('change', (e) => {
    member.role = e.target.value;
    const { color, css: avatarCss } = avatarStyle(member.role);
    const avatar = q('.crew-avatar');
    avatar.style.cssText = avatarCss;
    avatar.style.color = color;
    changed();
  });

  const shiftSelect = q('.crew-shift-select');
  const shiftInput = q('.crew-shift-input');
  shiftSelect.addEventListener('change', () => {
    const custom = shiftSelect.value === 'Custom';
    shiftSelect.style.display = custom ? 'none' : '';
    shiftInput.style.display = custom ? '' : 'none';
    member.shift = custom ? shiftInput.value : shiftSelect.value;
    if (custom) shiftInput.focus();
    changed();
  });
  shiftInput.addEventListener('input', () => { member.shift = shiftInput.value; changed(); });

  q('.crew-signon-input').addEventListener('change', (e) => { member.signOn = e.target.value; changed(); });
  q('.crew-signoff-input').addEventListener('change', (e) => { member.signOff = e.target.value; changed(); });

  q('.crew-remove-btn').addEventListener('click', () => {
    state.crewRoster.splice(index, 1);
    changed();
    redraw();
  });

  return row;
}

// Builds the Crew Roster card inside `container`.
export function renderCrewEditor(container) {
  container.innerHTML = '';
  const readOnly = state.currentUserRole === 'reviewer';

  const card = document.createElement('div');
  card.className = 'rcard';
  card.innerHTML = `
    <div class="flex items-center gap-3 px-6 py-3.5 border-b rcard-head">
      <span class="rcard-bar"></span>
      <span class="rcard-title">Crew Roster</span>
    </div>
    <div class="p-5" style="background:rgba(17,24,39,0.45);">
      <div class="grid gap-2 mb-2" style="grid-template-columns:52px 1fr 1fr 110px 130px 130px 44px;padding:0 8px;">
        <div></div>
        <div style="${HEADER_LABEL}">Name</div>
        <div style="${HEADER_LABEL}">Role</div>
        <div style="${HEADER_LABEL}">Shift</div>
        <div style="${HEADER_LABEL}">Sign On</div>
        <div style="${HEADER_LABEL}">Sign Off</div>
        <div></div>
      </div>
      <div class="crew-list"></div>
    </div>`;

  const list = card.querySelector('.crew-list');
  const draw = () => {
    list.innerHTML = '';
    if (state.crewRoster.length === 0) {
      list.innerHTML = `<p style="padding:20px;text-align:center;color:#4b5563;font-style:italic;font-size:0.875rem;">No crew members added yet.</p>`;
      return;
    }
    state.crewRoster.forEach((member, i) => list.appendChild(buildRow(member, i, readOnly, draw)));
  };

  if (!readOnly) {
    const head = card.querySelector('.rcard-head');
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '+ Add Member';
    add.className = 'ml-auto text-xs font-bold px-3 py-1.5 rounded-lg';
    add.style.cssText = 'background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.2);';
    add.addEventListener('click', () => {
      state.crewRoster.push(newMember());
      state.isDirty = true;
      draw();
    });
    head.appendChild(add);
  }

  draw();
  container.appendChild(card);
}

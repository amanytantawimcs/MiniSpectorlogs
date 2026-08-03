// Small shared DOM helpers used across modules.

export function showToast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(host);
  }
  const colors = {
    success: '#22c55e',
    error:   '#f87171',
    warn:    '#f39124',
    info:    '#459fd9',
  };
  const accent = colors[type] || colors.info;
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `background:#101B2C;border:1px solid rgba(120,166,212,0.16);border-left:3px solid ${accent};color:#E9F0F8;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:500;box-shadow:0 18px 40px -24px rgba(0,0,0,0.9);pointer-events:auto;`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function notImplemented(feature) {
  showToast(`${feature} — coming in a later update.`, 'info');
}

// Shown at the top of Sensors/Topology once a simulation has been pushed to
// Operation (simState.locked) — those tabs stay editable, but Pre-Op/Final
// Setup are a snapshot taken at push time, so further edits here won't show
// up anywhere until the simulation is pushed again.
export function renderLockedNotice() {
  const div = document.createElement('div');
  div.className = 'mb-5 flex items-center gap-3 px-4 py-3 rounded-xl';
  div.style.cssText = 'background:rgba(243,145,36,0.08);border:1px solid rgba(243,145,36,0.25);';
  div.innerHTML = `<span style="font-size:16px;line-height:1">⚠</span>
    <span class="text-xs" style="color:#f39124">This simulation has already been pushed to Operation. Edits made here won't appear in Pre-Op or Final Setup until you push again.</span>`;
  return div;
}

// Shown when a background staleness poll (staleCheck.js) detects the server
// has a newer save than what this tab last knew about — e.g. a second
// "office" device saved while this "vessel" tab was mid-edit. Deliberately a
// manual reload, not an automatic one: auto-reloading would blow away
// whatever the user is mid-typing here.
let staleBannerShown = false;
export function showStaleDataBanner() {
  if (staleBannerShown) return;
  staleBannerShown = true;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 16px;background:#f39124;color:#0A111C;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
  div.innerHTML = `<span>⚠ Someone else saved changes to this project. Your view may be out of date.</span>
    <button type="button" style="padding:4px 14px;border-radius:6px;background:#0A111C;color:#f39124;font-weight:700;font-size:12px;border:none;cursor:pointer;">Reload</button>`;
  div.querySelector('button').addEventListener('click', () => window.location.reload());
  document.body.appendChild(div);
}

// Toggles the active nav item within `scopeSelector` and keeps aria-current
// in sync with the visual `.active` class so they can never disagree.
export function setActiveNavItem(el, scopeSelector = '.nav-item') {
  document.querySelectorAll(scopeSelector).forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-current', 'page');
  }
}

// Sidebar user card (name + avatar initials + role). The avatar/role are
// only visible in Simulation mode CSS; safe to call from Operation mode too.
export function setUserCardName(name) {
  const nameEl = document.getElementById('display-user-id');
  if (nameEl) nameEl.innerText = name;
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    const initials = String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    avatarEl.textContent = initials || '?';
  }
}

export function setUserCardRole(role) {
  const roleEl = document.getElementById('display-user-role');
  if (!roleEl) return;
  const labels = { operator: 'Operator', viewer: 'Viewer', approver: 'Approver', member: 'Member' };
  roleEl.textContent = labels[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');
}

// Shared section-card frame — used by finalSetup.js and preOp.js, which
// both built their own near-identical version of this before the reskin.
// `body` may be an HTML string or a DOM node; `padded` adds card padding
// (for free-form content) vs edge-to-edge (for tables, which scroll inside
// the card themselves). `collapsed: true` renders the card as a native
// <details>/<summary> disclosure, closed by default — no JS wiring needed
// for the toggle, which matters because preOp.js's sectionWrap() serializes
// this to a string via .outerHTML and reinserts it with innerHTML; any
// addEventListener-based toggle would be silently dropped in that round-trip.
// `startOpen` overrides the default closed state (e.g. finalSetup.js
// re-renders its whole tab on every checkbox click, so it reads back
// whether the card was open before the rebuild and passes that in here —
// otherwise expanding a table to work through it would snap shut on the
// very first checkbox ticked). `id` lets a caller find a specific card
// again after a rebuild to read its .open state back.
export function renderSectionCard(dotColor, title, subtitle, body, { padded = false, collapsed = false, startOpen = false, id = null } = {}) {
  const wrap = document.createElement(collapsed ? 'details' : 'div');
  wrap.className = 'rcard mb-4';
  if (id) wrap.id = id;
  if (collapsed && startOpen) wrap.open = true;
  const header = document.createElement(collapsed ? 'summary' : 'div');
  header.className = 'flex items-center gap-2.5 px-5 py-3 border-b rcard-head';
  header.innerHTML = `<span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}80;"></span><span class="text-xs font-bold uppercase tracking-wider flex-1" style="color:#E9F0F8">${title}</span><span class="text-[10px]" style="color:#6C88A6">${subtitle}</span>${collapsed ? '<i class="ti ti-chevron-down section-collapse-chevron" aria-hidden="true"></i>' : ''}`;
  wrap.appendChild(header);
  const bodyWrap = document.createElement('div');
  bodyWrap.className = padded ? 'p-4' : '';
  if (!padded) bodyWrap.style.overflowX = 'auto';
  if (typeof body === 'string') bodyWrap.innerHTML = body;
  else if (body instanceof Node) bodyWrap.appendChild(body);
  wrap.appendChild(bodyWrap);
  return wrap;
}

export function calBadge(ok) {
  return ok
    ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3)">✓ CAL</span>`
    : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">✗ CAL</span>`;
}
export function tstBadge(ok) {
  return ok
    ? `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(69,159,217,0.12);color:#459fd9;border:1px solid rgba(69,159,217,0.3)">✓ TST</span>`
    : `<span style="padding:2px 8px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">✗ TST</span>`;
}
export function rdyBadge(ok) {
  return ok
    ? `<span style="padding:2px 10px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(243,145,36,0.12);color:#f39124;border:1px solid rgba(243,145,36,0.3)">READY</span>`
    : `<span style="padding:2px 10px;border-radius:5px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3)">CHECK</span>`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Final Setup tab — field confirmation of the pushed simulation plan.
//
// Structure of this file:
//   1. MODEL      normalise + reconcile state.preOpData into state.currentReportData.finalSetup
//   2. SELECTORS  pure functions deriving progress / blockers / conflicts. No DOM.
//   3. STYLE      one injected stylesheet, `mfs-` prefixed so it can't collide with Tailwind
//   4. VIEW       shell built once, then patched. Nothing here rebuilds the whole tab.
//   5. ACTIONS    lock / change / commit, with a real value diff written to the audit trail
//
// Two rules the old version broke, worth keeping:
//   - A checkbox click must never re-render the tab. It threw the operator back to the
//     top of a 47-row page every time they ticked something.
//   - `lockedAt` is the moment of first confirmation and is never rewritten. Later
//     confirmations live in `revisions`.

import { escapeHtml, showToast, calBadge, tstBadge } from './ui.js';
import { state } from './state.js';

/* ==========================================================================
   1. MODEL
   ========================================================================== */

const sensorKey = s => `${s._type}:${s.rovNum ?? '-'}:${s.name}`;
const deviceKey = d => `${d.category ?? '-'}:${d.name}`;
const thrusterKey = t => `${t.number ?? '-'}:${t.serial ?? '-'}`;

function blankSensor(s) {
  return { ...s, confirmed: false, flagged: false, opNote: '' };
}

/**
 * Build finalSetup from preOpData, or reconcile an existing one against a
 * re-push from Simulation. Confirmations survive the merge; items that left
 * the plan are dropped; items that joined arrive unconfirmed.
 */
function ensureFinalSetup() {
  const preOp = state.preOpData;
  const existing = state.currentReportData.finalSetup;

  const incomingSensors = [
    ...Object.entries(preOp.rovSensors || {}).flatMap(([num, arr]) =>
      (arr || []).map(s => ({ ...s, rovNum: parseInt(num, 10), _type: 'fixed' }))),
    ...(preOp.sensors || []).map(s => ({ ...s, _type: 'mission' })),
  ];
  const incomingThrusters = (preOp.thrusters || []).map(t => ({ ...t, position: '' }));
  const incomingDevices = (preOp.systemIPs || []).map(d => ({ ...d }));

  if (!existing?._initialized) {
    // Note: sensors start UNCONFIRMED even when the plan says calibrated + tested.
    // Cal/test status is a hint from the workshop; this tab records that a human
    // physically laid eyes on the item on deck. Pre-ticking defeats the point.
    state.currentReportData.finalSetup = {
      _initialized: true,
      _version: 2,
      activeROVNum: preOp.rovs?.find(r => r.role === 'main')?.rovNumber ?? preOp.rovs?.[0]?.rovNumber ?? null,
      sensors: incomingSensors.map(blankSensor),
      thrusters: incomingThrusters.map(t => ({ ...t, confirmed: false, flagged: false, opNote: '' })),
      systemIPs: incomingDevices,
      notes: '',
      lockedAt: null,
      lockedBy: null,
      reconfirmedAt: null,
      revisions: [],
      _pending: null,
      _merge: null,
    };
    return state.currentReportData.finalSetup;
  }

  // ---- reconcile ----
  const fs = existing;
  const added = [], removed = [];

  const byKey = new Map(fs.sensors.map(s => [sensorKey(s), s]));
  fs.sensors = incomingSensors.map(inc => {
    const prev = byKey.get(sensorKey(inc));
    if (prev) { byKey.delete(sensorKey(inc)); return { ...inc, confirmed: prev.confirmed, flagged: prev.flagged, opNote: prev.opNote }; }
    added.push(inc.name); return blankSensor(inc);
  });
  byKey.forEach(s => removed.push(s.name));

  const thrByKey = new Map(fs.thrusters.map(t => [thrusterKey(t), t]));
  fs.thrusters = incomingThrusters.map(inc => {
    const prev = thrByKey.get(thrusterKey(inc));
    if (prev) { thrByKey.delete(thrusterKey(inc)); return { ...inc, confirmed: prev.confirmed, flagged: prev.flagged, opNote: prev.opNote, position: prev.position }; }
    added.push(`Thruster ${inc.number ?? ''}`.trim()); return { ...inc, confirmed: false, flagged: false, opNote: '' };
  });
  thrByKey.forEach(t => removed.push(`Thruster ${t.number ?? ''}`.trim()));

  const devByKey = new Map(fs.systemIPs.map(d => [deviceKey(d), d]));
  fs.systemIPs = incomingDevices.map(inc => {
    const prev = devByKey.get(deviceKey(inc));
    if (prev) { devByKey.delete(deviceKey(inc)); return { ...inc, ip: prev.ip, port: prev.port }; }
    added.push(inc.name); return inc;
  });
  devByKey.forEach(d => removed.push(d.name));

  fs._merge = (added.length || removed.length) ? { added, removed, at: new Date().toISOString() } : null;
  return fs;
}

/** Hook for the app's autosave. Wire this to whatever marks the report dirty. */
function touch() {
  if (typeof state.markDirty === 'function') state.markDirty();
}

/* ==========================================================================
   2. SELECTORS  (pure)
   ========================================================================== */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const validIP = v => !v || IPV4.test(String(v).trim());
const validPort = v => !v || (/^\d{1,5}$/.test(String(v).trim()) && +v > 0 && +v < 65536);

/** An item counts as dealt with if it's confirmed, or flagged with a written reason. */
const settled = it => it.confirmed || (it.flagged && String(it.opNote || '').trim().length > 0);

const deviceAddressed = d =>
  (d.hasIP === false || (d.ip && validIP(d.ip))) &&
  (d.hasPort === false || (d.port && validPort(d.port)));

function duplicateIPs(fs) {
  const seen = new Set(), dup = new Set();
  fs.systemIPs.forEach(d => {
    const v = String(d.ip || '').trim();
    if (!v || !validIP(v)) return;
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  });
  return dup;
}

function progress(fs) {
  const items = [...fs.sensors, ...fs.thrusters];
  return {
    sensorsDone: fs.sensors.filter(s => s.confirmed).length,
    sensorsTotal: fs.sensors.length,
    thrustersDone: fs.thrusters.filter(t => t.confirmed).length,
    thrustersTotal: fs.thrusters.length,
    netDone: fs.systemIPs.filter(deviceAddressed).length,
    netTotal: fs.systemIPs.length,
    flagged: items.filter(i => i.flagged).length,
    total: items.length + fs.systemIPs.length,
    done: items.filter(i => i.confirmed).length + fs.systemIPs.filter(deviceAddressed).length,
  };
}

/** Everything standing between the operator and a lockable setup. */
function blockers(fs) {
  const out = [];
  fs.sensors.forEach(s => { if (!settled(s)) out.push({ pane: 'sensors', label: s.name, why: s.flagged ? 'flagged, needs a reason' : 'not checked' }); });
  fs.thrusters.forEach(t => { if (!settled(t)) out.push({ pane: 'thrusters', label: `Thruster ${t.number ?? ''}`.trim(), why: t.flagged ? 'flagged, needs a reason' : 'not checked' }); });
  fs.systemIPs.forEach(d => {
    if (deviceAddressed(d)) return;
    let why = 'address missing';
    if (d.ip && !validIP(d.ip)) why = 'IP is not a valid IPv4 value';
    else if (d.port && !validPort(d.port)) why = 'port must be 1–65535';
    out.push({ pane: 'network', label: d.name, why });
  });
  duplicateIPs(fs).forEach(v => out.push({ pane: 'network', label: v, why: 'assigned to more than one device' }));
  return out;
}

/* ==========================================================================
   3. STYLE
   ========================================================================== */

function injectStyles() {
  if (document.getElementById('mfs-styles')) return;
  const css = `
.mfs-bar{position:sticky;top:0;z-index:20;background:linear-gradient(180deg,#0A111C 60%,rgba(10,17,28,.94));border-bottom:1px solid rgba(120,166,212,.16);padding:14px 0 0;margin-bottom:4px}
.mfs-top{display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap}
.mfs-id{flex:1;min-width:220px}
.mfs-eyebrow{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6C88A6}
.mfs-title{font-size:18px;font-weight:700;color:#E9F0F8;margin-top:2px;line-height:1.25}
.mfs-sub{font-size:12px;color:#6C88A6;margin-top:3px}
.mfs-pill{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:6px;white-space:nowrap}
.mfs-pill.draft{background:rgba(243,145,36,.12);color:#f39124}
.mfs-pill.locked{background:rgba(69,159,217,.14);color:#459fd9}
.mfs-btn{padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;transition:.15s}
.mfs-btn.primary{background:#f39124;color:#0A111C}
.mfs-btn.primary:hover{filter:brightness(1.08)}
.mfs-btn.primary:disabled{background:rgba(243,145,36,.16);color:rgba(243,145,36,.5);cursor:not-allowed}
.mfs-btn.ghost{background:rgba(120,166,212,.1);color:#9AB0C8;border:1px solid rgba(120,166,212,.3)}
.mfs-btn.ghost:hover{background:rgba(120,166,212,.18)}
.mfs-strip-head{display:flex;align-items:baseline;gap:10px;margin:14px 0 6px}
.mfs-pct{font-size:13px;font-weight:800;color:#f39124;font-variant-numeric:tabular-nums}
.mfs-of{font-size:11px;color:#6C88A6}
.mfs-strip{display:flex;gap:3px;align-items:flex-end;height:18px}
.mfs-tick{flex:1 1 0;min-width:3px;max-width:14px;height:12px;border-radius:2px;background:rgba(120,166,212,.14);border:none;padding:0;cursor:pointer;transition:height .18s,background .18s}
.mfs-tick.done{background:#f39124;height:18px}
.mfs-tick.flag{background:#e2574c;height:18px}
.mfs-tick:hover{filter:brightness(1.35)}
.mfs-gap{flex:0 0 12px}
.mfs-segs{display:flex;gap:2px;margin-top:16px;overflow-x:auto;scrollbar-width:none}
.mfs-segs::-webkit-scrollbar{display:none}
.mfs-seg{display:flex;align-items:center;gap:8px;padding:10px 16px;border:none;border-bottom:2px solid transparent;background:none;font-size:12px;font-weight:600;color:#6C88A6;white-space:nowrap;cursor:pointer}
.mfs-seg:hover{color:#9AB0C8}
.mfs-seg[aria-selected="true"]{color:#E9F0F8;border-bottom-color:#f39124}
.mfs-count{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:rgba(120,166,212,.12);color:#6C88A6;font-variant-numeric:tabular-nums}
.mfs-seg[aria-selected="true"] .mfs-count{background:rgba(243,145,36,.15);color:#f39124}
.mfs-count.ok{background:rgba(63,185,138,.14);color:#3fb98a}
.mfs-count.bad{background:rgba(226,87,76,.14);color:#e2574c}
.mfs-pane{padding-top:20px}
.mfs-pane[hidden]{display:none}
.mfs-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.mfs-search{flex:1;min-width:170px;max-width:290px;background:#0C1727;border:1px solid rgba(120,166,212,.16);border-radius:8px;padding:8px 12px;font-size:12px;color:#E9F0F8;outline:none}
.mfs-search::placeholder{color:#6C88A6}
.mfs-chips{display:flex;gap:4px;background:#0C1727;padding:3px;border-radius:8px;border:1px solid rgba(120,166,212,.16)}
.mfs-chip{padding:5px 12px;border:none;background:none;border-radius:6px;font-size:11px;font-weight:600;color:#6C88A6;cursor:pointer}
.mfs-chip[aria-pressed="true"]{background:rgba(120,166,212,.14);color:#E9F0F8}
.mfs-spacer{flex:1}
.mfs-card{background:#101B2C;border:1px solid rgba(120,166,212,.16);border-radius:14px;overflow:hidden}
.mfs-card+.mfs-card{margin-top:18px}
.mfs-group{display:flex;align-items:center;gap:10px;padding:12px 18px 8px;background:rgba(12,23,39,.5)}
.mfs-group .lbl{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#459fd9}
.mfs-group .lbl.warm{color:#f39124}
.mfs-group .rule{flex:1;height:1px;background:rgba(120,166,212,.16)}
.mfs-group .mini{font-size:10px;color:#6C88A6;font-variant-numeric:tabular-nums}
.mfs-row{display:grid;grid-template-columns:40px minmax(140px,1.4fr) 96px 44px 64px 64px minmax(130px,1.2fr) 36px;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid rgba(120,166,212,.16)}
.mfs-row:hover{background:rgba(120,166,212,.04)}
.mfs-row.flagged{background:rgba(226,87,76,.05)}
.mfs-nm{font-size:13px;font-weight:500;color:#E9F0F8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mfs-row.done .mfs-nm{color:#9AB0C8}
.mfs-md{font-size:11px;color:#6C88A6;font-family:ui-monospace,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mfs-qt{font-size:12px;color:#9AB0C8;text-align:center;font-variant-numeric:tabular-nums}
.mfs-chk{width:20px;height:20px;border-radius:6px;border:2px solid rgba(120,166,212,.3);background:#0C1727;display:grid;place-items:center;font-size:12px;font-weight:800;color:transparent;cursor:pointer;transition:.14s;padding:0}
.mfs-chk:hover{border-color:#f39124}
.mfs-chk[aria-checked="true"]{background:rgba(243,145,36,.16);border-color:#f39124;color:#f39124}
.mfs-chk:disabled{opacity:.45;cursor:not-allowed}
.mfs-flag{width:26px;height:26px;border-radius:6px;border:none;background:none;display:grid;place-items:center;font-size:13px;color:#6C88A6;cursor:pointer;transition:.14s}
.mfs-flag:hover{background:rgba(226,87,76,.12);color:#e2574c}
.mfs-flag[aria-pressed="true"]{color:#e2574c;background:rgba(226,87,76,.12)}
.mfs-input{width:100%;background:#0C1727;border:1px solid rgba(120,166,212,.16);border-radius:6px;padding:5px 9px;font-size:11px;color:#E9F0F8;outline:none}
.mfs-input:focus{border-color:rgba(120,166,212,.4)}
.mfs-input::placeholder{color:rgba(108,136,166,.7)}
.mfs-input:disabled{opacity:.5;cursor:not-allowed}
.mfs-input.req{border-color:rgba(226,87,76,.45)}
.mfs-input.bad{border-color:rgba(226,87,76,.6);background:rgba(226,87,76,.07);color:#ffb4ad}
.mfs-input.dup{border-color:rgba(243,145,36,.6);background:rgba(243,145,36,.07)}
.mfs-mono{font-family:ui-monospace,Menlo,monospace;text-align:center;letter-spacing:.02em}
.mfs-nrow{display:grid;grid-template-columns:minmax(170px,1fr) 150px 92px 30px;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid rgba(120,166,212,.16)}
.mfs-nrow:hover{background:rgba(120,166,212,.04)}
.mfs-dash{color:#6C88A6;text-align:center;font-size:12px}
.mfs-units{display:flex;gap:12px;flex-wrap:wrap;padding:16px}
.mfs-unit{border:1px solid rgba(120,166,212,.16);background:rgba(16,27,44,.4);border-radius:12px;padding:14px 22px;text-align:center;min-width:116px;cursor:pointer;transition:.15s}
.mfs-unit[aria-pressed="true"]{border-color:rgba(243,145,36,.5);background:rgba(243,145,36,.07)}
.mfs-unit .no{font-size:21px;font-weight:900;color:#6C88A6}
.mfs-unit[aria-pressed="true"] .no{color:#f39124}
.mfs-unit .tag{font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;display:inline-block;margin-top:5px;background:rgba(120,166,212,.14);color:#9AB0C8}
.mfs-unit .tag.main{background:rgba(243,145,36,.15);color:#f39124}
.mfs-unit .act{font-size:9px;color:#459fd9;font-weight:700;margin-top:6px;height:12px}
.mfs-banner{display:flex;gap:10px;padding:11px 14px;border-radius:10px;font-size:12px;margin-bottom:14px;line-height:1.5}
.mfs-banner.warn{background:rgba(243,145,36,.08);border:1px solid rgba(243,145,36,.3);color:#f6c68a}
.mfs-banner.err{background:rgba(226,87,76,.08);border:1px solid rgba(226,87,76,.3);color:#f4a89f}
.mfs-banner b{color:#E9F0F8}
.mfs-signgrid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}
.mfs-block{padding:18px}
.mfs-block h3{margin:0 0 4px;font-size:13px;font-weight:700;color:#E9F0F8}
.mfs-hint{font-size:11px;color:#6C88A6;margin:0 0 14px;line-height:1.5}
.mfs-blockers{list-style:none;margin:0;padding:0}
.mfs-blockers li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(120,166,212,.16);font-size:12px;color:#9AB0C8}
.mfs-blockers li:first-child{border-top:none}
.mfs-blockers .who{flex:1}
.mfs-blockers .dot{width:6px;height:6px;border-radius:50%;background:#e2574c;flex:none}
.mfs-jump{font-size:11px;font-weight:700;color:#459fd9;background:none;border:none;cursor:pointer}
.mfs-clear{display:flex;gap:10px;padding:14px;border-radius:10px;background:rgba(63,185,138,.07);border:1px solid rgba(63,185,138,.25);font-size:12px;color:#9fdcc3}
.mfs-field{margin-bottom:12px}
.mfs-field label{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6C88A6;margin-bottom:5px}
.mfs-field input,.mfs-field textarea{width:100%;background:#0C1727;border:1px solid rgba(120,166,212,.16);border-radius:8px;padding:8px 11px;font-size:12px;color:#E9F0F8;outline:none;resize:vertical}
.mfs-tl-item{display:flex;gap:12px}
.mfs-tl-rail{width:12px;display:flex;flex-direction:column;align-items:center;flex:none}
.mfs-tl-dot{width:9px;height:9px;border-radius:50%;margin-top:4px;flex:none}
.mfs-tl-line{width:1px;flex:1;background:rgba(120,166,212,.3);margin-top:4px;min-height:20px}
.mfs-tl-body{flex:1;padding-bottom:16px;min-width:0}
.mfs-tl-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.mfs-tl-head .t{font-size:11px;font-weight:700}
.mfs-tl-head .w,.mfs-tl-head .d{font-size:10px;color:#6C88A6}
.mfs-tl-head .d{margin-left:auto;font-variant-numeric:tabular-nums}
.mfs-tl-body p{margin:3px 0 0;font-size:12px;color:#9AB0C8;line-height:1.5}
.mfs-diff{margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#6C88A6;line-height:1.7}
.mfs-empty{padding:44px 20px;text-align:center;color:#6C88A6;font-size:12px}
.mfs-badge-wrap{text-align:center}
@media(max-width:900px){.mfs-signgrid{grid-template-columns:1fr}}
@media(max-width:760px){
  .mfs-row{grid-template-columns:36px 1fr 36px;grid-template-areas:"c n f";row-gap:6px}
  .mfs-md,.mfs-qt,.mfs-cal,.mfs-tst{display:none}
  .mfs-notewrap{grid-column:1/4}
  .mfs-nrow{grid-template-columns:1fr 110px 76px 24px;gap:8px}
}
@media(prefers-reduced-motion:reduce){.mfs-tick,.mfs-chk,.mfs-btn{transition:none}}
`;
  const el = document.createElement('style');
  el.id = 'mfs-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

/* ==========================================================================
   4. VIEW
   ========================================================================== */

const PANES = ['unit', 'sensors', 'thrusters', 'network', 'signoff'];
const ui = { pane: 'sensors', sensorFilter: 'all', netFilter: 'all', q: { sensors: '', thrusters: '', network: '' } };
const refs = {};

let fs = null;
let readOnly = false;
let snapshot = null;      // JSON taken when a change is started
let pendingReason = null;

const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const fmtDate = iso => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function renderFinalSetupTab() {
  const host = document.getElementById('finalsetup-content');
  if (!host) return;
  injectStyles();

  const preOp = state.preOpData;
  if (!preOp?.rovs?.length) {
    host.innerHTML = `<div class="mfs-empty" style="padding:96px 20px">
      <p style="color:#9AB0C8;font-weight:600;font-size:14px;margin:0">Nothing to confirm yet</p>
      <p style="margin:6px 0 0">Finish the plan in Simulation, then use <b style="color:#E9F0F8">Push to Operation</b> on the Topology screen.</p></div>`;
    host.dataset.mfs = '';
    return;
  }

  fs = ensureFinalSetup();
  if (fs._pending && !snapshot) { pendingReason = fs._pending; snapshot = snap(); }
  readOnly = (!!fs.lockedAt && !snapshot) || state.currentUserRole === 'reviewer';

  buildShell(host, preOp);
  paintUnits(preOp);
  paintSensors();
  paintThrusters();
  paintNetwork();
  paintSignoff();
  paintHeader();
  showPane(ui.pane);
}

/* ---------------------------------------------------------- shell */

function buildShell(host, preOp) {
  host.innerHTML = '';
  const bar = el('div', 'mfs-bar');
  bar.innerHTML = `
    <div class="mfs-top">
      <div class="mfs-id">
        <div class="mfs-eyebrow">Final setup · field confirmation</div>
        <div class="mfs-title">${escapeHtml(preOp.projectName || '—')}</div>
        <div class="mfs-sub" id="mfs-sub"></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="mfs-pill draft" id="mfs-pill"></span>
        <button type="button" class="mfs-btn primary" id="mfs-action"></button>
      </div>
    </div>
    <div class="mfs-strip-head"><span class="mfs-pct" id="mfs-pct"></span><span class="mfs-of" id="mfs-of"></span></div>
    <div class="mfs-strip" id="mfs-strip"></div>
    <div class="mfs-segs" role="tablist" id="mfs-segs"></div>`;
  host.appendChild(bar);

  refs.sub = bar.querySelector('#mfs-sub');
  refs.pill = bar.querySelector('#mfs-pill');
  refs.action = bar.querySelector('#mfs-action');
  refs.pct = bar.querySelector('#mfs-pct');
  refs.of = bar.querySelector('#mfs-of');
  refs.strip = bar.querySelector('#mfs-strip');
  refs.segs = bar.querySelector('#mfs-segs');
  refs.action.addEventListener('click', onPrimaryAction);
  refs.sub.textContent = `${preOp.projectCode || ''} · ${preOp.scopeName || ''}`;

  PANES.forEach(p => {
    const pane = el('div', 'mfs-pane');
    pane.id = 'mfs-pane-' + p;
    pane.setAttribute('role', 'tabpanel');
    pane.hidden = true;
    host.appendChild(pane);
    refs['pane_' + p] = pane;
  });
}

function showPane(p) {
  ui.pane = p;
  PANES.forEach(x => { refs['pane_' + x].hidden = x !== p; });
  paintSegs();
  if (p === 'signoff') paintSignoff();
  document.getElementById('finalsetup-content')?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

/* ---------------------------------------------------------- header */

function paintHeader() {
  const p = progress(fs);
  const bl = blockers(fs);
  refs.pct.textContent = p.total ? Math.round(p.done / p.total * 100) + '%' : '—';
  refs.of.textContent = `${p.done} of ${p.total} items checked`
    + (p.flagged ? ` · ${p.flagged} flagged` : '')
    + ` · ${Math.max(0, p.total - p.done - p.flagged)} pending`;

  // tick strip: one bar per physical item, sensors+thrusters, gap, then network
  refs.strip.innerHTML = '';
  const left = [...fs.sensors, ...fs.thrusters].map(i => ({ name: i.name || `Thruster ${i.number}`, done: i.confirmed, flag: i.flagged, pane: fs.sensors.includes(i) ? 'sensors' : 'thrusters' }));
  const right = fs.systemIPs.map(d => ({ name: d.name, done: deviceAddressed(d), flag: false, pane: 'network' }));
  [left, right].forEach((set, gi) => {
    set.forEach(x => {
      const b = el('button', 'mfs-tick' + (x.flag ? ' flag' : x.done ? ' done' : ''));
      b.type = 'button';
      b.title = `${x.name} — ${x.flag ? 'flagged' : x.done ? 'checked' : 'pending'}`;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => showPane(x.pane));
      refs.strip.appendChild(b);
    });
    if (gi === 0 && right.length) refs.strip.appendChild(el('div', 'mfs-gap'));
  });

  if (snapshot) {
    refs.pill.className = 'mfs-pill draft';
    refs.pill.textContent = 'Change in progress';
    refs.action.className = 'mfs-btn primary';
    refs.action.textContent = 'Commit change';
    refs.action.disabled = bl.length > 0;
  } else if (fs.lockedAt) {
    refs.pill.className = 'mfs-pill locked';
    refs.pill.textContent = 'Locked · ' + fmtDate(fs.reconfirmedAt || fs.lockedAt);
    refs.action.className = 'mfs-btn ghost';
    refs.action.textContent = 'Log operational change';
    refs.action.disabled = state.currentUserRole === 'reviewer';
  } else {
    refs.pill.className = 'mfs-pill draft';
    refs.pill.textContent = bl.length ? `${bl.length} outstanding` : 'Ready to lock';
    refs.action.className = 'mfs-btn primary';
    refs.action.textContent = 'Confirm & lock';
    refs.action.disabled = bl.length > 0 || state.currentUserRole === 'reviewer';
  }
  refs.action.title = refs.action.disabled && bl.length ? `Resolve ${bl.length} outstanding item${bl.length > 1 ? 's' : ''} first` : '';
  paintSegs();
  touch();
}

function paintSegs() {
  const p = progress(fs);
  const bl = blockers(fs).length;
  const defs = [
    ['unit', 'Operated unit', fs.activeROVNum != null ? 'MS-' + fs.activeROVNum : '—', ''],
    ['sensors', 'Sensors', `${p.sensorsDone}/${p.sensorsTotal}`, p.sensorsDone === p.sensorsTotal && p.sensorsTotal ? 'ok' : ''],
    ['thrusters', 'Thrusters', `${p.thrustersDone}/${p.thrustersTotal}`, p.thrustersDone === p.thrustersTotal && p.thrustersTotal ? 'ok' : ''],
    ['network', 'Network', `${p.netDone}/${p.netTotal}`, p.netDone === p.netTotal && p.netTotal ? 'ok' : ''],
    ['signoff', 'Sign-off', bl ? String(bl) : '✓', bl ? 'bad' : 'ok'],
  ].filter(([id]) => !(id === 'thrusters' && !p.thrustersTotal));

  refs.segs.innerHTML = defs.map(([id, label, count, cls]) =>
    `<button type="button" class="mfs-seg" role="tab" data-pane="${id}" aria-selected="${ui.pane === id}">${label}<span class="mfs-count ${cls}">${count}</span></button>`).join('');
  refs.segs.querySelectorAll('.mfs-seg').forEach(b => b.addEventListener('click', () => showPane(b.dataset.pane)));
}

/* ---------------------------------------------------------- unit pane */

function paintUnits(preOp) {
  const pane = refs.pane_unit;
  pane.innerHTML = `<div class="mfs-banner warn"><span>⚠</span><div>Switching the operated unit reloads that hull's standard equipment list. Confirmations already made against the current unit are kept but will no longer apply.</div></div>`;
  const card = el('div', 'mfs-card');
  const wrap = el('div', 'mfs-units');
  preOp.rovs.forEach(r => {
    const b = el('button', 'mfs-unit');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(r.rovNumber === fs.activeROVNum));
    b.disabled = readOnly;
    b.innerHTML = `<div class="no">MS-${r.rovNumber}</div>
      <div class="tag ${r.role === 'main' ? 'main' : ''}">${escapeHtml(String(r.role || '').toUpperCase())}</div>
      <div class="act">${r.rovNumber === fs.activeROVNum ? 'OPERATED' : ''}</div>`;
    b.addEventListener('click', () => {
      fs.activeROVNum = r.rovNumber;
      paintUnits(preOp); paintHeader();
      showToast(`Operated unit set to MS-${r.rovNumber}.`, 'success');
    });
    wrap.appendChild(b);
  });
  card.appendChild(wrap);
  pane.appendChild(card);
}

/* ---------------------------------------------------------- item rows */

const FILTERS = [['all', 'All'], ['pending', 'Pending'], ['confirmed', 'Checked'], ['flagged', 'Flagged']];

function chipBar(current, onPick) {
  const wrap = el('div', 'mfs-chips');
  wrap.setAttribute('role', 'group');
  FILTERS.forEach(([k, label]) => {
    const b = el('button', 'mfs-chip', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(current === k));
    b.addEventListener('click', () => onPick(k));
    wrap.appendChild(b);
  });
  return wrap;
}

function matchesFilter(it, filter, q) {
  const name = it.name || `Thruster ${it.number ?? ''}`;
  if (q && !name.toLowerCase().includes(q.toLowerCase())) return false;
  if (filter === 'pending') return !it.confirmed && !it.flagged;
  if (filter === 'confirmed') return it.confirmed;
  if (filter === 'flagged') return it.flagged;
  return true;
}

/**
 * One item row. `repaint` is called after a state change and is expected to
 * refresh only what's affected — never the whole tab.
 */
function itemRow(it, repaint) {
  const name = it.name || `Thruster ${it.number ?? ''}`.trim();
  const row = el('div', 'mfs-row' + (it.flagged ? ' flagged' : it.confirmed ? ' done' : ''));

  const chk = el('button', 'mfs-chk', '✓');
  chk.type = 'button';
  chk.setAttribute('role', 'checkbox');
  chk.setAttribute('aria-checked', String(!!it.confirmed));
  chk.setAttribute('aria-label', 'Confirm ' + name);
  chk.disabled = readOnly;
  chk.addEventListener('click', () => {
    it.confirmed = !it.confirmed;
    if (it.confirmed) it.flagged = false;
    repaint();
  });

  const nm = el('div', 'mfs-nm', name); nm.title = name;
  const md = el('div', 'mfs-md', it.model || it.serial || '—');
  const qt = el('div', 'mfs-qt', it.qty ?? '—');
  const cal = el('div', 'mfs-cal mfs-badge-wrap');
  const tst = el('div', 'mfs-tst mfs-badge-wrap');
  if ('calibrated' in it) cal.innerHTML = calBadge(it.calibrated);
  if ('tested' in it) tst.innerHTML = tstBadge(it.tested);

  const noteWrap = el('div', 'mfs-notewrap');
  const note = el('input', 'mfs-input' + (it.flagged && !String(it.opNote || '').trim() ? ' req' : ''));
  note.type = 'text';
  note.disabled = readOnly;
  note.value = it.position !== undefined ? (it.position || '') : (it.opNote || '');
  note.placeholder = it.flagged ? 'Reason required…' : (it.position !== undefined ? 'Position, e.g. Port horizontal' : 'Note…');
  note.setAttribute('aria-label', 'Note for ' + name);
  note.addEventListener('input', () => {
    if (it.position !== undefined) it.position = note.value;
    it.opNote = note.value;
    note.classList.toggle('req', it.flagged && !note.value.trim());
    paintHeader();                       // header only — the row keeps its focus
  });
  noteWrap.appendChild(note);

  const flag = el('button', 'mfs-flag', '⚑');
  flag.type = 'button';
  flag.setAttribute('aria-pressed', String(!!it.flagged));
  flag.setAttribute('aria-label', 'Flag ' + name + ' as an issue');
  flag.title = 'Flag an issue — carries through to Technical / Faults';
  flag.disabled = readOnly;
  flag.addEventListener('click', () => {
    it.flagged = !it.flagged;
    if (it.flagged) it.confirmed = false;
    repaint();
  });

  row.append(chk, nm, md, qt, cal, tst, noteWrap, flag);
  return row;
}

function groupHead(label, warm, done, total) {
  const g = el('div', 'mfs-group');
  g.innerHTML = `<span class="lbl ${warm ? 'warm' : ''}">${escapeHtml(label)}</span><span class="rule"></span><span class="mini">${done}/${total}</span>`;
  return g;
}

/* ---------------------------------------------------------- sensors pane */

function paintSensors() {
  const pane = refs.pane_sensors;
  pane.innerHTML = '';

  if (fs._merge) {
    const m = fs._merge;
    const b = el('div', 'mfs-banner warn');
    b.innerHTML = `<span>⟳</span><div><b>The simulation plan changed since this setup was started.</b>
      ${m.added.length ? `Added: ${escapeHtml(m.added.slice(0, 6).join(', '))}${m.added.length > 6 ? ` +${m.added.length - 6}` : ''}. ` : ''}
      ${m.removed.length ? `Removed: ${escapeHtml(m.removed.slice(0, 6).join(', '))}${m.removed.length > 6 ? ` +${m.removed.length - 6}` : ''}.` : ''}
      New items need confirming.</div>`;
    pane.appendChild(b);
  }

  const bar = el('div', 'mfs-toolbar');
  const search = el('input', 'mfs-search');
  search.type = 'search'; search.placeholder = 'Filter sensors…'; search.value = ui.q.sensors;
  search.setAttribute('aria-label', 'Filter sensors');
  search.addEventListener('input', () => { ui.q.sensors = search.value; paintSensors(); refs.pane_sensors.querySelector('.mfs-search')?.focus(); });
  bar.append(search, chipBar(ui.sensorFilter, k => { ui.sensorFilter = k; paintSensors(); }), el('div', 'mfs-spacer'));

  if (!readOnly) {
    const bulk = el('button', 'mfs-btn ghost', 'Confirm all shown');
    bulk.type = 'button';
    bulk.addEventListener('click', () => {
      let n = 0;
      fs.sensors.forEach(s => { if (matchesFilter(s, ui.sensorFilter, ui.q.sensors) && !s.confirmed && !s.flagged) { s.confirmed = true; n++; } });
      paintSensors(); paintHeader();
      showToast(n ? `Checked ${n} sensor${n > 1 ? 's' : ''}.` : 'Nothing left to check here.', n ? 'success' : 'info');
    });
    bar.appendChild(bulk);
  }
  pane.appendChild(bar);

  const card = el('div', 'mfs-card');
  const repaint = () => { paintSensors(); paintHeader(); };
  let last = null, shown = 0;
  fs.sensors.forEach(s => {
    if (!matchesFilter(s, ui.sensorFilter, ui.q.sensors)) return;
    shown++;
    const label = s._type === 'fixed'
      ? `MS-${s.rovNum} standard equipment`
      : 'Mission sensors';
    if (label !== last) {
      last = label;
      const peers = fs.sensors.filter(x => (x._type === 'fixed' ? `MS-${x.rovNum} standard equipment` : 'Mission sensors') === label);
      card.appendChild(groupHead(label, s._type === 'fixed', peers.filter(x => x.confirmed).length, peers.length));
    }
    card.appendChild(itemRow(s, repaint));
  });
  if (!shown) card.innerHTML = '<div class="mfs-empty">No sensors match this filter.</div>';
  pane.appendChild(card);
}

/* ---------------------------------------------------------- thrusters pane */

function paintThrusters() {
  const pane = refs.pane_thrusters;
  pane.innerHTML = '';
  if (!fs.thrusters.length) { pane.innerHTML = '<div class="mfs-empty">No thrusters in this configuration.</div>'; return; }

  const bar = el('div', 'mfs-toolbar');
  bar.appendChild(el('div', 'mfs-spacer'));
  if (!readOnly) {
    const bulk = el('button', 'mfs-btn ghost', 'Confirm all');
    bulk.type = 'button';
    bulk.addEventListener('click', () => {
      let n = 0;
      fs.thrusters.forEach(t => { if (!t.confirmed && !t.flagged) { t.confirmed = true; n++; } });
      paintThrusters(); paintHeader();
      showToast(n ? `Checked ${n} thruster${n > 1 ? 's' : ''}.` : 'Nothing left to check here.', n ? 'success' : 'info');
    });
    bar.appendChild(bulk);
  }
  pane.appendChild(bar);

  const card = el('div', 'mfs-card');
  card.appendChild(groupHead('Thruster positions', true, fs.thrusters.filter(t => t.confirmed).length, fs.thrusters.length));
  const repaint = () => { paintThrusters(); paintHeader(); };
  fs.thrusters.forEach(t => card.appendChild(itemRow(t, repaint)));
  pane.appendChild(card);
}

/* ---------------------------------------------------------- network pane */

function paintNetwork() {
  const pane = refs.pane_network;
  pane.innerHTML = '';
  if (!fs.systemIPs.length) { pane.innerHTML = '<div class="mfs-empty">No network devices in this configuration.</div>'; return; }

  const dups = duplicateIPs(fs);
  const bad = fs.systemIPs.filter(d => (d.ip && !validIP(d.ip)) || (d.port && !validPort(d.port))).length;
  if (dups.size) {
    const b = el('div', 'mfs-banner err');
    b.innerHTML = `<span>⛔</span><div><b>Duplicate address${dups.size > 1 ? 'es' : ''} on the subnet.</b> ${escapeHtml([...dups].join(', '))} — assigned to more than one device. The second device will not come online.</div>`;
    pane.appendChild(b);
  }
  if (bad) {
    const b = el('div', 'mfs-banner warn');
    b.innerHTML = `<span>⚠</span><div><b>${bad} entr${bad > 1 ? 'ies are' : 'y is'} not valid.</b> IPs are four numbers 0–255, e.g. 192.168.1.20. Ports are 1–65535.</div>`;
    pane.appendChild(b);
  }

  const bar = el('div', 'mfs-toolbar');
  const search = el('input', 'mfs-search');
  search.type = 'search'; search.placeholder = 'Filter devices…'; search.value = ui.q.network;
  search.setAttribute('aria-label', 'Filter devices');
  search.addEventListener('input', () => { ui.q.network = search.value; paintNetwork(); refs.pane_network.querySelector('.mfs-search')?.focus(); });
  bar.append(search, chipBar(ui.netFilter, k => { ui.netFilter = k; paintNetwork(); }));
  pane.appendChild(bar);

  const card = el('div', 'mfs-card');
  let last = null, shown = 0;
  fs.systemIPs.forEach(d => {
    const q = ui.q.network.toLowerCase();
    if (q && !d.name.toLowerCase().includes(q) && !String(d.ip || '').includes(q)) return;
    const done = deviceAddressed(d);
    if (ui.netFilter === 'pending' && done) return;
    if (ui.netFilter === 'confirmed' && !done) return;
    if (ui.netFilter === 'flagged' && !((d.ip && !validIP(d.ip)) || dups.has(String(d.ip || '').trim()))) return;
    shown++;

    if (d.category !== last) {
      last = d.category;
      const peers = fs.systemIPs.filter(x => x.category === d.category);
      card.appendChild(groupHead(d.category || 'Devices', false, peers.filter(deviceAddressed).length, peers.length));
    }

    const row = el('div', 'mfs-nrow');
    const nm = el('div', null, d.name); nm.style.cssText = 'font-size:13px;color:#E9F0F8';
    const ipCell = el('div');
    if (d.hasIP !== false) {
      const i = el('input', 'mfs-input mfs-mono');
      i.type = 'text'; i.placeholder = '192.168.1.0'; i.value = d.ip || ''; i.disabled = readOnly; i.inputMode = 'decimal';
      i.setAttribute('aria-label', 'IP address for ' + d.name);
      const paint = () => {
        i.classList.toggle('bad', !!d.ip && !validIP(d.ip));
        i.classList.toggle('dup', !!d.ip && validIP(d.ip) && duplicateIPs(fs).has(String(d.ip).trim()));
      };
      i.addEventListener('input', () => { d.ip = i.value; paint(); paintHeader(); });
      i.addEventListener('blur', () => paintNetwork());
      paint(); ipCell.appendChild(i);
    } else ipCell.innerHTML = '<div class="mfs-dash">—</div>';

    const portCell = el('div');
    if (d.hasPort !== false) {
      const p = el('input', 'mfs-input mfs-mono');
      p.type = 'text'; p.placeholder = '0000'; p.value = d.port || ''; p.disabled = readOnly; p.inputMode = 'numeric';
      p.setAttribute('aria-label', 'Port for ' + d.name);
      p.classList.toggle('bad', !validPort(d.port));
      p.addEventListener('input', () => { d.port = p.value; p.classList.toggle('bad', !validPort(p.value)); paintHeader(); });
      portCell.appendChild(p);
    } else portCell.innerHTML = '<div class="mfs-dash">—</div>';

    const status = el('div');
    status.style.cssText = 'text-align:center;font-size:13px';
    status.innerHTML = done ? '<span style="color:#3fb98a">●</span>' : '<span style="color:rgba(120,166,212,.3)">○</span>';
    status.title = done ? 'Addressed' : 'Not addressed';

    row.append(nm, ipCell, portCell, status);
    card.appendChild(row);
  });
  if (!shown) card.innerHTML = '<div class="mfs-empty">No devices match this filter.</div>';
  pane.appendChild(card);
}

/* ---------------------------------------------------------- sign-off pane */

function paintSignoff() {
  const pane = refs.pane_signoff;
  pane.innerHTML = '';
  const grid = el('div', 'mfs-signgrid');

  // left column
  const leftCol = el('div');
  const readiness = el('div', 'mfs-card mfs-block');
  readiness.innerHTML = `<h3>Readiness</h3>
    <p class="mfs-hint">Every item has to be either checked or flagged with a reason before the setup can be locked. Flagged items carry forward to Technical / Faults.</p>`;
  const bl = blockers(fs);
  if (!bl.length) {
    const ok = el('div', 'mfs-clear');
    ok.innerHTML = `<span>✓</span><div>All ${progress(fs).total} items are checked or flagged with a reason. The setup can be locked.</div>`;
    readiness.appendChild(ok);
  } else {
    const ul = el('ul', 'mfs-blockers');
    bl.slice(0, 10).forEach(b => {
      const li = el('li');
      li.innerHTML = `<span class="dot"></span><span class="who"><b style="color:#E9F0F8">${escapeHtml(b.label)}</b> — ${escapeHtml(b.why)}</span>`;
      const jump = el('button', 'mfs-jump', 'Open →');
      jump.type = 'button';
      jump.addEventListener('click', () => showPane(b.pane));
      li.appendChild(jump);
      ul.appendChild(li);
    });
    if (bl.length > 10) {
      const li = el('li');
      li.innerHTML = `<span class="who" style="color:#6C88A6">+ ${bl.length - 10} more</span>`;
      ul.appendChild(li);
    }
    readiness.appendChild(ul);
  }
  leftCol.appendChild(readiness);

  const notesCard = el('div', 'mfs-card mfs-block');
  notesCard.innerHTML = `<h3>Setup notes</h3><p class="mfs-hint">Deviations from the simulation plan, field observations, last-minute swaps.</p>`;
  const f1 = el('div', 'mfs-field');
  const ta = el('textarea');
  ta.rows = 4; ta.disabled = readOnly; ta.value = fs.notes || '';
  ta.placeholder = 'e.g. Starboard camera swapped for spare, serial 44-2219, prior to launch.';
  ta.setAttribute('aria-label', 'Setup notes');
  ta.addEventListener('input', () => { fs.notes = ta.value; touch(); });
  f1.appendChild(ta);
  const f2 = el('div', 'mfs-field');
  f2.innerHTML = `<label for="mfs-signname">Confirmed by</label>`;
  const who = el('input');
  who.id = 'mfs-signname'; who.disabled = readOnly;
  who.value = fs.lockedBy || state.currentUserName || state.currentUserId || '';
  who.placeholder = 'Name of the confirming operator';
  f2.appendChild(who);
  refs.signName = who;
  notesCard.append(f1, f2);
  leftCol.appendChild(notesCard);

  // right column
  const history = el('div', 'mfs-card mfs-block');
  history.innerHTML = `<h3>Change history</h3><p class="mfs-hint">Append-only. Each entry records which values moved, not just that something did.</p>`;
  const entries = [
    ...(fs.lockedAt || fs.revisions.length ? [{ t: 'Initial confirmation', by: fs.lockedBy, at: fs.lockedAt, txt: 'Setup confirmed for operation.', diff: null, c: '#f39124' }] : []),
    ...fs.revisions.map((r, i) => ({ t: 'Change #' + (i + 1), by: r.by, at: r.at, txt: r.reason, diff: r.diff, c: '#459fd9' })),
  ].filter(e => e.at);

  if (!entries.length) {
    history.insertAdjacentHTML('beforeend', '<div class="mfs-empty" style="padding:24px 0">Nothing logged yet. The first entry is written when you lock the setup.</div>');
  } else {
    history.insertAdjacentHTML('beforeend', entries.map((e, i) => `
      <div class="mfs-tl-item">
        <div class="mfs-tl-rail"><div class="mfs-tl-dot" style="background:${e.c}"></div>${i < entries.length - 1 ? '<div class="mfs-tl-line"></div>' : ''}</div>
        <div class="mfs-tl-body">
          <div class="mfs-tl-head"><span class="t" style="color:${e.c}">${escapeHtml(e.t)}</span>
            <span class="w">by ${escapeHtml(e.by || '—')}</span><span class="d">${fmtDate(e.at)}</span></div>
          <p>${escapeHtml(e.txt || '—')}</p>
          ${e.diff?.length ? `<div class="mfs-diff">${e.diff.map(d => escapeHtml(d)).join('<br>')}</div>` : ''}
        </div>
      </div>`).join(''));
  }

  grid.append(leftCol, history);
  pane.appendChild(grid);
}

/* ==========================================================================
   5. ACTIONS
   ========================================================================== */

function snap() {
  return JSON.stringify({
    rov: fs.activeROVNum,
    s: fs.sensors.map(x => [x.name, x.confirmed, x.flagged, x.opNote]),
    t: fs.thrusters.map(x => [x.number, x.confirmed, x.flagged, x.position, x.opNote]),
    n: fs.systemIPs.map(x => [x.name, x.ip, x.port]),
    notes: fs.notes,
  });
}

/** Human-readable list of what actually moved between two snapshots. */
function diff(beforeJSON, afterJSON) {
  const a = JSON.parse(beforeJSON), b = JSON.parse(afterJSON), out = [];
  const st = x => x[2] ? 'flagged' : x[1] ? 'checked' : 'pending';
  if (a.rov !== b.rov) out.push(`operated unit  MS-${a.rov} → MS-${b.rov}`);
  a.s.forEach((x, i) => {
    const y = b.s[i]; if (!y) return;
    if (st(x) !== st(y)) out.push(`${x[0]}  ${st(x)} → ${st(y)}`);
    if (x[3] !== y[3]) out.push(`${x[0]} note  "${x[3] || '—'}" → "${y[3] || '—'}"`);
  });
  a.t.forEach((x, i) => {
    const y = b.t[i]; if (!y) return;
    if (x[1] !== y[1] || x[2] !== y[2]) out.push(`Thruster ${x[0]}  ${x[1] ? 'checked' : 'pending'} → ${y[1] ? 'checked' : 'pending'}`);
    if (x[3] !== y[3]) out.push(`Thruster ${x[0]} position  ${x[3] || '—'} → ${y[3] || '—'}`);
  });
  a.n.forEach((x, i) => {
    const y = b.n[i]; if (!y) return;
    if (x[1] !== y[1]) out.push(`${x[0]} IP  ${x[1] || '—'} → ${y[1] || '—'}`);
    if (x[2] !== y[2]) out.push(`${x[0]} port  ${x[2] || '—'} → ${y[2] || '—'}`);
  });
  if (a.notes !== b.notes) out.push('setup notes edited');
  return out.length ? out.slice(0, 12) : ['No field values changed.'];
}

function onPrimaryAction() {
  if (state.currentUserRole === 'reviewer') return;

  if (snapshot) {                                   // commit an in-flight change
    fs.revisions.push({
      at: new Date().toISOString(),
      by: refs.signName?.value?.trim() || state.currentUserId || 'Operator',
      reason: pendingReason,
      diff: diff(snapshot, snap()),
    });
    fs.reconfirmedAt = new Date().toISOString();     // lockedAt is left alone on purpose
    snapshot = null; pendingReason = null; fs._pending = null;
    showToast('Change logged and setup re-locked.', 'success');
    renderFinalSetupTab(); showPane('signoff');
    return;
  }

  if (!fs.lockedAt) {                               // first confirmation
    if (blockers(fs).length) return;
    fs.lockedAt = new Date().toISOString();
    fs.lockedBy = refs.signName?.value?.trim() || state.currentUserId || 'Operator';
    fs.reconfirmedAt = null;
    fs._merge = null;
    showToast('Setup confirmed and locked.', 'success');
    renderFinalSetupTab(); showPane('signoff');
    return;
  }

  // start a change — reason captured up front so the audit entry can never be blank
  const reason = window.prompt('What is changing, and why?\n\nThis goes into the audit trail alongside an automatic record of every value you edit.');
  if (reason === null) return;
  pendingReason = reason.trim() || 'No reason given';
  fs._pending = pendingReason;
  snapshot = snap();
  showToast('Editing unlocked. Press Commit change when you are done.', 'info');
  renderFinalSetupTab();
  showPane(ui.pane === 'signoff' ? 'sensors' : ui.pane);
}

export function installFinalSetup() {
  window.renderFinalSetupTab = renderFinalSetupTab;
}

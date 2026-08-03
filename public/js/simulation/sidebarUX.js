// Sidebar UX: collapse-to-icon-rail (desktop, >=900px, persisted) and the
// off-canvas drawer (mobile, <900px). Shared by both Operation and
// Simulation mode — both nav sections live in the same #app-sidebar.

const COLLAPSE_KEY = 'mcs_sim_sidebar_collapsed';
const DRAWER_BREAKPOINT = 900;

function isDesktop() {
  return window.innerWidth >= DRAWER_BREAKPOINT;
}

// ── Collapse (icon rail) ──────────────────────────────────────────────
// The visible toggle button (#sim-sidebar-collapse-btn) has been removed
// from the UI, but the collapse mechanism itself — the persisted state, the
// aside's .sim-collapsed class, and toggleCollapsed() — is left fully
// intact so it still applies on load and can be wired to a trigger again
// later without resurrecting any of this logic. Only the button-specific
// bits (aria attributes, label text) are skipped when it's absent.
function applyCollapsed(collapsed) {
  const aside = document.getElementById('app-sidebar');
  if (!aside) return;
  aside.classList.toggle('sim-collapsed', collapsed);
  const btn = document.getElementById('sim-sidebar-collapse-btn');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
  const label = document.getElementById('sim-collapse-label');
  if (label) label.textContent = collapsed ? 'Expand' : 'Collapse';
}

function toggleCollapsed() {
  const aside = document.getElementById('app-sidebar');
  const next = !aside?.classList.contains('sim-collapsed');
  applyCollapsed(next);
  localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
}

function initCollapse() {
  // Deliberately NOT restoring the persisted collapsed state here — with no
  // visible button, anyone who had previously collapsed the sidebar would
  // otherwise be stuck on an icon-only rail with no way back. toggleCollapsed()
  // and the .sim-collapsed CSS are still fully functional for a future trigger.
  document.getElementById('sim-sidebar-collapse-btn')?.addEventListener('click', () => {
    if (!isDesktop()) return; // rail collapse is a desktop-only affordance; mobile uses the drawer
    toggleCollapsed();
  });
}

// ── Rail tooltip (hover/focus, collapsed + desktop only) ─────────────
function ensureTooltipEl() {
  let el = document.getElementById('sim-rail-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sim-rail-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function showTooltip(target) {
  const aside = document.getElementById('app-sidebar');
  if (!aside?.classList.contains('sim-collapsed')) return;
  const text = target.getAttribute('data-tooltip');
  if (!text) return;
  const tip = ensureTooltipEl();
  tip.textContent = text;
  const r = target.getBoundingClientRect();
  tip.style.left = `${r.right + 10}px`;
  tip.style.top = `${r.top + r.height / 2}px`;
  tip.style.transform = 'translateY(-50%)';
  tip.classList.add('show');
}

function hideTooltip() {
  document.getElementById('sim-rail-tooltip')?.classList.remove('show');
}

function initRailTooltips() {
  const nav = document.getElementById('main-sidebar-nav');
  if (!nav) return;
  nav.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.nav-item[data-tooltip]');
    if (item) showTooltip(item);
  });
  nav.addEventListener('mouseout', (e) => {
    if (e.target.closest('.nav-item[data-tooltip]')) hideTooltip();
  });
  nav.addEventListener('focusin', (e) => {
    const item = e.target.closest('.nav-item[data-tooltip]');
    if (item) showTooltip(item);
  });
  nav.addEventListener('focusout', (e) => {
    if (e.target.closest('.nav-item[data-tooltip]')) hideTooltip();
  });
}

// ── Off-canvas drawer (<900px) ────────────────────────────────────────
let lastFocusedBeforeDrawer = null;

function getFocusable(container) {
  return [...container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
}

function openDrawer() {
  const aside = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sim-drawer-backdrop');
  const hamburger = document.getElementById('sim-hamburger-btn');
  if (!aside || !backdrop) return;
  lastFocusedBeforeDrawer = document.activeElement;
  aside.classList.add('sim-drawer-open');
  backdrop.classList.add('show');
  document.body.classList.add('sim-drawer-locked');
  hamburger?.setAttribute('aria-expanded', 'true');
  const focusable = getFocusable(aside);
  (focusable[0] || aside).focus();
}

function closeDrawer() {
  const aside = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sim-drawer-backdrop');
  const hamburger = document.getElementById('sim-hamburger-btn');
  if (!aside || !backdrop) return;
  aside.classList.remove('sim-drawer-open');
  backdrop.classList.remove('show');
  document.body.classList.remove('sim-drawer-locked');
  hamburger?.setAttribute('aria-expanded', 'false');
  (lastFocusedBeforeDrawer || hamburger)?.focus();
}

function isDrawerOpen() {
  return document.getElementById('app-sidebar')?.classList.contains('sim-drawer-open');
}

function initDrawer() {
  const hamburger = document.getElementById('sim-hamburger-btn');
  const backdrop = document.getElementById('sim-drawer-backdrop');
  const aside = document.getElementById('app-sidebar');
  if (!hamburger || !backdrop || !aside) return;

  hamburger.addEventListener('click', () => { isDrawerOpen() ? closeDrawer() : openDrawer(); });
  backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (!isDrawerOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    // Focus trap: cycle Tab/Shift+Tab within the drawer.
    const focusable = getFocusable(aside);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (isDesktop() && isDrawerOpen()) closeDrawer();
  });
}

export function installSimSidebarUX() {
  initCollapse();
  initRailTooltips();
  initDrawer();
}

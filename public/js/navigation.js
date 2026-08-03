import { state } from './state.js';
import { APPROVER_IDS } from './simulation/config.js';
import { setActiveNavItem } from './ui.js';

// Ported as-is from the old renderer.js — same behavior.
export function showTab(tabName, navElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.classList.remove('hidden');

  if (navElement && navElement.id !== 'nav-dash') {
    setActiveNavItem(navElement);
    const titleText = navElement.innerText.replace(/^[0-9]+|📊/, '').trim();
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleText;
  } else if (navElement) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = 'Infographics & Analysis';
    setActiveNavItem(null);
  }
}

export function enterDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('session-screen')?.classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');

  // Same two IDs as the simulation approver gate — see APPROVER_IDS in simulation/config.js.
  // isPrivileged additionally unlocks All Projects + simulation approvals;
  // isAdmin (privileged, or a per-user DB flag set from the Users tab) only
  // unlocks the Admin Management shortcut — see users.is_admin / requireAdminAuth.
  const isPrivileged = APPROVER_IDS.includes(String(state.currentUserId));
  const isAdmin = isPrivileged || !!state.currentUserIsAdmin;
  document.getElementById('nav-admin-group')?.classList.toggle('hidden', !(isPrivileged || isAdmin));
  document.getElementById('nav-projects-overview-item')?.classList.toggle('hidden', !isPrivileged);
  document.getElementById('nav-admin-mgmt-item')?.classList.toggle('hidden', !isAdmin);
}

function openSupport() {
  const el = document.getElementById('support-modal');
  if (el) el.style.display = 'flex';
}

function closeSupport() {
  const el = document.getElementById('support-modal');
  if (el) el.style.display = 'none';
}

function openPrivacyPolicy() {
  const el = document.getElementById('privacy-policy-modal');
  if (el) el.style.display = 'flex';
}

function closePrivacyPolicy() {
  const el = document.getElementById('privacy-policy-modal');
  if (el) el.style.display = 'none';
}

function openTermsOfService() {
  const el = document.getElementById('terms-of-service-modal');
  if (el) el.style.display = 'flex';
}

function closeTermsOfService() {
  const el = document.getElementById('terms-of-service-modal');
  if (el) el.style.display = 'none';
}

// A full reload puts every module back to its just-loaded defaults (login
// screen, cleared state, timers gone) — simpler and safer than manually
// unwinding every global. The beforeunload handler in main.js still fires
// first, so any unsaved work gets its flush + warning before this runs.
function signOut() {
  window.location.reload();
}

export function installNavigationStubs() {
  window.showTab = showTab;
  window.openSupport = openSupport;
  window.closeSupport = closeSupport;
  window.signOut = signOut;
  window.reviewerLogout = signOut; // previously dead — reviewer badge's ✕ never had a handler
  window.openPrivacyPolicy = openPrivacyPolicy;
  window.closePrivacyPolicy = closePrivacyPolicy;
  window.openTermsOfService = openTermsOfService;
  window.closeTermsOfService = closeTermsOfService;
}

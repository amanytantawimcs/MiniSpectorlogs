// Ported as-is from the old renderer.js — same behavior.
export function showTab(tabName, navElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.classList.remove('hidden');

  if (navElement && navElement.id !== 'nav-dash') {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    navElement.classList.add('active');
    const titleText = navElement.innerText.replace(/^[0-9]+|📊/, '').trim();
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleText;
  } else if (navElement) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = 'Infographics & Analysis';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  }
}

export function enterDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('session-screen')?.classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
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

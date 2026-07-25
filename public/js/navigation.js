import { notImplemented } from './ui.js';

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

// Modules not built yet in this phase — wired as harmless stubs so the
// ported markup's inline onclick handlers don't throw. Each becomes a real
// implementation in its own phase (checklists, dashboard, export, ...).
const pendingFeatures = {
  saveSimulationJSON: 'Save as JSON',
  exportSimulationExcel: 'Excel export',
  exportSimulationWord: 'Word export',
};

export function installNavigationStubs() {
  window.showTab = showTab;
  for (const [fnName, label] of Object.entries(pendingFeatures)) {
    window[fnName] = () => notImplemented(label);
  }
}

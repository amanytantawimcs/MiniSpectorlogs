// TEMPORARY dev-only shim: lets the new Mission Info / MiniSpectors UI be
// previewed at http://localhost:3016/?preview=sim without a working
// DATABASE_URL, by skipping login and dropping straight into Simulation
// mode. It is a no-op unless that query param is present. Delete this file
// and its one-line import in main.js once local DB testing is set up.

import { state } from './state.js';
import { initSimROVGrid } from './simulation/setup.js';
import { setActiveNavItem, setUserCardName, setUserCardRole } from './ui.js';

export function installDevPreview() {
  if (new URLSearchParams(location.search).get('preview') !== 'sim') return;

  state.currentMode = 'simulation';
  state.currentUserId = 'preview';
  state.currentUserName = 'Preview User';
  document.body.classList.add('sim-mode');
  document.getElementById('main-sidebar-nav')?.setAttribute('aria-label', 'Simulation navigation');

  document.getElementById('login-screen')?.classList.add('hidden');
  document.getElementById('mode-screen')?.classList.add('hidden');
  document.getElementById('session-screen')?.classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('nav-operation-sections').classList.add('hidden');
  document.getElementById('header-operation-buttons')?.classList.add('hidden');
  document.getElementById('nav-simulation-section').classList.remove('hidden');
  setUserCardName('Preview User');
  setUserCardRole('operator');

  const contentArea = document.getElementById('main-content-area');
  if (contentArea) { contentArea.style.padding = '0'; contentArea.style.overflow = 'hidden'; contentArea.style.position = 'relative'; }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-simulation')?.classList.remove('hidden');
  setActiveNavItem(document.getElementById('sim-nav-mission'));

  initSimROVGrid();
}

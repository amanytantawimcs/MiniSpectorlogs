import { api } from './api.js';
import { state, getDeviceId } from './state.js';
import { showToast } from './ui.js';
import { enterDashboard, showTab } from './navigation.js';
import { startProjectAutoSave } from './projectDetails.js';

function modeShowStep(id) {
  ['mode-step1', 'mode-step2-new', 'mode-step2-join'].forEach(s =>
    document.getElementById(s).classList.toggle('hidden', s !== id)
  );
}

async function checkProjectAccessForUser(code, userId) {
  try { return await api.checkProjectAccess(code, userId); }
  catch (e) { return { allowed: true, role: 'operator' }; }
}

async function saveSessionMeta(code, role, userName) {
  try {
    await api.saveSessionMeta({ device_id: getDeviceId(), project_code: code, device_role: role, user_name: userName });
    localStorage.setItem('mcs_last_project_code', code);
  } catch (e) { /* non-fatal */ }
}

function enterOpMode(userName) {
  state.currentMode = 'operation';
  state.currentUserName = userName;
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('nav-simulation-section').classList.add('hidden');
  document.getElementById('btn-mode-switch')?.classList.remove('hidden');
  enterDashboard();
  startProjectAutoSave();
}

function enterSimMode(userName) {
  state.currentMode = 'simulation';
  state.currentUserName = userName;
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('nav-operation-sections').classList.add('hidden');
  document.getElementById('header-operation-buttons')?.classList.add('hidden');
  document.getElementById('nav-simulation-section').classList.remove('hidden');
  document.getElementById('btn-mode-switch')?.classList.remove('hidden');
  enterDashboard();
  const simNavItem = document.querySelector('#nav-simulation-section .nav-item');
  if (simNavItem) showTab('simulation', simNavItem);
  showToast('Simulation module lands in a later update — you can still explore Operation mode.', 'info');
}

async function handleJoin(userName) {
  const codeInput = document.getElementById('join-code-input');
  const errEl = document.getElementById('join-error');
  const statusEl = document.getElementById('join-status');
  const btn = document.getElementById('btn-join-confirm');

  const code = codeInput.value.trim().toUpperCase();
  errEl.classList.add('hidden');
  statusEl.classList.add('hidden');
  if (!code) { errEl.textContent = 'Enter a project code'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = 'Searching...';
  const setStatus = (msg, color) => { statusEl.textContent = msg; statusEl.style.color = color; statusEl.classList.remove('hidden'); };
  const resetBtn = () => { btn.disabled = false; btn.innerHTML = originalHTML; };

  setStatus('Searching...', '#60a5fa');
  try {
    const result = await api.pullProject(code);
    if (!result.success) {
      errEl.textContent = result.notFound ? 'Project code not found.' : 'Connection failed. Check your internet connection.';
      errEl.classList.remove('hidden');
      resetBtn();
      return;
    }

    const access = await checkProjectAccessForUser(code, state.currentUserId);
    if (!access.allowed) {
      errEl.textContent = 'You do not have access to this project. Contact your admin.';
      errEl.classList.remove('hidden');
      resetBtn();
      return;
    }
    state.currentUserProjectRole = access.role || 'operator';
    if (access.role === 'viewer') state.currentUserRole = 'reviewer';

    state.currentProjectCode = code;
    state.currentDeviceRole = 'office';
    const project = result.project;

    if (project.mode === 'simulation') {
      enterSimMode(userName);
    } else {
      enterOpMode(userName);
      // Project Details module (phase 4) reads state.currentProjectCode and
      // populates the form; population itself lands with that module.
    }
    saveSessionMeta(code, 'office', userName);
  } catch (e) {
    errEl.textContent = 'Unexpected error. Try again.';
    errEl.classList.remove('hidden');
    resetBtn();
  }
}

function showModeScreen(userName) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('mode-user-name').innerText = userName;
  document.getElementById('mode-screen').classList.remove('hidden');
  modeShowStep('mode-step1');

  document.getElementById('btn-mode-new').onclick = () => modeShowStep('mode-step2-new');
  document.getElementById('btn-mode-join-btn').onclick = () => modeShowStep('mode-step2-join');
  document.getElementById('btn-start-sim').onclick = () => enterSimMode(userName);
  document.getElementById('btn-back-new').onclick = () => modeShowStep('mode-step1');
  document.getElementById('btn-back-join').onclick = () => modeShowStep('mode-step1');
  document.getElementById('btn-join-confirm').onclick = () => handleJoin(userName);
}

export function installAuth() {
  document.getElementById('btn-login').addEventListener('click', async () => {
    const userId = document.getElementById('login-id-input').value.trim();
    const pinInput = document.getElementById('login-pin-input').value.trim();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    if (!userId) {
      errEl.innerText = 'Please enter your User ID.';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const result = await api.getUserName(userId);
      if (!result.success) {
        errEl.innerText = 'User ID not found.';
        errEl.classList.remove('hidden');
        return;
      }

      const storedPin = localStorage.getItem(`pin_${userId}`);
      if (storedPin) {
        if (pinInput !== storedPin) {
          errEl.innerText = 'Incorrect PIN. Please try again.';
          errEl.classList.remove('hidden');
          return;
        }
      } else if (pinInput) {
        localStorage.setItem(`pin_${userId}`, pinInput);
        showToast('PIN set successfully.', 'success');
      }

      state.currentUserId = userId;
      state.currentUserRole = 'member';
      document.getElementById('display-user-id').innerText = result.name;
      showModeScreen(result.name);
    } catch (err) {
      console.error('Login error:', err);
      errEl.innerText = 'System error. Please try again.';
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('btn-review-login').addEventListener('click', async () => {
    const code = document.getElementById('review-code-input').value.trim().toUpperCase();
    const errEl = document.getElementById('review-error');
    errEl.classList.add('hidden');

    if (!code) { errEl.innerText = 'Please enter a project code.'; errEl.classList.remove('hidden'); return; }

    errEl.innerText = 'Loading project…';
    errEl.style.color = '#9ca3af';
    errEl.classList.remove('hidden');

    try {
      const result = await api.pullProject(code);
      if (!result.success) {
        errEl.innerText = result.notFound ? 'Project code not found. Check the code and try again.' : 'Connection failed. Check your internet connection.';
        errEl.style.color = '#f87171';
        return;
      }

      state.currentUserRole = 'reviewer';
      state.currentUserId = 'reviewer';
      state.currentMode = 'operation';
      state.currentProjectCode = code;
      document.getElementById('display-user-id').innerText = 'Reviewer';

      enterDashboard();
      document.getElementById('nav-operation-sections').classList.remove('hidden');
      document.getElementById('header-operation-buttons')?.classList.remove('hidden');
      document.getElementById('nav-simulation-section').classList.add('hidden');
      showToast(`Loaded project ${code} (read-only) — Project Details view lands in a later update.`, 'info');
    } catch (err) {
      errEl.innerText = 'Unexpected error. Try again.';
      errEl.classList.remove('hidden');
    }
  });
}

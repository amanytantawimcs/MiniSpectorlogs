import { api } from './api.js';
import { state, getDeviceId } from './state.js';
import { showToast } from './ui.js';
import { enterDashboard, showTab } from './navigation.js';
import { startProjectAutoSave } from './projectDetails.js';
import { initSimROVGrid } from './simulation/setup.js';
import { startSimAutoSave, loadSimulationState } from './simulation/core.js';
import { updateApprovalBadge } from './simulation/approvals.js';
import { populateUI } from './projectData.js';

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

function enterSimMode(userName, existingProject) {
  state.currentMode = 'simulation';
  state.currentUserName = userName;
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('nav-operation-sections').classList.add('hidden');
  document.getElementById('header-operation-buttons')?.classList.add('hidden');
  document.getElementById('nav-simulation-section').classList.remove('hidden');
  document.getElementById('btn-mode-switch')?.classList.remove('hidden');
  enterDashboard();

  const contentArea = document.getElementById('main-content-area');
  if (contentArea) { contentArea.style.padding = '0'; contentArea.style.overflow = 'hidden'; contentArea.style.position = 'relative'; }

  const simNavItem = document.querySelector('#nav-simulation-section .nav-item');
  if (simNavItem) showTab('simulation', simNavItem);

  if (existingProject) loadSimulationState(existingProject.data, existingProject.is_sim_locked);
  else initSimROVGrid();
  startSimAutoSave();
  updateApprovalBadge();
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
      enterSimMode(userName, project);
    } else {
      enterOpMode(userName);
      populateUI(project.data);
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
  document.getElementById('btn-start-op').onclick = () => enterOpMode(userName);
  document.getElementById('btn-back-new').onclick = () => modeShowStep('mode-step1');
  document.getElementById('btn-back-join').onclick = () => modeShowStep('mode-step1');
  document.getElementById('btn-join-confirm').onclick = () => handleJoin(userName);
}

function setLoginPasscodeMode(hasPasscode) {
  const label = document.getElementById('login-pin-label');
  const confirmWrap = document.getElementById('login-pin-confirm-wrap');
  const hint = document.getElementById('login-pin-hint');
  if (hasPasscode) {
    label.firstChild.textContent = 'Passcode ';
    confirmWrap.classList.add('hidden');
    hint.classList.add('hidden');
  } else {
    label.firstChild.textContent = 'Set a Passcode ';
    confirmWrap.classList.remove('hidden');
    hint.classList.remove('hidden');
  }
}

async function requestPasscodeReset() {
  const idInput = document.getElementById('login-id-input');
  const errEl = document.getElementById('login-error');
  const userId = idInput.value.trim();
  errEl.classList.add('hidden');

  if (!userId) {
    errEl.innerText = 'Enter your User ID above first, then click Reset Passcode.';
    errEl.classList.remove('hidden');
    return;
  }

  const lookup = await api.getUserName(userId);
  if (!lookup.success) {
    errEl.innerText = 'User ID not found.';
    errEl.classList.remove('hidden');
    return;
  }

  if (!confirm(`Reset the passcode for ${lookup.name} (ID ${userId})? You'll set a new one right after.`)) return;

  const result = await api.resetPasscode(userId);
  if (!result.success) {
    errEl.innerText = result.error || 'Could not reset passcode. Try again.';
    errEl.classList.remove('hidden');
    return;
  }

  setLoginPasscodeMode(false);
  document.getElementById('login-pin-input').value = '';
  document.getElementById('login-pin-confirm-input').value = '';
  showToast('Passcode reset. Set a new one below and log in.', 'success');
}

export function installAuth() {
  const idInput = document.getElementById('login-id-input');
  let lookupCache = { id: null, result: null };

  const lookupUser = async (userId) => {
    if (lookupCache.id === userId && lookupCache.result) return lookupCache.result;
    const result = await api.getUserName(userId);
    lookupCache = { id: userId, result };
    return result;
  };

  idInput.addEventListener('blur', async () => {
    const userId = idInput.value.trim();
    if (!userId) return;
    const result = await lookupUser(userId);
    if (result.success) setLoginPasscodeMode(result.hasPasscode);
  });

  document.getElementById('btn-reset-passcode')?.addEventListener('click', requestPasscodeReset);

  document.getElementById('btn-login').addEventListener('click', async () => {
    const userId = idInput.value.trim();
    const pin = document.getElementById('login-pin-input').value.trim();
    const pinConfirm = document.getElementById('login-pin-confirm-input').value.trim();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    if (!userId) {
      errEl.innerText = 'Please enter your User ID.';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const result = await lookupUser(userId);
      if (!result.success) {
        errEl.innerText = 'User ID not found.';
        errEl.classList.remove('hidden');
        return;
      }
      setLoginPasscodeMode(result.hasPasscode);

      if (result.hasPasscode) {
        if (!pin) {
          errEl.innerText = 'Enter your passcode.';
          errEl.classList.remove('hidden');
          return;
        }
        const verify = await api.verifyPasscode(userId, pin);
        if (!verify.success) {
          errEl.innerText = verify.error || 'Incorrect passcode.';
          errEl.classList.remove('hidden');
          return;
        }
      } else {
        if (!/^\d{4,}$/.test(pin)) {
          errEl.innerText = 'Choose a passcode of at least 4 digits.';
          errEl.classList.remove('hidden');
          return;
        }
        if (pin !== pinConfirm) {
          errEl.innerText = 'Passcodes do not match.';
          errEl.classList.remove('hidden');
          return;
        }
        const setResult = await api.setPasscode(userId, pin);
        if (!setResult.success) {
          errEl.innerText = setResult.error || 'Could not set passcode. Try again.';
          errEl.classList.remove('hidden');
          return;
        }
        showToast('Passcode set. Use it to log in next time.', 'success');
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

import { api } from './api.js';
import { state, getDeviceId } from './state.js';
import { showToast, setUserCardName, setUserCardRole } from './ui.js';
import { enterDashboard, showTab } from './navigation.js';
import { startProjectAutoSave, applyProjectIdentityLock } from './projectDetails.js';
import { initSimROVGrid } from './simulation/setup.js';
import { startSimAutoSave, loadSimulationState } from './simulation/core.js';
import { simState } from './simulation/state.js';
import { populateUI } from './projectData.js';
import { startStaleCheck, noteSavedUpdatedAt } from './staleCheck.js';
import { renderProjectTeam, clearPendingTeam } from './projectTeam.js';

function modeShowStep(id) {
  ['mode-step1', 'mode-step2-join'].forEach(s =>
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
  document.body.classList.remove('sim-mode');
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('nav-simulation-section').classList.add('hidden');
  document.getElementById('btn-mode-switch')?.classList.remove('hidden');
  document.getElementById('header-push-to-operation-btn')?.classList.add('hidden');
  document.getElementById('main-sidebar-nav')?.setAttribute('aria-label', 'Operation navigation');
  setUserCardRole(state.currentUserProjectRole);
  if (state.currentProjectCode) clearPendingTeam(); // joining an existing project — drop any stale staged picks
  applyProjectIdentityLock();
  enterDashboard();
  startProjectAutoSave();
  startStaleCheck();
  renderProjectTeam('team-container-op', state.currentProjectCode);
}

function enterSimMode(userName, existingProject) {
  state.currentMode = 'simulation';
  state.currentUserName = userName;
  document.body.classList.add('sim-mode');
  document.getElementById('main-sidebar-nav')?.setAttribute('aria-label', 'Simulation navigation');
  setUserCardRole(state.currentUserProjectRole);
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
  if (existingProject) clearPendingTeam(); // joining an existing project — drop any stale staged picks
  startSimAutoSave();
  startStaleCheck();
  renderProjectTeam('team-container-sim', simState.projectData.code);
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
    noteSavedUpdatedAt(project.updated_at);

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

  document.getElementById('btn-mode-new').onclick = () => enterSimMode(userName);
  document.getElementById('btn-mode-join-btn').onclick = () => modeShowStep('mode-step2-join');
  document.getElementById('btn-skip-to-op').onclick = () => enterOpMode(userName);
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

// Passcode reset is admin-only now (server/routes/users.js) — this used to
// perform the reset directly from here with no proof of identity beyond
// knowing someone's User ID, which is a short guessable number. Now it just
// points the person at whoever can actually verify who they are.
function showPasscodeResetGuidance() {
  const idInput = document.getElementById('login-id-input');
  const errEl = document.getElementById('login-error');
  const userId = idInput.value.trim();
  errEl.style.color = '#9ca3af';
  errEl.innerText = userId
    ? `Ask your admin to reset the passcode for User ID ${userId}.`
    : 'Ask your admin to reset your passcode.';
  errEl.classList.remove('hidden');
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

  document.getElementById('btn-reset-passcode')?.addEventListener('click', showPasscodeResetGuidance);

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
      state.currentUserIsAdmin = !!result.isAdmin;
      setUserCardName(result.name);
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

      const project = result.project;
      state.currentUserRole = 'reviewer';
      state.currentUserId = 'reviewer';
      state.currentMode = 'operation';
      state.currentProjectCode = code;
      document.body.classList.remove('sim-mode');
      setUserCardName('Reviewer');
      setUserCardRole('reviewer');

      enterDashboard();
      document.getElementById('nav-operation-sections').classList.remove('hidden');
      document.getElementById('header-operation-buttons')?.classList.remove('hidden');
      document.getElementById('nav-simulation-section').classList.add('hidden');

      if (project.mode === 'simulation') {
        // The pulled data here is the shape saveSimulation() writes, not what
        // populateUI() (an Operation-shape reader) expects — showing it as an
        // empty Operation dashboard would be just as misleading as before, so
        // say plainly that this project doesn't have a review view yet rather
        // than silently rendering nothing.
        showToast(`Loaded project ${code} — this is a Simulation-mode project; a read-only Simulation view isn't built yet.`, 'info');
      } else {
        populateUI(project.data);
        showToast(`Loaded project ${code} (read-only).`, 'info');
      }
    } catch (err) {
      errEl.innerText = 'Unexpected error. Try again.';
      errEl.classList.remove('hidden');
    }
  });
}

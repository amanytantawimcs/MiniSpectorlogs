import { state } from './state.js';
import { installAuth, tryRestoreSession } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails, flushSaveOnUnload } from './projectDetails.js';
import { installAdmin } from './admin.js';
import { installSimSetup } from './simulation/setup.js';
import { installSimCore, flushSimOnUnload } from './simulation/core.js';
import { installSimSidebarUX } from './simulation/sidebarUX.js';
import { installSensorTable } from './sensorTable.js';
import { installPreOp } from './preOp.js';
import { installFinalSetup } from './finalSetup.js';
import { installLogs } from './logs.js';
import { installChecklists } from './checklists.js';
import { installDashboard } from './dashboard.js';
import { installExport } from './export.js';
import { installProjectTeam } from './projectTeam.js';
import { installDevPreview } from './devPreviewSim.js'; // TEMPORARY — see file header
import { flushOfflineQueue, hasPersistedSessionToken } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  installNavigationStubs();
  installAuth();
  installProjectDetails();
  installAdmin();
  installSimSetup();
  installSimCore();
  installSimSidebarUX();
  installSensorTable();
  installPreOp();
  installFinalSetup();
  installLogs();
  installChecklists();
  installDashboard();
  installExport();
  installProjectTeam();
  installDevPreview(); // TEMPORARY — see devPreviewSim.js header

  // Silently re-authenticate and rejoin the last active project if a
  // previous visit left a session token behind — see tryRestoreSession()'s
  // own comment (auth.js) for the full reasoning. Only shows the loading
  // overlay when there's actually a token to check, so a genuinely
  // logged-out visitor sees the ordinary login screen with no flash/delay.
  if (hasPersistedSessionToken()) {
    document.getElementById('session-restore-loading')?.classList.remove('hidden');
    await tryRestoreSession();
    document.getElementById('session-restore-loading')?.classList.add('hidden');
  }

  // Retry any saves that failed while offline — on startup (queue survives a
  // reload via localStorage), when connectivity returns, and periodically as
  // a fallback since the 'online' event doesn't fire reliably in every case
  // (e.g. some captive-portal/proxy situations).
  flushOfflineQueue();
  window.addEventListener('online', flushOfflineQueue);
  setInterval(flushOfflineQueue, 30 * 1000);
});

// Best-effort flush + warn if there's unsaved work when the tab closes/reloads.
window.addEventListener('beforeunload', (e) => {
  if (state.currentMode === 'operation') flushSaveOnUnload();
  else if (state.currentMode === 'simulation') flushSimOnUnload();

  if (state.isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

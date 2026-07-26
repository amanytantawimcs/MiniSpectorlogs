import { state } from './state.js';
import { installAuth } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails, flushSaveOnUnload } from './projectDetails.js';
import { installAdmin } from './admin.js';
import { installSimSetup } from './simulation/setup.js';
import { installSimCore, flushSimOnUnload } from './simulation/core.js';
import { installApprovals } from './simulation/approvals.js';
import { installSensorTable } from './sensorTable.js';
import { installPreOp } from './preOp.js';
import { installFinalSetup } from './finalSetup.js';
import { installLogs } from './logs.js';
import { installChecklists } from './checklists.js';
import { installDashboard } from './dashboard.js';
import { installExport } from './export.js';

document.addEventListener('DOMContentLoaded', () => {
  installNavigationStubs();
  installAuth();
  installProjectDetails();
  installAdmin();
  installSimSetup();
  installSimCore();
  installApprovals();
  installSensorTable();
  installPreOp();
  installFinalSetup();
  installLogs();
  installChecklists();
  installDashboard();
  installExport();
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

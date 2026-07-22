import { installAuth } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails } from './projectDetails.js';
import { installAdmin } from './admin.js';
import { installSimSetup } from './simulation/setup.js';
import { installSimCore } from './simulation/core.js';
import { installApprovals } from './simulation/approvals.js';
import { installSensorTable } from './sensorTable.js';
import { installPreOp } from './preOp.js';
import { installFinalSetup } from './finalSetup.js';

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
});

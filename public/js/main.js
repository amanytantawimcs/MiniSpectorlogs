import { installAuth } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails } from './projectDetails.js';
import { installAdmin } from './admin.js';
import { installSimSetup } from './simulation/setup.js';
import { installSimCore } from './simulation/core.js';

document.addEventListener('DOMContentLoaded', () => {
  installNavigationStubs();
  installAuth();
  installProjectDetails();
  installAdmin();
  installSimSetup();
  installSimCore();
});

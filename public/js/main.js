import { installAuth } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails } from './projectDetails.js';
import { installAdmin } from './admin.js';

document.addEventListener('DOMContentLoaded', () => {
  installNavigationStubs();
  installAuth();
  installProjectDetails();
  installAdmin();
});

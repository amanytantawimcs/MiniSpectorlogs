import { installAuth } from './auth.js';
import { installNavigationStubs } from './navigation.js';
import { installProjectDetails } from './projectDetails.js';

document.addEventListener('DOMContentLoaded', () => {
  installNavigationStubs();
  installAuth();
  installProjectDetails();
});

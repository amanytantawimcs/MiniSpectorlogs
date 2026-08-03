// Shared app state — single mutable object instead of scattered globals.
// Other modules import `state` and read/write its fields directly.

export const state = {
  currentUserId: null,
  currentUserName: '',
  currentUserRole: 'member',     // 'member' | 'reviewer'
  currentUserIsAdmin: false,     // grants the "Admin Management" nav item — see users.is_admin / requireAdminAuth
  currentUserProjectRole: 'operator', // 'operator' | 'viewer'
  currentMode: null,             // 'operation' | 'simulation'
  currentProjectCode: null,
  currentDeviceRole: null,       // 'vessel' | 'office'
  isDirty: false,

  currentReportData: {
    diveLogs: [], maintenanceLogs: [], hseReports: [], standbyLogs: [], faultLogs: [], shiftLogs: [],
    checklists: { mobilization: {}, startup: {}, preOp: {}, postOp: {}, shutdown: {}, demob: {} },
    finalSetup: null,
  },

  preOpData: null,
  activeChecklistType: 'mobilization',
  activeChecklistDiveKeys: { preOp: '1', postOp: '1' },

  autoSaveTimer: null,
};

export function getDeviceId() {
  let id = localStorage.getItem('mcs_device_id');
  if (!id) {
    id = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('mcs_device_id', id);
  }
  return id;
}

// Simulation-mode working state — mirrors the shape of the old app's sim
// globals (simSelectedROVs, simSharedData, etc), just grouped into one object.
// Reset via resetSimState() whenever a fresh simulation is started.

export const simState = {
  locked: false,           // true once persisted (projects.is_sim_locked) — read-only banner
  selectedROVs: new Map(), // num -> 'main' | 'standby'
  rovSerials: new Map(),   // num -> serial string
  rovDescriptions: new Map(), // num -> description string
  activeROV: null,         // display-only focus, not persisted
  activeSubTab: 'sensors', // 'sensors' | 'sysarch' | 'readiness'
  selectedScope: null,     // numeric key into OPERATION_SCOPES
  projectData: { name: '', code: '', description: '' },
  approval: { status: 'draft', history: [] },
  shared: {
    sensors: [],
    rovSensors: {},        // { [rovNumber]: [...] }
    sysarch: { diagramDataUrl: null, machines: [], equipment: [], simStatus: [], deliverables: {}, systemIPs: [] },
    issues: [],
    thrusters: [],
  },
};

export function resetSimState() {
  simState.locked = false;
  simState.selectedROVs = new Map();
  simState.rovSerials = new Map();
  simState.rovDescriptions = new Map();
  simState.activeROV = null;
  simState.activeSubTab = 'sensors';
  simState.selectedScope = null;
  simState.projectData = { name: '', code: '', description: '' };
  simState.approval = { status: 'draft', history: [] };
  simState.shared = {
    sensors: [], rovSensors: {},
    sysarch: { diagramDataUrl: null, machines: [], equipment: [], simStatus: [], deliverables: {}, systemIPs: [] },
    issues: [], thrusters: [],
  };
}

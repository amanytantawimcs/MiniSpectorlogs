// Static reference data for the Simulation module — ported verbatim from the
// old app's renderer.js (OPERATION_SCOPES, SENSOR_HARDWARE, etc). None of this
// is user-editable; it only drives dropdowns, autocomplete, and scope-driven
// sensor defaults.

export const OPERATION_SCOPES = {
  1: {
    name: 'Platform Conventional Inspection (GVI - CVI - CP - UT - ACFM)', category: 'Platform',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'CP', status: 'required' },
      { name: 'Manipulator', status: 'required' }, { name: 'UT', status: 'required' },
      { name: 'FMD', status: 'required' }, { name: 'Cleaning Brush', status: 'required' },
      { name: 'PRC Real-Time', status: 'optional' },
    ],
  },
  2: {
    name: 'Platform Conventional Inspection with PRC', category: 'Platform',
    sensors: [
      { name: 'PRC Real-Time', status: 'required' }, { name: 'Navigation', status: 'required' },
      { name: 'Gyro', status: 'required' }, { name: 'Depth', status: 'required' },
      { name: 'CP', status: 'required' }, { name: 'Manipulator', status: 'required' },
      { name: 'UT', status: 'required' }, { name: 'FMD', status: 'required' },
      { name: 'Cleaning Brush', status: 'required' },
    ],
  },
  3: {
    name: 'Platform GVI - Video Only', category: 'Platform',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'CP', status: 'optional' },
      { name: 'Manipulator', status: 'optional' },
    ],
  },
  4: {
    name: 'Platform Mass Cleaning', category: 'Platform',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Water Jet', status: 'required' },
      { name: 'Manipulator', status: 'optional' },
    ],
  },
  5: {
    name: 'Pipeline Conventional Inspection + SBES/Profiler', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'Scan (SBES/Profiler)', status: 'required' }, { name: 'CP', status: 'required' },
      { name: 'Manipulator', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'MBES', status: 'optional' },
    ],
  },
  6: {
    name: 'Pipeline Conventional Inspection + PRC + SBES/Profiler', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'Scan (SBES/Profiler)', status: 'required' }, { name: 'CP', status: 'required' },
      { name: 'Manipulator', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'MBES', status: 'optional' },
    ],
  },
  7: {
    name: 'Pipeline Geometric Assessment + PRC', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'Scan (SBES/Profiler)', status: 'required' }, { name: 'CP', status: 'required' },
      { name: 'Manipulator', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'MBES', status: 'optional' },
    ],
  },
  8: {
    name: 'Pipeline Conventional Inspection + PRC + PipeTracker', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'MBES', status: 'required' }, { name: 'PipeTracker', status: 'required' },
      { name: 'CP', status: 'required' }, { name: 'Manipulator', status: 'required' },
      { name: 'PRC External Frame', status: 'optional' }, { name: 'Scan (SBES/Profiler)', status: 'optional' },
    ],
  },
  9: {
    name: 'Pipeline Geophysical Survey', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'MBES', status: 'required' }, { name: 'CP', status: 'required' },
      { name: 'Manipulator', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'PipeTracker', status: 'optional' },
    ],
  },
  10: {
    name: 'Seabed Geophysical Survey', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'MBES', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'PipeTracker', status: 'optional' },
    ],
  },
  11: {
    name: 'Pipeline GVI / Video Recording', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'PRC External Frame', status: 'optional' },
      { name: 'CP', status: 'optional' }, { name: 'Manipulator', status: 'optional' },
    ],
  },
  12: {
    name: 'Pre-engineering Metrology (Spools)', category: 'Pipeline',
    sensors: [
      { name: 'PRC External Frame', status: 'required' }, { name: 'Navigation', status: 'required' },
      { name: 'Gyro', status: 'required' }, { name: 'Depth', status: 'required' },
      { name: 'Altimeter', status: 'required' }, { name: 'Scan (SBES/Profiler)', status: 'optional' },
    ],
  },
  13: {
    name: 'Pre-engineering Metrology (Jumper / Subsea Structures)', category: 'Pipeline',
    sensors: [
      { name: 'PRC External Frame', status: 'required' }, { name: 'Navigation', status: 'required' },
      { name: 'Gyro', status: 'required' }, { name: 'Depth', status: 'required' },
      { name: 'Altimeter', status: 'required' }, { name: 'PRC Real-Time', status: 'optional' },
      { name: 'Scan (SBES/Profiler)', status: 'optional' },
    ],
  },
  14: {
    name: 'Pipeline Conventional Inspection + Subsea Structures + PRC', category: 'Pipeline',
    sensors: [
      { name: 'PRC External Frame', status: 'required' }, { name: 'Navigation', status: 'required' },
      { name: 'Gyro', status: 'required' }, { name: 'Depth', status: 'required' },
      { name: 'Altimeter', status: 'required' }, { name: 'Scan (SBES/Profiler)', status: 'required' },
      { name: 'CP', status: 'required' }, { name: 'Manipulator', status: 'required' },
    ],
  },
  15: {
    name: 'Pipeline Mass Cleaning', category: 'Pipeline',
    sensors: [
      { name: 'Navigation', status: 'required' }, { name: 'Gyro', status: 'required' },
      { name: 'Depth', status: 'required' }, { name: 'Altimeter', status: 'required' },
      { name: 'Water Jet', status: 'required' },
    ],
  },
};

export const SENSOR_HARDWARE = {
  'Front/Boom Camera': ['AQV 62 IP Subsea Camera', 'Board Camera', 'MCS HIKVISION Camera'],
  'Rear Camera': ['AQV 62 IP Subsea Camera', 'Board Camera', 'MCS HIKVISION Camera'],
  'Side Camera': ['AQV 62 IP Subsea Camera', 'Board Camera', 'MCS HIKVISION Camera'],
  'PRC (Fixed)': ['Embedded in Prospector'],
  'PRC External Frame': ['External PRC Frame'],
  'PRC Real-Time': ['Real-time PRC Pod'],
  Navigation: ['SUBSONUS USBL/INS'],
  Gyro: ['Embedded in Prospector', 'Exail Octans Nano'],
  Depth: ['Embedded in Prospector'],
  Altimeter: ['Impact Subsea ISA200', 'Embedded in Prospector'],
  'Scan (SBES/Profiler)': ['DFP TriTech', 'Impact Subsea ISP360'],
  MBES: ['SeaBat T20-S', 'IMAGENEX MODEL 837A Delta T', 'NORBIT Winghead B44'],
  PipeTracker: ['HydroPACT 660E', 'Pipe-Tracker-Innovatum Smartrak'],
  CP: ['MCS CP'],
  Manipulator: ['Reach Bravo 5', 'Exail 5E-micro'],
  UT: ['Cygnus M5-ROV-2K'],
  FMD: ['Impact Subsea ISA500'],
  'Cleaning Brush': ['MCS HT Brush', 'FlexiClean'],
  'Water Jet': ['Caviblaster (ProSpector Custom)'],
  'Sonar 360': ['Impact Subsea ISS360', 'Micron Sonar TriTech MK3'],
};

// Category label for each mission-sensor name — drives grouping in the Sensors workspace.
export const SENSOR_CATEGORIES = {
  'Rear Camera': 'Cameras & Lighting', 'Side Camera': 'Cameras & Lighting',
  'Front/Boom Camera': 'Cameras & Lighting', 'PTZ Camera': 'Cameras & Lighting', 'GVI Camera': 'Cameras & Lighting',
  Navigation: 'Navigation & Depth', Gyro: 'Navigation & Depth', Depth: 'Navigation & Depth', Altimeter: 'Navigation & Depth',
  CP: 'Inspection Tools', UT: 'Inspection Tools', ACFM: 'Inspection Tools', FMD: 'Inspection Tools',
  'Sonar 360': 'Inspection Tools', MBES: 'Inspection Tools', PipeTracker: 'Inspection Tools', 'Scan (SBES/Profiler)': 'Inspection Tools',
  'PRC Real-Time': 'Payloads / Tooling', 'PRC (Fixed)': 'Payloads / Tooling', 'PRC External Frame': 'Payloads / Tooling',
  'Cleaning Brush': 'Payloads / Tooling', 'Water Jet': 'Payloads / Tooling', Manipulator: 'Payloads / Tooling',
};

export const CAT_ORDER = { 'Cameras & Lighting': 0, 'Navigation & Depth': 1, 'Inspection Tools': 2, 'Payloads / Tooling': 3 };

// Fixed unit sensors every selected ROV gets automatically (not scope-driven).
export const MINISPECTOR_FIXED_SENSORS = [
  { name: 'Rear Camera', category: 'Cameras & Lighting' },
  { name: 'Side Camera', category: 'Cameras & Lighting' },
  { name: 'Front/Boom Camera', category: 'Cameras & Lighting' },
  { name: 'PRC (Fixed)', category: 'Payloads / Tooling' },
];

// Merged "Equipment & Consumables" list (replaces the old app's separate
// sysarch.equipment + packingList — see the rebuild's design decision to merge them).
export const EQUIP_CATEGORIES = [
  'ROV Main Unit', 'Thrusters', 'Cameras', 'Cables & Connectors', 'Inspection Tools',
  'Mechanical & Fixation', 'Electronics & Pods', 'Spares & Consumables', 'Networking', 'Other',
];
export const EQUIP_CAT_COLORS = {
  'ROV Main Unit': '#f39124', Thrusters: '#459fd9', Cameras: '#a78bfa',
  'Cables & Connectors': '#34d399', 'Inspection Tools': '#fbbf24',
  'Mechanical & Fixation': '#fb923c', 'Electronics & Pods': '#60a5fa',
  'Spares & Consumables': '#f87171', Networking: '#4ade80', Other: '#6b7280',
};

export const MACHINE_NAMES = [
  'ROVOnline', 'DVE', 'ROVLog', 'PRC Camera Controller', 'PRC Processing',
  'SC Admin', 'SC Offline', 'ROVOffline', 'Broadcast Server', 'Broadcast Client',
  'RIS', 'OAS Vessel', 'OAS Office', 'Backup Machine',
];

export const SOFTWARE_LIST = [
  'ROVOffline', 'ROVViewer', 'ROVOnline', 'DVE', 'ROVLog',
  'SC-Offline', 'SC-Viewer', 'SC-Admin',
  'PRC-Camera Controller', 'PRC-3D Reconstruction', 'PRC-MCS3DViewer', 'PRC-SC-Processing',
  'OAS Vessel', 'OAS Office', 'Broadcast Server', 'Broadcast Client',
  'CP', 'Minispector', 'AutoCharting Tool', 'MCS Report Generator',
  'AIMS', 'HTML Report', 'WebProgress', 'SQL 2014', 'Cad 2017',
  'Design Review 2018', 'Office', 'Adobe', '.rar', 'CUDA 10.1', 'Vimba 4',
  'ROVOnline + DVE',
];

// Autocomplete hints only for the merged equipment item field.
export const HARDWARE_ITEMS = [
  'MiniSpector ROV — full assembly (4x Lead Disks, PRC Plug, 1DOF Gimbal, 7x Thrusters, PTZ, Dummies)',
  'MiniSpector ROV Enhanced — Quad Fiber (L-shape Brush Fixation)',
  'MiniSpector ROV Enhanced — Quad Fiber (New Thrusters)',
  'MiniSpector 1kW Thruster - Subconn (New FW)', 'MiniSpector 1kW Thruster - Subconn (Old FW)',
  'MiniSpector 1kW Thruster - Subconn', 'Portable Thrusters Setup', 'Thruster Net Guards',
  'Right Propeller Assembly', 'Left Propeller Assembly', 'Set of Thruster Spares (springs, washers, bearings)',
  'GVI Camera (lightweight single PRC)', 'Boom Camera', 'PTZ Camera', 'PTZ Camera Fixation',
  'GVI Fixation with Latch', 'GVI Cable', 'Boom Camera Swivel Set (center attachment + arm)',
  'External LED Light - Subconn', 'External LED Fixation', '3-Pin Cable for External LED Subconn',
  'Rear Camera Control Cable DB9 to 2-Pin Rossette',
  'MiniSpector Piloting Case (HCU 10 & Tablet Charger)', 'MiniSpector Piloting Case (HCU 14, External Tablet Charger, GETAC-7)',
  'MiniSpector Piloting Case', 'Hand Control Unit (HCU)',
  'MiniSpector Power Supply - Enhanced Quad',
  'MiniSpector Tether Reel Slip-Ring (Quad Fiber, bullet, bolt pin, 5-pin SubConn)',
  'MiniSpector Tether Reel (Quad Fiber, bullet, bolt pin, 5-pin SubConn)',
  'MiniSpector Tether Reel (bullet, bolt pin, 5-pin SubConn)',
  'AC Cable 3 cores x 16mm 100m with Earth Leakage', 'On Deck Station Power Cable', 'CAN Cable',
  'Latch System', 'Latch System & 50m Stainless Steel Wire', '1DOF Gimbal for Latch System',
  'Lead Disks 1.25 kg', 'Foam Floaters Set (2x 0.5kg & 1x 0.25kg)', 'Full Skid Kit', 'ROVPaq Brackets',
  'Pilot Case Upper Joints', 'Pilot Case Lower Joints', 'External PRC Setup (fixation, Pod, GVI cable, floaters)',
  'Set of Studs & Screws (nuts, washers, o-rings, hoses, clamps)',
  'UT System (UT Bottle, Probe, Membranes, Couplant, Calibration Part)',
  'UT & FMD Fixation Setup', 'UT Probe Handler for Small ROV',
  'On-Deck UT Test Setup (24VDC PSU, 6-Pin female bulkhead, DB9 RS-232, USB-RS232, Common GND)',
  'FMD Sensor with Handler', 'FMD Handler', 'High Power Brush Pod', 'FlexiClean Fixation',
  'Brush Head Adaptor with Brush Head', 'Marine Growth Stick', 'Marine Growth Scraper',
  'High Power Pod — 350VDC→24VDC + Thruster Board + RS485 + Payload Ethernet - Subconn',
  'High Power Pod — 350VDC→24VDC + Thruster Board On/Off', 'MOXA Pod', 'PRC Plug',
  'Ethernet Cable Boom/PTZ 8-Pin Male to 6-Pin Female Subconn',
  '6-Pin Male-Female Pin-to-Pin Subconn', '8-Pin Male-Female Pin-to-Pin Subconn',
  '6-Pin Male to Pigtail Subconn', '8-Pin Male to Pigtail Subconn',
  '6-Pin Dummy Male Leak', '8-Pin Dummy Female', 'FMD Cable 6-Pin Male to 8-Pin Female SubConn',
  'RS-232 Cable RJ45 to DB9 — 2m', 'RS-232 Cable RJ45 to DB9 — 5m', 'RS-485 Cable RJ45 to DB9 — 2m',
  'LC to ST Fiber Patch Chord 5m', 'LC to LC Fiber Patch Chord 5m', 'LC to LC Fiber Patch Chord 15m',
  'Thor SDI to Fiber Receiver + 12VDC Power Adapter + BNC-BNC 75Ω 60cm',
  '6-Pin Male-Female Subconn Ethernet Cable', '8-Pin Male to 6-Pin Female Subconn Ethernet Cable',
  'Fuses Set', 'Filters for Power Supply Case IP55',
  'Decklink', 'HDMI to AV Converter', 'Hauppauge (1265)', 'Hauppauge Converter',
  'Switch', 'Planet Switch', 'MOXA', 'UPS', 'Network Cables',
  'Screen', 'Power Supply', 'Power Cables',
];

export const DEFAULT_SYSTEM_IPS = [
  { category: 'MiniSpector Server', name: 'MiniSpector Server', ip: '', port: '', hasIP: true, hasPort: true },
  { category: 'Piloting PC', name: 'Tablet IP / Piloting PC', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Clients', name: 'Motion', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Clients', name: 'PIU', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Clients', name: 'Serial HUB', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Hardware Clients (ODS)', name: 'HCU-Motion', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Hardware Clients (ODS)', name: 'HCU-PIU', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Hardware Clients (ODS)', name: 'Ethernet to Serial', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Hardware Clients (ODS)', name: 'Power Supply Status (LIM)', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Cameras', name: 'Rear Camera (MS-1 only)', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Cameras', name: 'PTZ Camera', ip: '', port: '', hasIP: true, hasPort: true },
  { category: 'MiniSpector Cameras', name: 'Right PRC Camera', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'MiniSpector Cameras', name: 'Left PRC Camera', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Other Clients', name: 'On-Deck Station Fiber Ethernet Switch', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Other Clients', name: 'MiniSpector Fiber Switch', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Other Clients', name: 'MiniSpector Pod Moxa IP', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Other Clients', name: 'Decoder Box', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'Other Clients', name: 'Wi-Fi Module', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'External ODS Solutions', name: 'External Ethernet to Serial Solution', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'External ODS Solutions', name: 'External HCU-Motion Solution', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'External ODS Solutions', name: 'External HCU-PIU Solution', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'External ODS Solutions', name: 'External ODS Fiber Ethernet Solution', ip: '', port: '', hasIP: true, hasPort: false },
  { category: 'RovLog Bridge', name: 'RovLog Bridge DMS', ip: '', port: '', hasIP: false, hasPort: true },
  { category: 'RovLog Bridge', name: 'RovLog Bridge Depth', ip: '', port: '', hasIP: false, hasPort: true },
];

export const PREOP_CHECKLIST = [
  'All sensors verified and installed',
  'LARS system checked and operational',
  'Communication test passed',
  'Navigation system calibrated',
  'Video recording system tested',
  'Emergency procedures reviewed',
  'Supervisor approved',
];

// User IDs allowed to approve simulations. TODO: move to a DB-driven role
// once the admin panel grows role management — hardcoded for parity for now.
export const APPROVER_IDS = ['1774', '1162'];

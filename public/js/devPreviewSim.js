// TEMPORARY dev-only shim: lets the new Mission Info / MiniSpectors UI be
// previewed at http://localhost:3016/?preview=sim without a working
// DATABASE_URL, by skipping login and dropping straight into Simulation
// mode. It is a no-op unless that query param is present. Delete this file
// and its one-line import in main.js once local DB testing is set up.

import { state } from './state.js';
import { initSimROVGrid } from './simulation/setup.js';
import { simState } from './simulation/state.js';
import { renderSimContent } from './simulation/core.js';
import {
  BASE_SCOPES, DEFAULT_SYSTEM_IPS, SENSOR_HARDWARE, MINISPECTOR_FIXED_SENSORS,
  MACHINE_NAMES, SOFTWARE_LIST, HARDWARE_ITEMS, EQUIP_CATEGORIES,
} from './simulation/config.js';
import { setActiveNavItem, setUserCardName, setUserCardRole } from './ui.js';

// Random test data for every Simulation table, in memory only (never saved).
// Opt in with ?preview=sim&fill=1. Lets tables be checked without typing.
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function randIp() { return `172.168.20.${randInt(2, 254)}`; }
function randDate() { return `2026-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`; }
function randSerial(prefix) { return `${prefix}-${randInt(1000, 9999)}`; }

function fillTestData() {
  const rovNums = [1, 2];
  simState.selectedROVs = new Map([[1, 'main'], [2, 'standby']]);
  simState.rovSerials = new Map(rovNums.map(n => [n, randSerial('MS')]));
  simState.rovDescriptions = new Map(rovNums.map(n => [n, `Test MiniSpector ${n}`]));
  simState.selectedScope = Object.keys(BASE_SCOPES)[0];
  simState.projectData = {
    ...simState.projectData,
    name: 'Test Project', code: `TEST-${randInt(100, 999)}`, description: 'Random test data',
    vessel: 'MV Test Vessel', location: 'Test Field',
  };

  const sensorNames = Object.keys(SENSOR_HARDWARE);
  simState.shared.sensors = sensorNames.slice(0, 8).map(name => {
    const hardware = SENSOR_HARDWARE[name] || [];
    return {
      name, note: '', status: 'required', included: true, custom: false, qty: randInt(1, 2),
      model: hardware.length ? pick(hardware) : 'Test model', serialNo: randSerial('SN'),
      calibrated: Math.random() > 0.3, calibratedDate: randDate(),
      tested: Math.random() > 0.3, testedDate: randDate(), rovAssignment: pick(['Shared', 'MS-1', 'MS-2']),
    };
  });

  simState.shared.rovSensors = Object.fromEntries(rovNums.map(n => [n, MINISPECTOR_FIXED_SENSORS.map(s => ({
    name: s.name, category: s.category, model: 'Test model', serialNo: randSerial('FX'),
    calibrated: Math.random() > 0.3, calibratedDate: randDate(),
    tested: Math.random() > 0.3, testedDate: randDate(), disabled: false,
  }))]));

  simState.shared.thrusters = [11, 12, 13, 14, 15, 17, 18].map((bulkhead, i) => ({
    number: String(i + 1), serial: randSerial('TH'), rovAssignment: pick(['Shared', 'MS-1', 'MS-2']),
    bulkhead: String(bulkhead), propeller: i % 2 ? 'Left Hand' : 'Right Hand',
  }));

  const sa = simState.shared.sysarch;
  sa.machines = Array.from({ length: 4 }, () => ({
    name: pick(MACHINE_NAMES), ip: randIp(), software: pick(SOFTWARE_LIST), version: `${randInt(1, 9)}.${randInt(0, 9)}`,
    activated: pick(['Activated', 'Need Activation']), comments: 'Test row',
  }));
  sa.equipment = Array.from({ length: 5 }, () => ({
    batch: `B${randInt(100, 999)}`, category: pick(EQUIP_CATEGORIES), item: pick(HARDWARE_ITEMS),
    serial: randSerial('EQ'), qty: randInt(1, 4), rovAssignment: pick(['Shared', 'MS-1', 'MS-2']), comments: 'Test row',
  }));
  sa.simStatus = Array.from({ length: 5 }, () => ({
    machine: pick(MACHINE_NAMES), scenario: `Scenario ${randInt(1, 20)}`, expected: 'Expected result',
    completion: randInt(0, 100), status: pick(['Passed', 'Warning', 'Failed']), comments: 'Test row',
  }));
  sa.deliverables = { deliveredTo: 'Test Client', date: randDate(), walletHDD: randInt(0, 3), otherHDD: randInt(0, 3), flashDrives: randInt(0, 5) };
  sa.systemIPs = DEFAULT_SYSTEM_IPS.map(p => ({ ...p, ip: p.hasIP ? randIp() : '', port: p.hasPort ? String(randInt(1000, 60000)) : '' }));

  const keys = ['powerSupply', 'tether', 'onDeckStation', 'hcu', 'tablet'];
  sa.setEquipment = { main: {}, backup: {}, mainIds: {}, backupIds: {}, mainCols: 2, backupCols: 2 };
  keys.forEach(key => {
    const mainIds = [randSerial('M'), randSerial('M')];
    const backupIds = [randSerial('B'), randSerial('B')];
    sa.setEquipment.mainIds[key] = mainIds;
    sa.setEquipment.backupIds[key] = backupIds;
    sa.setEquipment.main[key] = mainIds.join(', ');
    sa.setEquipment.backup[key] = backupIds.join(', ');
  });

  simState.shared.issues = Array.from({ length: 3 }, (_, i) => ({
    title: `Test issue ${i + 1}`, description: 'Random test issue', severity: pick(['low', 'medium', 'high']), status: pick(['open', 'closed']),
  }));
}

export function installDevPreview() {
  if (new URLSearchParams(location.search).get('preview') !== 'sim') return;

  state.currentMode = 'simulation';
  state.currentUserId = 'preview';
  state.currentUserName = 'Preview User';
  document.body.classList.add('sim-mode');
  document.getElementById('main-sidebar-nav')?.setAttribute('aria-label', 'Simulation navigation');

  document.getElementById('login-screen')?.classList.add('hidden');
  document.getElementById('mode-screen')?.classList.add('hidden');
  document.getElementById('session-screen')?.classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('nav-operation-sections').classList.remove('hidden');
  document.getElementById('nav-simulation-section').classList.remove('hidden');
  setUserCardName('Preview User');
  setUserCardRole('operator');

  const contentArea = document.getElementById('main-content-area');
  if (contentArea) { contentArea.style.padding = '0'; contentArea.style.overflow = 'hidden'; contentArea.style.position = 'relative'; }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-simulation')?.classList.remove('hidden');
  setActiveNavItem(document.getElementById('sim-nav-mission'));

  initSimROVGrid();

  if (new URLSearchParams(location.search).get('fill') === '1') {
    fillTestData();
    renderSimContent();
  }
}

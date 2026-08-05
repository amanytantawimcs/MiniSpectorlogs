// Ported from the old renderer.js's collectAllData()/populateUI() pair —
// same field IDs, same defaults. Works even for tabs not fully interactive
// yet in this phase (their DOM elements just aren't present, and every
// getValue/getCheck/scrapeTable helper here degrades gracefully to '' / false / []).
import { state } from './state.js';
import { restoreSensorTables } from './sensorTable.js';
import { collectEquipmentLog, populateEquipmentLog, renderAutoEquipmentSummary } from './projectDataLog.js';

const getCheck = (id) => document.getElementById(id) ? document.getElementById(id).checked : false;
const getValue = (id) => document.getElementById(id) ? document.getElementById(id).value : '';

function scrapeTable(tbodyId) {
  const rows = document.querySelectorAll(`#${tbodyId} tr`);
  return Array.from(rows).map(row => ({
    name: row.querySelector('.row-name')?.value || '',
    status: row.querySelector('.row-status')?.checked ? 'OK' : 'Fault',
    model: row.querySelector('.row-model')?.value || '',
    cal: row.querySelector('.row-cal')?.value || '',
    notes: row.querySelector('.row-notes')?.value || '',
  })).filter(item => item.name.trim() !== '');
}

function parseDur(d) {
  if (!d) return 0;
  const h = /(\d+)\s*hrs/.exec(d);
  const m = /(\d+)\s*mins/.exec(d);
  return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
}
function fmtDur(mins) {
  const h = Math.floor(mins / 60), mn = mins % 60;
  const p = [];
  if (h > 0) p.push(`${h} hrs`);
  if (mn > 0) p.push(`${mn} mins`);
  return p.join(' ') || '0 mins';
}

export function collectAllData() {
  const cameraSystems = scrapeTable('camLightBody');
  const otherSensors = scrapeTable('sensorBody');

  const crewList = [];
  document.querySelectorAll('.crew-row').forEach(row => {
    const name = row.querySelector('.crew-name-input')?.value;
    const role = row.querySelector('.crew-role-select')?.value;
    const signOn = row.querySelector('.crew-signon-input')?.value;
    const signOff = row.querySelector('.crew-signoff-input')?.value;
    const shiftSelect = row.querySelector('.crew-shift-select');
    const shiftInput = row.querySelector('.crew-shift-input');
    const shift = (shiftSelect && shiftSelect.style.display === 'none') ? shiftInput.value : shiftSelect?.value;
    if (name) crewList.push({ name, role, shift, signOn, signOff });
  });
  const supervisorEntry = crewList.find(c => c.role === 'ROV Supervisor');

  const systemsList = [];
  let defaultSystemName = 'N/A';
  document.querySelectorAll('.system-row').forEach(row => {
    const name = row.querySelector('.system-name')?.value;
    const isDefault = row.querySelector('.system-default-radio')?.checked;
    if (name) {
      systemsList.push({ name, isDefault });
      if (isDefault) defaultSystemName = name;
    }
  });

  let diveMinutes = 0;
  (state.currentReportData.diveLogs || []).forEach(l => diveMinutes += parseDur(l.duration));
  let sbMinutes = 0;
  (state.currentReportData.standbyLogs || []).forEach(l => sbMinutes += parseDur(l.duration));

  return {
    Minispectornumber: getValue('Minispectornumber'),
    projectName: getValue('projectName'),
    projectCode: getValue('projectCode'),
    Vessel: getValue('Vessel'),
    operationalIdAuto: getValue('operationalIdAuto'),

    shiftLogs: state.currentReportData.shiftLogs || [],

    dailySummary: {
      startDate: getValue('startDate'), endDate: getValue('endDate'), location: getValue('location'),
      weather: getValue('weather'), visibility: getValue('visibility'), temperature: getValue('temperature'),
      shiftno: getValue('shiftno'), scope: getValue('scope'),
    },

    supervisorName: supervisorEntry ? supervisorEntry.name : '',
    crew: crewList,
    preDive: { selectedSystem: getValue('preDiveSystemSelect'), overallRemarks: getValue('preDiveRemarks'), checks: {} },
    minispectorSystems: systemsList,
    activeMinispector: defaultSystemName,

    cameraSystems, otherSensors,
    preOperationData: state.preOpData || null,
    finalSetup: state.currentReportData.finalSetup || null,

    projectDataLog: {
      contractor: getValue('contractor'),
      projectManager: getValue('projectManager'),
      missionDetails: getValue('missionDetails'),
      weatherHigh: getValue('pdlWeatherHigh'),
      weatherLow: getValue('pdlWeatherLow'),
      weatherHumidity: getValue('pdlWeatherHumidity'),
      weatherNotes: getValue('pdlWeatherNotes'),
      equipment: collectEquipmentLog(),
    },

    auxToolStatus: {},
    softwareStatus: { pilot: getCheck('soft_pilot'), hmi: getCheck('soft_hmi'), logging: getCheck('soft_logging') },
    larsStatus: {
      davit: { winch: getValue('lars_davit_winch'), secure: getValue('lars_davit_secure'), type: getValue('lars_davit_type') },
      diving: { type: getValue('lars_diving_type'), clump: getCheck('lars_diving_clump') },
      vesselCrane: { type: getValue('lars_crane_type') },
      winch: getCheck('lars_winch'), umbilical: getCheck('lars_umbilical'), crane: getCheck('lars_crane'), tether: getCheck('lars_tether'),
    },
    faultReport: {
      status: document.querySelector('input[name="sysStatus"]:checked')?.value || '',
      desc: getValue('faultDesc'), action: getValue('correctiveAction'), parts: getValue('partsUsed'),
      tech: getValue('techResponsible'), pending: getValue('remainingIssues'),
    },
    postDive: {
      thrusters: getCheck('post_thrusters'), props: getCheck('post_props'), frame: getCheck('post_frame'), buoyancy: getCheck('post_buoyancy'),
      fasteners: getCheck('post_fasteners'), dome: getCheck('post_dome'), lights: getCheck('post_lights'), sensorMount: getCheck('post_sensorMount'),
      fogging: getCheck('post_fogging'), housings: getCheck('post_housings'), condensation: getCheck('post_condensation'),
      orings: getCheck('post_orings'), connectors: getCheck('post_connectors'), tether: getCheck('post_tether'), cuts: getCheck('post_cuts'),
      smell: getCheck('post_smell'), storage: getCheck('post_storage'), remarks: getValue('postDiveRemarks'),
    },
    remarks: getValue('additionalRemarks'),

    diveLogs: state.currentReportData.diveLogs || [],
    maintenanceLogs: state.currentReportData.maintenanceLogs || [],
    hseReports: state.currentReportData.hseReports || [],
    standbyLogs: state.currentReportData.standbyLogs || [],
    faultLogs: state.currentReportData.faultLogs || [],
    issueReports: state.currentReportData.issueReports || [],

    totalStandbyTime: fmtDur(sbMinutes),
    totalDiveDuration: fmtDur(diveMinutes),
    totalDiveCount: (state.currentReportData.diveLogs || []).length,

    checklists: state.currentReportData.checklists || {},
  };
}

export function populateUI(data) {
  if (!data) return;

  state.currentReportData = {
    diveLogs: data.diveLogs || [],
    maintenanceLogs: data.maintenanceLogs || [],
    hseReports: data.hseReports || [],
    standbyLogs: data.standbyLogs || [],
    faultLogs: data.faultLogs || [],
    issueReports: data.issueReports || [],
    shiftLogs: data.shiftLogs || [],
    checklists: data.checklists || { mobilization: {}, startup: {}, preOp: {}, postOp: {}, shutdown: {}, demob: {} },
    finalSetup: data.finalSetup || null,
  };

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  setVal('operationalIdAuto', data.operationalIdAuto);
  setVal('Minispectornumber', data.Minispectornumber);
  setVal('projectName', data.projectName);
  setVal('projectCode', data.projectCode);
  setVal('Vessel', data.Vessel);
  setVal('scope', data.dailySummary?.scope);
  setVal('location', data.dailySummary?.location);
  setVal('startDate', data.dailySummary?.startDate);
  setVal('endDate', data.dailySummary?.endDate);
  setVal('weather', data.dailySummary?.weather);
  setVal('visibility', data.dailySummary?.visibility);
  setVal('temperature', data.dailySummary?.temperature);
  setVal('shiftno', data.dailySummary?.shiftno);

  setVal('contractor', data.projectDataLog?.contractor);
  setVal('projectManager', data.projectDataLog?.projectManager);
  setVal('missionDetails', data.projectDataLog?.missionDetails);
  setVal('pdlWeatherHigh', data.projectDataLog?.weatherHigh);
  setVal('pdlWeatherLow', data.projectDataLog?.weatherLow);
  setVal('pdlWeatherHumidity', data.projectDataLog?.weatherHumidity);
  setVal('pdlWeatherNotes', data.projectDataLog?.weatherNotes);
  populateEquipmentLog(data.projectDataLog?.equipment);

  setVal('preDiveRemarks', data.preDive?.overallRemarks);

  setCheck('soft_pilot', data.softwareStatus?.pilot);
  setCheck('soft_hmi', data.softwareStatus?.hmi);
  setCheck('soft_logging', data.softwareStatus?.logging);

  setVal('lars_davit_winch', data.larsStatus?.davit?.winch);
  setVal('lars_davit_secure', data.larsStatus?.davit?.secure);
  setVal('lars_davit_type', data.larsStatus?.davit?.type);
  setVal('lars_diving_type', data.larsStatus?.diving?.type);
  setCheck('lars_diving_clump', data.larsStatus?.diving?.clump);
  setVal('lars_crane_type', data.larsStatus?.vesselCrane?.type);
  setCheck('lars_winch', data.larsStatus?.winch);
  setCheck('lars_umbilical', data.larsStatus?.umbilical);
  setCheck('lars_crane', data.larsStatus?.crane);
  setCheck('lars_tether', data.larsStatus?.tether);

  setVal('faultDesc', data.faultReport?.desc);
  setVal('correctiveAction', data.faultReport?.action);
  setVal('partsUsed', data.faultReport?.parts);
  setVal('techResponsible', data.faultReport?.tech);
  setVal('remainingIssues', data.faultReport?.pending);

  Object.entries(data.postDive || {}).forEach(([key, val]) => {
    if (key === 'remarks') { setVal('postDiveRemarks', val); return; }
    setCheck('post_' + key, val);
  });

  setVal('additionalRemarks', data.remarks);

  // crew rows — rebuilt via the crew module's addCrewRow, called from projectDetails.js
  const crewContainer = document.getElementById('crew-container');
  if (crewContainer) crewContainer.innerHTML = '';
  const emptyState = document.getElementById('crew-empty-state');
  if (emptyState) emptyState.style.display = (data.crew && data.crew.length) ? 'none' : '';
  if (window.__addCrewRow) {
    (data.crew || []).forEach(c => window.__addCrewRow(c.name, c.role, c.shift, c.signOn, c.signOff));
  }

  restoreSensorTables(data.cameraSystems, data.otherSensors);

  state.preOpData = data.preOperationData || null;
  if (state.preOpData) {
    document.getElementById('nav-preop-item')?.classList.remove('hidden');
    document.getElementById('nav-finalsetup-item')?.classList.remove('hidden');
    if (window.__renderProjectSimInfo) window.__renderProjectSimInfo();
  }
  renderAutoEquipmentSummary(state.preOpData);

  if (window.__renderLogs) window.__renderLogs();
  if (window.__refreshChecklists) window.__refreshChecklists();
}

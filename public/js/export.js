// Word export goes through a server route that builds a real .docx with the
// `docx` npm package (server/routes/export.js) — the old app only ever
// downloaded raw JSON with an apology since Word generation needs a backend.
// Excel export stays client-side via the SheetJS CDN script already loaded
// in index.html (global `XLSX`), same as the old app.

import { state } from './state.js';
import { showToast } from './ui.js';
import { collectAllData } from './projectData.js';
import { collectSimState } from './simulation/core.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Standby/Dive(Classic)/Maintenance have real client-supplied .docx templates
// (server/templates/*.docx) that get filled via docxtemplater — pixel-
// identical to the client's own layout/branding, not a recreation of it.
// Operation Daily Log and Issue Report use generated equivalents matching
// the client's "ROV Technical Logbook" Operation Daily Log / Issue Report
// pages (see scripts/generate-report-templates.js). Dive Log offers both:
// the original template ("MiniSpector® DIVE LOG") and the newer branded
// sheet ("Operation Daily Log"), as two separate export buttons. Everything
// else still goes through the programmatic docx-library builder.
const TEMPLATE_LOG_TYPE_FROM_FILENAME = {
  'Standby.docx': 'standby',
  'Divelog.docx': 'diveClassic',
  'OperationDailyLog.docx': 'dive',
  'Maintenance.docx': 'maintenance',
  'IssueReport.docx': 'issue',
  'ProjectDataLog.docx': 'projectDataLog',
  'ReplacementDataLog.docx': 'replacementLog',
};

export async function exportWord(arg) {
  const templateLogType = TEMPLATE_LOG_TYPE_FROM_FILENAME[arg];
  const data = collectAllData();
  showToast('Generating Word report…', 'info');
  try {
    const res = templateLogType
      ? await fetch('/api/export/log-template-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logType: templateLogType, data }),
      })
      : await fetch('/api/export/operation-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, section: 'all' }),
      });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const blob = await res.blob();
    const filenamePrefix = templateLogType ? arg.replace('.docx', '') : 'Report';
    downloadBlob(blob, `${filenamePrefix}-${data.operationalIdAuto || data.projectCode || 'report'}.docx`);
  } catch (e) {
    showToast('Word export failed: ' + e.message, 'error');
  }
}

export async function exportFinalSetupWord() {
  const preOpData = state.preOpData;
  const fs = state.currentReportData.finalSetup;
  if (!preOpData || !fs) { showToast('No Final Setup data to export yet.', 'warn'); return; }
  const activeRov = (preOpData.rovs || []).find(r => r.rovNumber === fs.activeROVNum);
  const data = {
    projectName: preOpData.projectName,
    projectCode: preOpData.projectCode,
    scopeName: preOpData.scopeName,
    operatedUnit: activeRov ? { rovNumber: activeRov.rovNumber, role: activeRov.role } : null,
    lockedAt: fs.lockedAt,
    sensors: fs.sensors,
    thrusters: fs.thrusters,
    notes: fs.notes,
    revisions: fs.revisions,
  };
  showToast('Generating Word report…', 'info');
  try {
    const res = await fetch('/api/export/final-setup-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const blob = await res.blob();
    downloadBlob(blob, `FinalSetup-${data.projectCode || 'setup'}.docx`);
  } catch (e) {
    showToast('Word export failed: ' + e.message, 'error');
  }
}

export async function exportSimulationWord() {
  const data = collectSimState();
  showToast('Generating simulation report…', 'info');
  try {
    const res = await fetch('/api/export/simulation-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const blob = await res.blob();
    downloadBlob(blob, `Simulation-${data.projectCode || 'simulation'}.docx`);
  } catch (e) {
    showToast('Word export failed: ' + e.message, 'error');
  }
}

export function exportSimulationExcel() {
  const data = collectSimState();
  const wb = XLSX.utils.book_new();

  const allFixed = Object.entries(data.rovSensors || {})
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .flatMap(([num, arr]) => arr.map(s => ({
      ROV: `MS-${num}`, Sensor: s.name, Model: s.model || '—',
      Calibrated: s.calibrated ? 'Yes' : 'No', Tested: s.tested ? 'Yes' : 'No',
    })));
  if (allFixed.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allFixed), 'Fixed Sensors');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    (data.sensors || []).map((s, i) => ({
      '#': i + 1, Sensor: s.name, Model: s.model || '—', Qty: s.qty || 1,
      Calibrated: s.calibrated ? 'Yes' : 'No', Tested: s.tested ? 'Yes' : 'No', Status: s.status,
    })),
  ), 'Mission Sensors');

  if (data.sysarch?.machines?.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.sysarch.machines.map((m, i) => ({ '#': i + 1, Machine: m.name, Software: m.software || '—', IP: m.ip || '—', Status: m.activated || 'OK' })),
    ), 'Machines');
  }
  if (data.sysarch?.equipment?.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.sysarch.equipment.map((e, i) => ({ '#': i + 1, Item: e.item || '—', Category: e.category || '', Qty: e.qty || 0, Assignment: e.rovAssignment || '', Comments: e.comments || '' })),
    ), 'Equipment');
  }
  if (data.thrusters?.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.thrusters.map((t, i) => ({ '#': i + 1, Thruster: t.number || '—', Serial: t.serial || '—' })),
    ), 'Thrusters');
  }
  if (data.issues?.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.issues.map((iss, i) => ({ '#': i + 1, Title: iss.title || '—', Description: iss.description || '', Severity: iss.severity || '', Status: iss.status || '' })),
    ), 'Issues');
  }

  XLSX.writeFile(wb, `PackingList-${data.projectCode || 'SIM'}.xlsx`);
}

// Field/section layout ported from the client's own "JOB SIMULATION &
// DELIVERABLES" packing-list template (single "Packing List" sheet, plus a
// "Lookup" sheet of dropdown-validation lists we can't reproduce — SheetJS's
// free client-side build doesn't support writing data validation). Rows here
// mirror that template's section headers/columns 1:1 where the app actually
// has the data (machines, equipment, deliverables, simulation status);
// fields the app has no source for (Project Manager, Job Supervisor, Job
// Team, Technical Support Approval, Simulation Notes/Date) are left as
// blank cells for manual fill-in, same as the original template.
export function exportJobSimulationDeliverables() {
  const data = collectSimState();
  const del = data.sysarch.deliverables || {};
  const rows = [];
  const blank = () => rows.push([]);
  const section = (title) => rows.push([title]);
  const field = (label, value) => rows.push([label, value ?? '']);

  rows.push(['JOB SIMULATION & DELIVERABLES']);
  blank();
  section('PROJECT DETAILS');
  field('Project Name:', data.projectName);
  field('Job Code:', data.projectCode);
  field('Project Scope:', data.scopeName || data.projectScope);
  field('Date:', data.reportDate);
  field('Project Manager:', '');
  field('Job Supervisor:', '');
  field('Job Team:', '');
  field('Prepared By [IT Representative]:', state.currentUserName);
  field('Delivered To:', del.deliveredTo);
  field('Technical Support Approval:', '');
  blank();

  section('MACHINES');
  rows.push(['Item #', 'Machine Name', 'IP Address', 'Installed Software', 'Software Version', 'Activated', 'Comments']);
  (data.sysarch.machines || []).forEach((m, i) => rows.push([i + 1, m.name || '', m.ip || '', m.software || '', m.version || '', m.activated || '', m.comments || '']));
  blank();

  section('HARDWARE & CONSUMABLES');
  rows.push(['Item #', 'Item', 'Quantity', 'Comments']);
  (data.sysarch.equipment || []).forEach((e, i) => rows.push([i + 1, e.item || '', e.qty || 0, e.comments || '']));
  blank();

  section('DELIVERABLES');
  field('Delivered To:', del.deliveredTo);
  field('Date:', del.date);
  field('Wallet HDD', del.walletHDD || 0);
  field('Other HDD', del.otherHDD || 0);
  field('Memory Flash Drives', del.flashDrives || 0);
  blank();

  section('DELIVERABLES NOTES');
  if ((del.notes || []).length) del.notes.forEach(n => rows.push([n]));
  else rows.push(['']);
  blank();

  section('SIMULATION NOTES');
  field('Simulation Date:', '');
  rows.push(['']);
  blank();

  section('SIMULATION STATUS');
  rows.push(['Item #', 'Machine Name', 'Testing Scenario', 'Expected Outcome', '% Complete', 'Status', 'Comments']);
  (data.sysarch.simStatus || []).forEach((s, i) => rows.push([i + 1, s.machine || '', s.scenario || '', s.expected || '', s.completion || 0, s.status || '', s.comments || '']));

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Job Simulation & Deliverables');
  XLSX.writeFile(wb, `JobSimulationDeliverables-${data.projectCode || 'SIM'}.xlsx`);
}

export function saveSimulationJSON() {
  const data = collectSimState();
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `Simulation-${data.projectCode || 'draft'}.json`,
  );
}

export function installExport() {
  window.exportWord = exportWord;
  window.exportFinalSetupWord = exportFinalSetupWord;
  window.exportSimulationWord = exportSimulationWord;
  window.exportSimulationExcel = exportSimulationExcel;
  window.exportJobSimulationDeliverables = exportJobSimulationDeliverables;
  window.saveSimulationJSON = saveSimulationJSON;
}

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
  window.saveSimulationJSON = saveSimulationJSON;
}

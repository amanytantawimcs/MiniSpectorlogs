const express = require('express');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell, WidthType } = require('docx');
const ExcelJS = require('exceljs');

const router = express.Router();

const p = (text) => new Paragraph({ children: [new TextRun(String(text ?? ''))] });
const title = (text) => new Paragraph({ text: String(text ?? ''), heading: HeadingLevel.TITLE });
const h1 = (text) => new Paragraph({ text: String(text ?? ''), heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } });
const kv = (label, val) => new Paragraph({ children: [
  new TextRun({ text: `${label}: `, bold: true }),
  new TextRun(String(val ?? '') || '—'),
] });

function headerCell(text) {
  return new TableCell({
    width: { size: 100, type: WidthType.PERCENTAGE },
    shading: { fill: 'D9D9D9' },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: true, size: 18 })] })],
  });
}
function bodyCell(text) {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '') || '—', size: 18 })] })] });
}

function logTable(columns, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: columns.map(c => headerCell(c.label)) }),
      ...rows.map(row => new TableRow({ children: columns.map(c => bodyCell(c.get(row))) })),
    ],
  });
}

function emptyNote(label) {
  return new Paragraph({ children: [new TextRun({ text: `No ${label} recorded.`, italics: true, color: '808080' })] });
}

const SECTIONS = {
  diveLogs: {
    heading: 'Dive Logs',
    columns: [
      { label: 'Dive #', get: r => r.num },
      { label: 'ROV', get: r => r.rov },
      { label: 'Date', get: r => r.date },
      { label: 'Time', get: r => `${r.startTime || ''}–${r.endTime || ''}` },
      { label: 'Depth (m)', get: r => r.depth },
      { label: 'Duration', get: r => r.duration },
      { label: 'Int. Temp.', get: r => r.intTemp },
      { label: 'Int. Humidity', get: r => r.intHumidity },
      { label: 'Rain', get: r => r.rain },
      { label: 'Objective', get: r => r.objective },
      { label: 'Purpose', get: r => r.purpose },
      { label: 'Area', get: r => r.area },
      { label: 'Notes', get: r => r.notes },
    ],
  },
  standbyLogs: {
    heading: 'Standby Time Log',
    columns: [
      { label: 'ID', get: r => r.id },
      { label: 'Logged By', get: r => r.by },
      { label: 'Date', get: r => r.date },
      { label: 'Time', get: r => `${r.startTime || ''}–${r.endTime || ''}` },
      { label: 'Duration', get: r => r.duration },
      { label: 'Category', get: r => r.category },
      { label: 'Description', get: r => r.desc },
    ],
  },
  maintenanceLogs: {
    heading: 'Maintenance Log',
    columns: [
      { label: 'ID', get: r => r.id },
      { label: 'Date', get: r => r.date },
      { label: 'By', get: r => r.by },
      { label: 'Task', get: r => r.task },
      { label: 'Details', get: r => r.details },
      { label: 'Parts Used', get: r => r.parts },
      { label: 'Remarks', get: r => r.remarks },
    ],
  },
  hseReports: {
    heading: 'HSE Reports',
    columns: [
      { label: 'ID', get: r => r.id },
      { label: 'Type', get: r => r.type },
      { label: 'Description', get: r => r.desc },
      { label: 'Immediate Action', get: r => r.action },
      { label: 'Root Cause', get: r => r.root },
      { label: 'Prevention', get: r => r.prev },
    ],
  },
  faultLogs: {
    heading: 'Technical / Fault Log',
    columns: [
      { label: 'Status', get: r => r.status },
      { label: 'Technician', get: r => r.tech },
      { label: 'Description', get: r => r.desc },
      { label: 'Corrective Action', get: r => r.action },
      { label: 'Parts Used', get: r => r.parts },
      { label: 'Remaining Issues', get: r => r.remaining },
    ],
  },
  issueReports: {
    heading: 'Issue Report',
    columns: [
      { label: 'Dive #', get: r => r.diveNo },
      { label: 'Issue Description', get: r => r.desc },
      { label: 'Cause', get: r => r.cause },
      { label: 'Lim Reading', get: r => r.limReading },
      { label: 'Action Taken', get: r => r.actionTaken },
      { label: 'Contacted System Support Personnel', get: r => r.contactedBy },
      { label: 'Malfunctioning Component No.', get: r => r.malfComponent },
      { label: 'Replaced Component No.', get: r => r.replacedComponent },
    ],
  },
  shiftLogs: {
    heading: 'Shift Log',
    columns: [
      { label: 'Shift #', get: r => r.shiftNo },
      { label: 'Start', get: r => r.startDate },
      { label: 'End', get: r => r.endDate },
      { label: 'Weather', get: r => r.weather },
      { label: 'Visibility', get: r => r.visibility },
      { label: 'Temp (°C)', get: r => r.temperature },
      { label: 'Crew', get: r => (r.crew || []).join(', ') },
      { label: 'Notes', get: r => r.notes },
    ],
  },
};
const SECTION_ORDER = ['shiftLogs', 'diveLogs', 'standbyLogs', 'maintenanceLogs', 'hseReports', 'faultLogs', 'issueReports'];

function buildOperationDocChildren(data, section) {
  const children = [
    title('MiniSpector Log — Operation Report'),
    p(''),
    kv('Project', data.projectName),
    kv('Code', data.projectCode),
    kv('Operational ID', data.operationalIdAuto),
    kv('Vessel', data.Vessel),
    kv('Scope', data.dailySummary?.scope),
    kv('Location', data.dailySummary?.location),
  ];

  const sectionsToRender = section === 'all' ? SECTION_ORDER : [section];
  sectionsToRender.forEach(key => {
    const cfg = SECTIONS[key];
    if (!cfg) return;
    const rows = data[key] || [];
    children.push(h1(cfg.heading));
    children.push(rows.length ? logTable(cfg.columns, rows) : emptyNote(cfg.heading.toLowerCase()));
  });

  return children;
}

// Colors AND grid layout lifted directly from the client's own "JOB
// SIMULATION & DELIVERABLES" packing-list template (section header teal,
// table-header dark teal w/ white text, field-label gray; Hardware &
// Consumables running side-by-side with Deliverables/Notes, same as the
// original — not stacked sequentially). Rebuilt from scratch with ExcelJS
// (not filling the actual template file) because the client-side SheetJS
// build this app otherwise uses for Excel exports (public/js/export.js) is
// the free Community Edition, which cannot write cell styles at all
// (verified: a fill written with it reads back as no fill). ExcelJS runs
// server-side and writes fills/fonts/borders/images correctly, same reason
// Word exports already go through a server route instead of a client-side
// library. Can't reproduce the original's native Excel Table banding
// (alternating row colors, filter buttons) — that's a different styling
// mechanism this approach doesn't touch either.
const JSD_SECTION_FILL = 'FFCCEBE8';
const JSD_HEADER_FILL = 'FF274C47';
const JSD_LABEL_FILL = 'FFF2F2F2';
const JSD_LEFT_COLS = 5;   // B:F
const JSD_TOTAL_COLS = 8;  // B:H

function buildJobSimulationDeliverablesWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Job Simulation & Deliverables');
  sheet.getColumn(1).width = 3;
  sheet.getColumn(2).width = 8;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 16;
  sheet.getColumn(7).width = 26;
  sheet.getColumn(8).width = 30;

  const fillCell = (row, col, rgb, bold, textColor) => {
    const cell = sheet.getCell(row, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rgb } };
    if (bold) cell.font = { bold: true, color: textColor ? { argb: textColor } : undefined };
    return cell;
  };
  const mergeSpan = (row, fromCol, toCol) => { if (toCol > fromCol) sheet.mergeCells(row, fromCol, row, toCol); };
  // A full-width teal section header spanning B:H (col 2-8).
  const sectionFull = (row, label) => {
    mergeSpan(row, 2, JSD_TOTAL_COLS);
    fillCell(row, 2, JSD_SECTION_FILL, true).value = label;
    for (let c = 3; c <= JSD_TOTAL_COLS; c++) fillCell(row, c, JSD_SECTION_FILL, false);
  };
  // A dark-teal table header row spanning the given column range.
  const tableHeaderRow = (row, fromCol, labels) => {
    labels.forEach((label, i) => { fillCell(row, fromCol + i, JSD_HEADER_FILL, true, 'FFFFFFFF').value = label; });
  };
  const dataRowAt = (row, fromCol, values) => { values.forEach((v, i) => { sheet.getCell(row, fromCol + i).value = v; }); };
  // A gray label cell (col G) + plain value cell (col H) — the right-side
  // "field" pattern used throughout (Date:, Project Manager:, Delivered To:, etc).
  const rightField = (row, label, value) => {
    fillCell(row, 7, JSD_LABEL_FILL, true).value = label;
    sheet.getCell(row, 8).value = value ?? '';
  };

  const del = data.sysarch?.deliverables || {};
  let r = 1;

  // --- Title + logo ---
  mergeSpan(r, 2, JSD_TOTAL_COLS);
  sheet.getCell(r, 2).value = 'JOB SIMULATION & DELIVERABLES';
  sheet.getCell(r, 2).font = { bold: true, size: 14 };
  try {
    const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo.png');
    const imageId = wb.addImage({ buffer: fs.readFileSync(logoPath), extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 6.2, row: 0.1 }, ext: { width: 90, height: 60 } });
  } catch { /* logo optional — export still works without it */ }
  r += 2;

  // --- Header block: General/Project Details (left) beside Date/Project
  // Manager/etc (right), one row per field, same row pairing as the
  // original template (Project Name <-> Project Manager, Job Code <-> Job
  // Supervisor, Project Scope <-> Job Team, then right-only for the rest). ---
  fillCell(r, 2, JSD_SECTION_FILL, true).value = 'General:';
  fillCell(r, 3, JSD_SECTION_FILL, false);
  fillCell(r, 4, JSD_SECTION_FILL, true).value = 'PROJECT DETAILS';
  fillCell(r, 5, JSD_SECTION_FILL, false);
  fillCell(r, 6, JSD_SECTION_FILL, false);
  fillCell(r, 7, JSD_SECTION_FILL, true).value = 'DATE:';
  fillCell(r, 8, JSD_SECTION_FILL, false).value = data.reportDate || '';
  r++;

  const leftLabeled = (row, label, value) => {
    fillCell(row, 4, JSD_LABEL_FILL, true).value = label;
    fillCell(row, 5, JSD_LABEL_FILL, false).value = value ?? '';
  };
  leftLabeled(r, 'PROJECT NAME:', data.projectName); rightField(r, 'Project Manager:', ''); r++;
  leftLabeled(r, 'JOB CODE:', data.projectCode); rightField(r, 'Job Supervisor:', ''); r++;
  leftLabeled(r, 'PROJECT SCOPE:', data.scopeName || data.projectScope); rightField(r, 'Job Team:', ''); r++;
  rightField(r, 'Prepared By [IT Representative]:', data.preparedBy); r++;
  rightField(r, 'Delivered To:', del.deliveredTo); r++;
  rightField(r, 'Technical Support Approval:', ''); r += 2;

  // --- MACHINES (full width) ---
  sectionFull(r, 'MACHINES'); r++;
  tableHeaderRow(r, 2, ['Item #', 'Machine Name', 'IP Address', 'Installed Software', 'Software Version', 'Activated', 'Comments']); r++;
  const machines = data.sysarch?.machines || [];
  machines.forEach((m, i) => { dataRowAt(r, 2, [i + 1, m.name || '', m.ip || '', m.software || '', m.version || '', m.activated || '', m.comments || '']); r++; });
  sheet.getCell(r, 2).value = 'TOTALS'; sheet.getCell(r, 2).font = { bold: true };
  sheet.getCell(r, 3).value = `Machines Count: ${machines.length}`;
  r += 2;

  // --- HARDWARE & CONSUMABLES (left, B:F) beside DELIVERABLES /
  // DELIVERABLES NOTES / SIMULATION NOTES (right, G:H) — same rows,
  // matching the original's side-by-side layout instead of stacking. ---
  const equipment = data.sysarch?.equipment || [];
  const notes = (del.notes || []).length ? del.notes : [''];

  const leftSeq = [];
  leftSeq.push({ kind: 'sectionLeft', text: 'HARDWARE & CONSUMABLES' });
  leftSeq.push({ kind: 'tableHeader', values: ['Item #', 'Item', 'Quantity', 'Comments'] });
  equipment.forEach((e, i) => leftSeq.push({ kind: 'data', values: [i + 1, e.item || '', e.qty || 0, e.comments || ''] }));
  leftSeq.push({ kind: 'totals', text: `Items Count: ${equipment.length}` });

  const rightSeq = [];
  rightSeq.push({ kind: 'sectionRight', text: 'DELIVERABLES' });
  rightSeq.push({ kind: 'field', label: 'Delivered To :', value: del.deliveredTo });
  rightSeq.push({ kind: 'field', label: 'Date :', value: del.date });
  rightSeq.push({ kind: 'field', label: 'Wallet HDD', value: del.walletHDD || 0 });
  rightSeq.push({ kind: 'field', label: 'Other HDD', value: del.otherHDD || 0 });
  rightSeq.push({ kind: 'field', label: 'Memory Flash Drives', value: del.flashDrives || 0 });
  rightSeq.push({ kind: 'blank' });
  rightSeq.push({ kind: 'sectionRight', text: 'DELIVERABLES NOTES' });
  notes.forEach((n, i) => rightSeq.push({ kind: 'note', label: i === 0 ? 'Notes From' : '', value: n }));
  rightSeq.push({ kind: 'sectionRight', text: 'SIMULATION NOTES' });
  rightSeq.push({ kind: 'field', label: 'SIMULATION DATE:', value: '' });

  const parallelRows = Math.max(leftSeq.length, rightSeq.length);
  for (let i = 0; i < parallelRows; i++) {
    const row = r + i;
    const left = leftSeq[i];
    if (left) {
      if (left.kind === 'sectionLeft') sectionN(sheet, row, 2, JSD_LEFT_COLS, left.text);
      else if (left.kind === 'tableHeader') tableHeaderRow(row, 2, left.values);
      else if (left.kind === 'data') dataRowAt(row, 2, left.values);
      else if (left.kind === 'totals') { sheet.getCell(row, 2).value = 'TOTALS'; sheet.getCell(row, 2).font = { bold: true }; sheet.getCell(row, 3).value = left.text; }
    }
    const right = rightSeq[i];
    if (right) {
      if (right.kind === 'sectionRight') sectionN(sheet, row, 7, 2, right.text);
      else if (right.kind === 'field') rightField(row, right.label, right.value);
      else if (right.kind === 'note') { if (right.label) fillCell(row, 7, JSD_LABEL_FILL, true).value = right.label; sheet.getCell(row, 8).value = right.value; }
    }
  }
  r += parallelRows + 1;

  // --- SIMULATION STATUS (full width) ---
  sectionFull(r, 'SIMULATION STATUS'); r++;
  tableHeaderRow(r, 2, ['Item #', 'Machine Name', 'Testing Scenario', 'Expected Outcome', '% Complete', 'Status', 'Comments']); r++;
  (data.sysarch?.simStatus || []).forEach((s, i) => { dataRowAt(r, 2, [i + 1, s.machine || '', s.scenario || '', s.expected || '', s.completion || 0, s.status || '', s.comments || '']); r++; });

  return wb;
}

const PH_NAVY_FILL = 'FF17253D';   // app sidebar navy — table header row
const PH_ORANGE = 'FFF39124';      // app accent orange — title text

// Project Management's "Project history" feed as a styled .xlsx. `data.log`
// is already the person/section/what/when rows as shown on screen (computed
// client-side by projectManagement.js's historyRowData — see that file's
// comment on why it's the single source of truth), so this just lays them
// into a table; no reformatting/relabeling happens here.
function buildProjectHistoryWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Project History');
  sheet.getColumn(1).width = 3;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 55;

  let r = 1;
  sheet.mergeCells(r, 2, r, 5);
  sheet.getCell(r, 2).value = 'PROJECT HISTORY';
  sheet.getCell(r, 2).font = { bold: true, size: 14, color: { argb: PH_ORANGE } };
  try {
    const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo.png');
    const imageId = wb.addImage({ buffer: fs.readFileSync(logoPath), extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 4.2, row: 0.1 }, ext: { width: 90, height: 60 } });
  } catch { /* logo optional — export still works without it */ }
  r += 1;
  sheet.getCell(r, 2).value = [data.projectName, data.projectCode].filter(Boolean).join(' — ') || 'Project';
  sheet.getCell(r, 2).font = { italic: true, color: { argb: 'FF666666' } };
  r += 2;

  ['Date & Time', 'Person', 'Section', 'Update'].forEach((label, i) => {
    const cell = sheet.getCell(r, 2 + i);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PH_NAVY_FILL } };
  });
  r++;

  (data.log || []).forEach(entry => {
    sheet.getCell(r, 2).value = entry.when || '';
    sheet.getCell(r, 3).value = entry.person || '';
    sheet.getCell(r, 4).value = entry.section || '';
    sheet.getCell(r, 5).value = entry.what || '';
    r++;
  });

  return wb;
}

// Teal section header spanning `span` columns starting at `fromCol` (used
// for the side-by-side Hardware/Deliverables block, where each side's
// header only spans its own half of the sheet instead of the full width).
function sectionN(sheet, row, fromCol, span, label) {
  if (span > 1) sheet.mergeCells(row, fromCol, row, fromCol + span - 1);
  const cell = sheet.getCell(row, fromCol);
  cell.value = label;
  cell.font = { bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JSD_SECTION_FILL } };
  for (let c = fromCol + 1; c < fromCol + span; c++) {
    sheet.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: JSD_SECTION_FILL } };
  }
}

function buildSimulationDocChildren(data) {
  const allFixed = Object.entries(data.rovSensors || {})
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .flatMap(([num, arr]) => arr.map(s => ({ ...s, rovNum: num })));
  const missionSensors = data.sensors || [];
  const machines = data.sysarch?.machines || [];
  const equipment = data.sysarch?.equipment || [];
  const thrusters = data.thrusters || [];
  const issues = data.issues || [];

  const children = [
    title('MiniSpector — Simulation Report'),
    p(''),
    kv('Project', data.projectName),
    kv('Code', data.projectCode),
    kv('Scope', data.scopeName),
    kv('Report Date', data.reportDate),
    kv('Approval Status', data.approvalStatus),
  ];

  children.push(h1('ROVs'));
  children.push((data.rovs || []).length
    ? logTable(
      [
        { label: 'ROV', get: r => `MS-${r.rovNumber}` },
        { label: 'Role', get: r => r.role },
        { label: 'Serial', get: r => r.serial },
        { label: 'Description', get: r => r.description },
      ],
      data.rovs,
    )
    : emptyNote('ROVs'));

  children.push(h1('Fixed Per-ROV Sensors'));
  children.push(allFixed.length
    ? logTable(
      [
        { label: 'ROV', get: r => `MS-${r.rovNum}` },
        { label: 'Sensor', get: r => r.name },
        { label: 'Model', get: r => r.model },
        { label: 'Calibrated', get: r => (r.calibrated ? 'Yes' : 'No') },
        { label: 'Tested', get: r => (r.tested ? 'Yes' : 'No') },
      ],
      allFixed,
    )
    : emptyNote('fixed sensors'));

  children.push(h1('Mission Sensor Packing List'));
  children.push(missionSensors.length
    ? logTable(
      [
        { label: 'Sensor', get: r => r.name },
        { label: 'Model', get: r => r.model },
        { label: 'Qty', get: r => r.qty },
        { label: 'Calibrated', get: r => (r.calibrated ? 'Yes' : 'No') },
        { label: 'Tested', get: r => (r.tested ? 'Yes' : 'No') },
        { label: 'Note', get: r => r.note },
      ],
      missionSensors,
    )
    : emptyNote('mission sensors'));

  children.push(h1('Machines & Software'));
  children.push(machines.length
    ? logTable(
      [
        { label: 'Machine', get: r => r.name },
        { label: 'Software', get: r => r.software },
        { label: 'IP', get: r => r.ip },
        { label: 'Status', get: r => r.activated },
      ],
      machines,
    )
    : emptyNote('machines'));

  children.push(h1('Equipment & Consumables'));
  children.push(equipment.length
    ? logTable(
      [
        { label: 'Item', get: r => r.item },
        { label: 'Category', get: r => r.category },
        { label: 'Qty', get: r => r.qty },
        { label: 'Serial/Batch', get: r => r.serial || r.batch },
        { label: 'Assignment', get: r => r.rovAssignment },
        { label: 'Comments', get: r => r.comments },
      ],
      equipment,
    )
    : emptyNote('equipment'));

  children.push(h1('Thrusters'));
  children.push(thrusters.length
    ? logTable([{ label: 'Thruster #', get: r => r.number }, { label: 'Serial', get: r => r.serial }], thrusters)
    : emptyNote('thrusters'));

  children.push(h1('Flagged Issues'));
  children.push(issues.length
    ? logTable(
      [
        { label: 'Title', get: r => r.title },
        { label: 'Description', get: r => r.description },
        { label: 'Severity', get: r => r.severity },
        { label: 'Status', get: r => r.status },
      ],
      issues,
    )
    : emptyNote('issues'));

  return children;
}

function buildFinalSetupDocChildren(data) {
  const dt = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending';
  const sensors = data.sensors || [];
  const thrusters = data.thrusters || [];
  const revisions = data.revisions || [];

  const children = [
    title('Final Setup Report'),
    p(''),
    kv('Project', data.projectName),
    kv('Code', data.projectCode),
    kv('Scope', data.scopeName),
    kv('Operated Unit', data.operatedUnit ? `MS-${data.operatedUnit.rovNumber} (${(data.operatedUnit.role || '').toUpperCase()})` : ''),
    kv('Setup Status', data.lockedAt ? `Confirmed ${dt(data.lockedAt)}` : 'Draft — not yet confirmed'),
  ];

  children.push(h1(`Active Sensors (${sensors.filter(s => s.confirmed).length}/${sensors.length} confirmed)`));
  children.push(sensors.length
    ? logTable(
      [
        { label: 'Confirmed', get: r => r.confirmed ? 'Yes' : 'No' },
        { label: 'Sensor', get: r => r.name },
        { label: 'Model', get: r => r.model },
        { label: 'Qty', get: r => r.qty },
        { label: 'Calibrated', get: r => r.calibrated ? 'Yes' : 'No' },
        { label: 'Tested', get: r => r.tested ? 'Yes' : 'No' },
        { label: 'Op. Note', get: r => r.opNote },
      ],
      sensors,
    )
    : emptyNote('sensors'));

  children.push(h1(`Thrusters (${thrusters.filter(t => t.confirmed).length}/${thrusters.length} confirmed)`));
  children.push(thrusters.length
    ? logTable(
      [
        { label: 'Confirmed', get: r => r.confirmed ? 'Yes' : 'No' },
        { label: 'Thruster No.', get: r => r.number },
        { label: 'Serial', get: r => r.serial },
        { label: 'Position', get: r => r.position },
      ],
      thrusters,
    )
    : emptyNote('thrusters'));

  children.push(h1('Setup Notes'));
  children.push(data.notes ? p(data.notes) : emptyNote('setup notes'));

  children.push(h1('Change History'));
  if (revisions.length === 0) {
    children.push(emptyNote('operational changes'));
  } else {
    revisions.forEach((rev, idx) => {
      children.push(p(`Change #${idx + 1} — ${dt(rev.at)}${rev.by ? ` by ${rev.by}` : ''}: ${rev.reason || '—'}`));
    });
  }

  return children;
}

router.post('/operation-word', async (req, res) => {
  try {
    const { data, section } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });
    const doc = new Document({ sections: [{ properties: {}, children: buildOperationDocChildren(data, section || 'all') }] });
    const buffer = await Packer.toBuffer(doc);
    const key = data.operationalIdAuto || data.projectCode || 'report';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Report-${key}.docx"`,
    });
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/simulation-word', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });
    const doc = new Document({ sections: [{ properties: {}, children: buildSimulationDocChildren(data) }] });
    const buffer = await Packer.toBuffer(doc);
    const key = data.projectCode || 'simulation';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Simulation-${key}.docx"`,
    });
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/job-simulation-deliverables-excel', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });
    const wb = buildJobSimulationDeliverablesWorkbook(data);
    const buffer = await wb.xlsx.writeBuffer();
    const key = data.projectCode || 'SIM';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="JobSimulationDeliverables-${key}.xlsx"`,
    });
    res.send(buffer);
  } catch (e) {
    console.error('[export/job-simulation-deliverables-excel]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/project-history-excel', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });
    const wb = buildProjectHistoryWorkbook(data);
    const buffer = await wb.xlsx.writeBuffer();
    const key = data.projectCode || 'project';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ProjectHistory-${key}.xlsx"`,
    });
    res.send(buffer);
  } catch (e) {
    console.error('[export/project-history-excel]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/final-setup-word', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });
    const doc = new Document({ sections: [{ properties: {}, children: buildFinalSetupDocChildren(data) }] });
    const buffer = await Packer.toBuffer(doc);
    const key = data.projectCode || 'setup';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="FinalSetup-${key}.docx"`,
    });
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================
// TEMPLATE-BACKED EXPORTS (Standby / Dive / Maintenance)
// ============================================================
// Unlike buildOperationDocChildren() above, which builds a .docx from
// scratch with the `docx` package, these fill real client-supplied .docx
// files (server/templates/*.docx) via docxtemplater — the templates already
// contain the client's exact branding/layout with {tag} and {#loop}...{/loop}
// placeholders, so the output is pixel-identical to what they authored in
// Word, not a recreation of it.

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

function todayFormatted() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Durations are free-text ("2 hrs 30 mins", "45 mins", or non-numeric values
// like "In Progress"/"Check Dates" for an entry still open) — not a numeric
// column in the data model, so totals are computed by parsing out any hrs/
// mins components found and summing those; unparseable entries are skipped
// rather than treated as zero, so an in-progress entry doesn't fool anyone
// into thinking it contributed no time.
function sumDurations(strings) {
  let totalMins = 0;
  for (const s of strings) {
    if (!s) continue;
    const hrsMatch = /(\d+)\s*hrs?/i.exec(s);
    const minsMatch = /(\d+)\s*mins?/i.exec(s);
    if (!hrsMatch && !minsMatch) continue;
    totalMins += (hrsMatch ? parseInt(hrsMatch[1], 10) * 60 : 0) + (minsMatch ? parseInt(minsMatch[1], 10) : 0);
  }
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hrs`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins} mins`);
  return parts.join(' ');
}

// Duplicated from public/js/projectDataLog.js's deriveAutoEquipment() —
// see the comment on TEMPLATE_CONFIGS.projectDataLog for why. rovAssignment
// on sensors/thrusters is either 'Shared' or 'MS-<number>' (see
// buildAssignmentSelect in simulation/sensors.js), not a raw ROV number.
function rovNumberFromAssignment(assignment) {
  const m = /^MS-(\d+)$/.exec(assignment || '');
  return m ? m[1] : null;
}
const AUTO_SENSOR_NAMES = { ptz: 'PTZ Camera', gvi: 'GVI Camera', ut: 'UT', fmd: 'FMD' };
function deriveAutoEquipment(preOpData) {
  const empty = { main: {}, backup: {}, thrustersMain: [], thrustersBackup: [] };
  if (!preOpData) return empty;

  const roleByRov = {};
  (preOpData.rovs || []).forEach((r) => { roleByRov[String(r.rovNumber)] = r.role; });
  const mainRov = (preOpData.rovs || []).find((r) => r.role === 'main');
  const backupRov = (preOpData.rovs || []).find((r) => r.role !== 'main');

  function findSensor(name) {
    const mission = (preOpData.sensors || []).find((s) => s.name === name);
    if (mission) return { value: mission.serialNo || mission.model || '', assignment: mission.rovAssignment || 'Shared' };
    for (const [num, arr] of Object.entries(preOpData.rovSensors || {})) {
      const hit = (arr || []).find((s) => s.name === name);
      if (hit) return { value: hit.model || '', assignment: `MS-${num}` };
    }
    return null;
  }

  function valueForRole(found, role) {
    if (!found) return '';
    if (found.assignment === 'Shared') return found.value;
    return roleByRov[rovNumberFromAssignment(found.assignment)] === role ? found.value : '';
  }

  const setEq = preOpData.setEquipment || {};
  const main = { minispector: mainRov?.serial || '', ...(setEq.main || {}) };
  const backup = { minispector: backupRov?.serial || '', ...(setEq.backup || {}) };
  Object.entries(AUTO_SENSOR_NAMES).forEach(([key, name]) => {
    const found = findSensor(name);
    main[key] = valueForRole(found, 'main');
    backup[key] = valueForRole(found, 'standby');
  });

  const isBrush = (n) => (n || '').trim().toLowerCase() === 'brush';
  function thrustersForRole(role) {
    return (preOpData.thrusters || []).filter((t) => {
      if (!t.rovAssignment || t.rovAssignment === 'Shared') return true;
      return roleByRov[rovNumberFromAssignment(t.rovAssignment)] === role;
    });
  }
  const mainThrusters = thrustersForRole('main');
  const backupThrusters = thrustersForRole('standby');
  main.brush = mainThrusters.find((t) => isBrush(t.number))?.serial || '';
  backup.brush = backupThrusters.find((t) => isBrush(t.number))?.serial || '';

  return {
    main, backup,
    thrustersMain: mainThrusters.filter((t) => !isBrush(t.number)),
    thrustersBackup: backupThrusters.filter((t) => !isBrush(t.number)),
  };
}

const TEMPLATE_CONFIGS = {
  standby: {
    file: 'Standby.docx',
    buildData: (data) => {
      const logs = data.standbyLogs || [];
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        supervisorName: data.supervisorName || '',
        date: todayFormatted(),
        totalStandbyTime: sumDurations(logs.map(r => r.duration)),
        standbyLogs: logs.map(r => ({
          id: r.id || '', date: r.date || '', startTime: r.startTime || '', endTime: r.endTime || '',
          duration: r.duration || '', category: r.category || '', desc: r.desc || '', by: r.by || '',
        })),
      };
    },
  },
  // Dive Log offers two separate export buttons — the client's original
  // portrait template ("MiniSpector® DIVE LOG") and the newer branded
  // landscape sheet matching the ROV Technical Logbook's Operation Daily
  // Log page. Kept as two distinct keys/files rather than one, since they're
  // different documents with different column sets, not two versions of
  // the same one.
  diveClassic: {
    file: 'Divelog.docx',
    buildData: (data) => {
      const logs = data.diveLogs || [];
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        supervisorName: data.supervisorName || '',
        date: todayFormatted(),
        totalDiveCount: logs.length,
        totalDiveDuration: sumDurations(logs.map(r => r.duration)),
        diveLogs: logs.map(r => ({
          num: r.num || '', date: r.date || '', startTime: r.startTime || '', endTime: r.endTime || '',
          duration: r.duration || '', depth: r.depth || '', purpose: r.purpose || '', area: r.area || '', notes: r.notes || '',
        })),
      };
    },
  },
  dive: {
    // Matches the client's "ROV Technical Logbook" Operation Daily Log page
    // (landscape, MCS-branded, navy header row) — generated once via
    // scripts/generate-report-templates.js rather than hand-authored in Word,
    // since no real client .docx of just this page was available.
    file: 'OperationDailyLog.docx',
    buildData: (data) => {
      const logs = data.diveLogs || [];
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        diveLogs: logs.map(r => ({
          num: r.num || '', date: r.date || '', startTime: r.startTime || '', endTime: r.endTime || '',
          depth: r.depth || '', intTemp: r.intTemp || '', intHumidity: r.intHumidity || '', rain: r.rain || '', objective: r.objective || '',
        })),
      };
    },
  },
  issue: {
    // Matches the client's "Issue Report" page — see the comment on `dive`
    // above for how/why this template was generated.
    file: 'IssueReport.docx',
    buildData: (data) => {
      const logs = data.issueReports || [];
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        issueReports: logs.map(r => ({
          diveNo: r.diveNo || '', desc: r.desc || '', cause: r.cause || '', limReading: r.limReading || '',
          replacedYN: r.actionTaken === 'Replaced' ? 'Yes' : 'No',
          repairedYN: r.actionTaken === 'Repaired' ? 'Yes' : 'No',
          noActionYN: r.actionTaken === 'No Action' ? 'Yes' : '',
          contactedBy: r.contactedBy || '', malfComponent: r.malfComponent || '', replacedComponent: r.replacedComponent || '',
        })),
      };
    },
  },
  maintenance: {
    file: 'Maintenance.docx',
    buildData: (data) => {
      const logs = data.maintenanceLogs || [];
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        supervisorName: data.supervisorName || '',
        date: todayFormatted(),
        maintenanceLogs: logs.map(r => ({
          id: r.id || '', date: r.date || '', task: r.task || '', details: r.details || '', parts: r.parts || '', by: r.by || '',
        })),
      };
    },
  },
  projectDataLog: {
    // Matches the client's ROV Technical Logbook "Project Data Log" page —
    // see the comment on `dive` above for how/why this template was
    // generated. Every equipment item is derived from Topology/Packing List
    // & Equipment (see deriveAutoEquipment above) — key naming must match
    // public/js/projectDataLog.js's own deriveAutoEquipment(), which this is
    // a duplicate of (CommonJS route, can't import that ES module).
    file: 'ProjectDataLog.docx',
    buildData: (data) => {
      const crew = data.crew || [];
      const operators = {};
      for (let i = 1; i <= 6; i++) operators['operator' + i] = crew[i - 1]?.name || '';

      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const auto = deriveAutoEquipment(data.preOperationData);
      const equipTags = {};
      ['minispector', 'powerSupply', 'tether', 'onDeckStation', 'hcu', 'tablet', 'ptz', 'gvi', 'ut', 'fmd', 'brush'].forEach((k) => {
        equipTags['main' + cap(k)] = auto.main[k] || '';
        equipTags['backup' + cap(k)] = auto.backup[k] || '';
      });

      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        jobStartDate: data.dailySummary?.startDate || '',
        diveLocation: data.dailySummary?.location || '',
        contractor: data.projectDataLog?.contractor || '',
        typeOfOperation: data.dailySummary?.scope || '',
        projectManager: data.projectDataLog?.projectManager || '',
        missionDetails: data.projectDataLog?.missionDetails || '',
        weatherHigh: data.projectDataLog?.weatherHigh || '',
        weatherLow: data.projectDataLog?.weatherLow || '',
        weatherHumidity: data.projectDataLog?.weatherHumidity || '',
        weatherNotes: data.projectDataLog?.weatherNotes || '',
        ...operators,
        ...equipTags,
        mainThrusters: auto.thrustersMain.map((t) => ({ number: t.number || '', serial: t.serial || '' })),
        backupThrusters: auto.thrustersBackup.map((t) => ({ number: t.number || '', serial: t.serial || '' })),
      };
    },
  },
  replacementLog: {
    // Matches the client's "Replacement Data Log" page — reads the same
    // structured item/mainSetId/replacementId fields Final Setup's "Log
    // Operational Change" now captures (finalSetup.js). Only revisions with
    // an item set are included — a freeform-only change isn't a replacement.
    file: 'ReplacementDataLog.docx',
    buildData: (data) => {
      const revisions = (data.finalSetup?.revisions || []).filter((r) => r.item);
      return {
        projectName: data.projectName || '',
        projectCode: data.projectCode || '',
        revisions: revisions.map((r) => ({
          date: r.at ? r.at.slice(0, 10) : '',
          item: r.item || '', mainSetId: r.mainSetId || '', replacementId: r.replacementId || '',
        })),
      };
    },
  },
};

router.post('/log-template-word', (req, res) => {
  try {
    const { logType, data } = req.body || {};
    const cfg = TEMPLATE_CONFIGS[logType];
    if (!cfg) return res.status(400).json({ success: false, error: 'Unknown log type' });
    if (!data) return res.status(400).json({ success: false, error: 'Missing data' });

    const content = fs.readFileSync(path.join(TEMPLATES_DIR, cfg.file), 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(cfg.buildData(data));
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });

    const key = data.operationalIdAuto || data.projectCode || 'report';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${cfg.file.replace('.docx', '')}-${key}.docx"`,
    });
    res.send(buffer);
  } catch (e) {
    console.error('[export/log-template-word]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

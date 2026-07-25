const express = require('express');
const { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell, WidthType } = require('docx');

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
const SECTION_ORDER = ['shiftLogs', 'diveLogs', 'standbyLogs', 'maintenanceLogs', 'hseReports', 'faultLogs'];

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

module.exports = router;

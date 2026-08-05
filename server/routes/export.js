const express = require('express');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
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
  dive: {
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

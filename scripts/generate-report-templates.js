// One-off generator for two docxtemplater-fillable .docx templates that
// visually match the client's "ROV Technical Logbook" v1.7 Operation Daily
// Log / Issue Report pages (landscape, MCS-branded, navy header row) — run
// once to (re)produce server/templates/OperationDailyLog.docx and
// server/templates/IssueReport.docx. The {tag}/{#loop}...{/loop} text runs
// written here are plain text as far as the `docx` package is concerned;
// docxtemplater finds and replaces them at fill-time exactly as it does in
// the client's own real .docx templates — same mechanism, just authored by
// script instead of by hand in Word.
//
// Usage: node scripts/generate-report-templates.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  Header, Footer, ImageRun, PageNumber, PageOrientation, AlignmentType,
  BorderStyle, ShadingType, VerticalAlign, HeightRule,
} = require('docx');

const LOGO_PATH = path.join('C:', 'Users', 'Maryam', 'Desktop', 'Web_logs', 'assets', 'logo.png');
const OUT_DIR = path.join(__dirname, '..', 'server', 'templates');

const NAVY = '1F3864';
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function pageHeader() {
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: noBorders,
                children: [new Paragraph({ children: [new ImageRun({ data: logoBuffer, transformation: { width: 97, height: 30 }, type: 'png' })] })],
              }),
              new TableCell({
                borders: noBorders,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'ROV Technical Logbook', bold: true })] })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function pageFooter() {
  return new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders: noBorders, children: [new Paragraph({ children: [new TextRun('{projectCode}')] })] }),
              new TableCell({
                borders: noBorders,
                children: [new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(' of '), new TextRun({ children: [PageNumber.TOTAL_PAGES] })],
                })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function title(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 300 },
    children: [new TextRun({ text, bold: true, size: 28, underline: {} })],
  });
}

function projectLine() {
  return new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({ text: 'Project: ', bold: true }), new TextRun('{projectName}'),
      new TextRun({ text: '    Code: ', bold: true }), new TextRun('{projectCode}'),
    ],
  });
}

function navyHeaderCell(text, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    verticalAlign: VerticalAlign.CENTER,
    ...opts,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })],
  });
}

function bodyCell(runText, opts = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    ...opts,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: runText, size: 18 })] })],
  });
}

function landscapeSection(children) {
  return {
    properties: {
      page: {
        size: { orientation: PageOrientation.LANDSCAPE },
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    headers: { default: pageHeader() },
    footers: { default: pageFooter() },
    children,
  };
}

function portraitSection(children) {
  return {
    properties: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
    headers: { default: pageHeader() },
    footers: { default: pageFooter() },
    children,
  };
}

// Smaller header cell for the Project Data Log's dense 10-12 column
// equipment/thruster rows — a portrait page can't give those the room
// navyHeaderCell's default size gets on a landscape one.
function navyHeaderCellSmall(text, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: NAVY },
    verticalAlign: VerticalAlign.CENTER,
    ...opts,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 13 })] })],
  });
}
function bodyCellSmall(runText, opts = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    ...opts,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: runText, size: 13 })] })],
  });
}

function sectionHeading(text) {
  return new Paragraph({ spacing: { before: 240, after: 100 }, children: [new TextRun({ text, bold: true, size: 20 })] });
}

// ============================================================
// Operation Daily Log (Dive Log export)
// ============================================================

function buildOperationDailyLog() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      navyHeaderCell('Dive #'), navyHeaderCell('Dive Date'), navyHeaderCell('Dive In'), navyHeaderCell('Dive Out'),
      navyHeaderCell('Max Depth (m)'), navyHeaderCell('Int. Temp.'), navyHeaderCell('Int. Humidity'),
      navyHeaderCell('Rain'), navyHeaderCell('Objective'),
    ],
  });

  const bodyRow = new TableRow({
    children: [
      bodyCell('{#diveLogs}{num}'), bodyCell('{date}'), bodyCell('{startTime}'), bodyCell('{endTime}'),
      bodyCell('{depth}'), bodyCell('{intTemp}'), bodyCell('{intHumidity}'), bodyCell('{rain}'), bodyCell('{objective}{/diveLogs}'),
    ],
  });

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, bodyRow] });

  return new Document({
    sections: [landscapeSection([title('Operation Daily Log'), projectLine(), table])],
  });
}

// ============================================================
// Issue Report (Issue Report export)
// ============================================================

function buildIssueReport() {
  const headerRow1 = new TableRow({
    tableHeader: true,
    children: [
      navyHeaderCell('Dive #', { rowSpan: 2 }),
      navyHeaderCell('Issue Description', { rowSpan: 2 }),
      navyHeaderCell('Cause', { rowSpan: 2 }),
      navyHeaderCell('Lim Reading', { rowSpan: 2 }),
      navyHeaderCell('Action Taken', { columnSpan: 3 }),
      navyHeaderCell('Contacted System Support Personnel', { rowSpan: 2 }),
      navyHeaderCell('Malfunctioning Component No.', { rowSpan: 2 }),
      navyHeaderCell('Replaced Component No.', { rowSpan: 2 }),
    ],
  });
  const headerRow2 = new TableRow({
    tableHeader: true,
    children: [navyHeaderCell('Replaced'), navyHeaderCell('Repaired'), navyHeaderCell('No Action')],
  });

  const bodyRow = new TableRow({
    children: [
      bodyCell('{#issueReports}{diveNo}'), bodyCell('{desc}'), bodyCell('{cause}'), bodyCell('{limReading}'),
      bodyCell('{replacedYN}'), bodyCell('{repairedYN}'), bodyCell('{noActionYN}'),
      bodyCell('{contactedBy}'), bodyCell('{malfComponent}'), bodyCell('{replacedComponent}{/issueReports}'),
    ],
  });

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow1, headerRow2, bodyRow] });

  return new Document({
    sections: [landscapeSection([title('Issue Report'), projectLine(), table])],
  });
}

// ============================================================
// Project Data Log (Project Details tab export)
// ============================================================

// Manually-entered items must match public/js/projectDataLog.js's
// EQUIPMENT_ITEMS keys exactly; auto-sourced items (from Packing List &
// Equipment) must match its AUTO_SENSOR_NAMES/deriveAutoEquipment() key
// naming. Duplicated here (rather than imported) because this script only
// ever runs standalone at dev time, not as part of the server, and the tag
// naming (`main`/`backup` + capitalized key) has to line up with what
// server/routes/export.js's `projectDataLog` buildData produces at runtime.
const MANUAL_EQUIPMENT_KEYS = ['powerSupply', 'tether', 'onDeckStation', 'hcu', 'tablet'];
const AUTO_EQUIPMENT_KEYS = ['minispector', 'ptz', 'gvi', 'ut', 'fmd', 'brush'];
const EQUIPMENT_LABELS = {
  powerSupply: 'Power Supply', tether: 'Tether', onDeckStation: 'On Deck Station', hcu: 'HCU', tablet: 'Tablet',
  minispector: 'MiniSpector', ptz: 'PTZ', gvi: 'GVI (Pencil Camera)', ut: 'UT', fmd: 'FMD', brush: 'Brush',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function plainCell(text, { bold = false, ...opts } = {}) {
  return new TableCell({ ...opts, children: [new Paragraph({ children: [new TextRun({ text, size: 18, bold })] })] });
}

// One combined Item | Main Set ID | Backup Set ID table (rather than
// separate per-set tables) — matches the on-screen card's layout.
function equipmentTable(keys) {
  const header = new TableRow({ tableHeader: true, children: [navyHeaderCell('Item'), navyHeaderCell('Main Set ID'), navyHeaderCell('Backup Set ID')] });
  const rows = keys.map((k) => new TableRow({
    children: [bodyCell(EQUIPMENT_LABELS[k]), bodyCell(`{main${cap(k)}}`), bodyCell(`{backup${cap(k)}}`)],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

// Thruster count varies per project (whatever was added in Packing List &
// Equipment) — a repeating loop table rather than a fixed 1-11 grid.
function thrusterLoopTable(loopName) {
  const header = new TableRow({ tableHeader: true, children: [navyHeaderCellSmall('Thruster No.'), navyHeaderCellSmall('Serial')] });
  const body = new TableRow({ children: [bodyCellSmall(`{#${loopName}}{number}`), bodyCellSmall(`{serial}{/${loopName}}`)] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, body] });
}

function buildProjectDataLog() {
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [navyHeaderCell('Job Start Date'), navyHeaderCell('Dive Location'), navyHeaderCell('Contractor'), navyHeaderCell('Type of Operation'), navyHeaderCell('Project Manager')],
      }),
      new TableRow({ children: [bodyCell('{jobStartDate}'), bodyCell('{diveLocation}'), bodyCell('{contractor}'), bodyCell('{typeOfOperation}'), bodyCell('{projectManager}')] }),
    ],
  });

  const opRow = (labelA, tagA, labelB, tagB) => new TableRow({
    children: [plainCell(labelA, { bold: true }), plainCell(tagA), plainCell(labelB, { bold: true }), plainCell(tagB)],
  });
  const operatorsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      opRow('Operator 1', '{operator1}', 'Operator 4', '{operator4}'),
      opRow('Operator 2', '{operator2}', 'Operator 5', '{operator5}'),
      opRow('Operator 3', '{operator3}', 'Operator 6', '{operator6}'),
    ],
  });

  const missionPara = new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: 'Mission Details: ', bold: true }), new TextRun('{missionDetails}')],
  });

  const weatherTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [navyHeaderCell('High Temperature'), navyHeaderCell('Low Temperature'), navyHeaderCell('Humidity'), navyHeaderCell('General Notes')] }),
      new TableRow({ children: [bodyCell('{weatherHigh}'), bodyCell('{weatherLow}'), bodyCell('{weatherHumidity}'), bodyCell('{weatherNotes}')] }),
    ],
  });

  return new Document({
    sections: [portraitSection([
      title('Project Data Log'),
      projectLine(),
      infoTable,
      sectionHeading('Operators'),
      operatorsTable,
      missionPara,
      sectionHeading('Weather Conditions'),
      weatherTable,
      sectionHeading('Equipment IDs — Main Set / Backup Set'),
      equipmentTable(MANUAL_EQUIPMENT_KEYS),
      sectionHeading('From Packing List & Equipment'),
      equipmentTable(AUTO_EQUIPMENT_KEYS),
      sectionHeading('Thrusters — Main Set'),
      thrusterLoopTable('mainThrusters'),
      sectionHeading('Thrusters — Backup Set'),
      thrusterLoopTable('backupThrusters'),
    ])],
  });
}

// ============================================================
// Replacement Data Log (Final Setup tab export)
// ============================================================

function buildReplacementDataLog() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [navyHeaderCell('Date'), navyHeaderCell('Item'), navyHeaderCell('Main Set ID'), navyHeaderCell('Replacement ID')],
  });
  const bodyRow = new TableRow({
    children: [bodyCell('{#revisions}{date}'), bodyCell('{item}'), bodyCell('{mainSetId}'), bodyCell('{replacementId}{/revisions}')],
  });
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, bodyRow] });

  return new Document({
    sections: [portraitSection([title('Replacement Data Log'), projectLine(), table])],
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const opDoc = buildOperationDailyLog();
  fs.writeFileSync(path.join(OUT_DIR, 'OperationDailyLog.docx'), await Packer.toBuffer(opDoc));
  console.log('Wrote', path.join(OUT_DIR, 'OperationDailyLog.docx'));

  const issueDoc = buildIssueReport();
  fs.writeFileSync(path.join(OUT_DIR, 'IssueReport.docx'), await Packer.toBuffer(issueDoc));
  console.log('Wrote', path.join(OUT_DIR, 'IssueReport.docx'));

  const pdlDoc = buildProjectDataLog();
  fs.writeFileSync(path.join(OUT_DIR, 'ProjectDataLog.docx'), await Packer.toBuffer(pdlDoc));
  console.log('Wrote', path.join(OUT_DIR, 'ProjectDataLog.docx'));

  const replDoc = buildReplacementDataLog();
  fs.writeFileSync(path.join(OUT_DIR, 'ReplacementDataLog.docx'), await Packer.toBuffer(replDoc));
  console.log('Wrote', path.join(OUT_DIR, 'ReplacementDataLog.docx'));
}

main().catch((e) => { console.error(e); process.exit(1); });

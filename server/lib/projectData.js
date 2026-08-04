// ============================================================
// Ported from the mcs-MiniSpectorlogs repo's api/server.js — proven
// correct via live round-trip testing against Railway Postgres
// (operation + simulation payloads, upsert idempotency, the
// report_date timezone fix). Decomposes/reassembles the exact shapes
// the frontend's collectAllData()/collectSimState() produce.
// ============================================================

const pool = require('../db');

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

function deriveActiveMinispector(systems) {
  if (!Array.isArray(systems)) return 'N/A';
  const def = systems.find(s => s.isDefault);
  return def ? def.name : 'N/A';
}

// Case-insensitive: Join Project and Load Project both uppercase the code
// client-side before sending it, but Project Details' own code field never
// did — an exact-match lookup here meant a project saved as "prj-001" was
// invisible to a later request for "PRJ-001" (or vice versa), silently
// falling through every "project not found" branch that treats it as brand
// new, including assertCanWrite()'s write-access check.
async function getProjectRowByCode(code) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE UPPER(project_code) = UPPER($1)', [code]);
  return rows[0] || null;
}

// createOnly (set only for a brand-new project's very first save — see
// isFirstSave in projectDetails.js) turns the upsert into a create-or-fail:
// ON CONFLICT DO NOTHING means an existing row is left completely untouched
// rather than merged into, and the empty RETURNING tells the caller a
// collision happened so it can report it instead of silently joining
// someone else's project. Every later save on that same project (isFirstSave
// false) still upserts normally.
// created_by is intentionally absent from the DO UPDATE SET below — it's
// only written on the initial INSERT. Every save sends the current user's
// own name as created_by, so including it in the update clause would
// silently overwrite the original creator with whoever last hit save
// (which is exactly the bug the admin Projects tab's "Created By" column
// was showing).
async function upsertOperationProject(client, { project_code, project_name, created_by, data, createOnly }) {
  const d = data || {};
  const { rows } = await client.query(
    `INSERT INTO projects (
       project_code, project_name, mode, created_by, vessel, location, scope,
       operational_id_auto, minispector_number, supervisor_name,
       daily_summary, pre_dive, post_dive, lars_status, software_status,
       aux_tool_status, camera_systems, other_sensors, fault_report, checklists,
       minispector_systems, pre_operation_data, final_setup, remarks
     ) VALUES (
       $1,$2,'operation',$3,$4,$5,$6,
       $7,$8,$9,
       $10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,
       $20,$21,$22,$23
     )
     ON CONFLICT (project_code) DO ${createOnly ? 'NOTHING' : `UPDATE SET
       project_name = EXCLUDED.project_name,
       mode = 'operation',
       vessel = EXCLUDED.vessel,
       location = EXCLUDED.location,
       scope = EXCLUDED.scope,
       operational_id_auto = EXCLUDED.operational_id_auto,
       minispector_number = EXCLUDED.minispector_number,
       supervisor_name = EXCLUDED.supervisor_name,
       daily_summary = EXCLUDED.daily_summary,
       pre_dive = EXCLUDED.pre_dive,
       post_dive = EXCLUDED.post_dive,
       lars_status = EXCLUDED.lars_status,
       software_status = EXCLUDED.software_status,
       aux_tool_status = EXCLUDED.aux_tool_status,
       camera_systems = EXCLUDED.camera_systems,
       other_sensors = EXCLUDED.other_sensors,
       fault_report = EXCLUDED.fault_report,
       checklists = EXCLUDED.checklists,
       minispector_systems = EXCLUDED.minispector_systems,
       pre_operation_data = EXCLUDED.pre_operation_data,
       final_setup = EXCLUDED.final_setup,
       remarks = EXCLUDED.remarks`}
     RETURNING id, updated_at`,
    [
      project_code, project_name || '', created_by || '',
      d.Vessel || '', d.dailySummary?.location || '', d.dailySummary?.scope || d.scope || '',
      d.operationalIdAuto || '', d.Minispectornumber || '', d.supervisorName || '',
      JSON.stringify(d.dailySummary || {}), JSON.stringify(d.preDive || {}),
      JSON.stringify(d.postDive || {}), JSON.stringify(d.larsStatus || {}),
      JSON.stringify(d.softwareStatus || {}), JSON.stringify(d.auxToolStatus || {}),
      JSON.stringify(d.cameraSystems || []), JSON.stringify(d.otherSensors || []),
      JSON.stringify(d.faultReport || {}), JSON.stringify(d.checklists || {}),
      JSON.stringify(d.minispectorSystems || []),
      d.preOperationData ? JSON.stringify(d.preOperationData) : null,
      d.finalSetup ? JSON.stringify(d.finalSetup) : null,
      d.remarks || '',
    ]
  );
  if (rows.length === 0) return { conflict: true }; // createOnly + project_code already existed
  const projectId = rows[0].id;

  // replace child rows wholesale — the app always sends full arrays, never deltas
  await client.query('DELETE FROM crew_members WHERE project_id = $1', [projectId]);
  for (const c of d.crew || []) {
    await client.query(
      `INSERT INTO crew_members (project_id, name, role, shift, sign_on, sign_off) VALUES ($1,$2,$3,$4,$5,$6)`,
      [projectId, c.name || '', c.role || '', c.shift || '', c.signOn || '', c.signOff || '']
    );
  }

  await client.query('DELETE FROM shift_logs WHERE project_id = $1', [projectId]);
  for (const s of d.shiftLogs || []) {
    await client.query(
      `INSERT INTO shift_logs (project_id, shift_no, start_date, end_date, weather, visibility, temperature, notes, crew)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [projectId, s.shiftNo || '', s.startDate || '', s.endDate || '', s.weather || '', s.visibility || '', s.temperature || '', s.notes || '', s.crew || []]
    );
  }

  await client.query('DELETE FROM dive_logs WHERE project_id = $1', [projectId]);
  for (const l of d.diveLogs || []) {
    await client.query(
      `INSERT INTO dive_logs (project_id, num, rov, date, end_date, start_time, end_time, depth, duration, purpose, area, issues, client, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [projectId, l.num || '', l.rov || '', l.date || '', l.endDate || '', l.startTime || '', l.endTime || '', l.depth || '', l.duration || '', l.purpose || '', l.area || '', l.issues || '', l.client || '', l.notes || '']
    );
  }

  await client.query('DELETE FROM maintenance_logs WHERE project_id = $1', [projectId]);
  for (const l of d.maintenanceLogs || []) {
    await client.query(
      `INSERT INTO maintenance_logs (project_id, entry_ref, date, performed_by, task, details, parts, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [projectId, l.id || '', l.date || '', l.by || '', l.task || '', l.details || '', l.parts || '', l.remarks || '']
    );
  }

  await client.query('DELETE FROM hse_reports WHERE project_id = $1', [projectId]);
  for (const l of d.hseReports || []) {
    await client.query(
      `INSERT INTO hse_reports (project_id, entry_ref, type, description, action, root_cause, prevention)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [projectId, l.id || '', l.type || '', l.desc || '', l.action || '', l.root || '', l.prev || '']
    );
  }

  await client.query('DELETE FROM standby_logs WHERE project_id = $1', [projectId]);
  for (const l of d.standbyLogs || []) {
    await client.query(
      `INSERT INTO standby_logs (project_id, entry_ref, date, end_date, performed_by, start_time, end_time, duration, category, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId, l.id || '', l.date || '', l.endDate || '', l.by || '', l.startTime || '', l.endTime || '', l.duration || '', l.category || '', l.desc || '']
    );
  }

  await client.query('DELETE FROM fault_logs WHERE project_id = $1', [projectId]);
  for (const l of d.faultLogs || []) {
    await client.query(
      `INSERT INTO fault_logs (project_id, status, tech, description, action, parts, remaining, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [projectId, l.status || '', l.tech || '', l.desc || '', l.action || '', l.parts || '', l.remaining || '', JSON.stringify(l.photos || [])]
    );
  }

  return rows[0];
}

// createOnly: see the comment on upsertOperationProject above — same
// create-or-fail behavior, gated on the new-project wizard's first save
// (isNewProjectFlow && isFirstSave in simulation/core.js's saveSimulation()).
// created_by is likewise absent from DO UPDATE SET — see that same comment
// for why (only the initial INSERT should ever set it).
async function upsertSimulationProject(client, { project_code, project_name, created_by, data, createOnly }) {
  const d = data || {};
  // Once a simulation has been pushed to Operation (is_sim_locked), later edits
  // to Sensors/Topology — which the UI deliberately leaves open for reference/
  // correction after push — must still save (nothing the user typed should be
  // silently lost), but must NOT flip projects.mode back to 'simulation'.
  // Sensors/Topology sync every ~2s on edit and Operation autosaves every 20s;
  // without this guard the two loops fight over `mode` and whichever last
  // reaches the server decides whether GET /:code returns operation data
  // (crew, logs, everything) or stale simulation data to any device that
  // pulls the project in that window. `projects.is_sim_locked` and `mode`
  // referenced unqualified below are the pre-existing row's current values,
  // not the row being inserted (that's what EXCLUDED is for).
  const { rows } = await client.query(
    `INSERT INTO projects (project_code, project_name, mode, created_by, scope)
     VALUES ($1,$2,'simulation',$3,$4)
     ON CONFLICT (project_code) DO ${createOnly ? 'NOTHING' : `UPDATE SET
       project_name = EXCLUDED.project_name,
       mode = CASE WHEN projects.is_sim_locked THEN projects.mode ELSE 'simulation' END,
       scope = EXCLUDED.scope`}
     RETURNING id, updated_at`,
    [project_code, project_name || '', created_by || '', d.projectScope || '']
  );
  if (rows.length === 0) return { conflict: true }; // createOnly + project_code already existed
  const projectId = rows[0].id;

  const simResult = await client.query(
    `INSERT INTO simulations (
       project_id, project_code, scope_id, scope_name, report_date,
       sensors, rov_sensors, sysarch, issues, thrusters,
       approval_status, approval_history
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (project_id) DO UPDATE SET
       project_code = EXCLUDED.project_code,
       scope_id = EXCLUDED.scope_id,
       scope_name = EXCLUDED.scope_name,
       report_date = EXCLUDED.report_date,
       sensors = EXCLUDED.sensors,
       rov_sensors = EXCLUDED.rov_sensors,
       sysarch = EXCLUDED.sysarch,
       issues = EXCLUDED.issues,
       thrusters = EXCLUDED.thrusters,
       approval_status = EXCLUDED.approval_status,
       approval_history = EXCLUDED.approval_history
     RETURNING id`,
    [
      projectId, project_code, d.scopeId || null, d.scopeName || '', d.reportDate || null,
      JSON.stringify(d.sensors || []), JSON.stringify(d.rovSensors || {}), JSON.stringify(d.sysarch || {}),
      JSON.stringify(d.issues || []), JSON.stringify(d.thrusters || []),
      d.approvalStatus || 'draft', JSON.stringify(d.approvalHistory || []),
    ]
  );
  const simulationId = simResult.rows[0].id;

  await client.query('DELETE FROM simulation_rovs WHERE simulation_id = $1', [simulationId]);
  for (const r of d.rovs || []) {
    await client.query(
      `INSERT INTO simulation_rovs (simulation_id, rov_number, role, serial, description) VALUES ($1,$2,$3,$4,$5)`,
      [simulationId, r.rovNumber, r.role || 'main', r.serial || '', r.description || '']
    );
  }

  return rows[0];
}

async function buildOperationData(project) {
  const projectId = project.id;
  const [crew, shifts, dives, maint, hse, standby, faults] = await Promise.all([
    pool.query('SELECT * FROM crew_members WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM shift_logs WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM dive_logs WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM maintenance_logs WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM hse_reports WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM standby_logs WHERE project_id = $1 ORDER BY id', [projectId]),
    pool.query('SELECT * FROM fault_logs WHERE project_id = $1 ORDER BY id', [projectId]),
  ]);

  const diveLogs = dives.rows.map(l => ({
    num: l.num, rov: l.rov, date: l.date, endDate: l.end_date, startTime: l.start_time, endTime: l.end_time,
    depth: l.depth, duration: l.duration, purpose: l.purpose, area: l.area, issues: l.issues, client: l.client, notes: l.notes,
  }));
  const standbyLogs = standby.rows.map(l => ({
    id: l.entry_ref, date: l.date, endDate: l.end_date, by: l.performed_by, startTime: l.start_time, endTime: l.end_time,
    duration: l.duration, category: l.category, desc: l.description,
  }));

  let diveMinutes = 0; diveLogs.forEach(l => diveMinutes += parseDur(l.duration));
  let sbMinutes = 0; standbyLogs.forEach(l => sbMinutes += parseDur(l.duration));

  return {
    userId: null,
    Minispectornumber: project.minispector_number || '',
    projectName: project.project_name || '',
    projectCode: project.project_code || '',
    Vessel: project.vessel || '',
    operationalIdAuto: project.operational_id_auto || '',

    shiftLogs: shifts.rows.map(s => ({
      shiftNo: s.shift_no, startDate: s.start_date, endDate: s.end_date, weather: s.weather,
      visibility: s.visibility, temperature: s.temperature, notes: s.notes, crew: s.crew || [],
    })),

    dailySummary: project.daily_summary || {},
    supervisorName: project.supervisor_name || '',
    crew: crew.rows.map(c => ({ name: c.name, role: c.role, shift: c.shift, signOn: c.sign_on, signOff: c.sign_off })),
    preDive: project.pre_dive || {},
    minispectorSystems: project.minispector_systems || [],
    activeMinispector: deriveActiveMinispector(project.minispector_systems),

    cameraSystems: project.camera_systems || [],
    otherSensors: project.other_sensors || [],
    preOperationData: project.pre_operation_data || null,
    finalSetup: project.final_setup || null,

    auxToolStatus: project.aux_tool_status || {},
    softwareStatus: project.software_status || {},
    larsStatus: project.lars_status || {},
    faultReport: project.fault_report || {},
    postDive: project.post_dive || {},
    remarks: project.remarks || '',

    diveLogs,
    maintenanceLogs: maint.rows.map(l => ({ id: l.entry_ref, date: l.date, by: l.performed_by, task: l.task, details: l.details, parts: l.parts, remarks: l.remarks })),
    hseReports: hse.rows.map(l => ({ id: l.entry_ref, type: l.type, desc: l.description, action: l.action, root: l.root_cause, prev: l.prevention })),
    standbyLogs,
    faultLogs: faults.rows.map(l => ({ status: l.status, tech: l.tech, desc: l.description, action: l.action, parts: l.parts, remaining: l.remaining, photos: l.photos || [] })),

    totalStandbyTime: fmtDur(sbMinutes),
    totalDiveDuration: fmtDur(diveMinutes),
    totalDiveCount: diveLogs.length,

    checklists: project.checklists || { mobilization: {}, startup: {}, preOp: {}, postOp: {}, shutdown: {}, demob: {} },
  };
}

async function buildSimulationData(project) {
  const { rows } = await pool.query('SELECT * FROM simulations WHERE project_id = $1', [project.id]);
  const sim = rows[0];
  if (!sim) {
    return {
      type: 'simulation', reportDate: '', projectName: project.project_name || '', projectCode: project.project_code || '',
      projectScope: project.scope || '', scopeId: null, scopeName: '', rovs: [], sensors: [], rovSensors: {},
      sysarch: {}, issues: [], thrusters: [], approvalStatus: 'draft', approvalHistory: [],
    };
  }
  const rovRows = await pool.query('SELECT * FROM simulation_rovs WHERE simulation_id = $1 ORDER BY rov_number', [sim.id]);
  return {
    type: 'simulation',
    reportDate: sim.report_date || '',
    projectName: project.project_name || '',
    projectCode: project.project_code || '',
    projectScope: project.scope || '',
    scopeId: sim.scope_id,
    scopeName: sim.scope_name || '',
    rovs: rovRows.rows.map(r => ({ rovNumber: r.rov_number, role: r.role, serial: r.serial || '', description: r.description || '' })),
    sensors: sim.sensors || [],
    rovSensors: sim.rov_sensors || {},
    sysarch: sim.sysarch || {},
    issues: sim.issues || [],
    thrusters: sim.thrusters || [],
    approvalStatus: sim.approval_status || 'draft',
    approvalHistory: sim.approval_history || [],
  };
}

async function lockSimulation(projectId) {
  const { rows } = await pool.query('UPDATE projects SET is_sim_locked = true WHERE id = $1 RETURNING updated_at', [projectId]);
  await pool.query('UPDATE simulations SET pushed_at = now() WHERE project_id = $1', [projectId]);
  return rows[0]?.updated_at;
}

module.exports = {
  parseDur, fmtDur, deriveActiveMinispector, getProjectRowByCode,
  upsertOperationProject, upsertSimulationProject,
  buildOperationData, buildSimulationData, lockSimulation,
};

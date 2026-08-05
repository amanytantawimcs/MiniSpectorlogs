// Equipment ID derivation shared by Packing List & Equipment (preOp.js) and
// the Word export (server/routes/export.js's duplicate) — MiniSpector,
// Power Supply, Tether, On-Deck Station, HCU, Tablet, PTZ, GVI, UT, FMD, and
// the thruster list all already exist in Topology (simulation/sysarch.js's
// Equipment IDs card + the generic Equipment/thruster lists) or Packing
// List & Equipment (state.preOpData, pushed from Simulation), with a
// Main/Standby assignment already made there — this reads that instead of
// having its own data entry.

// rovAssignment on sensors/thrusters is either 'Shared' or 'MS-<number>'
// (see buildAssignmentSelect in simulation/sensors.js) — not a raw ROV
// number — so it needs unwrapping before it can be compared against
// preOpData.rovs[].rovNumber.
function rovNumberFromAssignment(assignment) {
  const m = /^MS-(\d+)$/.exec(assignment || '');
  return m ? m[1] : null;
}

const AUTO_SENSOR_NAMES = { ptz: 'PTZ Camera', gvi: 'GVI Camera', ut: 'UT', fmd: 'FMD' };

// Exported (not just used internally) — server/routes/export.js duplicates
// this same logic for the Word export, since it can't import an ES module
// from a CommonJS route file; keep both in sync if this changes.
export function deriveAutoEquipment(preOpData) {
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


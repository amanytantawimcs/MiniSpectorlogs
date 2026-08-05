// "Project Data Log" card (Project Details tab) — matches the client's ROV
// Technical Logbook Project Data Log page. Every Equipment ID item —
// MiniSpector, Power Supply, Tether, On-Deck Station, HCU, Tablet, PTZ,
// GVI, UT, FMD, and the thruster list — already exists in Topology
// (simulation/sysarch.js's Equipment IDs card + the generic Equipment/
// thruster lists) or Packing List & Equipment (preOp.js / state.preOpData,
// pushed from Simulation), with a Main/Standby assignment already made
// there, so everything here is derived live and shown read-only rather
// than re-entered.

import { escapeHtml } from './ui.js';

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

function autoRow(label, mainVal, backupVal) {
  return `<tr style="border-bottom:1px solid rgba(120,166,212,0.16)">
    <td class="px-3 py-1.5 text-sm text-[#E9F0F8]">${escapeHtml(label)}</td>
    <td class="px-3 py-1.5 text-sm text-[#9AB0C8] font-mono">${escapeHtml(mainVal || '—')}</td>
    <td class="px-3 py-1.5 text-sm text-[#9AB0C8] font-mono">${escapeHtml(backupVal || '—')}</td>
  </tr>`;
}

export function renderAutoEquipmentSummary(preOpData) {
  const el = document.getElementById('auto-equipment-log');
  if (!el) return;
  if (!preOpData) {
    el.innerHTML = `<p class="text-[#6C88A6] text-xs italic px-1">No Packing List &amp; Equipment data yet — push from Simulation to auto-fill these.</p>`;
    return;
  }
  const { main, backup, thrustersMain, thrustersBackup } = deriveAutoEquipment(preOpData);
  const thrusterList = (list) => list.length ? list.map((t) => `${escapeHtml(t.number || '—')}: ${escapeHtml(t.serial || '—')}`).join(', ') : '—';

  el.innerHTML = `
    <div class="rcard" style="overflow-x:auto">
      <table class="w-full text-left text-sm" style="color:#E9F0F8">
        <thead class="text-xs uppercase font-bold" style="background:#16233A;color:#9AB0C8">
          <tr><th class="px-3 py-2">Item</th><th class="px-3 py-2">Main Set ID</th><th class="px-3 py-2">Backup Set ID</th></tr>
        </thead>
        <tbody>
          ${autoRow('MiniSpector', main.minispector, backup.minispector)}
          ${autoRow('Power Supply', main.powerSupply, backup.powerSupply)}
          ${autoRow('Tether', main.tether, backup.tether)}
          ${autoRow('On Deck Station', main.onDeckStation, backup.onDeckStation)}
          ${autoRow('HCU', main.hcu, backup.hcu)}
          ${autoRow('Tablet', main.tablet, backup.tablet)}
          ${autoRow('PTZ', main.ptz, backup.ptz)}
          ${autoRow('GVI (Pencil Camera)', main.gvi, backup.gvi)}
          ${autoRow('UT', main.ut, backup.ut)}
          ${autoRow('FMD', main.fmd, backup.fmd)}
          ${autoRow('Brush', main.brush, backup.brush)}
        </tbody>
      </table>
    </div>
    <div class="mt-3 text-xs" style="color:#9AB0C8">
      <p><span class="font-bold text-[#6C88A6] uppercase tracking-wider text-[10px]">Thrusters — Main:</span> ${thrusterList(thrustersMain)}</p>
      <p class="mt-1"><span class="font-bold text-[#6C88A6] uppercase tracking-wider text-[10px]">Thrusters — Backup:</span> ${thrusterList(thrustersBackup)}</p>
    </div>`;
}

export function installProjectDataLog() {
  renderAutoEquipmentSummary(null);
}

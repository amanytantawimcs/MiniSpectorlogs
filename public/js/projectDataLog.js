// Equipment ID inventory for the "Project Data Log" card (Project Details
// tab) — matches the client's ROV Technical Logbook Project Data Log page:
// a fixed Main Set / Backup Set row per named item plus 11 thrusters + brush.
// Rows are fixed (not user-addable, unlike crew/camera tables), so they're
// rendered once into a static table body and read/written by field key
// rather than scraped generically.

import { escapeHtml } from './ui.js';

export const EQUIPMENT_ITEMS = [
  { key: 'minispector', label: 'MiniSpector' },
  { key: 'powerSupply', label: 'Power Supply' },
  { key: 'tether', label: 'Tether' },
  { key: 'onDeckStation', label: 'On Deck Station' },
  { key: 'hcu', label: 'HCU' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'ptz', label: 'PTZ' },
  { key: 'gvi', label: 'GVI (Pencil Camera)' },
  { key: 'ut', label: 'UT' },
  { key: 'fmd', label: 'FMD' },
  ...Array.from({ length: 11 }, (_, i) => ({ key: `thruster${i + 1}`, label: `Thruster ${i + 1}` })),
  { key: 'brush', label: 'Brush' },
];

function idInput(id) {
  return `<input type="text" id="${id}" class="bg-[#0C1727] border-[rgba(120,166,212,0.16)] focus:border-[#459fd9] h-9 rounded-lg px-2 text-white text-sm w-full font-mono">`;
}

export function renderEquipmentTable() {
  const tbody = document.getElementById('equipment-log-body');
  if (!tbody) return;
  tbody.innerHTML = EQUIPMENT_ITEMS.map(({ key, label }) => `
    <tr style="border-bottom:1px solid rgba(120,166,212,0.16)">
      <td class="px-3 py-1.5 text-sm text-[#E9F0F8]">${escapeHtml(label)}</td>
      <td class="px-3 py-1.5">${idInput('eq_main_' + key)}</td>
      <td class="px-3 py-1.5">${idInput('eq_backup_' + key)}</td>
    </tr>`).join('');
}

export function collectEquipmentLog() {
  const getV = (id) => document.getElementById(id)?.value || '';
  const main = {}, backup = {};
  EQUIPMENT_ITEMS.forEach(({ key }) => {
    main[key] = getV('eq_main_' + key);
    backup[key] = getV('eq_backup_' + key);
  });
  return { main, backup };
}

// Re-renders the table first — the rows don't exist yet on a fresh page
// load, and this is the only path (besides installProjectDataLog's initial
// call) that's guaranteed to run before a saved project's values need
// somewhere to land.
export function populateEquipmentLog(equipmentLog) {
  renderEquipmentTable();
  const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  EQUIPMENT_ITEMS.forEach(({ key }) => {
    setV('eq_main_' + key, equipmentLog?.main?.[key]);
    setV('eq_backup_' + key, equipmentLog?.backup?.[key]);
  });
}

export function installProjectDataLog() {
  renderEquipmentTable();
}

// Camera & Lighting / Sensors & Payload row builder for the Operation-mode
// Sensors tab (#camLightBody, #sensorBody). Row shape (row-name/row-status/
// row-model/row-cal/row-notes classes) matches what collectAllData()'s
// scrapeTable() in projectData.js already expects — this is the write side.

import { showToast } from './ui.js';

const DEFAULT_CAMERA_ITEMS = ['Rear Fixed Camera', 'PRC Camera', 'PTZ Camera', 'GVI Camera', 'Front Light', 'Rear Light', 'External Light'];
const DEFAULT_SENSOR_ITEMS = ['Depth Sensor', 'Heading / AHRS', 'Humidity Sensor', 'Temperature Sensor', 'Leak Sensor'];

export function showSensorTables() {
  document.getElementById('sensor-empty-state')?.classList.add('hidden');
  const content = document.getElementById('sensor-content');
  if (content) { content.classList.remove('hidden'); content.classList.add('flex'); }
}

export function addSensorRow(tbodyId, data = {}) {
  const container = document.getElementById(tbodyId);
  if (!container) return;
  const tr = document.createElement('tr');
  tr.className = 'hover:bg-gray-700/50 transition-colors';

  const isOk = data.status === 'OK';
  tr.innerHTML = `
    <td class="p-2 pl-4"><input type="text" class="row-name w-full bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500 outline-none text-gray-300 font-bold placeholder-gray-600 transition-all" value="${(data.name || '').replace(/"/g, '&quot;')}" placeholder="Item Name..."></td>
    <td class="p-2">
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" class="row-status sr-only peer" ${isOk ? 'checked' : ''}>
        <div class="w-11 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-bg after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
        <span class="row-status-label ml-3 text-sm font-bold w-12 ${isOk ? 'text-green-400' : 'text-red-400'}">${isOk ? 'OK' : 'Fault'}</span>
      </label>
    </td>
    <td class="p-2"><input type="text" class="row-model w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500" value="${(data.model || '').replace(/"/g, '&quot;')}" placeholder="Model..."></td>
    <td class="p-2"><input type="date" class="row-cal w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500" value="${data.cal || ''}"></td>
    <td class="p-2"><input type="text" class="row-notes w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500" value="${(data.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
    <td class="p-2 text-center"><button type="button" class="remove-row-btn text-red-500 hover:text-red-400 font-bold text-lg" title="Remove Row">&times;</button></td>
  `;
  tr.querySelector('.row-status').addEventListener('change', (e) => {
    const label = tr.querySelector('.row-status-label');
    const ok = e.target.checked;
    label.textContent = ok ? 'OK' : 'Fault';
    label.classList.toggle('text-green-400', ok);
    label.classList.toggle('text-red-400', !ok);
  });
  tr.querySelector('.remove-row-btn').addEventListener('click', () => tr.remove());
  container.appendChild(tr);
}

function resetSensorTab() {
  if (!confirm('Clear all camera and sensor rows and return to setup?')) return;
  ['camLightBody', 'sensorBody'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  document.getElementById('sensor-content')?.classList.add('hidden');
  document.getElementById('sensor-empty-state')?.classList.remove('hidden');
}

function loadDefaultSensors() {
  showSensorTables();
  DEFAULT_CAMERA_ITEMS.forEach(name => addSensorRow('camLightBody', { name, status: 'Fault' }));
  DEFAULT_SENSOR_ITEMS.forEach(name => addSensorRow('sensorBody', { name, status: 'Fault' }));
}

function importPackingJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const cam = parsed.cameraSystems || [];
      const sens = parsed.otherSensors || [];
      if (!cam.length && !sens.length) { showToast('No recognizable camera/sensor data in that file.', 'warn'); return; }
      showSensorTables();
      cam.forEach(i => addSensorRow('camLightBody', i));
      sens.forEach(i => addSensorRow('sensorBody', i));
      showToast('Packing list imported.', 'success');
    } catch (e) {
      showToast('Could not read that file as JSON.', 'error');
    }
  };
  input.click();
}

export function restoreSensorTables(cameraSystems, otherSensors) {
  const hasCam = cameraSystems && cameraSystems.length > 0;
  const hasSens = otherSensors && otherSensors.length > 0;
  document.getElementById('camLightBody').innerHTML = '';
  document.getElementById('sensorBody').innerHTML = '';
  if (hasCam || hasSens) {
    showSensorTables();
    (cameraSystems || []).forEach(i => addSensorRow('camLightBody', i));
    (otherSensors || []).forEach(i => addSensorRow('sensorBody', i));
  } else {
    document.getElementById('sensor-content')?.classList.add('hidden');
    document.getElementById('sensor-empty-state')?.classList.remove('hidden');
  }
}

export function installSensorTable() {
  window.addSensorRow = addSensorRow;
  window.resetSensorTab = resetSensorTab;
  window.loadDefaultSensors = loadDefaultSensors;
  window.importPackingJSON = importPackingJSON;
}

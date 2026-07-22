// Camera & Lighting / Sensors & Payload row builder for the Operation-mode
// Sensors tab (#camLightBody, #sensorBody). Row shape (row-name/row-status/
// row-model/row-cal/row-notes classes) matches what collectAllData()'s
// scrapeTable() in projectData.js already expects — this is the write side.

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
  if (!confirm('Clear all camera and sensor rows?')) return;
  ['camLightBody', 'sensorBody'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
}

export function installSensorTable() {
  window.addSensorRow = addSensorRow;
  window.resetSensorTab = resetSensorTab;
}

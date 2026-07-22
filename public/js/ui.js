// Small shared DOM helpers used across modules.

export function showToast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(host);
  }
  const colors = {
    success: { bg: '#16a34a', border: '#22c55e' },
    error:   { bg: '#dc2626', border: '#ef4444' },
    warn:    { bg: '#d97706', border: '#f59e0b' },
    info:    { bg: '#2563eb', border: '#3b82f6' },
  };
  const c = colors[type] || colors.info;
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `background:${c.bg};border:1px solid ${c.border};color:white;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function notImplemented(feature) {
  showToast(`${feature} — coming in a later update.`, 'info');
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

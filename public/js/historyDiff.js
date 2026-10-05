// Change detail for Project History (feedback point 4). Pure helpers with no
// imports: a save's data is flattened to "path -> value" pairs, and two
// snapshots are compared to list what changed. historyChanges.js uses these
// on every save.

// Fields that are huge or not user-facing and would only add noise.
const SKIP_PATH = /(^|\.)(diagramDataUrl|approvalHistory|history)$/;
const MAX_VALUE_LENGTH = 60;

export function flattenForHistory(value, path = '', out = {}) {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) out[path] = '[]';
      value.forEach((item, i) => flattenForHistory(item, `${path}[${i + 1}]`, out));
    } else {
      Object.keys(value).forEach(key => {
        const next = path ? `${path}.${key}` : key;
        if (!SKIP_PATH.test(next)) flattenForHistory(value[key], next, out);
      });
    }
    return out;
  }
  if (path) out[path] = value === undefined || value === null ? '' : String(value);
  return out;
}

// "thrusters[3].serial" -> "thrusters #3 › serial", "rovSensors.1[2]" -> "rovSensors › 1 #2"
function labelFor(path) {
  const text = path
    .replace(/\[(\d+)\]/g, ' #$1')
    .replace(/\./g, ' › ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function showValue(value) {
  if (value === '') return '—';
  if (value === '[]') return 'empty list';
  return value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) + '…' : value;
}

// Human-readable list of differences between two flattened snapshots.
export function diffFlat(prev, next) {
  const out = [];
  const paths = new Set([...Object.keys(prev), ...Object.keys(next)]);
  paths.forEach(path => {
    const before = prev[path];
    const after = next[path];
    if (before === after) return;
    const label = labelFor(path);
    if (before === undefined) out.push(after ? `${label}: added ${showValue(after)}` : `${label}: added`);
    else if (after === undefined) out.push(`${label}: removed`);
    else out.push(`${label}: ${showValue(before)} → ${showValue(after)}`);
  });
  return out;
}

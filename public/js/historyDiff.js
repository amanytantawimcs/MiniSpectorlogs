// Change detail for Project History (feedback point 4). Pure helpers with no
// imports: a save's data is flattened to "path -> value" pairs, and two
// snapshots are compared to list what changed. historyChanges.js uses these
// on every save.

// Fields that are huge, purely internal bookkeeping, or not user-facing —
// would only add noise, never something a user actually changed.
// - diagramDataUrl/approvalHistory/history: huge or already shown elsewhere.
// - pushedAt: stamped fresh on every Simulation→Operation sync, so it always
//   "changes" even when nothing else did.
// - reportDate: today's date, recomputed on every save.
const SKIP_PATH = /(^|\.)(diagramDataUrl|approvalHistory|history|pushedAt|reportDate)$/;
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

// The path up to and including the last array index, e.g.
// "sysarch.systemIPs[25].name" -> "sysarch.systemIPs[25]". Null if the path
// has no array index at all. Used to group every field of one array item
// (a payload, a system IP row, a thruster, ...) back into a single entry.
function arrayItemRoot(path) {
  const re = /\[\d+\]/g;
  let end = -1;
  let m;
  while ((m = re.exec(path))) end = m.index + m[0].length;
  return end === -1 || end === path.length ? null : path.slice(0, end);
}

// A representative value to show for a whole added/removed item, e.g. the
// payload's name or the equipment item's label, rather than every field.
const SUMMARY_FIELDS = ['name', 'item', 'title'];
function pickSummaryValue(itemPaths, data) {
  for (const field of SUMMARY_FIELDS) {
    const match = itemPaths.find(p => p.endsWith('.' + field));
    if (match && data[match]) return showValue(data[match]);
  }
  for (const p of itemPaths) {
    if (data[p]) return showValue(data[p]);
  }
  return '';
}

// Human-readable list of differences between two flattened snapshots. A
// whole array item that was added or removed (every one of its fields went
// from undefined to a value, or the reverse) is reported as one line, not
// one line per field — the same payload row, system IP, or thruster was not
// 6 separate changes.
export function diffFlat(prev, next) {
  const allPaths = new Set([...Object.keys(prev), ...Object.keys(next)]);

  const itemGroups = new Map(); // array-item root -> its field paths
  const standalone = [];
  allPaths.forEach(path => {
    const root = arrayItemRoot(path);
    if (root && root !== path) {
      if (!itemGroups.has(root)) itemGroups.set(root, []);
      itemGroups.get(root).push(path);
    } else {
      standalone.push(path);
    }
  });

  const out = [];
  const remaining = [...standalone];

  itemGroups.forEach((itemPaths, root) => {
    const allAdded = itemPaths.every(p => prev[p] === undefined);
    const allRemoved = itemPaths.every(p => next[p] === undefined);
    if (allAdded || allRemoved) {
      const data = allAdded ? next : prev;
      const summary = pickSummaryValue(itemPaths, data);
      out.push(`${labelFor(root)}: ${allAdded ? 'added' : 'removed'}${summary ? ` (${summary})` : ''}`);
    } else {
      // An existing item with some fields changed: keep the per-field detail.
      remaining.push(...itemPaths);
    }
  });

  remaining.forEach(path => {
    const before = prev[path];
    const after = next[path];
    if (before === after) return;
    // A bare "array is empty" marker trading places with real items under the
    // same path is not itself a change — the item-level lines above (if any)
    // already cover it; an array that was never populated either way isn't
    // worth reporting.
    if ((before === '[]' && after === undefined) || (before === undefined && after === '[]')) return;
    const label = labelFor(path);
    if (before === undefined) out.push(after ? `${label}: added ${showValue(after)}` : `${label}: added`);
    else if (after === undefined) out.push(`${label}: removed`);
    else out.push(`${label}: ${showValue(before)} → ${showValue(after)}`);
  });

  return out;
}

// Re-groups an already-stored change list back into one line per item, the
// same outcome diffFlat() produces directly. Entries written before item
// grouping existed have one stored line per field of each added/removed
// item — e.g. 6 lines for one new System IP row — because the database only
// kept the rendered strings, not the structured paths/values diffFlat()
// needs; those can't be re-diffed, only re-grouped from the text itself.
// Also drops the same sync-bookkeeping noise newer saves never record.
// A no-op on entries that are already grouped (verified against real data).
const NOISE_LABEL_SUFFIXES = [' › pushed At', ' › report Date'];
const NOISE_LABEL_EXACT = ['Pushed At', 'Report Date'];
const ITEM_ROOT_RE = /^(.*#\d+) › ([^›]+)$/;

function parseChangeLine(line) {
  const idx = line.indexOf(': ');
  if (idx === -1) return null;
  const label = line.slice(0, idx);
  const rest = line.slice(idx + 2);
  if (rest === 'added') return { label, kind: 'added', value: '' };
  if (rest.startsWith('added ')) return { label, kind: 'added', value: rest.slice(6) };
  if (rest === 'removed') return { label, kind: 'removed', value: '' };
  const arrow = rest.indexOf(' → ');
  if (arrow !== -1) return { label, kind: 'changed', before: rest.slice(0, arrow), after: rest.slice(arrow + 3) };
  return null;
}

export function cleanStoredChanges(lines) {
  const filtered = lines.filter(line => {
    const parsed = parseChangeLine(line);
    const label = parsed ? parsed.label : line.split(':')[0];
    return !NOISE_LABEL_SUFFIXES.some(s => label.endsWith(s)) && !NOISE_LABEL_EXACT.includes(label);
  });

  const out = [];
  let i = 0;
  while (i < filtered.length) {
    const parsed = parseChangeLine(filtered[i]);
    const m = parsed && parsed.label.match(ITEM_ROOT_RE);
    if (!parsed || !m) { out.push(filtered[i]); i++; continue; }
    const root = m[1];
    const group = [parsed];
    let j = i + 1;
    while (j < filtered.length) {
      const p2 = parseChangeLine(filtered[j]);
      const m2 = p2 && p2.label.match(ITEM_ROOT_RE);
      if (!p2 || !m2 || m2[1] !== root) break;
      group.push(p2);
      j++;
    }
    const allAdded = group.length > 1 && group.every(g => g.kind === 'added');
    const allRemoved = group.length > 1 && group.every(g => g.kind === 'removed');
    if (allAdded || allRemoved) {
      let summary = '';
      for (const f of SUMMARY_FIELDS) {
        const hit = group.find(g => g.label.endsWith('› ' + f) && g.value);
        if (hit) { summary = hit.value; break; }
      }
      if (!summary) { const hit = group.find(g => g.value); if (hit) summary = hit.value; }
      out.push(`${root}: ${allAdded ? 'added' : 'removed'}${summary ? ` (${summary})` : ''}`);
    } else {
      for (let k = i; k < j; k++) out.push(filtered[k]);
    }
    i = j;
  }
  return out;
}

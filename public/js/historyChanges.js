// Records what each save changed, for Project History (feedback point 4).
//
// Every save is diffed against the previous one (primeHistory() sets the
// starting point when a project is loaded). Changes are queued per section
// and written as one sync_log entry when the section's window closes. The
// old throttle skipped saves inside the window entirely, so those changes
// were lost; here they are kept and written together.

import { api } from './api.js';
import { state } from './state.js';
import { flattenForHistory, diffFlat } from './historyDiff.js';

const FLUSH_MS = 60_000;
const MAX_STORED_CHANGES = 20;

const lastSnapshot = {};   // mode -> flattened data at the last save or load
const lastSavedJson = {};  // mode -> serialized data at the last save or load (see isUnchangedSinceSave)

// reportDate changes every day on its own, so it is ignored when comparing.
function snapshotKey(data) {
  return JSON.stringify(data, (key, value) => (key === 'reportDate' ? undefined : value));
}

// Autosaves run every 20 seconds. A save with nothing new still moves the
// project's updated_at, which other devices read as a real change. Silent
// autosaves call this first and skip the write when nothing differs.
export function isUnchangedSinceSave(mode, data) {
  return lastSavedJson[mode] === snapshotKey(data);
}
const pending = new Map(); // `${mode}|${section}` -> { mode, section, projectCode, changes, timer }

// Call once a project's data has been loaded, so the first save diffs
// against what was loaded rather than against nothing.
export function primeHistory(mode, data) {
  lastSnapshot[mode] = flattenForHistory(data);
  lastSavedJson[mode] = snapshotKey(data);
}

// Call after every successful save.
export function recordSave({ mode, section, projectCode, data }) {
  lastSavedJson[mode] = snapshotKey(data);
  const next = flattenForHistory(data);
  const prev = lastSnapshot[mode];
  lastSnapshot[mode] = next;
  if (!prev) return;
  const changes = diffFlat(prev, next);
  if (changes.length === 0) return;

  const key = `${mode}|${section}`;
  let entry = pending.get(key);
  if (!entry) {
    entry = { mode, section, projectCode, changes: [], timer: null };
    pending.set(key, entry);
  }
  entry.projectCode = projectCode;
  entry.changes.push(...changes);
  if (!entry.timer) entry.timer = setTimeout(() => flush(key), FLUSH_MS);
}

function flush(key) {
  const entry = pending.get(key);
  if (!entry) return;
  pending.delete(key);
  clearTimeout(entry.timer);
  api.logSyncAction({
    project_code: entry.projectCode,
    device_role: state.currentDeviceRole || 'vessel',
    user_name: state.currentUserName,
    action: 'update',
    meta: {
      mode: entry.mode,
      section: entry.section,
      changes: entry.changes.slice(0, MAX_STORED_CHANGES),
      more: Math.max(0, entry.changes.length - MAX_STORED_CHANGES),
    },
  });
}

// Writes anything still waiting, e.g. when the tab is closing.
export function flushAllHistory() {
  [...pending.keys()].forEach(flush);
}

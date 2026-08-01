// Periodic staleness check: neither Operation nor Simulation mode ever pulls
// from the server after the initial load/join — two devices ("vessel" and
// "office") editing the same project code just silently last-write-wins each
// other with zero warning. This polls for a changed updated_at and warns
// instead of staying silent. Deliberately a warning + manual reload, not
// automatic merging — merging two people's concurrent edits is a much bigger
// problem than this app needs solved right now.

import { state } from './state.js';
import { api } from './api.js';
import { showStaleDataBanner } from './ui.js';

let knownUpdatedAt = null;
let pollTimer = null;
// Bumped on every local save/lock. Push-to-Operation fires two writes back
// to back (saveProject + lockSimulation) — if a poll's pull request happens
// to be in flight while those land, it can resolve with a pre-push snapshot
// *after* knownUpdatedAt has already moved on locally, which reads as a
// mismatch even though nobody else touched the project. Comparing the epoch
// before/after the await lets us discard that one stale round instead of
// flashing a false banner; the next tick re-checks cleanly.
let epoch = 0;

export function noteSavedUpdatedAt(ts) {
  if (ts) { knownUpdatedAt = ts; epoch++; }
}

async function checkForUpdates() {
  const code = state.currentProjectCode;
  if (!code) return;
  const epochAtStart = epoch;
  const result = await api.pullProject(code);
  if (!result.success || !result.project) return;
  if (epoch !== epochAtStart) return;
  const serverUpdatedAt = result.project.updated_at;
  if (knownUpdatedAt === null) { knownUpdatedAt = serverUpdatedAt; return; }
  if (serverUpdatedAt && serverUpdatedAt !== knownUpdatedAt) {
    showStaleDataBanner();
  }
}

export function startStaleCheck() {
  stopStaleCheck();
  pollTimer = setInterval(checkForUpdates, 25 * 1000);
}

export function stopStaleCheck() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Scope-bundle catalog: wraps the built-in OPERATION_SCOPES as browsable
// "bundles" (id/family/name/required+optional sensors) and layers in
// user-saved custom bundles (session-local, persisted to localStorage only —
// they are a client-side convenience, not part of the server schema).
//
// simState.selectedScope keeps storing whatever id was picked — a numeric-ish
// string for a built-in OPERATION_SCOPES key, or a "CUS-xx" id for a custom
// bundle. Every other module that used to read OPERATION_SCOPES[id] directly
// should go through findScope()/scopeName() here instead, so custom bundles
// work everywhere (readiness, sensors, pre-op, push-to-operation).

import { OPERATION_SCOPES } from './config.js';

const STORAGE_KEY = 'mcs_custom_scope_bundles';

function loadCustom() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustom(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* non-fatal */ }
}

let customBundles = loadCustom();

export function getBuiltInBundles() {
  return Object.entries(OPERATION_SCOPES).map(([id, s]) => ({
    id,
    fam: s.category,
    name: s.name,
    req: s.sensors.filter(x => x.status === 'required').map(x => x.name),
    opt: s.sensors.filter(x => x.status === 'optional').map(x => x.name),
  }));
}

export function getCustomBundles() {
  return customBundles;
}

export function getAllBundles() {
  return [...getBuiltInBundles(), ...customBundles];
}

// Returns { id, fam, name, sensors:[{name,status}], req:[names], opt:[names] }
// — the `sensors` shape matches what loadFreshScope()/mergeWithNewScope() expect.
export function findScope(id) {
  if (id === null || id === undefined || id === '') return null;
  const builtIn = OPERATION_SCOPES[id];
  if (builtIn) {
    return {
      id: String(id),
      fam: builtIn.category,
      name: builtIn.name,
      sensors: builtIn.sensors,
      req: builtIn.sensors.filter(x => x.status === 'required').map(x => x.name),
      opt: builtIn.sensors.filter(x => x.status === 'optional').map(x => x.name),
    };
  }
  const custom = customBundles.find(b => b.id === id);
  if (custom) {
    return {
      id: custom.id,
      fam: custom.fam,
      name: custom.name,
      sensors: [
        ...custom.req.map(name => ({ name, status: 'required' })),
        ...custom.opt.map(name => ({ name, status: 'optional' })),
      ],
      req: custom.req,
      opt: custom.opt,
    };
  }
  return null;
}

export function scopeName(id) {
  return findScope(id)?.name || '';
}

export function addCustomBundle({ name, fam, req, opt, note, shared }) {
  const n = customBundles.length + 1;
  const bundle = {
    id: 'CUS-' + String(n).padStart(2, '0'),
    fam: fam || 'Custom',
    name,
    req: req.slice(),
    opt: opt.slice(),
    custom: true,
    note: note || '',
    shared: !!shared,
  };
  customBundles.push(bundle);
  saveCustom(customBundles);
  return bundle;
}

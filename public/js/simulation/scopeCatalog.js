// Scope catalog: base operation scopes (BASE_SCOPES) plus optional add-on
// modules (SCOPE_ADD_ONS) that layer sensor overrides on top, replacing the
// old flat OPERATION_SCOPES bundle list (16 heavily-duplicated entries).
// Layers in user-saved custom bundles too (session-local, persisted to
// localStorage only — they are a client-side convenience, not part of the
// server schema).
//
// simState.selectedScope stores a composite id: a base id alone
// ("pipeline-conventional"), a base id plus sorted add-on ids joined with
// "+" ("pipeline-conventional+prc-ext-frame+sbes-profiler"), or a "CUS-xx"
// custom-bundle id. Every other module that needs a resolved name or final
// sensor list goes through findScope()/scopeName() here, never BASE_SCOPES
// directly, so custom bundles and composite ids work everywhere (readiness,
// sensors, pre-op, push-to-operation).

import { BASE_SCOPES, SCOPE_ADD_ONS, LEGACY_SCOPE_IDS } from './config.js';

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

export function getBaseScopes() {
  return Object.entries(BASE_SCOPES).map(([id, s]) => ({
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
  return [...getBaseScopes(), ...customBundles];
}

// Every add-on whose appliesTo includes this base scope id — drives the
// add-ons toggle row in setup.js's renderScopeDetail(). Empty for a custom
// bundle id or an id that isn't a known base.
export function getAddOnsForBase(baseId) {
  return Object.entries(SCOPE_ADD_ONS)
    .filter(([, a]) => a.appliesTo.includes(baseId))
    .map(([id, a]) => ({ id, label: a.label }));
}

// Encodes a base id + a set of add-on ids into the single opaque string
// simState.selectedScope/scope_id stores. Add-on ids are sorted first so the
// same combination always encodes identically regardless of pick order —
// beginSimulation() detects a scope change via a plain string !== compare.
export function encodeScopeId(baseId, addonIds = []) {
  const sorted = [...addonIds].sort();
  return sorted.length ? `${baseId}+${sorted.join('+')}` : baseId;
}

export function decodeScopeId(id) {
  const [baseId, ...addonIds] = String(id).split('+');
  return { baseId, addonIds };
}

// Resolves a base id + add-on ids into a final sensor list. Add-ons are
// applied in the order given, each overriding the running required/optional
// status for any sensor name it declares (last one wins on a conflict
// between two add-ons); the base's own sensors are the starting point.
export function composeScope(baseId, addonIds = []) {
  const base = BASE_SCOPES[baseId];
  if (!base) return null;
  const statusByName = new Map(base.sensors.map(s => [s.name, s.status]));
  for (const addonId of addonIds) {
    const addon = SCOPE_ADD_ONS[addonId];
    if (!addon) continue;
    for (const s of addon.sensors) statusByName.set(s.name, s.status);
  }
  const sensors = [...statusByName.entries()].map(([name, status]) => ({ name, status }));
  return {
    sensors,
    req: sensors.filter(s => s.status === 'required').map(s => s.name),
    opt: sensors.filter(s => s.status === 'optional').map(s => s.name),
  };
}

// Resolves any stored scope id — a composite base+add-ons string, a legacy
// flat OPERATION_SCOPES number ("1".."16"), or a "CUS-xx" custom-bundle id —
// down to { baseId, addonIds, custom }. `baseId` is null when `id` names a
// custom bundle (`custom` is set instead) or resolves to nothing at all.
// Shared by findScope() below and by setup.js, which needs the same
// breakdown to drive the add-ons toggle row without reaching into
// BASE_SCOPES/SCOPE_ADD_ONS directly.
export function resolveScopeSelection(id) {
  if (id === null || id === undefined || id === '') return { baseId: null, addonIds: [], custom: null };
  const { baseId, addonIds } = decodeScopeId(id);
  if (BASE_SCOPES[baseId]) return { baseId, addonIds, custom: null };
  const legacy = LEGACY_SCOPE_IDS[id];
  if (legacy) return resolveScopeSelection(legacy);
  const custom = customBundles.find(b => b.id === id);
  if (custom) return { baseId: null, addonIds: [], custom };
  return { baseId: null, addonIds: [], custom: null };
}

// Returns { id, fam, name, sensors:[{name,status}], req:[names], opt:[names] }
// — the `sensors` shape matches what loadFreshScope()/mergeWithNewScope() expect.
// `id` on the returned object is the canonical composite form (legacy ids
// resolve and normalize here, same as a fresh pick would encode).
export function findScope(id) {
  const { baseId, addonIds, custom } = resolveScopeSelection(id);

  if (baseId) {
    const base = BASE_SCOPES[baseId];
    const composed = composeScope(baseId, addonIds);
    const addonLabels = addonIds.map(a => SCOPE_ADD_ONS[a]?.label).filter(Boolean);
    return {
      id: encodeScopeId(baseId, addonIds),
      fam: base.category,
      name: [base.name, ...addonLabels].join(' '),
      sensors: composed.sensors,
      req: composed.req,
      opt: composed.opt,
    };
  }

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

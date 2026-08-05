/**
 * GNMPresets.js — save / load of GNM face parameters.
 *
 * A "face preset" is the full parameter state (identity + expression PCA
 * coefficients, joint rotations, and translation) captured from the scene.
 * Presets can be kept in the browser (localStorage), exported to / imported
 * from a `.gnmhead.json` file, or fetched from a URL.
 */

const PRESET_KIND = 'gnm-face';
const PRESET_VERSION = 1;
const STORAGE_KEY = 'gnm.presets.v1';
const FILE_EXTENSION = '.gnmhead.json';

/** Rounds coefficients to keep files small without visible loss. */
function round(values, digits = 5) {
  const factor = 10 ** digits;
  return Array.from(values, (v) => Math.round(v * factor) / factor);
}

/**
 * Wraps a captured parameter state ({identity, expression, rotations,
 * translation}) into a portable, self-describing document.
 */
export function serializePreset(state, meta, name) {
  return {
    kind: PRESET_KIND,
    version: PRESET_VERSION,
    name: name || 'Untitled face',
    savedAt: new Date().toISOString(),
    model: {
      gnmVersion: meta.gnmVersion,
      identityDim: meta.identityDim,
      expressionDim: meta.expressionDim,
    },
    params: {
      identity: round(state.identity),
      expression: round(state.expression),
      rotations: round(state.rotations),
      translation: round(state.translation),
    },
  };
}

/**
 * Validates a parsed document against the current model and returns the
 * parameter state. Throws with a human-readable message on mismatch.
 */
export function parsePreset(doc, meta) {
  if (!doc || typeof doc !== 'object' || doc.kind !== PRESET_KIND) {
    throw new Error('Not a GNM face file.');
  }
  const params = doc.params || {};
  const identity = params.identity;
  const expression = params.expression;
  if (!Array.isArray(identity) || !Array.isArray(expression)) {
    throw new Error('File is missing identity/expression parameters.');
  }
  if (identity.length !== meta.identityDim) {
    throw new Error(
      `Identity dimension ${identity.length} does not match this model` +
        ` (${meta.identityDim}).`
    );
  }
  if (expression.length !== meta.expressionDim) {
    throw new Error(
      `Expression dimension ${expression.length} does not match this model` +
        ` (${meta.expressionDim}).`
    );
  }
  return {
    name: doc.name || 'Untitled face',
    savedAt: doc.savedAt,
    state: {
      identity,
      expression,
      rotations: Array.isArray(params.rotations) ? params.rotations : [],
      translation: Array.isArray(params.translation) ? params.translation : [],
    },
  };
}

// ---------------------------------------------------------- local storage --

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Lists saved presets, newest first: [{name, savedAt}]. */
export function listLocalPresets() {
  const store = readStore();
  return Object.values(store)
    .map((doc) => ({name: doc.name, savedAt: doc.savedAt}))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

/** Saves (or overwrites) a preset document by name. */
export function saveLocalPreset(doc) {
  const store = readStore();
  store[doc.name] = doc;
  writeStore(store);
}

/** Returns the stored document for a name, or null. */
export function getLocalPreset(name) {
  return readStore()[name] || null;
}

/** Deletes a stored preset by name. Returns true if it existed. */
export function deleteLocalPreset(name) {
  const store = readStore();
  if (!(name in store)) return false;
  delete store[name];
  writeStore(store);
  return true;
}

// ------------------------------------------------------------- file / url --

/** Triggers a browser download of a preset document. */
export function downloadPreset(doc) {
  const safe = (doc.name || 'face')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const blob = new Blob([JSON.stringify(doc, null, 1)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${safe || 'face'}${FILE_EXTENSION}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Reads and JSON-parses a File chosen from an <input type="file">. */
export async function readPresetFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

/** Fetches and JSON-parses a preset document from a URL. */
export async function fetchPresetUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

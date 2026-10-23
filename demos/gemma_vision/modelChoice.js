import {DEFAULT_MODEL, MODELS} from './modelConfig.js';

export const MODEL_CHOICE_KEY = 'xrblocks-gemma-vision-model';
const COMPACT_DEVICE = /Android|Mobile|iPhone|iPad|OculusBrowser|Quest/i;

/**
 * Phones, headsets and devices that report less than 8 GB of memory.
 * @param {{deviceMemory?: unknown, userAgent?: unknown}} hints
 */
export function isCompactDevice({deviceMemory, userAgent} = {}) {
  if (typeof deviceMemory === 'number' && deviceMemory < 8) return true;
  return typeof userAgent === 'string' && COMPACT_DEVICE.test(userAgent);
}

/**
 * Models offered on this device. Gemma 4 needs several GB beyond its download
 * and crashed Galaxy XR and Quest 3 tabs while loading, so compact devices get
 * only Lite.
 * @param {{deviceMemory?: unknown, userAgent?: unknown}} hints
 * @returns {Array<keyof typeof MODELS>}
 */
export function offeredModels(hints = {}) {
  return isCompactDevice(hints)
    ? ['lite']
    : /** @type {Array<keyof typeof MODELS>} */ (Object.keys(MODELS));
}

/**
 * Prefer a saved choice the device is offered, then Gemma where it is offered,
 * otherwise Lite.
 * @param {{stored?: unknown, deviceMemory?: unknown, userAgent?: unknown}} hints
 * @returns {keyof typeof MODELS}
 */
export function pickDefaultModel({stored, deviceMemory, userAgent} = {}) {
  const offered = offeredModels({deviceMemory, userAgent});
  if (typeof stored === 'string' && offered.some((key) => key === stored)) {
    return /** @type {keyof typeof MODELS} */ (stored);
  }
  return offered.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : offered[0];
}

function pageStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Storage that tolerates blocked or missing localStorage. */
function safeStorage(storage) {
  return {
    get() {
      try {
        return storage?.getItem(MODEL_CHOICE_KEY) ?? undefined;
      } catch {
        return undefined;
      }
    },
    set(value) {
      try {
        storage?.setItem(MODEL_CHOICE_KEY, value);
      } catch {
        // The choice still applies for this page.
      }
    },
  };
}

/**
 * @param {{storage?: Pick<Storage, 'getItem' | 'setItem'> | null, navigator?: {deviceMemory?: number, userAgent?: string}}} options
 */
export function createModelChoice({
  storage = pageStorage(),
  navigator = globalThis.navigator,
} = {}) {
  const saved = safeStorage(storage);
  const hints = {
    deviceMemory: navigator?.deviceMemory,
    userAgent: navigator?.userAgent,
  };
  return {
    initial: pickDefaultModel({stored: saved.get(), ...hints}),
    models: offeredModels(hints),
    save: (key) => saved.set(key),
  };
}

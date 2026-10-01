import {DEFAULT_MODEL, MODELS} from './modelConfig.js';

export const MODEL_CHOICE_KEY = 'xrblocks-gemma-vision-model';
const COMPACT_DEVICE = /Android|Mobile|iPhone|iPad|OculusBrowser|Quest/i;
export const COMPACT_GEMMA_NOTE =
  'Gemma 4 E2B is a 3.4 GB model and may run slowly on this device. Lite is faster.';

/**
 * Phones, headsets and devices that report less than 8 GB of memory.
 * @param {{deviceMemory?: unknown, userAgent?: unknown}} hints
 */
export function isCompactDevice({deviceMemory, userAgent} = {}) {
  if (typeof deviceMemory === 'number' && deviceMemory < 8) return true;
  return typeof userAgent === 'string' && COMPACT_DEVICE.test(userAgent);
}

/**
 * Prefer a saved choice, then Lite for phones, headsets and devices that
 * report less than 8 GB of memory, otherwise Gemma.
 * @param {{stored?: unknown, deviceMemory?: unknown, userAgent?: unknown}} hints
 * @returns {keyof typeof MODELS}
 */
export function pickDefaultModel({stored, deviceMemory, userAgent} = {}) {
  if (typeof stored === 'string' && Object.hasOwn(MODELS, stored)) {
    return /** @type {keyof typeof MODELS} */ (stored);
  }
  return isCompactDevice({deviceMemory, userAgent}) ? 'lite' : DEFAULT_MODEL;
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
    compact: isCompactDevice(hints),
    save: (key) => saved.set(key),
  };
}

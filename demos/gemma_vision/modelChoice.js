import {DEFAULT_MODEL, MODELS} from './modelConfig.js';

export const MODEL_CHOICE_KEY = 'xrblocks-gemma-vision-model';
const COMPACT_DEVICE = /Android|Mobile|iPhone|iPad|OculusBrowser|Quest/i;

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
  if (typeof deviceMemory === 'number' && deviceMemory < 8) return 'lite';
  if (typeof userAgent === 'string' && COMPACT_DEVICE.test(userAgent)) {
    return 'lite';
  }
  return DEFAULT_MODEL;
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
  return {
    initial: pickDefaultModel({
      stored: saved.get(),
      deviceMemory: navigator?.deviceMemory,
      userAgent: navigator?.userAgent,
    }),
    save: (key) => saved.set(key),
  };
}

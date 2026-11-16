import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GamepadBindings} from './GamepadBindings';

const key = 'xrblocks:simulator:gamepad-bindings:v1';
let stored: string | null;
beforeEach(() => {
  stored = localStorage.getItem(key);
  localStorage.removeItem(key);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (stored === null) localStorage.removeItem(key);
  else localStorage.setItem(key, stored);
});

describe('GamepadBindings', () => {
  it('persists edits, prevents duplicate assignments, and can reset them', () => {
    const bindings = new GamepadBindings();
    const original = bindings.getAllBindings();
    bindings.setBinding('select', 12);
    bindings.setBinding('toggleUI', 12);
    const reloaded = new GamepadBindings();
    expect(reloaded.getBinding('toggleUI')).toBe(12);
    expect(reloaded.getBinding('select')).toBe(-1);
    reloaded.resetDefaults();
    expect(new GamepadBindings().getAllBindings()).toEqual(original);
  });

  it('keeps edits usable when browser storage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const bindings = new GamepadBindings();
    bindings.setBinding('select', 12);
    expect(bindings.getBinding('select')).toBe(12);
  });
});

import {describe, it, expect, beforeEach, vi} from 'vitest';

import {GamepadBindings} from './GamepadBindings';

describe('GamepadBindings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default bindings when no storage exists', () => {
    const bindings = new GamepadBindings();
    expect(bindings.getBinding('select')).toBe(0);
    expect(bindings.getBinding('cycleHandPoseLeft')).toBe(14);
    expect(bindings.getBinding('cycleHandPoseRight')).toBe(15);
    expect(bindings.getBinding('cycleSimulatorMode')).toBe(3);
    expect(bindings.getBinding('toggleUI')).toBe(5);
    expect(bindings.getBinding('openSettings')).toBe(9);
  });

  it('persists and reloads customized bindings', () => {
    const bindings = new GamepadBindings();
    bindings.setBinding('select', 1);

    const stored = localStorage.getItem(
      'xrblocks:simulator:gamepad-bindings:v1'
    );
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.bindings.select).toBe(1);
    expect(new GamepadBindings().getBinding('select')).toBe(1);
  });

  it('falls back to defaults for invalid stored data', () => {
    for (const stored of [
      'not valid json',
      JSON.stringify({version: 99, bindings: {select: 5}}),
    ]) {
      localStorage.setItem('xrblocks:simulator:gamepad-bindings:v1', stored);
      expect(new GamepadBindings().getBinding('select')).toBe(0);
    }
  });

  it('auto-unbinds duplicate when setting a binding', () => {
    const bindings = new GamepadBindings();
    // select = 0 by default, cycleHandPoseLeft = 14
    bindings.setBinding('cycleHandPoseLeft', 0); // steal button 0 from select
    expect(bindings.getBinding('cycleHandPoseLeft')).toBe(0);
    expect(bindings.getBinding('select')).toBe(-1); // unbound
  });

  it('keeps the settings binding reserved', () => {
    const bindings = new GamepadBindings();
    bindings.setBinding('openSettings', 0);
    expect(bindings.getBinding('openSettings')).toBe(9);
    bindings.setBinding('select', 9); // openSettings is on 9
    expect(bindings.getBinding('select')).toBe(0); // refused, kept default
    expect(bindings.getBinding('openSettings')).toBe(9);
  });

  it('resetDefaults restores all to defaults and persists', () => {
    const bindings = new GamepadBindings();
    bindings.setBinding('select', 5);
    bindings.setBinding('toggleUI', 12);
    bindings.resetDefaults();

    expect(bindings.getBinding('select')).toBe(0);
    expect(bindings.getBinding('toggleUI')).toBe(5);

    // Check it persisted the reset
    const stored = JSON.parse(
      localStorage.getItem('xrblocks:simulator:gamepad-bindings:v1')!
    );
    expect(stored.bindings.select).toBe(0);
  });

  it('getAllBindings returns a copy', () => {
    const bindings = new GamepadBindings();
    const all = bindings.getAllBindings();
    all.select = 99;
    expect(bindings.getBinding('select')).toBe(0); // not affected
  });

  it('continues when browser storage is unavailable', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    // Should not throw
    const bindingsWithUnavailableStorage = new GamepadBindings();
    expect(bindingsWithUnavailableStorage.getBinding('select')).toBe(0);
    spy.mockRestore();
    const saveSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
    const bindings = new GamepadBindings();
    // Should not throw
    bindings.setBinding('select', 3);
    expect(bindings.getBinding('select')).toBe(3); // in-memory still works
    saveSpy.mockRestore();
  });
});

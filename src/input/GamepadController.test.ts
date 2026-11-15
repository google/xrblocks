import {afterEach, describe, expect, it} from 'vitest';

import {GamepadController} from './GamepadController';

function makeButton(): GamepadButton {
  return {pressed: false, touched: false, value: 0};
}

function makeGamepad({
  connected = true,
  mapping = 'standard',
  buttonCount = 16,
  axisCount = 4,
}: {
  connected?: boolean;
  mapping?: string;
  buttonCount?: number;
  axisCount?: number;
} = {}): Gamepad {
  return {
    id: 'Mock Gamepad',
    index: 0,
    connected,
    mapping: mapping as GamepadMappingType,
    buttons: Array.from({length: buttonCount}, makeButton),
    axes: Array.from({length: axisCount}, () => 0),
    timestamp: 0,
    vibrationActuator: null,
  } as Gamepad;
}

function stubGamepads(...pads: Array<Gamepad | null>) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads,
  });
}

function pollActivePad() {
  const controller = new GamepadController();
  controller.update();
  return controller.activeGamepad ?? null;
}

describe('GamepadController', () => {
  describe('applyDeadzone', () => {
    it('returns 0 for values within deadzone', () => {
      expect(GamepadController.applyDeadzone(0)).toBe(0);
      expect(GamepadController.applyDeadzone(0.1)).toBe(0);
      expect(GamepadController.applyDeadzone(-0.1)).toBe(0);
      expect(GamepadController.applyDeadzone(0.14)).toBe(0);
    });

    it('preserves direction and remaps values outside the deadzone', () => {
      expect(GamepadController.applyDeadzone(1.0)).toBeCloseTo(1.0, 2);
      expect(GamepadController.applyDeadzone(-1.0)).toBeCloseTo(-1.0, 2);
      // At exactly the deadzone boundary, should be ~0
      const atEdge = GamepadController.applyDeadzone(0.15);
      expect(atEdge).toBeCloseTo(0, 1);

      // Halfway between deadzone and 1.0
      const mid = GamepadController.applyDeadzone(0.575);
      expect(mid).toBeCloseTo(0.5, 1);
    });

    it('returns 0 for invalid input', () => {
      expect(GamepadController.applyDeadzone(NaN)).toBe(0);
      expect(GamepadController.applyDeadzone(Infinity)).toBe(0);
      expect(GamepadController.applyDeadzone(-Infinity)).toBe(0);
    });
  });

  describe('_pollGamepad', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'getGamepads');
    });

    it("accepts a connected mapping: 'standard' pad", () => {
      const pad = makeGamepad({mapping: 'standard'});
      stubGamepads(pad);
      expect(pollActivePad()).toBe(pad);
    });

    it('accepts a connected empty-mapping pad with a standard shape', () => {
      const pad = makeGamepad({mapping: '', buttonCount: 16, axisCount: 4});
      stubGamepads(pad);
      expect(pollActivePad()).toBe(pad);
    });

    it('rejects an empty-mapping pad that is not standard-shaped', () => {
      stubGamepads(makeGamepad({mapping: '', buttonCount: 15, axisCount: 4}));
      expect(pollActivePad()).toBeNull();

      stubGamepads(makeGamepad({mapping: '', buttonCount: 16, axisCount: 3}));
      expect(pollActivePad()).toBeNull();
    });

    it('rejects disconnected pads', () => {
      stubGamepads(makeGamepad({connected: false, mapping: 'standard'}));
      expect(pollActivePad()).toBeNull();

      stubGamepads(
        makeGamepad({
          connected: false,
          mapping: '',
          buttonCount: 16,
          axisCount: 4,
        })
      );
      expect(pollActivePad()).toBeNull();
    });

    it('rejects pads with a non-standard mapping string', () => {
      stubGamepads(
        makeGamepad({
          mapping: 'xr-standard',
          buttonCount: 16,
          axisCount: 4,
        })
      );
      expect(pollActivePad()).toBeNull();
    });
  });
});

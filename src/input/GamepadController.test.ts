import {describe, it, expect} from 'vitest';

import {GamepadController} from './GamepadController';

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
});

import {expect, it} from 'vitest';
import {GamepadController} from './GamepadController';

it('filters stick noise while preserving direction and full travel', () => {
  const filter = GamepadController.applyDeadzone;
  expect(filter(0)).toBe(0);
  expect(filter(1)).toBe(1);
  expect(filter(-1)).toBe(-1);
  expect(filter(0.6)).toBeGreaterThan(0);
  expect(filter(0.6)).toBeLessThan(0.6);
  expect(filter(-0.6)).toBeCloseTo(-filter(0.6));
  expect(filter(NaN)).toBe(0);
});

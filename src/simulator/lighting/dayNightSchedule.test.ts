import {expect, it} from 'vitest';
import {dayNightSchedule} from './dayNightSchedule';

it('blends monotonically between pure day and night endpoints', () => {
  const day = dayNightSchedule(-1);
  const night = dayNightSchedule(2);
  expect(day.mixU).toBe(0);
  expect(night.mixU).toBe(1);
  for (const endpoint of [day, night]) {
    expect(
      endpoint.sunIntensity +
        endpoint.bounceIntensity +
        endpoint.skyFillIntensity
    ).toBe(0);
  }
  const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => dayNightSchedule(t).mixU);
  expect(samples).toEqual([...samples].sort((a, b) => a - b));
  expect(samples[2]).toBeGreaterThan(0);
  expect(samples[2]).toBeLessThan(1);
});

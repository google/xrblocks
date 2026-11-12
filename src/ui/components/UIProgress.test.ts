import {expect, it} from 'vitest';
import {UIProgress} from './UIProgress';

it('clamps progress to its configured range without accepting nonfinite values', () => {
  const progress = new UIProgress({
    ariaLabel: 'Upload',
    min: 10,
    max: 50,
    value: -1,
  });
  expect(progress.value).toBe(10);
  progress.value = 30;
  expect(progress.value).toBe(30);
  progress.value = 100;
  expect(progress.value).toBe(50);
  expect(() => {
    progress.value = NaN;
  }).toThrow();
  expect(progress.value).toBe(50);
  expect(
    () => new UIProgress({ariaLabel: 'Upload', min: 50, max: 10})
  ).toThrow();
});

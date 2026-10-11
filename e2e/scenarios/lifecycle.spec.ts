import {test, expect} from '../fixtures/boot';

test('probe script initializes with scene content', async ({driver}) => {
  const state = await driver.getState();
  expect(state.sceneObjects).toContain('E2E probe');
  expect(state.frames).toBeGreaterThanOrEqual(0);
});

test('frame-loop ticks track stepped duration', async ({driver}) => {
  // Measured behavior: one update tick per configured tickMs (16.67ms).
  const before = await driver.getState();

  await driver.step(100);
  const afterShort = await driver.getState();
  const shortDelta = afterShort.frames - before.frames;
  expect(shortDelta).toBeGreaterThanOrEqual(4);
  expect(shortDelta).toBeLessThanOrEqual(10);

  await driver.step(300);
  const afterLong = await driver.getState();
  const longDelta = afterLong.frames - afterShort.frames;
  expect(longDelta).toBeGreaterThanOrEqual(14);
  expect(longDelta).toBeLessThanOrEqual(24);
});

test('probe rotation accumulates across steps', async ({driver}) => {
  await driver.step(50);
  const first = await driver.getState();
  await driver.step(50);
  const second = await driver.getState();
  expect(second.probeRotationY).toBeGreaterThan(first.probeRotationY);
});

test('dispose tears the engine down', async ({driver}) => {
  await driver.step(16);
  await driver.destroy();
  const state = await driver.getState();
  expect(state.lifecycle).toBe('disposed');
});

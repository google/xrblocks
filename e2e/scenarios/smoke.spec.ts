import {test, expect} from '../fixtures/boot';

test('boots the engine in the simulator', async ({driver}) => {
  const state = await driver.getState();
  expect(state.lifecycle).toBeTruthy();
  expect(state.lifecycle).not.toBe('disposed');
  expect(state.canvasSize.width).toBeGreaterThan(0);
  expect(state.canvasSize.height).toBeGreaterThan(0);
});

test('stepping advances the frame loop and probe rotation', async ({
  driver,
}) => {
  const before = await driver.getState();

  await driver.step(100);

  const after = await driver.getState();
  expect(after.frames).toBeGreaterThan(before.frames);
  expect(after.probeRotationY).toBeGreaterThan(before.probeRotationY);
});

test('renders non-black frames', async ({driver}) => {
  await driver.step(50);
  const frame = await driver.captureFrame();
  expect(frame.samples).toBeGreaterThan(0);
  // The harness scene renders a few small objects against the clear color,
  // so only a small fraction of pixels is lit.
  expect(frame.nonBlackFraction).toBeGreaterThan(0.01);
  expect(frame.meanLuma).toBeGreaterThan(0.5);
});

import {test, expect} from '../fixtures/boot';

test('depth is off by default', async ({driver}) => {
  const state = await driver.getState();
  expect(state.depthEnabled).toBe(false);
});

test.describe('with ?depth=1', () => {
  test('enables the depth subsystem', async ({driver}) => {
    await driver.boot('e2e/fixtures/apps/harness.html?depth=1');
    const state = await driver.getState();
    expect(state.depthEnabled).toBe(true);
  });

  test('still steps and renders frames', async ({driver}) => {
    await driver.boot('e2e/fixtures/apps/harness.html?depth=1');
    await driver.step(100);
    const state = await driver.getState();
    expect(state.frames).toBeGreaterThan(0);

    const frame = await driver.captureFrame();
    expect(frame.nonBlackFraction).toBeGreaterThan(0.01);
  });
});

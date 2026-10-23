import {test, expect} from '../fixtures/boot';

test('depth is off by default', async ({driver}) => {
  const state = await driver.getState();
  expect(state.depthEnabled).toBe(false);
});

test.describe('with ?depth=1', () => {
  test('enables the depth subsystem', async ({driver}) => {
    await driver.boot('e2e/fixtures/apps/harness.html?depth=1');
    await expect
      .poll(
        async () => {
          await driver.step(100);
          return (await driver.getState()).depthMeshVisible;
        },
        {timeout: 15_000, intervals: [100, 250, 500]}
      )
      .toBe(true);
    const state = await driver.getState();
    expect(state.depthEnabled).toBe(true);
    expect(state.depthMeshVisible).toBe(true);
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

import {test, expect} from '../fixtures/boot';

// Perception features over the real WebXR code path: IWER's Synthetic
// Environment Module feeds plane/mesh/depth data through the WebXR API
// (frame.detectedPlanes / detectedMeshes / depth information), and these
// tests assert the SDK consumes it.

test('depth sensing is active in the session', async ({driver}) => {
  await driver.boot('e2e/fixtures/apps/harness.html?depth=1&planes=1&meshes=1');
  const state = await driver.getState();
  expect(state.depthEnabled).toBe(true);

  await driver.step(300);
  const after = await driver.getState();
  expect(after.frames).toBeGreaterThan(state.frames);
  // The depth mesh is built from depth-sensing data.
  expect(after.depthMeshPresent).toBe(true);
});

test('plane detection surfaces planes in the SDK', async ({driver}) => {
  await driver.boot('e2e/fixtures/apps/harness.html?depth=1&planes=1&meshes=1');
  await driver.step(400);
  const state = await driver.getState();
  // Emulator-side truth first, then the SDK-side consumption.
  expect(state.semPlanes).toBeGreaterThan(0);
  expect(state.worldPlanes).toBeGreaterThan(0);
});

test('mesh detection surfaces scene meshes in the SDK', async ({driver}) => {
  await driver.boot('e2e/fixtures/apps/harness.html?depth=1&planes=1&meshes=1');
  await driver.step(400);
  const state = await driver.getState();
  expect(state.semMeshes).toBeGreaterThan(0);
  expect(state.worldMeshes).toBeGreaterThan(0);
});

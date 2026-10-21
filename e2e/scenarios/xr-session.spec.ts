import {test, expect} from '../fixtures/boot';
import {IwerDriver} from '../drivers/webxr';

// WebXR code-path integration tests: IWER installs an emulated headset as
// `navigator.xr` before the app loads, so these exercise the SDK's real
// session manager, reference spaces, XR frame loop, and XR input sources.

test('enters an immersive session and presents', async ({driver, page}) => {
  const presenting = await page.evaluate(
    () =>
      (
        window as unknown as {
          xb: {core: {renderer: {xr: {isPresenting: boolean}}}};
        }
      ).xb.core.renderer.xr.isPresenting
  );
  expect(presenting).toBe(true);

  const state = await driver.getState();
  expect(state.lifecycle).not.toBe('disposed');
});

test('applies a supported target frame rate to the IWER session', async ({
  page,
}) => {
  const driver = new IwerDriver(page);
  try {
    await driver.boot('e2e/fixtures/apps/harness.html?targetFrameRate=72');
    await page.waitForFunction(() => {
      const session = (
        window as unknown as {__e2e: Window['__e2e']}
      ).__e2e.xrSessionFrameRate();
      return (
        session?.supportedFrameRates.includes(72) && session.frameRate === 72
      );
    });
  } finally {
    await driver.destroy();
  }
});

test('frame loop advances under the XR session', async ({driver}) => {
  const before = await driver.getState();
  await driver.step(300);
  const after = await driver.getState();
  expect(after.frames).toBeGreaterThan(before.frames);
  expect(after.probeRotationY).toBeGreaterThan(before.probeRotationY);
});

test('XR controller select drives the app', async ({driver}) => {
  await driver.pointTo('rightHand', 'grabbable');
  await driver.step(150);
  await driver.select('rightHand', true);

  const grabbed = await driver.getState();
  expect(grabbed.grabbedByHand).toBe(1);

  await driver.select('rightHand', false);
  await driver.step(150);
  const released = await driver.getState();
  expect(released.grabbedByHand).toBeNull();
});

test('XR controller select accepts a partial trigger press', async ({
  driver,
  page,
}) => {
  await driver.pointTo('rightHand', 'grabbable');
  await page.evaluate(() =>
    window.__xrDevice.controllers.right?.updateButtonValue('trigger', 0.8)
  );
  await driver.step(150);

  const grabbed = await driver.getState();
  expect(grabbed.grabbedByHand).toBe(1);

  await page.evaluate(() =>
    window.__xrDevice.controllers.right?.updateButtonValue('trigger', 0)
  );
  await driver.step(150);
  const released = await driver.getState();
  expect(released.grabbedByHand).toBeNull();
});

test('disposal ends the XR session cleanly', async ({driver, page}) => {
  await driver.step(100);
  await driver.destroy();

  const presenting = await page.evaluate(
    () =>
      (
        window as unknown as {
          xb?: {
            core?: {renderer?: {xr?: {isPresenting?: boolean}}};
          };
        }
      ).xb?.core?.renderer?.xr?.isPresenting ?? false
  );
  expect(presenting).toBe(false);

  const state = await driver.getState();
  expect(state.lifecycle).toBe('disposed');
});

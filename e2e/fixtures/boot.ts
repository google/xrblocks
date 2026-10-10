import {test as base, expect} from '@playwright/test';
import {SimulatorDriver} from '../drivers/simulator';
import {IwerDriver} from '../drivers/webxr';
import type {XRTestDriver} from '../drivers/types';

type Fixtures = {
  /** Booted driver for the current project's backend. */
  driver: XRTestDriver & {webgpu: boolean};
};

/**
 * Boots the harness app on the project's backend:
 * - `sim-webgl` / `sim-webgpu` — desktop simulator (?xrAutomation=1), with
 *   the WebGPU project switching the harness to `THREE.WebGPURenderer`
 * - `xr-*` — the real WebXR code path behind IWER's emulated headset
 */
export const test = base.extend<Fixtures>({
  driver: async ({page}, use, testInfo) => {
    const project = testInfo.project.name;
    const webxr = project.startsWith('xr-');
    const webgpu = project === 'sim-webgpu';
    if (webgpu) {
      const supported = await page.evaluate(
        () => typeof navigator !== 'undefined' && 'gpu' in navigator
      );
      if (!supported) {
        testInfo.skip(true, 'WebGPU is not available in this browser.');
      }
    }
    const driver = webxr ? new IwerDriver(page) : new SimulatorDriver(page);
    driver.webgpu = webgpu;
    await driver.boot('e2e/fixtures/apps/harness.html');
    await use(driver);
    await driver.destroy().catch(() => undefined);
  },
});

export {expect};

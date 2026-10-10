import {test as base, expect} from '@playwright/test';
import {SimulatorDriver} from '../drivers/simulator';

type Fixtures = {
  /** Booted simulator driver pointed at the E2E harness app. */
  driver: SimulatorDriver;
};

/**
 * Boots the harness app in the desktop simulator. The `sim-webgpu` project
 * name switches the harness to `THREE.WebGPURenderer`; tests that only make
 * sense on one backend check `driver.webgpu`.
 */
export const test = base.extend<Fixtures>({
  driver: async ({page}, use, testInfo) => {
    const webgpu = testInfo.project.name === 'sim-webgpu';
    if (webgpu) {
      const supported = await page.evaluate(
        () => typeof navigator !== 'undefined' && 'gpu' in navigator
      );
      if (!supported) {
        testInfo.skip(true, 'WebGPU is not available in this browser.');
      }
    }
    const driver = new SimulatorDriver(page);
    driver.webgpu = webgpu;
    await driver.boot('e2e/fixtures/apps/harness.html');
    await use(driver);
    await driver.destroy().catch(() => undefined);
  },
});

export {expect};

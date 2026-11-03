import {expect, test} from '../fixtures/boot';

// IWER has no XRGPUBinding, like browsers without the WebXR/WebGPU binding.
for (const sessionMode of ['immersive-ar', 'immersive-vr'] as const) {
  test.describe(`WebGPU app in ${sessionMode} without WebXR/WebGPU`, () => {
    test.use({iwerOptions: {sessionMode, webgpu: true}});

    test('enters XR on the WebGL backend of WebGPURenderer', async ({
      driver,
      page,
    }) => {
      expect((await driver.getState()).lifecycle).toBe('running');
      const renderer = await page.evaluate(() => {
        const r = (
          window as unknown as {
            xb: {
              core: {
                renderer: {
                  isWebGPURenderer?: boolean;
                  backend?: {isWebGLBackend?: boolean};
                  xr: {isPresenting: boolean};
                };
              };
            };
          }
        ).xb.core.renderer;
        return {
          webgpuRenderer: r.isWebGPURenderer === true,
          webglBackend: r.backend?.isWebGLBackend === true,
          presenting: r.xr.isPresenting,
        };
      });
      expect(renderer).toEqual({
        webgpuRenderer: true,
        webglBackend: true,
        presenting: true,
      });
    });
  });
}

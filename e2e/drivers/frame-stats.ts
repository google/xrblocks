import type {Page} from '@playwright/test';
import type {FrameStats} from './types';

/**
 * Renders one frame and returns pixel statistics of the canvas. Kept shared
 * so the simulator and WebXR drivers capture identically.
 */
export function captureFrameStats(page: Page): Promise<FrameStats> {
  return page.evaluate(async () => {
    // Render synchronously first: without an explicit render the canvas
    // back buffer may already be cleared, and reads come back black.
    const core = (
      window as unknown as {
        xb?: {
          core?: {
            renderer: {
              render(scene: unknown, camera: unknown): unknown;
              setRenderTarget(target: null): void;
            };
            scene: unknown;
            camera: unknown;
          };
        };
      }
    ).xb?.core;
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas on page.');
    if (core) {
      core.renderer.setRenderTarget(null);
      await core.renderer.render(core.scene, core.camera);
    }
    const sample = document.createElement('canvas');
    sample.width = 160;
    sample.height = 90;
    const context = sample.getContext('2d');
    if (!context) throw new Error('No 2D context.');
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const {data} = context.getImageData(0, 0, sample.width, sample.height);
    let nonBlack = 0;
    let lumaSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma =
        0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      lumaSum += luma;
      if (luma > 8) nonBlack += 1;
    }
    const samples = data.length / 4;
    return {
      nonBlackFraction: nonBlack / samples,
      meanLuma: lumaSum / samples,
      samples,
    };
  });
}

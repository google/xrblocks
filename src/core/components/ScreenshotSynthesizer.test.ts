import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {XRDeviceCamera} from '../../camera/XRDeviceCamera.js';
import {ScreenshotSynthesizer} from './ScreenshotSynthesizer';

const IMAGE_DATA_URL = 'data:image/png;base64,screenshot';

function observeRequest(request: Promise<string>) {
  const resolved = vi.fn();
  const rejected = vi.fn();
  void request.then(resolved, rejected);
  return {resolved, rejected};
}

// Drain screenshot promise chains without waiting on a potentially stuck request.
function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createFixture() {
  const synthesizer = new ScreenshotSynthesizer();
  const renderScene = vi.fn();
  const readPixels = vi
    .fn<THREE.WebGLRenderer['readRenderTargetPixelsAsync']>()
    .mockResolvedValue(new Uint8Array());
  const renderer: Partial<THREE.WebGLRenderer> = {
    xr: {isPresenting: false} as THREE.WebGLRenderer['xr'],
    getRenderTarget: vi.fn(() => new THREE.WebGLRenderTarget(640, 480)),
    getSize: vi.fn((target: THREE.Vector2) => target.set(800, 600)),
    setRenderTarget: vi.fn(),
    clearColor: vi.fn(),
    clearDepth: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixelsAsync: readPixels,
  };
  const camera = {
    loaded: true,
    texture: new THREE.Texture(),
  } as XRDeviceCamera;

  function renderFrame(deviceCamera?: XRDeviceCamera) {
    const rejected = vi.fn();
    const result = synthesizer.onAfterRender(
      renderer as THREE.WebGLRenderer,
      renderScene,
      deviceCamera
    );
    // Observe the old dispatcher's rejection so RED has no unhandled promises.
    void Promise.resolve(result).catch(rejected);
    return {result, rejected};
  }

  return {synthesizer, renderer, renderScene, readPixels, renderFrame, camera};
}

beforeEach(() => {
  const context: Partial<CanvasRenderingContext2D> = {
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    IMAGE_DATA_URL
  );
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ScreenshotSynthesizer missing-camera regression', () => {
  it('rejects every overlay request and removes them before following frames', async () => {
    const {synthesizer, renderFrame, readPixels, camera} = createFixture();
    const requests = [
      observeRequest(synthesizer.getScreenshot(true)),
      observeRequest(synthesizer.getScreenshot(true)),
    ];

    const firstFrame = renderFrame();
    await flushMicrotasks();
    const secondFrame = renderFrame();
    await flushMicrotasks();

    for (const request of requests) {
      expect
        .soft(request.rejected)
        .toHaveBeenCalledExactlyOnceWith(
          new Error('No device camera provided')
        );
      expect.soft(request.resolved).not.toHaveBeenCalled();
    }
    expect.soft(firstFrame.rejected).not.toHaveBeenCalled();
    expect.soft(secondFrame.rejected).not.toHaveBeenCalled();
    expect.soft(firstFrame.result).toBeUndefined();
    expect.soft(secondFrame.result).toBeUndefined();

    renderFrame(camera);
    await flushMicrotasks();
    expect(readPixels).toHaveBeenCalledTimes(0);
  });

  it('rejects only overlays in a mixed queue and captures virtual requests next frame', async () => {
    const {synthesizer, renderFrame, readPixels} = createFixture();
    const firstOverlay = observeRequest(synthesizer.getScreenshot(true));
    const virtual = observeRequest(synthesizer.getScreenshot());
    const secondOverlay = observeRequest(synthesizer.getScreenshot(true));

    const firstFrame = renderFrame();
    await flushMicrotasks();

    for (const overlay of [firstOverlay, secondOverlay]) {
      expect
        .soft(overlay.rejected)
        .toHaveBeenCalledExactlyOnceWith(
          new Error('No device camera provided')
        );
      expect.soft(overlay.resolved).not.toHaveBeenCalled();
    }
    expect(virtual.rejected).not.toHaveBeenCalled();
    expect(virtual.resolved).not.toHaveBeenCalled();

    const secondFrame = renderFrame();
    await flushMicrotasks();

    expect
      .soft(virtual.resolved)
      .toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
    expect(virtual.rejected).not.toHaveBeenCalled();
    expect.soft(firstFrame.rejected).not.toHaveBeenCalled();
    expect.soft(secondFrame.rejected).not.toHaveBeenCalled();
    expect(readPixels).toHaveBeenCalledOnce();
  });
});

describe('ScreenshotSynthesizer capture preservation', () => {
  it.each([false, true])(
    'coalesces requests without blocking frames on readback (overlay=%s)',
    async (overlayOnCamera) => {
      const {synthesizer, renderFrame, readPixels, camera} = createFixture();
      let finishReadback: (() => void) | undefined;
      readPixels.mockImplementationOnce(
        () =>
          new Promise<Uint8Array>((resolve) => {
            finishReadback = () => resolve(new Uint8Array());
          })
      );
      const requests = [
        observeRequest(synthesizer.getScreenshot(overlayOnCamera)),
        observeRequest(synthesizer.getScreenshot(overlayOnCamera)),
      ];
      const deviceCamera = overlayOnCamera ? camera : undefined;

      const firstFrame = renderFrame(deviceCamera);
      await flushMicrotasks();
      const secondFrame = renderFrame(deviceCamera);
      await flushMicrotasks();

      expect(readPixels).toHaveBeenCalledOnce();
      for (const request of requests) {
        expect(request.resolved).not.toHaveBeenCalled();
        expect(request.rejected).not.toHaveBeenCalled();
      }

      finishReadback?.();
      await flushMicrotasks();

      for (const request of requests) {
        expect(request.resolved).toHaveBeenCalledExactlyOnceWith(
          IMAGE_DATA_URL
        );
        expect(request.rejected).not.toHaveBeenCalled();
      }
      expect(firstFrame.rejected).not.toHaveBeenCalled();
      expect(secondFrame.rejected).not.toHaveBeenCalled();
      renderFrame(deviceCamera);
      expect(readPixels).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    'rejects failed async captures, clears requests, and permits retry (overlay=%s)',
    async (overlayOnCamera) => {
      const {synthesizer, renderFrame, readPixels, camera} = createFixture();
      const error = new Error('Pixel readback failed');
      readPixels.mockRejectedValueOnce(error);
      const requests = [
        observeRequest(synthesizer.getScreenshot(overlayOnCamera)),
        observeRequest(synthesizer.getScreenshot(overlayOnCamera)),
      ];
      const deviceCamera = overlayOnCamera ? camera : undefined;

      const frame = renderFrame(deviceCamera);
      await flushMicrotasks();

      for (const request of requests) {
        expect(request.rejected).toHaveBeenCalledExactlyOnceWith(error);
        expect(request.resolved).not.toHaveBeenCalled();
      }
      expect(frame.rejected).not.toHaveBeenCalled();
      renderFrame(deviceCamera);
      expect(readPixels).toHaveBeenCalledOnce();

      const retry = observeRequest(synthesizer.getScreenshot(overlayOnCamera));
      renderFrame(deviceCamera);
      await flushMicrotasks();

      expect(retry.resolved).toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
      expect(retry.rejected).not.toHaveBeenCalled();
      expect(readPixels).toHaveBeenCalledTimes(2);
    }
  );
});

describe('ScreenshotSynthesizer null render target fallback', () => {
  it('succeeds when renderer.getRenderTarget() returns null by falling back to renderer.getSize and restoring setRenderTarget(null)', async () => {
    const {synthesizer, renderer, renderFrame} = createFixture();
    vi.mocked(renderer.getRenderTarget!).mockReturnValue(null);

    const request = observeRequest(synthesizer.getScreenshot(false));
    renderFrame();
    await flushMicrotasks();

    expect(renderer.getSize).toHaveBeenCalledOnce();
    expect(renderer.setRenderTarget).toHaveBeenCalledTimes(2);
    expect(renderer.setRenderTarget).toHaveBeenNthCalledWith(
      1,
      expect.any(THREE.WebGLRenderTarget)
    );
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(null);
    expect(request.resolved).toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
    expect(request.rejected).not.toHaveBeenCalled();
  });
});

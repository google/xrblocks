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

describe('ScreenshotSynthesizer on WebGPURenderer', () => {
  // 2x2 pixels: rows [A,B] (top) and [C,D] (bottom), RGBA8.
  const A = [10, 20, 30, 40];
  const B = [50, 60, 70, 80];
  const C = [90, 100, 110, 120];
  const D = [130, 140, 150, 160];

  function createWebGPUFixture({isWebGLFallback = false} = {}) {
    const synthesizer = new ScreenshotSynthesizer();
    (synthesizer as unknown as {renderTargetWidth: number}).renderTargetWidth =
      2;
    const renderScene = vi.fn();
    const readPixels = vi
      .fn<(target: unknown) => Promise<Uint8Array>>()
      .mockResolvedValue(new Uint8Array());
    const renderer = {
      isWebGPURenderer: true,
      backend: isWebGLFallback
        ? {isWebGLBackend: true}
        : {isWebGPUBackend: true},
      xr: {isPresenting: false},
      getRenderTarget: vi.fn(() => new THREE.WebGLRenderTarget(2, 2)),
      getSize: vi.fn((target: THREE.Vector2) => target.set(2, 2)),
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
    const captured: Uint8ClampedArray[] = [];
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {
          captured.push(data);
        }
      }
    );

    function renderFrame(deviceCamera?: XRDeviceCamera) {
      synthesizer.onAfterRender(
        renderer as never,
        renderScene,
        deviceCamera as XRDeviceCamera | undefined
      );
    }

    return {
      synthesizer,
      renderer,
      renderScene,
      readPixels,
      renderFrame,
      captured,
      camera,
    };
  }

  it('keeps native WebGPU readbacks top-down and strips row padding', async () => {
    const {synthesizer, renderFrame, readPixels, captured} =
      createWebGPUFixture();
    // Native WebGPU: rows top-down, each row padded to 256 bytes.
    const readback = new Uint8Array(264);
    readback.set(A, 0);
    readback.set(B, 4);
    readback.set(C, 256);
    readback.set(D, 260);
    readPixels.mockResolvedValue(readback);

    const request = observeRequest(synthesizer.getScreenshot(false));
    renderFrame();
    await flushMicrotasks();

    expect(request.resolved).toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
    expect(request.rejected).not.toHaveBeenCalled();
    expect(Array.from(captured[0].subarray(0, 8))).toEqual([...A, ...B]);
    expect(Array.from(captured[0].subarray(8, 16))).toEqual([...C, ...D]);
  });

  it('flips WebGL-fallback readbacks bottom-up like the WebGL path', async () => {
    const {synthesizer, renderFrame, readPixels, captured} =
      createWebGPUFixture({
        isWebGLFallback: true,
      });
    // WebGL-style fallback: bottom-up rows without padding.
    const readback = new Uint8Array(16);
    readback.set(C, 0);
    readback.set(D, 4);
    readback.set(A, 8);
    readback.set(B, 12);
    readPixels.mockResolvedValue(readback);

    const request = observeRequest(synthesizer.getScreenshot(false));
    renderFrame();
    await flushMicrotasks();

    expect(request.resolved).toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
    expect(request.rejected).not.toHaveBeenCalled();
    expect(Array.from(captured[0].subarray(0, 8))).toEqual([...A, ...B]);
    expect(Array.from(captured[0].subarray(8, 16))).toEqual([...C, ...D]);
  });

  it('renders the device-camera overlay through a node-material quad', async () => {
    const {synthesizer, renderer, renderFrame, camera} = createWebGPUFixture();
    const request = observeRequest(synthesizer.getScreenshot(true));
    renderFrame(camera);
    // The overlay path dynamically imports the node materials.
    await vi.waitFor(() => {
      expect(request.resolved).toHaveBeenCalled();
    });

    expect(request.resolved).toHaveBeenCalledExactlyOnceWith(IMAGE_DATA_URL);
    expect(request.rejected).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledOnce();
    const [mesh, quadCamera] = vi.mocked(renderer.render).mock.calls[0];
    expect((mesh as THREE.Mesh).isMesh).toBe(true);
    expect((quadCamera as THREE.Camera).isCamera).toBe(true);
    expect((mesh as THREE.Mesh).material).toHaveProperty(
      'isNodeMaterial',
      true
    );
  });
});

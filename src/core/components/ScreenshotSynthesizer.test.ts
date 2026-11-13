import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {ScreenshotSynthesizer} from './ScreenshotSynthesizer';

const URL = 'data:image/png;base64,native-encoder-output';
const images: ImageData[] = [];
const cleanups: Array<() => void> = [];
beforeEach(() => {
  images.length = 0;
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: (image: ImageData) => images.push(image),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(URL);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Backend = 'webgl' | 'webgpu' | 'gpu-webgl';
function fixture(backend: Backend = 'webgl', array = false, mainTarget = true) {
  const synthesizer = new ScreenshotSynthesizer();
  const main = new THREE.RenderTarget(4, 2);
  main.texture.isArrayTexture = array;
  const targets = new Set([main]);
  let current: THREE.RenderTarget | null = mainTarget ? main : null;
  const texture = new THREE.Texture();
  cleanups.push(() => {
    for (const target of targets) target.dispose();
    texture.dispose();
  });
  const readPixels = vi.fn(
    async (
      _target: THREE.RenderTarget,
      _x: number,
      _y: number,
      width: number,
      height: number,
      buffer?: Uint8Array
    ) => {
      const bytes = new Uint8Array(width * height * 4);
      buffer?.set(bytes);
      return bytes;
    }
  );
  const renderer = {
    isWebGPURenderer: backend !== 'webgl',
    backend:
      backend === 'webgpu' ? {isWebGPUBackend: true} : {isWebGLBackend: true},
    xr: {isPresenting: true, getCamera: () => ({cameras: [{}, {}]})},
    autoClearColor: true,
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.RenderTarget | null) => {
      current = target;
      if (target) targets.add(target);
    },
    getSize: (target: THREE.Vector2) => target.set(4, 2),
    clearColor() {},
    clearDepth() {},
    render() {},
    readRenderTargetPixelsAsync: readPixels,
  };
  const camera = {loaded: true, texture} as XRDeviceCamera;
  const renderScene = vi.fn();
  const frame = (overlay = false) =>
    synthesizer.onAfterRender(
      renderer as never,
      renderScene,
      overlay ? camera : undefined
    );
  return {synthesizer, renderer, readPixels, renderScene, frame, main};
}

describe('screenshot request lifetime', () => {
  it('rejects unavailable camera requests without losing virtual requests in the same queue', async () => {
    const f = fixture();
    const overlay = f.synthesizer.getScreenshot(true);
    const failed = expect(overlay).rejects.toThrow(/camera/i);
    const virtual = f.synthesizer.getScreenshot();
    f.frame();
    await failed;
    f.frame();
    await expect(virtual).resolves.toBe(URL);
  });

  it('shares an in-flight readback without blocking frames or losing waiting consumers', async () => {
    const f = fixture();
    const pending = Promise.withResolvers<Uint8Array>();
    f.readPixels.mockReturnValue(pending.promise);
    let finished = false;
    const result = Promise.all([
      f.synthesizer.getScreenshot(),
      f.synthesizer.getScreenshot(),
    ]).then((urls) => {
      finished = true;
      return urls;
    });
    try {
      expect(f.frame()).toBeUndefined();
      f.frame();
      expect(f.readPixels).toHaveBeenCalledOnce();
      expect(finished).toBe(false);
      expect(f.renderer.getRenderTarget()).toBe(f.main);
    } finally {
      pending.resolve(new Uint8Array());
    }
    await expect(result).resolves.toEqual([URL, URL]);
  });

  it('rejects every failed readback consumer and allows a new capture', async () => {
    const f = fixture();
    const error = new Error('Native readback failed');
    f.readPixels.mockRejectedValueOnce(error);
    const requests = [
      f.synthesizer.getScreenshot(),
      f.synthesizer.getScreenshot(),
    ];
    const result = Promise.allSettled(requests);
    f.frame();
    expect(await result).toEqual([
      {status: 'rejected', reason: error},
      {status: 'rejected', reason: error},
    ]);
    const retry = f.synthesizer.getScreenshot();
    await vi.waitFor(() => {
      f.frame();
      expect(f.readPixels).toHaveBeenCalledTimes(2);
    });
    await expect(retry).resolves.toBe(URL);
  });
});

it.each([
  {backend: 'webgl', array: false, aspect: 1},
  {backend: 'webgpu', array: true, aspect: 2},
  {backend: 'gpu-webgl', array: false, aspect: 1},
] as const)(
  'preserves independent corner pixels, image orientation and stereo aspect for %j',
  async ({backend, array, aspect}) => {
    const f = fixture(backend, array);
    const a = [10, 20, 30, 40],
      b = [50, 60, 70, 80],
      c = [90, 100, 110, 120],
      d = [130, 140, 150, 160];
    f.readPixels.mockImplementation(
      async (_target, _x, _y, width, height, buffer) => {
        // Native GPU rows start at the top; WebGL rows start at the bottom.
        const rowBytes = width * 4;
        const stride =
          backend === 'webgpu' ? Math.ceil(rowBytes / 256) * 256 : rowBytes;
        const bytes = new Uint8Array(stride * height);
        const top = backend === 'webgpu' ? 0 : (height - 1) * stride;
        const bottom = backend === 'webgpu' ? (height - 1) * stride : 0;
        bytes.set(a, top);
        bytes.set(b, top + rowBytes - 4);
        bytes.set(c, bottom);
        bytes.set(d, bottom + rowBytes - 4);
        buffer?.set(bytes);
        return bytes;
      }
    );
    const request = f.synthesizer.getScreenshot();
    f.frame();
    await request;
    const {data, width, height} = images[0];
    expect(width / height).toBe(aspect);
    expect([...data.slice(0, 4)]).toEqual(a);
    expect([...data.slice(width * 4 - 4, width * 4)]).toEqual(b);
    expect([
      ...data.slice((height - 1) * width * 4, (height - 1) * width * 4 + 4),
    ]).toEqual(c);
    expect([...data.slice(-4)]).toEqual(d);
  }
);

it.each([
  {backend: 'webgl', overlay: false},
  {backend: 'webgpu', overlay: true},
] as const)(
  'restores borrowed renderer state after a scene failure: %j',
  async ({backend, overlay}) => {
    const f = fixture(backend);
    const error = new Error('App render failed');
    f.renderScene.mockImplementation(() => {
      throw error;
    });
    const request = f.synthesizer.getScreenshot(overlay);
    const failure = expect(request).rejects.toBe(error);
    f.frame(overlay);
    await failure;
    expect(f.renderer.getRenderTarget()).toBe(f.main);
    expect(f.renderer.xr.isPresenting).toBe(true);
    expect(f.renderer.autoClearColor).toBe(true);
  }
);

it('waits for actual GPU overlay setup before borrowing renderer state', async () => {
  const f = fixture('webgpu');
  f.renderScene.mockImplementation(() => {
    expect(f.renderer.autoClearColor).toBe(false);
  });
  const request = f.synthesizer.getScreenshot(true);
  f.frame(true);
  expect(f.renderer.getRenderTarget()).toBe(f.main);
  expect(f.renderer.xr.isPresenting).toBe(true);
  expect(f.renderer.autoClearColor).toBe(true);
  await expect(request).resolves.toBe(URL);
  expect(f.renderer.getRenderTarget()).toBe(f.main);
  expect(f.renderer.autoClearColor).toBe(true);
});

it('captures the default framebuffer using its actual dimensions and restores it', async () => {
  const f = fixture('webgl', false, false);
  f.renderer.xr.isPresenting = false;
  const request = f.synthesizer.getScreenshot();
  f.frame();
  await expect(request).resolves.toBe(URL);
  expect(images[0].width / images[0].height).toBe(2);
  expect(f.renderer.getRenderTarget()).toBeNull();
});

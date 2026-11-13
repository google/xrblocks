import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {DeviceCameraOptions} from './CameraOptions';
import {XRDeviceCamera} from './XRDeviceCamera';

const cameras: XRDeviceCamera[] = [];
afterEach(() => {
  for (const camera of cameras.splice(0)) camera.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function createCamera() {
  const camera = new XRDeviceCamera(new DeviceCameraOptions({enabled: true}));
  cameras.push(camera);
  return camera;
}
function devices(devices: unknown[], getUserMedia = vi.fn()) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {enumerateDevices: async () => devices, getUserMedia},
  });
  return () => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  };
}
it('streams after valid metadata even when autoplay rejects, and stops its media on dispose', async () => {
  const stop = vi.fn(),
    track = {getSettings: () => ({deviceId: 'camera'}), stop},
    stream = {getVideoTracks: () => [track], getTracks: () => [track]};
  const restore = devices(
    [{kind: 'videoinput', deviceId: 'camera'}],
    vi.fn().mockResolvedValue(stream)
  );
  const camera = createCamera();
  Object.defineProperties(camera.video, {
    videoWidth: {value: 640},
    videoHeight: {value: 320},
  });
  vi.spyOn(camera.video, 'play').mockImplementation(() => {
    queueMicrotask(() =>
      camera.video.onloadedmetadata?.call(
        camera.video,
        new Event('loadedmetadata')
      )
    );
    return Promise.reject(new Error('autoplay blocked'));
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await camera.init();
    expect(camera.state).toBe('streaming');
    expect(camera.loaded).toBe(true);
    expect([camera.width, camera.height]).toEqual([640, 320]);
    camera.onXRSessionEnded();
    expect(camera.loaded).toBe(true);
    camera.dispose();
    expect(stop).toHaveBeenCalledOnce();
    expect(camera.video.srcObject).toBeNull();
  } finally {
    restore();
  }
});
async function rawCamera() {
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
  const restore = devices([]);
  const camera = createCamera();
  let target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(
    3,
    1
  );
  const original = target;
  const nativeTexture = {} as WebGLTexture;
  const renderer = {
    xr: {
      enabled: true,
      getSession: () => ({
        mode: 'immersive-ar',
        enabledFeatures: ['camera-access'],
      }),
      getBinding: () => ({getCameraImage: () => nativeTexture}),
      getReferenceSpace: () => ({}),
    },
    properties: {get: () => ({}), remove() {}},
    getRenderTarget: () => target,
    setRenderTarget(value: THREE.WebGLRenderTarget | null) {
      target = value;
    },
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(
      (
        _t: unknown,
        _x: number,
        _y: number,
        width: number,
        height: number,
        pixels: Uint8Array
      ) => {
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            pixels.set([y * 40 + x, 2, 3, 255], (y * width + x) * 4);
      }
    ),
  };
  const frames = (width = 2, height = 2) =>
    ({
      getViewerPose: () => ({views: [{camera: {width, height}}]}),
    }) as unknown as XRFrame;
  camera.setRenderer(renderer as never);
  await camera.init();
  return {
    camera,
    renderer,
    frames,
    original,
    restore() {
      restore();
      original.dispose();
    },
  };
}
it('captures top-down native image pixels and resizes the next frame', async () => {
  const f = await rawCamera();
  // Observe native canvas writes; preserve real snapshot formatting.
  let image: ImageData | undefined;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData(value: ImageData) {
      image = value;
    },
    drawImage() {},
    getImageData: () => image,
  } as never);
  try {
    const pending = f.camera.captureSnapshot({outputFormat: 'imageData'});
    f.camera.updateXRCamera(f.frames());
    const first = (await pending)!;
    expect(Array.from(first.data)).toEqual([
      40, 2, 3, 255, 41, 2, 3, 255, 0, 2, 3, 255, 1, 2, 3, 255,
    ]);
    const next = f.camera.captureSnapshot({outputFormat: 'imageData'});
    f.camera.updateXRCamera(f.frames(3, 1));
    const resized = (await next)!;
    expect([resized.width, resized.height]).toEqual([3, 1]);
    expect(Array.from(resized.data)).toEqual([
      0, 2, 3, 255, 1, 2, 3, 255, 2, 2, 3, 255,
    ]);
    expect(f.renderer.getRenderTarget()).toBe(f.original);
    expect(f.renderer.xr.enabled).toBe(true);
  } finally {
    f.camera.dispose();
    f.restore();
  }
});
it('restores renderer state and settles capture when native rendering fails', async () => {
  const f = await rawCamera();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  f.renderer.render.mockImplementation(() => {
    throw new Error('GPU lost');
  });
  try {
    const pending = f.camera.captureSnapshot({outputFormat: 'imageData'});
    f.camera.updateXRCamera(f.frames());
    await expect(pending).resolves.toBeNull();
    expect(f.renderer.getRenderTarget()).toBe(f.original);
    expect(f.renderer.xr.enabled).toBe(true);
  } finally {
    f.camera.dispose();
    f.restore();
  }
});
it('settles missing-frame captures on timeout and session end', async () => {
  vi.useFakeTimers();
  const f = await rawCamera();
  try {
    const timed = f.camera.captureSnapshot({outputFormat: 'imageData'});
    await vi.runAllTimersAsync();
    await expect(timed).resolves.toBeNull();
    // A new fallback lifetime must also settle pending work when the session ends.
    await f.camera.init();
    const ended = f.camera.captureSnapshot({outputFormat: 'imageData'});
    f.camera.onXRSessionEnded();
    await expect(ended).resolves.toBeNull();
    expect(f.camera.getSnapshot({outputFormat: 'imageData'})).toBeNull();
  } finally {
    f.camera.dispose();
    f.restore();
  }
});

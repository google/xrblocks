import * as THREE from 'three';
import type {WebGLRenderer} from 'three';
import {afterEach, describe, it, expect, vi, beforeEach} from 'vitest';

import {StreamState} from '../video/VideoStream';

import {SimulatorCamera} from '../simulator/SimulatorCamera';
import {DeviceCameraOptions} from './CameraOptions';
import {XRDeviceCamera} from './XRDeviceCamera';

function createMockOptions() {
  return new DeviceCameraOptions({
    enabled: true,
    willCaptureFrequently: false,
    videoConstraints: {facingMode: 'environment' as const},
  });
}

/**
 * Creates a mock MediaStream with a single video track.
 */
function createMockStream(): MediaStream {
  const track = {
    kind: 'video',
    getSettings: () => ({deviceId: 'mock-device', facingMode: 'environment'}),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function createMockRenderer(
  mode: XRSessionMode,
  enabledFeatures?: string[]
): WebGLRenderer {
  return {
    xr: {
      getSession: () => ({mode, enabledFeatures}) as unknown as XRSession,
    },
  } as unknown as WebGLRenderer;
}

describe('XRDeviceCamera', () => {
  let camera: XRDeviceCamera;

  beforeEach(() => {
    camera = new XRDeviceCamera(createMockOptions());

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          {
            kind: 'videoinput',
            deviceId: 'mock-device',
            label: 'Mock Camera',
            groupId: 'mock-group',
          },
        ]),
        getUserMedia: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('continues streaming when video.play() is rejected after metadata loads', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      createMockStream()
    );

    const playError = new Error('NotAllowedError: play() request was rejected');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testCamera = camera as unknown as XRDeviceCamera & {
      handleVideoStreamLoadedMetadata: (
        resolve: () => void,
        reject: (_: Error) => void,
        allowRetry?: boolean
      ) => void;
      video_: HTMLVideoElement;
    };
    const originalHandleMetadata = testCamera.handleVideoStreamLoadedMetadata;
    testCamera.handleVideoStreamLoadedMetadata = vi.fn(
      (resolve: () => void) => {
        camera.width = 1920;
        camera.height = 1080;
        camera.aspectRatio = 1920 / 1080;
        camera.loaded = true;
        resolve();
      }
    );
    const videoMock = document.createElement('video') as HTMLVideoElement & {
      srcObject: MediaStream | null;
      src: string;
      play: () => Promise<void>;
    };
    Object.defineProperty(videoMock, 'srcObject', {
      set(_: MediaStream | null) {},
    });
    Object.defineProperty(videoMock, 'src', {
      set(_: string) {},
    });
    videoMock.play = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        videoMock.onloadedmetadata?.call(
          videoMock,
          new Event('loadedmetadata')
        );
      });
      return Promise.reject(playError);
    });
    Object.assign(videoMock, {
      autoplay: true,
      muted: true,
      playsInline: true,
    });
    Object.defineProperty(camera, 'video_', {
      value: videoMock,
      writable: true,
      configurable: true,
    });
    const stateChanges: StreamState[] = [];
    camera.addEventListener('statechange', (event) => {
      stateChanges.push(event.state);
    });

    await expect(camera.init()).resolves.toBeUndefined();
    expect(stateChanges).toContain(StreamState.STREAMING);
    expect(stateChanges).not.toContain(StreamState.ERROR);
    expect(warnSpy).toHaveBeenCalledWith(
      'video.play() rejected (may still autoplay):',
      playError
    );
    testCamera.handleVideoStreamLoadedMetadata = originalHandleMetadata;
    warnSpy.mockRestore();
  });

  it('streams when metadata reports valid dimensions', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      createMockStream()
    );

    const videoMock = document.createElement('video') as HTMLVideoElement & {
      srcObject: MediaStream | null;
      src: string;
      play: () => Promise<void>;
    };
    Object.defineProperty(videoMock, 'srcObject', {
      set(_: MediaStream | null) {},
    });
    Object.defineProperty(videoMock, 'src', {
      set(_: string) {},
    });
    Object.defineProperty(videoMock, 'videoWidth', {value: 1280});
    Object.defineProperty(videoMock, 'videoHeight', {value: 720});
    videoMock.play = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        videoMock.onloadedmetadata?.call(
          videoMock,
          new Event('loadedmetadata')
        );
      });
      return Promise.resolve();
    });
    Object.assign(videoMock, {
      autoplay: true,
      muted: true,
      playsInline: true,
    });
    Object.defineProperty(camera, 'video_', {
      value: videoMock,
      writable: true,
      configurable: true,
    });

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.state).toBe(StreamState.STREAMING);
    expect(camera.loaded).toBe(true);
    expect(camera.width).toBe(1280);
    expect(camera.height).toBe(720);
    expect(camera.aspectRatio).toBe(1280 / 720);
  });

  it('falls back to XR camera access in immersive-ar sessions', async () => {
    const getUserMediaError = new Error('NotReadableError');
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      getUserMediaError
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    camera.setRenderer(createMockRenderer('immersive-ar', ['camera-access']));

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.isUsingXRCameraAccess).toBe(true);
    expect(camera.state).toBe(StreamState.INITIALIZING);

    warnSpy.mockRestore();
  });

  it('surfaces getUserMedia errors when no renderer is available', async () => {
    const getUserMediaError = new Error('NotReadableError');
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      getUserMediaError
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(camera.init()).rejects.toThrow(getUserMediaError);
    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.state).toBe(StreamState.ERROR);

    errorSpy.mockRestore();
  });

  it('reports NO_DEVICES_FOUND when no devices and no renderer', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.state).toBe(StreamState.NO_DEVICES_FOUND);

    warnSpy.mockRestore();
  });

  it('times out XR camera fallback when no frames arrive', async () => {
    vi.useFakeTimers();
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    camera.setRenderer(createMockRenderer('immersive-ar', ['camera-access']));

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.state).toBe(StreamState.INITIALIZING);

    await vi.advanceTimersByTimeAsync(5000);

    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.state).toBe(StreamState.NO_DEVICES_FOUND);

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('handles switching to a device with empty deviceId gracefully', async () => {
    const mockEnumerateDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          kind: 'videoinput',
          deviceId: '',
          label: '',
          groupId: 'real-group',
        },
        {
          kind: 'videoinput',
          deviceId: 'sim-device',
          label: 'Simulator Camera',
          groupId: 'simulator',
        },
      ])
      .mockResolvedValueOnce([
        {
          kind: 'videoinput',
          deviceId: 'real-device-resolved',
          label: 'Real Camera',
          groupId: 'real-group',
        },
        {
          kind: 'videoinput',
          deviceId: 'sim-device',
          label: 'Simulator Camera',
          groupId: 'simulator',
        },
      ]);

    const mockGetUserMedia = vi.fn().mockResolvedValue({
      getVideoTracks: () => [
        {
          kind: 'video',
          getSettings: () => ({deviceId: 'real-device-resolved'}),
          stop: vi.fn(),
        },
      ],
      getTracks: () => [],
    } as unknown as MediaStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: mockEnumerateDevices,
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
      configurable: true,
    });

    const videoMock = document.createElement('video') as HTMLVideoElement & {
      srcObject: MediaStream | null;
      src: string;
      play: () => Promise<void>;
    };
    Object.defineProperty(videoMock, 'srcObject', {
      set(_: MediaStream | null) {},
    });
    Object.defineProperty(videoMock, 'src', {set(_: string) {}});
    Object.defineProperty(videoMock, 'videoWidth', {value: 1280});
    Object.defineProperty(videoMock, 'videoHeight', {value: 720});
    videoMock.play = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        videoMock.onloadedmetadata?.call(
          videoMock,
          new Event('loadedmetadata')
        );
      });
      return Promise.resolve();
    });
    Object.defineProperty(camera, 'video_', {
      value: videoMock,
      writable: true,
      configurable: true,
    });

    const mockSimulatorCamera: Partial<SimulatorCamera> = {
      enumerateDevices: vi.fn().mockResolvedValue([
        {
          kind: 'videoinput',
          deviceId: 'sim-device',
          label: 'Simulator Camera',
          groupId: 'simulator',
        },
      ]),
      getMedia: vi.fn().mockReturnValue({
        getVideoTracks: () => [
          {
            kind: 'video',
            getSettings: () => ({deviceId: 'sim-device'}),
            stop: vi.fn(),
          },
        ],
        getTracks: () => [],
      }),
    };
    camera.simulatorCamera = mockSimulatorCamera as SimulatorCamera;

    await camera.init();
    expect(camera.getCurrentDevice()?.deviceId).toBe('sim-device');

    await camera.setDeviceId('');

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {},
    });

    expect(camera.getAvailableDevices()[0].deviceId).toBe(
      'real-device-resolved'
    );
    expect(camera.getCurrentDeviceIndex()).toBe(0);
    expect(camera.getCurrentDevice()?.deviceId).toBe('real-device-resolved');
  });
});

describe('XRDeviceCamera raw camera snapshots', () => {
  let lastImageData: ImageData | undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'ImageData', {
      value: class ImageData {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
      configurable: true,
    });
    lastImageData = undefined;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        return {
          putImageData: vi.fn((imageData: ImageData) => {
            lastImageData = imageData;
          }),
          drawImage: vi.fn(),
          getImageData: vi.fn(
            (_x: number, _y: number, width: number, height: number) =>
              lastImageData?.width === width && lastImageData?.height === height
                ? lastImageData
                : new ImageData(
                    new Uint8ClampedArray(width * height * 4),
                    width,
                    height
                  )
          ),
        } as unknown as CanvasRenderingContext2D;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createRawCameraRenderer({renderThrows = false} = {}) {
    const glTexture = {} as WebGLTexture;
    const previousTarget = {previous: true};
    const render = vi.fn(() => {
      if (renderThrows) throw new Error('render failed');
    });
    const readRenderTargetPixels = vi.fn(
      (_target, _x, _y, width: number, height: number, pixels: Uint8Array) => {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            pixels[offset] = y === 0 ? 10 + x : 100 + x;
            pixels[offset + 1] = y === 0 ? 20 + x : 110 + x;
            pixels[offset + 2] = y === 0 ? 30 + x : 120 + x;
            pixels[offset + 3] = 255;
          }
        }
      }
    );
    const renderer = {
      xr: {
        enabled: true,
        getSession: () =>
          ({
            mode: 'immersive-ar',
            enabledFeatures: ['camera-access'],
          }) as XRSession,
        getBinding: () => ({getCameraImage: () => glTexture}),
        getReferenceSpace: () => ({}),
      },
      properties: {get: vi.fn(() => ({}))},
      getRenderTarget: vi.fn(() => previousTarget),
      setRenderTarget: vi.fn(),
      render,
      readRenderTargetPixels,
    } as unknown as WebGLRenderer;
    return {
      renderer,
      glTexture,
      previousTarget,
      render,
      readRenderTargetPixels,
    };
  }

  function createFrame(width = 2, height = 2) {
    return {
      getViewerPose: () => ({views: [{camera: {width, height}}]}),
    } as unknown as XRFrame;
  }

  async function startRawFallback(
    camera: XRDeviceCamera,
    renderer: WebGLRenderer
  ) {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    camera.setRenderer(renderer);
    await camera.init();
  }

  it('captureSnapshot resolves on the next WebXR camera frame', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const pending = camera.captureSnapshot({outputFormat: 'imageData'});
    expect(camera.getSnapshot({outputFormat: 'imageData'})).toBeNull();
    camera.updateXRCamera(createFrame());
    const snapshot = await pending;

    expect(snapshot?.width).toBe(2);
    expect(snapshot?.height).toBe(2);
    expect([...(snapshot?.data ?? [])]).toEqual([
      100, 110, 120, 255, 101, 111, 121, 255, 10, 20, 30, 255, 11, 21, 31, 255,
    ]);
    expect(renderer.xr.enabled).toBe(true);
    expect(camera.getSnapshot({outputFormat: 'imageData'})?.width).toBe(2);
  });

  it('restores render target and xr.enabled when rendering throws', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer, previousTarget} = createRawCameraRenderer({
      renderThrows: true,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await startRawFallback(camera, renderer);

    const pending = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame());

    await expect(pending).resolves.toBeNull();
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget);
    expect(renderer.xr.enabled).toBe(true);
    errorSpy.mockRestore();
  });

  it('recreates the render target and disposes the old one when size changes', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const first = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame(2, 2));
    await first;
    const internals = camera as unknown as {
      xrCameraRenderTarget_: THREE.WebGLRenderTarget;
    };
    const oldTarget = internals.xrCameraRenderTarget_;
    const dispose = vi.spyOn(oldTarget, 'dispose');

    const second = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame(4, 2));
    await second;

    expect(dispose).toHaveBeenCalled();
    expect(internals.xrCameraRenderTarget_).not.toBe(oldTarget);
    expect(internals.xrCameraRenderTarget_.width).toBe(4);
    expect(internals.xrCameraRenderTarget_.height).toBe(2);
  });

  it('does not mark the copy material dirty when the texture object is unchanged', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const first = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame());
    await first;
    const internals = camera as unknown as {
      xrCameraCopyMaterial_: THREE.MeshBasicMaterial;
    };
    const version = internals.xrCameraCopyMaterial_.version;

    const second = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame());
    await second;

    expect(internals.xrCameraCopyMaterial_.version).toBe(version);
  });

  it('resizes requested WebXR camera snapshots through VideoStream formatting', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const context = {
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(
        () => new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1)
      ),
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const pending = camera.captureSnapshot({
      outputFormat: 'imageData',
      width: 1,
      height: 1,
    });
    camera.updateXRCamera(createFrame(2, 2));
    const snapshot = await pending;

    expect(snapshot?.width).toBe(1);
    expect(snapshot?.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalled();
    getContext.mockRestore();
  });

  it('delegates captureSnapshot to getSnapshot on the video path', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const imageData = new ImageData(
      new Uint8ClampedArray([1, 2, 3, 255]),
      1,
      1
    );
    const getSnapshot = vi
      .spyOn(camera, 'getSnapshot')
      .mockReturnValue(imageData as ImageData);

    await expect(
      camera.captureSnapshot({outputFormat: 'imageData'})
    ).resolves.toBe(imageData);
    expect(getSnapshot).toHaveBeenCalledWith({outputFormat: 'imageData'});
    getSnapshot.mockRestore();
  });

  it('captureSnapshot resolves null on timeout', async () => {
    vi.useFakeTimers();
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const pending = camera.captureSnapshot({outputFormat: 'imageData'});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('captureSnapshot resolves null on dispose and clears raw resources', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);
    const first = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame());
    await first;
    const pending = camera.captureSnapshot({outputFormat: 'imageData'});
    const internals = camera as unknown as {
      xrCameraTexture_?: THREE.Texture;
      xrCameraRenderTarget_?: THREE.WebGLRenderTarget;
    };
    const textureDispose = vi.spyOn(internals.xrCameraTexture_!, 'dispose');
    const targetDispose = vi.spyOn(internals.xrCameraRenderTarget_!, 'dispose');

    camera.dispose();

    await expect(pending).resolves.toBeNull();
    expect(textureDispose).toHaveBeenCalled();
    expect(targetDispose).toHaveBeenCalled();
    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.getSnapshot({outputFormat: 'imageData'})).toBeNull();
  });

  it('clears the raw camera frame and stops streaming when the XR session ends', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer} = createRawCameraRenderer();
    await startRawFallback(camera, renderer);
    const pending = camera.captureSnapshot({outputFormat: 'imageData'});
    camera.updateXRCamera(createFrame());
    await pending;
    expect(camera.state).toBe('streaming');

    camera.onXRSessionEnded();

    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.state).toBe('idle');
    expect(camera.getSnapshot({outputFormat: 'imageData'})).toBeNull();
  });

  it('keeps a getUserMedia stream loaded when the XR session ends', () => {
    const camera = new XRDeviceCamera(createMockOptions());
    camera.loaded = true;

    camera.onXRSessionEnded();

    expect(camera.loaded).toBe(true);
  });
});

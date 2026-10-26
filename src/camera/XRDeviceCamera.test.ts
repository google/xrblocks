import * as THREE from 'three';
import type {WebGLRenderer} from 'three';
import {afterEach, describe, it, expect, vi, beforeEach} from 'vitest';

import {StreamState} from '../video/VideoStream';

import {SimulatorCamera} from '../simulator/SimulatorCamera';
import {DeviceCameraOptions} from './CameraOptions';
import {XRDeviceCamera} from './XRDeviceCamera';
import {
  DEVICE_CAMERA_PARAMETERS,
  getCameraParametersSnapshot,
  getDeviceCameraClipFromView,
  isDeviceCameraPoseAvailable,
} from './CameraUtils';

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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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

  describe('XRDeviceCamera raw frame parameters', () => {
    let session: XRSession;
    let xr: THREE.EventDispatcher<{sessionstart: object; sessionend: object}>;
    let renderer: WebGLRenderer;
    let getCameraImage: ReturnType<typeof vi.fn>;
    const projection = new THREE.Matrix4().makePerspective(
      -0.05,
      0.075,
      0.05,
      -0.03888888888888889,
      0.1,
      100
    );
    const pose = new THREE.Matrix4().makeTranslation(1, 2, 3);

    function makeView(
      clipFromView = projection,
      referenceFromView = pose,
      camera: XRCamera | null = {width: 1280, height: 720}
    ): XRView {
      return {
        camera,
        projectionMatrix: new Float32Array(clipFromView.elements),
        transform: {matrix: new Float32Array(referenceFromView.elements)},
      } as XRView;
    }

    function makeFrame(views: XRView[] = [makeView()]): XRFrame {
      return {
        session,
        getViewerPose: () => ({views}),
      } as XRFrame;
    }

    function expectUnavailable() {
      expect(camera.hasXRCameraParams).toBe(false);
      expect(isDeviceCameraPoseAvailable(camera, null)).toBe(false);
      expect(
        getDeviceCameraClipFromView(
          new THREE.PerspectiveCamera(),
          camera,
          'galaxyxr'
        )
      ).toBe(DEVICE_CAMERA_PARAMETERS.galaxyxr.projectionMatrix);
    }

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
        () => {}
      );
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          enumerateDevices: vi.fn().mockResolvedValue([]),
          getUserMedia: vi.fn(),
        },
        configurable: true,
      });
      session = {enabledFeatures: ['camera-access']} as XRSession;
      getCameraImage = vi.fn().mockReturnValue({});
      xr = new THREE.EventDispatcher();
      renderer = {
        xr: Object.assign(xr, {
          getSession: () => session,
          getReferenceSpace: vi.fn(() => ({})),
          getBinding: vi.fn(() => ({getCameraImage})),
        }),
        properties: {get: vi.fn(() => ({}))},
      } as unknown as WebGLRenderer;
      camera.setRenderer(renderer);
      await camera.init();
    });

    afterEach(() => {
      camera.dispose();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('captures the first usable image and that same view, not view zero', () => {
      const views = [
        makeView(projection, pose, null),
        makeView(new THREE.PerspectiveCamera().projectionMatrix),
        makeView(),
      ];
      const texture = {};
      getCameraImage.mockReturnValueOnce(null).mockReturnValueOnce(texture);
      camera.updateXRCamera(makeFrame(views));
      expect(getCameraImage).toHaveBeenLastCalledWith(views[2].camera);
      expect(camera.texture).toBeInstanceOf(THREE.ExternalTexture);
      expect((camera.texture as THREE.ExternalTexture).sourceTexture).toBe(
        texture
      );
      expect(camera.hasXRCameraParams).toBe(true);
      expect(camera.xrCameraClipFromView!.elements).toEqual(
        Array.from(views[2].projectionMatrix)
      );
      expect(camera.xrCameraReferenceFromView!.elements).toEqual(
        Array.from(views[2].transform.matrix)
      );
      expect([camera.width, camera.height]).toEqual([1280, 720]);
      views[2].projectionMatrix.fill(0);
      views[2].transform.matrix.fill(0);
      expect(camera.xrCameraClipFromView!.elements[0]).toBeCloseTo(1.6);
      expect(camera.xrCameraReferenceFromView!.elements[12]).toBe(1);
    });

    it('keeps all snapshot matrices unchanged when the next raw frame arrives', () => {
      camera.updateXRCamera(makeFrame());
      const snapshot = getCameraParametersSnapshot(
        new THREE.PerspectiveCamera(),
        null,
        camera,
        'galaxyxr'
      )!;
      const saved = Object.values(snapshot).map((matrix) => matrix.toArray());
      camera.updateXRCamera(
        makeFrame([
          makeView(
            new THREE.PerspectiveCamera(60, 2, 0.1, 100).projectionMatrix,
            new THREE.Matrix4().makeTranslation(7, 8, 9)
          ),
        ])
      );
      expect(Object.values(snapshot).map((matrix) => matrix.toArray())).toEqual(
        saved
      );
      const product = snapshot.clipFromView
        .clone()
        .multiply(snapshot.viewFromClip);
      new THREE.Matrix4().elements.forEach((value, i) => {
        expect(product.elements[i]).toBeCloseTo(value);
      });
    });

    it('unprojects a captured off-axis image centre through the render rig', () => {
      camera.updateXRCamera(makeFrame());
      const renderCamera = new THREE.PerspectiveCamera();
      const rig = new THREE.Group();
      rig.position.x = 10;
      rig.rotation.y = Math.PI / 2;
      rig.add(renderCamera);
      const snapshot = getCameraParametersSnapshot(
        renderCamera,
        null,
        camera,
        'galaxyxr'
      )!;
      const origin = new THREE.Vector3().setFromMatrixPosition(
        snapshot.worldFromView
      );
      const point = new THREE.Vector3(0, 0, -1).applyMatrix4(
        snapshot.worldFromClip
      );
      expect(origin.distanceTo(new THREE.Vector3(13, 2, -1))).toBeLessThan(
        1e-6
      );
      expect(
        point.distanceTo(new THREE.Vector3(12.9, 2 + 1 / 180, -1.0125))
      ).toBeLessThan(1e-6);
    });

    it.each(['init', 'setFacingMode'] as const)(
      'invalidates raw parameters before %s switches to getUserMedia',
      async (method) => {
        const videoTexture = camera.texture;
        camera.updateXRCamera(makeFrame());
        vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([
          {kind: 'videoinput', deviceId: 'mock-device'} as MediaDeviceInfo,
        ]);
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
          createMockStream()
        );
        Object.defineProperty(camera.video, 'videoWidth', {value: 640});
        Object.defineProperty(camera.video, 'videoHeight', {value: 480});
        vi.spyOn(camera.video, 'play').mockImplementation(async () => {
          camera.video.dispatchEvent(new Event('loadedmetadata'));
        });
        const initializing =
          method === 'init' ? camera.init() : camera.setFacingMode('user');
        expectUnavailable();
        await initializing;
        expect(camera.isUsingXRCameraAccess).toBe(false);
        expect(camera.state).toBe(StreamState.STREAMING);
        expectUnavailable();
        expect(camera.texture).toBeInstanceOf(THREE.VideoTexture);
        expect(camera.texture).toBe(videoTexture);
        camera.updateXRCamera(makeFrame());
        expectUnavailable();
      }
    );

    it('invalidates on session end and restart until a frame from the new session arrives', async () => {
      camera.updateXRCamera(makeFrame());
      const oldFrame = makeFrame();
      xr.dispatchEvent({type: 'sessionend'});
      expectUnavailable();
      session = {enabledFeatures: ['camera-access']} as XRSession;
      xr.dispatchEvent({type: 'sessionstart'});
      expectUnavailable();
      await camera.init();
      camera.updateXRCamera(oldFrame);
      expectUnavailable();
      camera.updateXRCamera(makeFrame());
      expect(camera.hasXRCameraParams).toBe(true);
    });

    it.each([
      'binding',
      'reference space',
      'pose',
      'camera',
      'texture',
    ] as const)('invalidates when a later frame has no %s', (missing) => {
      camera.updateXRCamera(makeFrame());
      const frame = makeFrame();
      if (missing === 'binding')
        vi.spyOn(renderer.xr, 'getBinding').mockReturnValue(null!);
      if (missing === 'reference space')
        vi.spyOn(renderer.xr, 'getReferenceSpace').mockReturnValue(null);
      if (missing === 'pose') frame.getViewerPose = () => null;
      if (missing === 'camera')
        frame.getViewerPose = makeFrame([]).getViewerPose;
      if (missing === 'texture') getCameraImage.mockReturnValue(null);
      camera.updateXRCamera(frame);
      expectUnavailable();
    });

    it('invalidates across fallback restart, timeout and denied camera access', async () => {
      camera.updateXRCamera(makeFrame());
      await camera.init();
      expectUnavailable();
      await vi.advanceTimersByTimeAsync(5000);
      expectUnavailable();
      expect(camera.state).toBe(StreamState.NO_DEVICES_FOUND);
      session = {enabledFeatures: []} as unknown as XRSession;
      await camera.init();
      expectUnavailable();
      expect(camera.isUsingXRCameraAccess).toBe(false);
    });

    it('invalidates and detaches session listeners on disposal', () => {
      camera.updateXRCamera(makeFrame());
      const removeListener = vi.spyOn(xr, 'removeEventListener');
      camera.dispose();
      expectUnavailable();
      expect(removeListener.mock.calls.map(([type]) => type)).toEqual([
        'sessionstart',
        'sessionend',
      ]);
      camera.updateXRCamera(makeFrame());
      expectUnavailable();
    });

    it('invalidates and detaches the previous renderer when it is replaced', () => {
      camera.updateXRCamera(makeFrame());
      const removeListener = vi.spyOn(xr, 'removeEventListener');
      camera.setRenderer(createMockRenderer('immersive-ar', ['camera-access']));
      expectUnavailable();
      expect(removeListener.mock.calls.map(([type]) => type)).toEqual([
        'sessionstart',
        'sessionend',
      ]);
      camera.updateXRCamera(makeFrame());
      expectUnavailable();
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
  let rawSession: XRSession | undefined;

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
    const session = {
      mode: 'immersive-ar',
      enabledFeatures: ['camera-access'],
    } as XRSession;
    rawSession = session;
    const renderer = {
      xr: {
        enabled: true,
        getSession: () => session,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
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
      session: rawSession,
      getViewerPose: () => ({
        views: [
          {
            camera: {width, height},
            projectionMatrix: new THREE.Matrix4().toArray(),
            transform: {matrix: new THREE.Matrix4().toArray()},
          },
        ],
      }),
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

  it('resolves concurrent captures with different formats from one readback', async () => {
    const camera = new XRDeviceCamera(createMockOptions());
    const {renderer, render, readRenderTargetPixels} =
      createRawCameraRenderer();
    await startRawFallback(camera, renderer);

    const image = camera.captureSnapshot({outputFormat: 'imageData'});
    const texture = camera.captureSnapshot({outputFormat: 'texture'});
    camera.updateXRCamera(createFrame());

    await expect(image).resolves.toMatchObject({width: 2, height: 2});
    await expect(texture).resolves.toBeInstanceOf(THREE.Texture);
    expect(render).toHaveBeenCalledTimes(1);
    expect(readRenderTargetPixels).toHaveBeenCalledTimes(1);
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

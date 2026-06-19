import type {WebGLRenderer} from 'three';
import {describe, it, expect, vi, beforeEach} from 'vitest';

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

  it('falls back to XR camera access when a renderer is available', async () => {
    const getUserMediaError = new Error('NotReadableError');
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      getUserMediaError
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    camera.setRenderer(createMockRenderer('immersive-vr', ['camera-access']));

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

  it('falls back to XR camera access when no video devices are enumerated', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    camera.setRenderer(createMockRenderer('immersive-ar', ['camera-access']));

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.isUsingXRCameraAccess).toBe(true);
    expect(camera.state).toBe(StreamState.INITIALIZING);

    warnSpy.mockRestore();
  });

  it('reports NO_DEVICES_FOUND when no devices and no renderer', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(camera.init()).resolves.toBeUndefined();
    expect(camera.isUsingXRCameraAccess).toBe(false);
    expect(camera.state).toBe(StreamState.NO_DEVICES_FOUND);

    warnSpy.mockRestore();
  });

  it('reports NO_DEVICES_FOUND when camera-access was not granted', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    camera.setRenderer(createMockRenderer('immersive-ar', []));

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

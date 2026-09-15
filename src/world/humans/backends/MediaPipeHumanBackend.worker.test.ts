import {beforeEach, describe, expect, it, vi} from 'vitest';

// Fake the shared worker client so these tests exercise the backend's
// worker-vs-main-thread decision rather than real worker plumbing, which
// MediaPipeVisionWorker.test.ts already covers. Everything a vi.mock factory
// touches has to be hoisted, because those factories run before the module
// body does.
const {workerState, FakeClient, mainThread} = vi.hoisted(() => {
  const workerState = {
    supported: true,
    initShouldFail: false,
    instances: [] as Array<{
      label: string;
      init: ReturnType<typeof vi.fn>;
      detect: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }>,
  };

  class FakeClient {
    init = vi.fn(async () => {
      if (workerState.initShouldFail) {
        throw new Error('worker boot failed');
      }
    });
    detect = vi.fn(async () => ({landmarks: [[{x: 0.5, y: 0.5, z: 0}]]}));
    dispose = vi.fn();

    constructor(public label: string) {
      workerState.instances.push(this);
    }

    static isSupported() {
      return workerState.supported;
    }
  }

  const mainThread = {
    detect: vi.fn(() => ({landmarks: [[{x: 0.25, y: 0.25, z: 0}]]})),
    close: vi.fn(),
    createFromOptions: vi.fn(),
  };
  mainThread.createFromOptions.mockImplementation(async () => ({
    detect: mainThread.detect,
    close: mainThread.close,
  }));

  return {workerState, FakeClient, mainThread};
});

vi.mock('../../shared/MediaPipeVisionWorker', () => ({
  MEDIAPIPE_MODULE_URL: 'module://vision',
  MediaPipeVisionWorkerClient: FakeClient,
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {forVisionTasks: vi.fn(async () => ({}))},
  PoseLandmarker: {createFromOptions: mainThread.createFromOptions},
}));

vi.mock('../../../camera/CameraUtils', () => ({
  transformRgbUvToWorld: vi.fn(() => ({worldPosition: {x: 0, y: 0, z: 0}})),
}));

import {MediaPipeHumanBackend} from './MediaPipeHumanBackend';

function makeContext(useWorker = true): never {
  return {
    options: {
      humans: {
        backendConfig: {
          mediapipe: {
            useWorker,
            wasmFilesUrl: 'wasm://',
            modelAssetPath: 'model://',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          },
        },
      },
    },
    deviceCamera: {
      getSnapshot: vi.fn().mockResolvedValue({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      }),
    },
  } as never;
}

/** Drives the protected detect() hook without the full run() pipeline. */
function detectWith(backend: MediaPipeHumanBackend) {
  const snapshot = {imageData: {} as ImageData};
  return (
    backend as never as {
      detect(s: unknown, d: unknown, c: unknown): Promise<unknown[]>;
    }
  ).detect(
    snapshot,
    {} as never,
    {
      worldFromView: {},
      worldFromClip: {},
    } as never
  );
}

beforeEach(() => {
  workerState.supported = true;
  workerState.initShouldFail = false;
  workerState.instances = [];
  mainThread.detect.mockClear();
  mainThread.close.mockClear();
  mainThread.createFromOptions.mockClear();
});

describe('MediaPipeHumanBackend inference placement', () => {
  it('runs inference in the worker by default', async () => {
    const backend = new MediaPipeHumanBackend(makeContext());

    await detectWith(backend);

    expect(workerState.instances).toHaveLength(1);
    expect(workerState.instances[0].detect).toHaveBeenCalledOnce();
    expect(mainThread.detect).not.toHaveBeenCalled();
  });

  it('asks the worker for the pose task with the configured model', async () => {
    const backend = new MediaPipeHumanBackend(makeContext());
    await detectWith(backend);

    const config = workerState.instances[0].init.mock.calls[0][0] as never as {
      taskName: string;
      taskOptions: {baseOptions: {modelAssetPath: string; delegate: string}};
    };
    expect(config.taskName).toBe('PoseLandmarker');
    expect(config.taskOptions.baseOptions.modelAssetPath).toBe('model://');
    // Workers have no DOM canvas, so MediaPipe cannot use a GPU surface.
    expect(config.taskOptions.baseOptions.delegate).toBe('CPU');
  });

  it('keeps inference on the main thread when useWorker is false', async () => {
    const backend = new MediaPipeHumanBackend(makeContext(false));

    await detectWith(backend);

    expect(workerState.instances).toHaveLength(0);
    expect(mainThread.detect).toHaveBeenCalledOnce();
  });

  it('uses the GPU delegate on the main-thread path', async () => {
    const backend = new MediaPipeHumanBackend(makeContext(false));
    await detectWith(backend);

    const options = mainThread.createFromOptions.mock.calls[0][1] as never as {
      baseOptions: {delegate: string};
    };
    expect(options.baseOptions.delegate).toBe('GPU');
  });

  it('falls back to the main thread when workers are unavailable', async () => {
    workerState.supported = false;
    const backend = new MediaPipeHumanBackend(makeContext());

    await detectWith(backend);

    expect(workerState.instances).toHaveLength(0);
    expect(mainThread.detect).toHaveBeenCalledOnce();
  });

  it('falls back to the main thread when the worker fails to start', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    workerState.initShouldFail = true;
    const backend = new MediaPipeHumanBackend(makeContext());

    await detectWith(backend);

    // The half-built worker is released rather than leaked.
    expect(workerState.instances[0].dispose).toHaveBeenCalledOnce();
    expect(mainThread.detect).toHaveBeenCalledOnce();
  });

  it('still reports as available after falling back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    workerState.initShouldFail = true;
    const backend = new MediaPipeHumanBackend(makeContext());

    const available = await (
      backend as never as {isAvailable(): Promise<boolean>}
    ).isAvailable();

    expect(available).toBe(true);
  });

  it('converts worker results into poses', async () => {
    const backend = new MediaPipeHumanBackend(makeContext());

    const poses = await detectWith(backend);

    expect(poses).toHaveLength(1);
  });

  it('tears the worker down on dispose', async () => {
    const backend = new MediaPipeHumanBackend(makeContext());
    await detectWith(backend);

    backend.dispose();

    expect(workerState.instances[0].dispose).toHaveBeenCalled();
  });

  it('closes the main-thread landmarker on dispose', async () => {
    const backend = new MediaPipeHumanBackend(makeContext(false));
    await detectWith(backend);

    backend.dispose();

    expect(mainThread.close).toHaveBeenCalledOnce();
  });
});

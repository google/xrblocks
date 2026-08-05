import {beforeEach, describe, expect, it, vi} from 'vitest';

import {MediaPipeFaceBackend} from './MediaPipeFaceBackend';

// Mock the processing pipeline so these tests focus on the worker
// lifecycle rather than re-asserting the world-space transform (which
// MediaPipeFaceBackend.test.ts already covers exhaustively).
vi.mock('./MediaPipeFaceBackend', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./MediaPipeFaceBackend')>();
  return {...actual};
});

vi.mock('../../../camera/CameraUtils', () => ({
  transformRgbUvToWorld: vi.fn().mockReturnValue({
    worldPosition: {x: 0, y: 0, z: 0},
  }),
}));

// Stub Worker so the test never spawns a real OS-level worker. Each
// instance captures the messages sent from the main thread and exposes
// a `triggerMessage(data)` hook the test uses to simulate worker
// replies. `terminate()` is recorded so the dispose-test can assert it.
class FakeWorker {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((event: {data: Record<string, unknown>}) => void) | null = null;
  onerror: ((event: {message: string}) => void) | null = null;
  url: string;
  options?: WorkerOptions;
  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    FakeWorker.instances.push(this);
  }
  triggerMessage(data: Record<string, unknown>) {
    this.onmessage?.({data});
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:fake-url'),
    revokeObjectURL: vi.fn(),
  });
  // jsdom doesn't ship Blob with a real backing buffer but the Worker
  // constructor only needs the URL, so a no-op stub is enough.
  vi.stubGlobal('Blob', class {});
  // The backend pipes its snapshot through createImageBitmap before
  // posting to the worker; return a sentinel object so we can assert on
  // it later in the transfer list.
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({type: 'fake-bitmap', close: vi.fn()})
  );
});

function makeContext(): never {
  return {
    options: {
      faces: {
        backendConfig: {
          mediapipe: {
            wasmFilesUrl: 'wasm://',
            modelAssetPath: 'model://',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          },
        },
      },
    },
    deviceCamera: {
      getSnapshot: vi.fn().mockResolvedValue({
        // Match the ImageData shape the backend expects from
        // XRDeviceCamera.getSnapshot(outputFormat: 'imageData').
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      }),
    },
  } as never;
}

function lastInit() {
  const worker = FakeWorker.instances.at(-1)!;
  // The first postMessage is always 'init' with id 0.
  return worker.postMessage.mock.calls[0][0] as {
    id: number;
    type: string;
    config: Record<string, unknown>;
  };
}

describe('MediaPipeFaceBackend worker lifecycle', () => {
  it('spawns exactly one worker per backend and sends a single init message with the configured options', async () => {
    const backend = new MediaPipeFaceBackend(makeContext());
    // Init is posted synchronously from the constructor; flush microtasks.
    await Promise.resolve();
    expect(FakeWorker.instances).toHaveLength(1);
    const init = lastInit();
    expect(init.type).toBe('init');
    expect(init.config.modelAssetPath).toBe('model://');
    expect(init.config.numFaces).toBe(1);
    // Drain init so the backend reports as available.
    FakeWorker.instances[0].triggerMessage({id: init.id, ok: true});
    expect(
      await (
        backend as never as {isAvailable(): Promise<boolean>}
      ).isAvailable()
    ).toBe(true);
  });

  it('spawns the worker as a classic (non-module) worker so MediaPipe wasm loader can use importScripts', async () => {
    new MediaPipeFaceBackend(makeContext());
    await Promise.resolve();
    // We pass no { type: 'module' } so options is undefined. Module
    // workers don't expose importScripts and MediaPipe's wasm bootstrap
    // depends on it.
    expect(FakeWorker.instances[0].options).toBeUndefined();
  });

  it('routes overlapping detect requests back to the right caller by id', async () => {
    const backend = new MediaPipeFaceBackend(makeContext());
    await Promise.resolve();
    const worker = FakeWorker.instances[0];
    // Finish init so detect() proceeds past the init gate.
    worker.triggerMessage({id: 0, ok: true});

    const detect = (
      backend as never as {
        detect(
          s: {imageData: ImageData},
          d: unknown,
          c: unknown
        ): Promise<unknown[]>;
      }
    ).detect.bind(backend);
    const snap = {imageData: new Uint8ClampedArray(4) as never as ImageData};
    const a = detect(snap, {} as never, {} as never);
    const b = detect(snap, {} as never, {} as never);
    // Let the createImageBitmap + send microtasks resolve so the worker
    // has both posts.
    await new Promise((r) => setTimeout(r, 0));
    const sent = worker.postMessage.mock.calls
      .map((c) => c[0] as {id: number; type: string})
      .filter((m) => m.type === 'detect');
    expect(sent).toHaveLength(2);
    // Reply to the second request first to prove correlation works.
    worker.triggerMessage({
      id: sent[1].id,
      ok: true,
      result: {faceLandmarks: []},
    });
    worker.triggerMessage({
      id: sent[0].id,
      ok: true,
      result: {faceLandmarks: []},
    });
    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual([]);
  });

  it('rejects detect() with the worker-reported error (logged + returns []) when the worker replies with ok=false', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = new MediaPipeFaceBackend(makeContext());
    await Promise.resolve();
    const worker = FakeWorker.instances[0];
    worker.triggerMessage({id: 0, ok: true});

    const detect = (
      backend as never as {
        detect(
          s: {imageData: ImageData},
          d: unknown,
          c: unknown
        ): Promise<unknown[]>;
      }
    ).detect.bind(backend);
    const snap = {imageData: new Uint8ClampedArray(4) as never as ImageData};
    const p = detect(snap, {} as never, {} as never);
    await new Promise((r) => setTimeout(r, 0));
    const detectMsg = worker.postMessage.mock.calls
      .map((c) => c[0] as {id: number; type: string})
      .find((m) => m.type === 'detect')!;
    worker.triggerMessage({id: detectMsg.id, ok: false, error: 'boom'});
    await expect(p).resolves.toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      'MediaPipe Face detection (worker) failed:',
      expect.objectContaining({message: 'boom'})
    );
    errSpy.mockRestore();
  });

  it('terminates the worker, revokes the Blob URL, and rejects pending requests on dispose()', async () => {
    const backend = new MediaPipeFaceBackend(makeContext());
    await Promise.resolve();
    const worker = FakeWorker.instances[0];
    // Trigger init success so we can fire a detect.
    worker.triggerMessage({id: 0, ok: true});
    const detect = (
      backend as never as {
        detect(
          s: {imageData: ImageData},
          d: unknown,
          c: unknown
        ): Promise<unknown[]>;
      }
    ).detect.bind(backend);
    const snap = {imageData: new Uint8ClampedArray(4) as never as ImageData};
    const pending = detect(snap, {} as never, {} as never);
    await new Promise((r) => setTimeout(r, 0));

    backend.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    // dispose() returns [] for the inflight detect (it catches the
    // rejection internally and logs it), so awaiting it should resolve.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pending).resolves.toEqual([]);
    errSpy.mockRestore();
    // A second dispose should be a no-op (no double-terminate).
    backend.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

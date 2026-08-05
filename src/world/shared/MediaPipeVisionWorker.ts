// Shared plumbing for running MediaPipe vision tasks off the main thread.
//
// MediaPipe's `detect()` is synchronous and can take tens of milliseconds,
// which stalls the render loop when it runs on the main thread. Every vision
// backend has the same needs (spawn a worker, load a model once, run one
// detect per snapshot), so the worker source and the client live here rather
// than being copied per backend.
//
// The worker source is inlined as a string and instantiated via a Blob URL so
// the SDK still ships as one bundle and the rollup pipeline does not need to
// know about worker entry points.
//
// Wire protocol (every message carries a numeric `id` so replies can be
// correlated with requests):
//   { id, type: 'init', config: {...} }
//   { id, type: 'detect', imageBitmap }   // bitmap is transferred, not cloned
// Replies:
//   { id, ok: true }
//   { id, ok: true, result }
//   { id, ok: false, error }

/**
 * Name of a MediaPipe vision task class exported by `@mediapipe/tasks-vision`.
 * The worker looks the class up on the imported module by this name.
 */
export type MediaPipeTaskName = 'FaceLandmarker' | 'PoseLandmarker';

/**
 * CDN module the worker dynamic-imports for MediaPipe. Workers cannot see the
 * host page's importmap, so they need an absolute URL. Bump this in lockstep
 * with the importmap entries in the demos that use MediaPipe.
 */
export const MEDIAPIPE_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';

export interface MediaPipeWorkerInitConfig {
  /**
   * Absolute URL the worker dynamic-imports MediaPipe from. Workers cannot see
   * the host page's importmap, so a bare specifier would not resolve.
   */
  mediapipeModuleUrl: string;
  /** Directory the MediaPipe wasm binaries are served from. */
  wasmFilesUrl: string;
  /** Vision task class to instantiate. */
  taskName: MediaPipeTaskName;
  /**
   * Options forwarded verbatim to `createFromOptions`. Callers should request
   * the CPU delegate: the wasm pipeline only creates a GPU surface when it
   * finds a real DOM canvas, which a worker does not have.
   */
  taskOptions: Record<string, unknown>;
}

// The worker is written as a plain string rather than a module so it can be
// spawned from a Blob URL. Keep it dependency-free.
export const MEDIA_PIPE_VISION_WORKER_SOURCE = /* js */ `
let task = null;

async function init(config) {
  const mod = await import(config.mediapipeModuleUrl);
  const { FilesetResolver } = mod;
  const TaskClass = mod[config.taskName];
  if (!TaskClass) {
    throw new Error('unknown MediaPipe task: ' + config.taskName);
  }
  const vision = await FilesetResolver.forVisionTasks(config.wasmFilesUrl);
  task = await TaskClass.createFromOptions(vision, config.taskOptions);
}

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === 'init') {
      await init(event.data.config);
      self.postMessage({ id, ok: true });
    } else if (type === 'detect') {
      if (!task) throw new Error('worker not initialized');
      const bitmap = event.data.imageBitmap;
      const result = task.detect(bitmap);
      bitmap.close();
      self.postMessage({ id, ok: true, result });
    } else {
      throw new Error('unknown message type: ' + type);
    }
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: (err && err.message) || String(err),
    });
  }
};
`;

type WorkerRequest =
  | {type: 'init'; config: MediaPipeWorkerInitConfig}
  | {type: 'detect'; imageBitmap: ImageBitmap};

type WorkerSuccessReply = {id: number; ok: true; result?: unknown};
type WorkerErrorReply = {id: number; ok: false; error: string};
type WorkerReply = WorkerSuccessReply | WorkerErrorReply;

/**
 * Runs a single MediaPipe vision task in a dedicated web worker.
 *
 * Results are whatever the task's `detect()` returns, as a structured-clonable
 * object. Callers cast to the matching MediaPipe result type and do their own
 * post-processing on the main thread, since that work usually needs the live
 * depth mesh and camera matrices.
 */
export class MediaPipeVisionWorkerClient {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private nextRequestId = 0;
  private pendingRequests = new Map<
    number,
    {resolve: (value: WorkerReply) => void; reject: (error: Error) => void}
  >();

  /**
   * @param label - Name used in error messages, e.g. `MediaPipeFaceBackend`.
   */
  constructor(private label: string) {}

  /** Whether this environment can host the worker at all. */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined' && typeof Blob !== 'undefined';
  }

  /**
   * Spawns the worker and loads the model. Resolves once the task is ready.
   *
   * @param config - Module URLs and task options for the worker.
   */
  async init(config: MediaPipeWorkerInitConfig): Promise<void> {
    if (this.worker) {
      return;
    }
    if (!MediaPipeVisionWorkerClient.isSupported()) {
      throw new Error('Web Workers are not available in this environment');
    }

    const blob = new Blob([MEDIA_PIPE_VISION_WORKER_SOURCE], {
      type: 'text/javascript',
    });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const {id} = event.data;
      const pending = this.pendingRequests.get(id);
      if (!pending) return;
      this.pendingRequests.delete(id);
      if (event.data.ok) {
        pending.resolve(event.data);
      } else {
        pending.reject(new Error(event.data.error || 'worker error'));
      }
    };
    this.worker.onerror = (event) => {
      console.error(`${this.label} worker errored:`, event.message);
    };

    await this.send({type: 'init', config});
  }

  /**
   * Runs one detection pass.
   *
   * The snapshot is converted to an `ImageBitmap` so its pixel buffer can be
   * transferred rather than copied; `ImageData` is structured-clonable but
   * that means a full copy on every frame.
   *
   * @param imageData - Camera snapshot to run the task over.
   * @returns The raw task result, or null when the pass could not run.
   */
  async detect(imageData: ImageData): Promise<unknown> {
    if (!this.worker) {
      return null;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(imageData);
    } catch (error: unknown) {
      console.error(`${this.label}: failed to create ImageBitmap:`, error);
      return null;
    }

    try {
      const reply = (await this.send({type: 'detect', imageBitmap: bitmap}, [
        bitmap,
      ])) as WorkerSuccessReply;
      return reply.result ?? null;
    } catch (error: unknown) {
      console.error(`${this.label}: worker detection failed:`, error);
      return null;
    }
  }

  /**
   * Terminates the worker and revokes its Blob URL. Safe to call repeatedly.
   */
  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    // Reject anything still in flight so awaiting callers don't hang forever.
    for (const {reject} of this.pendingRequests.values()) {
      reject(new Error(`${this.label} disposed`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Promise-wraps one request/response round trip. The worker echoes the
   * request id back so overlapping calls stay correlated.
   */
  private send(
    payload: WorkerRequest,
    transfer: Transferable[] = []
  ): Promise<WorkerReply> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error('worker not spawned'));
    }
    const id = this.nextRequestId++;
    return new Promise<WorkerReply>((resolve, reject) => {
      this.pendingRequests.set(id, {resolve, reject});
      worker.postMessage({id, ...payload}, transfer);
    });
  }
}

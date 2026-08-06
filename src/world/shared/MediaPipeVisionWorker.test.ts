import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MediaPipeVisionWorkerClient} from './MediaPipeVisionWorker';

type PostedMessage = {id: number; type: string; [key: string]: unknown};

/**
 * Stands in for a real `Worker`. jsdom has no worker implementation, and the
 * point of these tests is the request/reply correlation rather than MediaPipe
 * itself, so the fake lets each test drive replies by hand.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror: ((event: {message: string}) => void) | null = null;
  posted: Array<{message: PostedMessage; transfer: unknown[]}> = [];
  terminated = false;

  constructor(public url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: PostedMessage, transfer: unknown[] = []) {
    this.posted.push({message, transfer});
  }

  terminate() {
    this.terminated = true;
  }

  reply(data: unknown) {
    this.onmessage?.({data});
  }

  replyOk(id: number, result?: unknown) {
    this.reply({id, ok: true, result});
  }

  replyError(id: number, error: string) {
    this.reply({id, ok: false, error});
  }

  messageOfType(type: string) {
    return this.posted.find((entry) => entry.message.type === type);
  }
}

const INIT_CONFIG = {
  mediapipeModuleUrl: 'https://example.test/vision_bundle.mjs',
  wasmFilesUrl: 'https://example.test/wasm',
  taskName: 'PoseLandmarker' as const,
  taskOptions: {runningMode: 'IMAGE'},
};

const FAKE_IMAGE_DATA = {width: 2, height: 2} as unknown as ImageData;

let revokedUrls: string[] = [];

beforeEach(() => {
  FakeWorker.instances = [];
  revokedUrls = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake-worker-url'),
    revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
  });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({close: vi.fn()}) as unknown as ImageBitmap)
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Spawns a client whose worker has already acknowledged init. */
async function createInitializedClient() {
  const client = new MediaPipeVisionWorkerClient('TestBackend');
  const pending = client.init(INIT_CONFIG);
  const worker = FakeWorker.instances[0];
  worker.replyOk(worker.posted[0].message.id);
  await pending;
  return {client, worker};
}

describe('MediaPipeVisionWorkerClient', () => {
  it('reports support when Worker and Blob exist', () => {
    expect(MediaPipeVisionWorkerClient.isSupported()).toBe(true);
  });

  it('reports no support without Worker', () => {
    vi.stubGlobal('Worker', undefined);

    expect(MediaPipeVisionWorkerClient.isSupported()).toBe(false);
  });

  it('sends the task configuration on init', async () => {
    const {worker} = await createInitializedClient();

    const init = worker.messageOfType('init');
    expect(init?.message.config).toEqual(INIT_CONFIG);
  });

  it('spawns the worker from a blob URL', async () => {
    const {worker} = await createInitializedClient();

    expect(worker.url).toBe('blob:fake-worker-url');
  });

  it('rejects init when the worker reports a failure', async () => {
    const client = new MediaPipeVisionWorkerClient('TestBackend');
    const pending = client.init(INIT_CONFIG);
    const worker = FakeWorker.instances[0];
    worker.replyError(worker.posted[0].message.id, 'model download failed');

    await expect(pending).rejects.toThrow('model download failed');
  });

  it('rejects init when the environment has no Worker', async () => {
    vi.stubGlobal('Worker', undefined);
    const client = new MediaPipeVisionWorkerClient('TestBackend');

    await expect(client.init(INIT_CONFIG)).rejects.toThrow(
      'Web Workers are not available'
    );
  });

  it('only spawns one worker across repeated init calls', async () => {
    const {client} = await createInitializedClient();

    await client.init(INIT_CONFIG);

    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('returns the detection result from the worker', async () => {
    const {client, worker} = await createInitializedClient();

    const pending = client.detect(FAKE_IMAGE_DATA);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    worker.replyOk(worker.posted[1].message.id, {landmarks: [[{x: 0.5}]]});

    await expect(pending).resolves.toEqual({landmarks: [[{x: 0.5}]]});
  });

  it('transfers the image bitmap rather than cloning it', async () => {
    const {client, worker} = await createInitializedClient();

    const pending = client.detect(FAKE_IMAGE_DATA);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    const detect = worker.posted[1];
    worker.replyOk(detect.message.id, {});
    await pending;

    expect(detect.transfer).toEqual([detect.message.imageBitmap]);
  });

  it('correlates overlapping detections by request id', async () => {
    const {client, worker} = await createInitializedClient();

    const first = client.detect(FAKE_IMAGE_DATA);
    const second = client.detect(FAKE_IMAGE_DATA);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(3));

    // Reply out of order: the second request resolves before the first.
    worker.replyOk(worker.posted[2].message.id, {tag: 'second'});
    worker.replyOk(worker.posted[1].message.id, {tag: 'first'});

    await expect(first).resolves.toEqual({tag: 'first'});
    await expect(second).resolves.toEqual({tag: 'second'});
  });

  it('resolves to null when the worker reports a detection failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {client, worker} = await createInitializedClient();

    const pending = client.detect(FAKE_IMAGE_DATA);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    worker.replyError(worker.posted[1].message.id, 'inference blew up');

    await expect(pending).resolves.toBeNull();
  });

  it('resolves to null when the snapshot cannot be converted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {client} = await createInitializedClient();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('detached buffer');
      })
    );

    await expect(client.detect(FAKE_IMAGE_DATA)).resolves.toBeNull();
  });

  it('resolves to null when detecting before init', async () => {
    const client = new MediaPipeVisionWorkerClient('TestBackend');

    await expect(client.detect(FAKE_IMAGE_DATA)).resolves.toBeNull();
  });

  it('terminates the worker and revokes its URL on dispose', async () => {
    const {client, worker} = await createInitializedClient();

    client.dispose();

    expect(worker.terminated).toBe(true);
    expect(revokedUrls).toEqual(['blob:fake-worker-url']);
  });

  it('fails in-flight detections on dispose instead of hanging', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {client, worker} = await createInitializedClient();

    const pending = client.detect(FAKE_IMAGE_DATA);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    client.dispose();

    await expect(pending).resolves.toBeNull();
  });

  it('tolerates being disposed twice', async () => {
    const {client} = await createInitializedClient();

    client.dispose();

    expect(() => client.dispose()).not.toThrow();
  });

  it('ignores replies for unknown request ids', async () => {
    const {worker} = await createInitializedClient();

    expect(() => worker.replyOk(999, {})).not.toThrow();
  });
});

import {afterEach, describe, expect, it, vi} from 'vitest';
import {GemmaVisionClient} from './GemmaVisionClient.js';
import {IMAGE_BUDGET} from './modelConfig.js';

interface Request {
  id: number;
  type: string;
  [key: string]: unknown;
}

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  requests: Request[] = [];
  terminate = vi.fn();
  postMessage = vi.fn((request: Request, _transfer: Transferable[] = []) => {
    this.requests.push(request);
  });

  last(type: string) {
    const request = this.requests.findLast((entry) => entry.type === type);
    if (!request) throw new Error(`Missing ${type} request`);
    return request;
  }

  emit(data: unknown) {
    this.onmessage?.(new MessageEvent('message', {data}));
  }

  result(type: string, result: Record<string, unknown> = {}) {
    this.emit({type: 'result', id: this.last(type).id, result});
  }

  error(type: string, message = 'Operation failed', fatal = false) {
    this.emit({type: 'error', id: this.last(type).id, message, fatal});
  }
}

const loadResult = {cached: true, cacheWarning: '', loadMs: 123};
const generationResult = {
  text: 'A red chair.',
  generatedTokens: 4,
  tokensPerSecond: 12,
  interrupted: false,
};
const image = () => ({width: 1, height: 1, buffer: new ArrayBuffer(4)});

function fixture() {
  const worker = new FakeWorker();
  const createWorker = vi.fn(() => worker);
  const now = vi.fn(() => 100);
  const client = new GemmaVisionClient({createWorker, now});
  return {client, worker, createWorker, now};
}

async function load(client: GemmaVisionClient, worker: FakeWorker) {
  const pending = client.load();
  worker.result('load', loadResult);
  await pending;
}

async function capture(client: GemmaVisionClient, worker: FakeWorker) {
  const pending = client.setImage(image());
  worker.result('image', {imageId: worker.last('image').imageId});
  await pending;
}

async function ready() {
  const f = fixture();
  await load(f.client, f.worker);
  await capture(f.client, f.worker);
  return f;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GemmaVisionClient', () => {
  it('does no work until an explicit check, load, or capture', async () => {
    const {client, createWorker} = fixture();
    expect(client.state).toBe('idle');
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    await expect(client.generate('Describe')).rejects.toThrow(/load/i);
    await client.stop();
    await client.clear();
    await client.dispose();
    expect(client.state).toBe('disposed');
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('constructs the default worker lazily with a module-relative URL', async () => {
    const workers: FakeWorker[] = [];
    const workerConstructor = vi.fn(function (
      _url: URL,
      _options: WorkerOptions
    ) {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    vi.stubGlobal('Worker', workerConstructor);
    const client = new GemmaVisionClient();
    expect(workerConstructor).not.toHaveBeenCalled();
    const checking = client.check();
    expect(workerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: expect.stringMatching(/\/gemmaVisionWorker\.js$/),
      }),
      {type: 'module'}
    );
    workers[0].result('check');
    await checking;
    const closing = client.dispose();
    workers[0].result('dispose');
    await closing;
  });

  it('reuses one worker and passes false download consent by default', async () => {
    const {client, worker, createWorker} = fixture();
    const checking = client.check();
    expect(worker.last('check')).toEqual({id: 1, type: 'check'});
    worker.result('check', {supported: true});
    await expect(checking).resolves.toEqual({supported: true});
    const loading = client.load();
    expect(client.state).toBe('loading');
    expect(worker.last('load')).toEqual({
      id: 2,
      type: 'load',
      modelKey: 'gemma',
      allowDownload: false,
    });
    worker.result('load', loadResult);
    await expect(loading).resolves.toEqual(loadResult);
    expect(client.state).toBe('ready');
    expect(client.loaded).toBe(true);
    expect(client.modelKey).toBe('gemma');
    expect(createWorker).toHaveBeenCalledOnce();
    await expect(client.load()).rejects.toThrow(/already loaded/i);
  });

  it('switches models inside the same worker and keeps the capture', async () => {
    const {client, worker, createWorker} = await ready();
    const switching = client.load({modelKey: 'lite'});
    expect(worker.last('load')).toMatchObject({
      modelKey: 'lite',
      allowDownload: false,
    });
    worker.result('load', loadResult);
    await switching;
    expect(client.modelKey).toBe('lite');
    expect(client.imageId).toBe(1);
    const generating = client.generate('Describe');
    expect(worker.last('generate').imageBudget).toBe(64);
    worker.result('generate', generationResult);
    await generating;
    const back = client.load({modelKey: 'gemma'});
    worker.result('load', loadResult);
    await back;
    expect(client.modelKey).toBe('gemma');
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('rejects unknown models before contacting the worker', async () => {
    const {client, createWorker} = fixture();
    await expect(client.load({modelKey: 'huge'})).rejects.toThrow(
      /unknown vision model/i
    );
    expect(createWorker).not.toHaveBeenCalled();
    expect(client.state).toBe('idle');
  });

  it('forwards consent and raw progress without confusing cached and loaded', async () => {
    const {client, worker} = fixture();
    const onProgress = vi.fn();
    const loading = client.load({allowDownload: true, onProgress});
    expect(worker.last('load').allowDownload).toBe(true);
    const event = {status: 'progress', file: 'model.onnx', progress: 50};
    worker.emit({type: 'progress', id: worker.last('load').id, event});
    expect(onProgress).toHaveBeenCalledWith(event);
    const result = {cached: false, cacheWarning: 'Storage is full', loadMs: 88};
    worker.result('load', result);
    await expect(loading).resolves.toEqual(result);
    expect(client.loaded).toBe(true);
  });

  it('keeps the worker and capture after a recoverable load failure', async () => {
    const {client, worker, createWorker} = await ready();
    const loading = client.load({modelKey: 'lite'});
    worker.error('load', 'Download Lite first; its cache is incomplete.');
    await expect(loading).rejects.toThrow(/cache is incomplete/);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(client.loaded).toBe(false);
    expect(client.modelKey).toBeNull();
    expect(client.imageId).toBe(1);
    expect(client.state).toBe('idle');
    const retry = client.load();
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.last('load').allowDownload).toBe(false);
    worker.result('load', loadResult);
    await expect(retry).resolves.toEqual(loadResult);
    expect(client.loaded).toBe(true);
    expect(client.imageId).toBe(1);
  });

  it('discards the worker and its capture after a fatal load failure', async () => {
    const {client, worker, createWorker} = fixture();
    await capture(client, worker);
    const loading = client.load({allowDownload: true});
    worker.error('load', 'WebGPU device lost', true);
    await expect(loading).rejects.toThrow('WebGPU device lost');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    const replacement = new FakeWorker();
    createWorker.mockReturnValue(replacement);
    const retry = client.load();
    expect(createWorker).toHaveBeenCalledTimes(2);
    replacement.result('load', loadResult);
    await expect(retry).resolves.toEqual(loadResult);
  });

  it('transfers captures before loading and changes imageId only on matching acknowledgement', async () => {
    const {client, worker} = fixture();
    const pixels = image();
    const first = client.setImage(pixels);
    expect(worker.last('image')).toMatchObject({imageId: 1, ...pixels});
    expect(worker.postMessage).toHaveBeenLastCalledWith(worker.last('image'), [
      pixels.buffer,
    ]);
    expect(client.imageId).toBeNull();
    worker.result('image', {imageId: 1});
    await first;
    expect(client.imageId).toBe(1);
    expect(client.loaded).toBe(false);
    const second = client.setImage(image());
    expect(worker.last('image').imageId).toBe(2);
    expect(client.imageId).toBe(1);
    worker.error('image', 'Bad capture');
    await expect(second).rejects.toThrow('Bad capture');
    expect(client.imageId).toBe(1);
    const third = client.setImage(image());
    expect(worker.last('image').imageId).toBe(3);
    worker.result('image', {imageId: 3});
    await third;
    expect(client.imageId).toBe(3);
  });

  it.each([
    {width: 0, height: 1, buffer: new ArrayBuffer(0)},
    {width: 769, height: 1, buffer: new ArrayBuffer(3076)},
    {width: 1.5, height: 1, buffer: new ArrayBuffer(6)},
    {width: 1, height: 1, buffer: new ArrayBuffer(3)},
  ])(
    'rejects malformed capture data before creating a worker',
    async (pixels) => {
      const {client, createWorker} = fixture();
      await expect(client.setImage(pixels)).rejects.toThrow(
        /image|rgba|capture/i
      );
      expect(createWorker).not.toHaveBeenCalled();
    }
  );

  it('rejects a mismatched image acknowledgement rather than claiming a valid capture', async () => {
    const {client, worker} = fixture();
    const pending = client.setImage(image());
    worker.result('image', {imageId: 99});
    await expect(pending).rejects.toThrow(/image|malformed/i);
    expect(client.imageId).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('ignores completed request IDs without overwriting the current capture', async () => {
    const {client, worker} = fixture();
    await capture(client, worker);
    const previous = worker.last('image').id;
    const pending = client.setImage(image());
    worker.emit({type: 'result', id: previous, result: {imageId: 1}});
    expect(client.imageId).toBe(1);
    worker.result('image', {imageId: 2});
    await pending;
    worker.emit({type: 'result', id: previous, result: {imageId: 1}});
    expect(client.imageId).toBe(2);
  });

  it('requires a model and image, trims valid questions, and validates questions locally', async () => {
    const {client, worker} = fixture();
    await load(client, worker);
    await expect(client.generate('Describe')).rejects.toThrow(/capture/i);
    await capture(client, worker);
    for (const question of ['', '  ', 'x'.repeat(2001)]) {
      await expect(client.generate(question)).rejects.toThrow(
        /question|characters/i
      );
    }
    expect(
      worker.requests.filter((request) => request.type === 'generate')
    ).toHaveLength(0);
    const pending = client.generate('  Describe  ');
    expect(worker.last('generate')).toMatchObject({
      question: 'Describe',
      imageId: 1,
      imageBudget: IMAGE_BUDGET,
    });
    worker.result('generate', generationResult);
    await expect(pending).resolves.toMatchObject({firstTextMs: null});
  });

  it('assembles cumulative chunks and measures only the first nonempty text event', async () => {
    const {client, worker, now} = await ready();
    const onText = vi.fn();
    const pending = client.generate('Describe', {imageBudget: 140, onText});
    expect(client.state).toBe('generating');
    const id = worker.last('generate').id;
    expect(worker.last('generate').imageBudget).toBe(140);
    worker.emit({type: 'delta', id, text: ''});
    now.mockReturnValue(145);
    worker.emit({type: 'delta', id, text: 'A red '});
    now.mockReturnValue(900);
    worker.emit({type: 'delta', id, text: 'chair.'});
    expect(onText.mock.calls.map(([text]) => text).filter(Boolean)).toEqual([
      'A red ',
      'A red chair.',
    ]);
    worker.result('generate', generationResult);
    await expect(pending).resolves.toEqual({
      ...generationResult,
      firstTextMs: 45,
    });
    expect(client.state).toBe('ready');
  });

  it('rejects overlapping operations while loading, checking, capturing, clearing, or generating', async () => {
    const {client, worker} = fixture();
    const loading = client.load();
    for (const operation of [
      () => client.check(),
      () => client.load(),
      () => client.setImage(image()),
      () => client.clear(),
      () => client.generate('Describe'),
    ])
      await expect(operation()).rejects.toThrow(/busy|loading/i);
    worker.result('load', loadResult);
    await loading;
    const checking = client.check();
    await expect(client.check()).rejects.toThrow(/busy/i);
    worker.result('check');
    await checking;
    const capturing = client.setImage(image());
    await expect(client.setImage(image())).rejects.toThrow(/busy/i);
    worker.result('image', {imageId: 1});
    await capturing;
    const clearing = client.clear();
    await expect(client.generate('Describe')).rejects.toThrow(/busy/i);
    worker.result('clear');
    await clearing;
    const generating = client.generate('Describe');
    await expect(client.generate('Again')).rejects.toThrow(/busy/i);
    await expect(client.setImage(image())).rejects.toThrow(/busy/i);
    worker.result('generate', generationResult);
    await generating;
  });

  it('keeps the model and capture when clearing history or receiving a nonfatal operation error', async () => {
    const {client, worker} = await ready();
    const pending = client.generate('Describe');
    worker.error('generate', 'Context budget exceeded');
    await expect(pending).rejects.toThrow('Context budget exceeded');
    const clearing = client.clear();
    worker.result('clear');
    await clearing;
    expect(client.loaded).toBe(true);
    expect(client.imageId).toBe(1);
    expect(client.state).toBe('ready');
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('recovers from synchronous worker creation and postMessage failures without retrying', async () => {
    const {client, worker, createWorker} = fixture();
    createWorker.mockImplementationOnce(() => {
      throw new Error('Worker unavailable');
    });
    await expect(client.load()).rejects.toThrow('Worker unavailable');
    expect(client.state).toBe('idle');
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Transfer failed');
    });
    await expect(client.setImage(image())).rejects.toThrow('Transfer failed');
    expect(client.imageId).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it.each(['error', 'messageerror', 'fatal'])(
    'rejects all pending work on worker %s and requires explicit reload',
    async (kind) => {
      const {client, worker, createWorker} = await ready();
      const generating = client.generate('Describe');
      const stopping = client.stop();
      const results = Promise.allSettled([generating, stopping]);
      if (kind === 'error')
        worker.onerror?.(new ErrorEvent('error', {message: 'GPU crashed'}));
      else if (kind === 'messageerror')
        worker.onmessageerror?.(new MessageEvent('messageerror'));
      else worker.error('generate', 'GPU crashed', true);
      expect((await results).map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
      ]);
      expect(client.state).toBe('idle');
      expect(client.loaded).toBe(false);
      expect(client.imageId).toBeNull();
      expect(worker.terminate).toHaveBeenCalledOnce();
      await expect(client.generate('Retry')).rejects.toThrow(/load/i);
      expect(createWorker).toHaveBeenCalledOnce();
    }
  );

  it.each([
    null,
    {type: 'result', id: 0, result: {}},
    {type: 'unknown', id: 1},
    {type: 'result', id: 1},
    {type: 'delta', id: 1, text: 4},
    {type: 'error', id: 1, message: 4, fatal: false},
    {type: 'progress', id: 1},
  ])('makes malformed protocol responses visible', async (reply) => {
    const {client, worker} = fixture();
    const pending = client.check();
    worker.emit(reply);
    await expect(pending).rejects.toThrow(/malformed|invalid/i);
    expect(client.state).toBe('idle');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['progress', 'text'])(
    'does not strand work when a %s callback throws',
    async (kind) => {
      const {client, worker} = fixture();
      const failure = () => {
        throw new Error('UI callback failed');
      };
      let pending: Promise<unknown>;
      if (kind === 'progress') {
        pending = client.load({onProgress: failure});
        worker.emit({
          type: 'progress',
          id: worker.last('load').id,
          event: {status: 'initiate'},
        });
      } else {
        await load(client, worker);
        await capture(client, worker);
        pending = client.generate('Describe', {onText: failure});
        worker.emit({
          type: 'delta',
          id: worker.last('generate').id,
          text: 'Hi',
        });
      }
      await expect(pending).rejects.toThrow('UI callback failed');
      expect(client.state).toBe('idle');
      expect(client.loaded).toBe(false);
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  );

  it('cancels loading immediately and ignores every event from the replaced worker', async () => {
    const {client, worker, createWorker} = fixture();
    await capture(client, worker);
    const oldMessage = worker.onmessage;
    const oldError = worker.onerror;
    const oldMessageError = worker.onmessageerror;
    const loading = client.load({allowDownload: true});
    const rejected = expect(loading).rejects.toThrow(/cancel/i);
    await client.stop();
    await rejected;
    expect(client.state).toBe('idle');
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.requests.some((request) => request.type === 'stop')).toBe(
      false
    );
    const replacement = new FakeWorker();
    createWorker.mockReturnValue(replacement);
    const reloading = client.load();
    oldMessage?.(
      new MessageEvent('message', {
        data: {
          type: 'result',
          id: replacement.last('load').id,
          result: loadResult,
        },
      })
    );
    oldMessage?.(new MessageEvent('message', {data: null}));
    oldError?.(new ErrorEvent('error', {message: 'old failure'}));
    oldMessageError?.(new MessageEvent('messageerror'));
    expect(client.loaded).toBe(false);
    expect(client.state).toBe('loading');
    expect(replacement.terminate).not.toHaveBeenCalled();
    replacement.result('load', loadResult);
    await reloading;
    expect(client.loaded).toBe(true);
  });

  it('coalesces stop requests and waits for graceful generation completion and stop acknowledgement', async () => {
    vi.useFakeTimers();
    const {client, worker} = await ready();
    const generating = client.generate('Describe');
    const stopping = client.stop();
    const secondStop = client.stop();
    const settled = vi.fn();
    void stopping.then(settled);
    expect(worker.last('stop')).toMatchObject({
      targetId: worker.last('generate').id,
    });
    expect(
      worker.requests.filter((request) => request.type === 'stop')
    ).toHaveLength(1);
    worker.result('generate', {...generationResult, interrupted: true});
    await generating;
    expect(settled).not.toHaveBeenCalled();
    await expect(client.generate('Too soon')).rejects.toThrow(/busy|stopping/i);
    worker.result('stop');
    await Promise.all([stopping, secondStop]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.state).toBe('ready');
    expect(client.loaded).toBe(true);
    expect(client.imageId).toBe(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets after exactly five seconds when cooperative stop hangs', async () => {
    vi.useFakeTimers();
    const {client, worker} = await ready();
    const generating = client.generate('Describe');
    const stopping = client.stop();
    const generatedFailure =
      expect(generating).rejects.toThrow(/reset|reload/i);
    const stopFailure = expect(stopping).rejects.toThrow(/reset|reload/i);
    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([generatedFailure, stopFailure]);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    expect(client.state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still applies the stop deadline if generation finishes but the stop acknowledgement never arrives', async () => {
    vi.useFakeTimers();
    const {client, worker} = await ready();
    const generating = client.generate('Describe');
    const stopping = client.stop();
    const rejected = expect(stopping).rejects.toThrow(/reset|reload/i);
    worker.result('generate', generationResult);
    await generating;
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(client.loaded).toBe(false);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects remaining generation and resets when the worker cannot stop', async () => {
    vi.useFakeTimers();
    const {client, worker} = await ready();
    const generating = client.generate('Describe');
    const stopping = client.stop();
    const results = Promise.allSettled([generating, stopping]);
    worker.error('stop', 'Stopping failed');
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect((await results).map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(client.state).toBe('idle');
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes gracefully during loading and blocks new work immediately', async () => {
    vi.useFakeTimers();
    const {client, worker} = fixture();
    const loading = client.load();
    const disposing = client.dispose();
    const secondDispose = client.dispose();
    await expect(client.check()).rejects.toThrow(/dispos/i);
    await expect(client.load()).rejects.toThrow(/dispos/i);
    expect(
      worker.requests.filter((request) => request.type === 'dispose')
    ).toHaveLength(1);
    worker.result('load', loadResult);
    await loading;
    worker.result('dispose');
    await Promise.all([disposing, secondDispose]);
    expect(client.state).toBe('disposed');
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await client.dispose();
    await expect(client.setImage(image())).rejects.toThrow(/dispos/i);
    await expect(client.generate('Describe')).rejects.toThrow(/dispos/i);
    await expect(client.clear()).rejects.toThrow(/dispos/i);
  });

  it('bounds disposal of a busy worker and rejects its pending requests', async () => {
    vi.useFakeTimers();
    const {client, worker} = await ready();
    const generating = client.generate('Describe');
    const disposing = client.dispose();
    const generatedFailure =
      expect(generating).rejects.toThrow(/dispos|reset/i);
    const disposalFailure = expect(disposing).rejects.toThrow(/dispos|reset/i);
    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([generatedFailure, disposalFailure]);
    expect(client.state).toBe('disposed');
    expect(client.loaded).toBe(false);
    expect(client.imageId).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

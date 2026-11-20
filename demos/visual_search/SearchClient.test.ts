// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';

import {SearchClient} from './SearchClient.js';

type Request = {id: number; type: string} & Record<string, unknown>;

class FakeWorker {
  requests: Request[] = [];
  transfers: unknown[][] = [];
  terminated = false;
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror:
    | ((event: {message?: string; preventDefault?: () => void}) => void)
    | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(request: Request, transfer: unknown[] = []) {
    this.requests.push(request);
    this.transfers.push(transfer);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({data});
  }
  last() {
    return this.requests.at(-1)!;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new SearchClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  return {client, workers};
}

async function loaded() {
  const context = setup();
  const load = context.client.load();
  const worker = context.workers[0];
  worker.reply({
    type: 'result',
    id: worker.last().id,
    result: {loadMs: 1, warmupMs: 1},
  });
  await load;
  return {...context, worker};
}

afterEach(() => vi.useRealTimers());

describe('SearchClient', () => {
  it('creates one worker lazily and tracks load state', async () => {
    const {client, workers, worker} = await loaded();
    expect(workers).toHaveLength(1);
    expect(worker.requests[0]).toEqual({id: 1, type: 'load'});
    expect(client.loaded).toBe(true);
    expect(client.state).toBe('ready');
    expect(() => client.load()).toThrow(/already loaded/);
  });

  const TILES = [
    {x: 0, y: 0, side: 2},
    {x: 2, y: 0, side: 2},
  ];
  const frame = () => ({
    data: new Uint8ClampedArray(4 * 2 * 4),
    width: 4,
    height: 2,
  });
  const ok = {
    scores: [0.3, 0.2],
    probabilities: [0.9, 0.1],
    textMs: 1,
    visionMs: 2,
  };

  it('transfers frame ownership and copies views of larger buffers', async () => {
    const {client, worker} = await loaded();
    const image = frame();
    const pending = client.search(image, TILES, 'cup');
    expect(worker.last()).toMatchObject({
      type: 'search',
      tiles: TILES,
      query: 'cup',
    });
    expect(worker.transfers.at(-1)).toEqual([image.data.buffer]);
    expect(client.busy).toBe(true);
    expect(client.state).toBe('searching');
    expect(() => client.search(frame(), TILES, 'cup')).toThrow(/busy/);
    worker.reply({type: 'result', id: worker.last().id, result: ok});
    await expect(pending).resolves.toEqual(ok);
    expect(client.state).toBe('ready');

    const big = new Uint8ClampedArray(64);
    const view = big.subarray(16, 48);
    const second = client.search(
      {data: view, width: 4, height: 2},
      TILES,
      'cup'
    );
    const sent = (worker.last().image as {data: Uint8ClampedArray}).data;
    expect(sent).not.toBe(view);
    expect(sent.length).toBe(32);
    worker.reply({type: 'result', id: worker.last().id, result: ok});
    await second;
  });

  it('requires a loaded model and a pixel buffer before searching', async () => {
    const {client} = setup();
    expect(() => client.search(frame(), TILES, 'cup')).toThrow(/Load/);
    const ready = await loaded();
    expect(() =>
      ready.client.search(
        {data: new Float32Array(4), width: 1, height: 1} as never,
        TILES,
        'cup'
      )
    ).toThrow(/Invalid camera frame/);
  });

  it('resets on search results that do not match the request', async () => {
    for (const result of [
      {...ok, scores: [0.3]},
      {...ok, probabilities: [0.9]},
      {...ok, scores: [0.3, Number.NaN]},
      {...ok, textMs: 'fast'},
      {scores: [0.3, 0.2], textMs: 1, visionMs: 2},
    ]) {
      const {client, worker} = await loaded();
      const pending = client.search(frame(), TILES, 'cup');
      worker.reply({type: 'result', id: worker.last().id, result});
      await expect(pending).rejects.toThrow(/Malformed/);
      expect(worker.terminated).toBe(true);
      expect(client.loaded).toBe(false);
    }
  });

  it('forwards download progress and ignores stale response IDs', async () => {
    const {client, workers} = setup();
    const onProgress = vi.fn();
    const download = client.download({onProgress});
    const worker = workers[0];
    const id = worker.last().id;
    worker.reply({
      type: 'progress',
      id,
      event: {loaded: 5, total: 10, file: 'a'},
    });
    worker.reply({type: 'result', id: 999, result: {}});
    expect(onProgress).toHaveBeenCalledWith({loaded: 5, total: 10, file: 'a'});
    worker.reply({type: 'result', id, result: {downloadedBytes: 10}});
    await expect(download).resolves.toEqual({downloadedBytes: 10});
    expect(client.loaded).toBe(false);
  });

  it('cancels a download cooperatively', async () => {
    const {client, workers} = setup();
    const download = client.download();
    const worker = workers[0];
    const downloadId = worker.last().id;
    const stopping = client.stop();
    const stop = worker.last();
    expect(stop).toMatchObject({type: 'stop', targetId: downloadId});
    worker.reply({
      type: 'error',
      id: downloadId,
      message: 'Download canceled.',
      fatal: false,
    });
    worker.reply({type: 'result', id: stop.id, result: {}});
    await expect(download).rejects.toThrow('Download canceled.');
    await stopping;
    expect(worker.terminated).toBe(false);
    expect(client.busy).toBe(false);
  });

  it('cancels loading by resetting the worker', async () => {
    const {client, workers} = setup();
    const load = client.load();
    await client.stop();
    await expect(load).rejects.toThrow(/canceled/);
    expect(workers[0].terminated).toBe(true);
    expect(client.state).toBe('idle');
  });

  it('recovers from worker crashes, fatal errors and malformed messages', async () => {
    for (const fail of [
      (worker: FakeWorker) => worker.onerror?.({message: 'boom'}),
      (worker: FakeWorker) =>
        worker.reply({
          type: 'error',
          id: worker.last().id,
          message: 'oom',
          fatal: true,
        }),
      (worker: FakeWorker) => worker.reply({type: 'weird', id: 1}),
      (worker: FakeWorker) => worker.onmessageerror?.(),
    ]) {
      const {client, worker} = await loaded();
      const pending = client.search(frame(), TILES, 'cup');
      fail(worker);
      await expect(pending).rejects.toThrow();
      expect(worker.terminated).toBe(true);
      expect(client.loaded).toBe(false);
      expect(client.resets).toBe(1);
      expect(client.state).toBe('idle');
    }
  });

  it('keeps the worker for non-fatal search errors', async () => {
    const {client, worker} = await loaded();
    const pending = client.search(frame(), TILES, 'cup');
    worker.reply({
      type: 'error',
      id: worker.last().id,
      message: 'bad',
      fatal: false,
    });
    await expect(pending).rejects.toThrow('bad');
    expect(client.loaded).toBe(true);
    expect(worker.terminated).toBe(false);
  });

  it('disposes gracefully, or terminates after a deadline', async () => {
    const {client, worker} = await loaded();
    const disposing = client.dispose();
    worker.reply({type: 'result', id: worker.last().id, result: {}});
    await disposing;
    expect(client.state).toBe('disposed');
    expect(worker.terminated).toBe(true);
    expect(() => client.check()).toThrow(/disposed/);

    vi.useFakeTimers();
    const other = await loaded();
    const slow = other.client.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    await slow;
    expect(other.worker.terminated).toBe(true);
    expect(other.client.state).toBe('disposed');
  });
});

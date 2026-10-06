// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';

import {CaptionsClient} from './CaptionsClient.js';

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
  const client = new CaptionsClient({
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

describe('CaptionsClient', () => {
  it('creates one worker lazily and tracks load state', async () => {
    const {client, workers, worker} = await loaded();
    expect(workers).toHaveLength(1);
    expect(worker.requests[0]).toEqual({id: 1, type: 'load'});
    expect(client.loaded).toBe(true);
    expect(client.state).toBe('ready');
    expect(() => client.load()).toThrow(/already loaded/);
  });

  it('transfers audio ownership and copies views of larger buffers', async () => {
    const {client, worker} = await loaded();
    const audio = new Float32Array(4);
    const pending = client.transcribe(audio);
    expect(worker.transfers.at(-1)).toEqual([audio.buffer]);
    expect(client.busy).toBe(true);
    expect(() => client.transcribe(new Float32Array(1))).toThrow(/busy/);
    worker.reply({
      type: 'result',
      id: worker.last().id,
      result: {text: 'hi', inferenceMs: 3, audioMs: 4},
    });
    await expect(pending).resolves.toEqual({
      text: 'hi',
      inferenceMs: 3,
      audioMs: 4,
    });

    const big = new Float32Array(8);
    const view = big.subarray(2, 4);
    const second = client.transcribe(view);
    const sent = worker.last().audio as Float32Array;
    expect(sent).not.toBe(view);
    expect(sent.length).toBe(2);
    worker.reply({
      type: 'result',
      id: worker.last().id,
      result: {text: '', inferenceMs: 1, audioMs: 1},
    });
    await second;
  });

  it('requires a loaded model and valid audio before transcribing', () => {
    const {client} = setup();
    expect(() => client.transcribe(new Float32Array(1))).toThrow(/Load/);
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
      const pending = client.transcribe(new Float32Array(2));
      fail(worker);
      await expect(pending).rejects.toThrow();
      expect(worker.terminated).toBe(true);
      expect(client.loaded).toBe(false);
      expect(client.resets).toBe(1);
      expect(client.state).toBe('idle');
    }
  });

  it('keeps the worker for non-fatal transcription errors', async () => {
    const {client, worker} = await loaded();
    const pending = client.transcribe(new Float32Array(2));
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

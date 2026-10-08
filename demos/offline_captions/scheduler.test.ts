import {describe, expect, it, vi} from 'vitest';

import {CaptionScheduler} from './scheduler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

type Result = {text: string; inferenceMs: number; audioMs: number};

function setup() {
  const calls: Array<{
    final: boolean;
    audio: Float32Array;
    job: ReturnType<typeof deferred<Result>>;
  }> = [];
  const callbacks = {
    transcribe: vi.fn((audio: Float32Array, {final}: {final: boolean}) => {
      const job = deferred<Result>();
      calls.push({final, audio, job});
      return job.promise;
    }),
    onPartial: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
  };
  return {calls, callbacks, scheduler: new CaptionScheduler(callbacks)};
}

const result = (text: string) => ({text, inferenceMs: 10, audioMs: 100});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CaptionScheduler', () => {
  it('runs partials only when idle', async () => {
    const {calls, callbacks, scheduler} = setup();
    expect(scheduler.requestPartial(1, new Float32Array(1))).toBe(true);
    expect(scheduler.requestPartial(1, new Float32Array(2))).toBe(false);
    calls[0].job.resolve(result('hel'));
    await flush();
    expect(callbacks.onPartial).toHaveBeenCalledWith(1, result('hel'));
    expect(scheduler.busy).toBe(false);
  });

  it('queues finals in order behind a running partial', async () => {
    const {calls, callbacks, scheduler} = setup();
    scheduler.requestPartial(1, new Float32Array(1));
    scheduler.submitFinal(1, new Float32Array(3), {endedAt: 5});
    scheduler.submitFinal(2, new Float32Array(4));
    expect(scheduler.requestPartial(3, new Float32Array(1))).toBe(false);
    expect(calls).toHaveLength(1);
    calls[0].job.resolve(result('stale partial'));
    await flush();
    // The partial for segment 1 is stale once its final was submitted.
    expect(callbacks.onPartial).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    expect(calls[1].final).toBe(true);
    calls[1].job.resolve(result('One.'));
    await flush();
    expect(callbacks.onFinal).toHaveBeenCalledWith(1, result('One.'), {
      endedAt: 5,
    });
    calls[2].job.resolve(result('Two.'));
    await flush();
    expect(callbacks.onFinal).toHaveBeenLastCalledWith(
      2,
      result('Two.'),
      undefined
    );
    expect(scheduler.busy).toBe(false);
  });

  it('drops queued and in-flight results after clear', async () => {
    const {calls, callbacks, scheduler} = setup();
    scheduler.submitFinal(1, new Float32Array(1));
    scheduler.submitFinal(2, new Float32Array(1));
    scheduler.clear();
    calls[0].job.resolve(result('old'));
    await flush();
    expect(callbacks.onFinal).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    scheduler.submitFinal(3, new Float32Array(1));
    calls[1].job.resolve(result('new'));
    await flush();
    expect(callbacks.onFinal).toHaveBeenCalledWith(3, result('new'), undefined);
  });

  it('reports errors, including synchronous throws, and keeps draining', async () => {
    const {calls, callbacks, scheduler} = setup();
    scheduler.submitFinal(1, new Float32Array(1));
    scheduler.submitFinal(2, new Float32Array(1));
    calls[0].job.reject(new Error('boom'));
    await flush();
    expect(callbacks.onError).toHaveBeenCalledWith(
      new Error('boom'),
      expect.objectContaining({id: 1, kind: 'final'})
    );
    calls[1].job.resolve(result('ok'));
    await flush();
    expect(callbacks.onFinal).toHaveBeenCalledWith(2, result('ok'), undefined);

    callbacks.transcribe.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    scheduler.submitFinal(3, new Float32Array(1));
    await flush();
    expect(callbacks.onError).toHaveBeenLastCalledWith(
      new Error('sync'),
      expect.objectContaining({id: 3})
    );
    expect(scheduler.busy).toBe(false);
  });
});

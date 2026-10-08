import {describe, expect, it, vi} from 'vitest';

import {TranslationQueue} from './translation.js';

type Result = {text: string; language: string; translateMs: number};

function deferred() {
  let resolve!: (value: Result) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Result>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

function setup(maxWaiting?: number) {
  const calls: {text: string; job: ReturnType<typeof deferred>}[] = [];
  const onResult = vi.fn();
  const onError = vi.fn();
  const onSkip = vi.fn();
  const queue = new TranslationQueue({
    translate: (text: string) => {
      const job = deferred();
      calls.push({text, job});
      return job.promise;
    },
    onResult,
    onError,
    onSkip,
    maxWaiting,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const reply = async (index: number, text: string) => {
    calls[index].job.resolve({text, language: 'es', translateMs: 5});
    await settle();
  };
  return {queue, calls, onResult, onError, onSkip, reply, settle};
}

describe('TranslationQueue', () => {
  it('translates finalized lines one at a time in order', async () => {
    const {queue, calls, onResult, reply} = setup();
    queue.submit(1, ' Hello. ', {at: 1});
    queue.submit(2, 'World.');
    expect(calls.map(({text}) => text)).toEqual(['Hello.']);
    expect(queue.busy).toBe(true);
    await reply(0, 'Hola.');
    expect(onResult).toHaveBeenCalledWith(
      1,
      {text: 'Hola.', language: 'es', translateMs: 5},
      {at: 1}
    );
    expect(calls.map(({text}) => text)).toEqual(['Hello.', 'World.']);
    await reply(1, 'Mundo.');
    expect(onResult).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({text: 'Mundo.'}),
      undefined
    );
    expect(queue.busy).toBe(false);
  });

  it('ignores empty lines and coalesces a repeated id', async () => {
    const {queue, calls, reply} = setup();
    queue.submit(1, '   ');
    expect(calls).toHaveLength(0);
    queue.submit(1, 'One.');
    queue.submit(1, 'One again.');
    queue.submit(2, 'Two.');
    queue.submit(2, 'Two, corrected.');
    await reply(0, 'Uno.');
    expect(calls.map(({text}) => text)).toEqual(['One.', 'Two, corrected.']);
  });

  it('skips the oldest waiting line when too many are queued', async () => {
    const {queue, calls, onSkip, reply} = setup(2);
    for (let id = 1; id <= 5; id++) queue.submit(id, `Line ${id}.`);
    expect(onSkip.mock.calls.map(([id]) => id)).toEqual([2, 3]);
    await reply(0, 'A');
    await reply(1, 'B');
    expect(calls.map(({text}) => text)).toEqual([
      'Line 1.',
      'Line 4.',
      'Line 5.',
    ]);
  });

  it('drops in-flight and waiting results after clear', async () => {
    const {queue, calls, onResult, reply} = setup();
    queue.submit(1, 'Old.');
    queue.submit(2, 'Also old.');
    queue.clear();
    queue.submit(3, 'New.');
    // The worker is still busy with the stale line, so nothing new starts yet.
    expect(calls).toHaveLength(1);
    await reply(0, 'Viejo.');
    expect(onResult).not.toHaveBeenCalled();
    expect(calls.map(({text}) => text)).toEqual(['Old.', 'New.']);
    await reply(1, 'Nuevo.');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toBe(3);
  });

  it('reports errors for the current generation only and keeps going', async () => {
    const {queue, calls, onError, settle, reply} = setup();
    queue.submit(1, 'Fails.');
    queue.submit(2, 'Next.');
    calls[0].job.reject('boom');
    await settle();
    expect(onError).toHaveBeenCalledWith(new Error('boom'), 1);
    queue.clear();
    calls[1].job.reject(new Error('stale'));
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    queue.submit(3, 'Later.');
    await reply(2, 'Luego.');
    expect(queue.busy).toBe(false);
  });

  it('turns a synchronous translate throw into an error callback', async () => {
    const onError = vi.fn();
    const queue = new TranslationQueue({
      translate: () => {
        throw new Error('not loaded');
      },
      onResult: vi.fn(),
      onError,
    });
    queue.submit(7, 'Hi.');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledWith(new Error('not loaded'), 7);
    expect(queue.busy).toBe(false);
  });
});

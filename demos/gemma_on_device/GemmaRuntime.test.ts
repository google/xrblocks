// @vitest-environment node

import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';

import {GemmaRuntime} from './GemmaRuntime.js';

type Message = {
  content?: string | Array<{type: string; text?: string}>;
  channels?: Record<string, string>;
};

function stream(...messages: Message[]) {
  return new ReadableStream<Message>({
    start(controller) {
      for (const message of messages) controller.enqueue(message);
      controller.close();
    },
  });
}

function pendingStream() {
  let controller!: ReadableStreamDefaultController<Message>;
  const body = new ReadableStream<Message>({
    start(value) {
      controller = value;
    },
  });
  return {
    body,
    get controller() {
      return controller;
    },
  };
}

function conversation() {
  return {
    sendMessageStreaming: vi.fn((_message: string) =>
      stream({content: 'Hello'})
    ),
    getTokenCount: vi.fn(async () => 100),
    getBenchmarkInfo: vi.fn(async () => ({
      lastDecodeTokensPerSecond: 24,
      lastDecodeTokenCount: 6,
    })),
    cancel: vi.fn(),
    delete: vi.fn(async () => {}),
  };
}

function setup() {
  const conversations: ReturnType<typeof conversation>[] = [];
  const engine = {
    createConversation: vi.fn(async (_options: unknown) => {
      const next = conversation();
      conversations.push(next);
      return next;
    }),
    delete: vi.fn(async () => {}),
  };
  const library = {
    Backend: {GPU_ARTISAN: 'gpu-artisan'},
    SamplerType: {GREEDY: 3},
    Engine: {create: vi.fn(async (_options: unknown) => engine)},
  };
  const loadRuntime = vi.fn(async () => library);
  const model = new ReadableStream<Uint8Array>();
  const openModel = vi.fn(async () => model);
  const postMessage = vi.fn();
  const close = vi.fn();
  const runtime = new GemmaRuntime({
    loadRuntime,
    openModel,
    postMessage,
    close,
  });
  return {
    runtime,
    engine,
    library,
    conversations,
    loadRuntime,
    openModel,
    model,
    postMessage,
    close,
  };
}

async function loaded() {
  const fixture = setup();
  await fixture.runtime.handle({type: 'load', id: 1});
  fixture.postMessage.mockClear();
  return fixture;
}

afterEach(() => vi.restoreAllMocks());

describe('GemmaRuntime loading and protocol', () => {
  it('opens the cached stream in the worker and initializes bounded text-only inference', async () => {
    const {
      runtime,
      model,
      library,
      engine,
      postMessage,
      loadRuntime,
      openModel,
    } = setup();
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(openModel).not.toHaveBeenCalled();
    await runtime.handle({type: 'load', id: 1});
    expect(library.Engine.create).toHaveBeenCalledExactlyOnceWith({
      model,
      backend: 'gpu-artisan',
      benchmarkEnabled: true,
      mainExecutorSettings: {maxNumTokens: 8192},
    });
    expect(engine.createConversation).toHaveBeenCalledExactlyOnceWith({
      sessionConfig: {
        maxOutputTokens: 256,
        samplerParams: {type: 3, k: 1, temperature: 0, seed: 0},
      },
      preface: {
        messages: [
          {
            role: 'system',
            content: expect.stringMatching(/metadata.*not.*vision/i),
          },
        ],
        extra_context: {enable_thinking: false},
      },
    });
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'result',
      id: 1,
      result: {contextTokens: 100},
    });
    await runtime.handle({type: 'reset', id: 2});
    expect(engine.createConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionConfig: {
          maxOutputTokens: 256,
          samplerParams: {type: 3, k: 1, temperature: 0, seed: 0},
        },
      })
    );
  });

  it('keeps the proven classic-worker runtime and WASM locations pinned', () => {
    const source = readFileSync(
      new URL('./gemmaWorker.js', import.meta.url),
      'utf8'
    );
    expect(source).toContain(
      'https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle'
    );
    expect(source).toContain(
      'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.1/wasm/'
    );
    expect(source).toContain('self.Module');
    expect(source).toContain('locateFile');
    expect(source).toContain("import('./modelStore.js')");
    expect(source).not.toMatch(/\b(window|document)\b/);
  });

  it('returns missing-cache errors without creating an engine or downloading', async () => {
    const {runtime, openModel, library, postMessage} = setup();
    openModel.mockRejectedValueOnce(new Error('No complete cached model.'));
    await runtime.handle({type: 'load', id: 1});
    expect(library.Engine.create).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        id: 1,
        name: 'Error',
        message: 'No complete cached model.',
      })
    );
    await runtime.handle({type: 'load', id: 2});
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'result',
      id: 2,
      result: {contextTokens: 100},
    });
  });

  it('deletes an engine after conversation initialization failure', async () => {
    const {runtime, engine, postMessage} = setup();
    engine.createConversation.mockRejectedValueOnce(
      new Error('Preface failed')
    );
    await runtime.handle({type: 'load', id: 1});
    expect(engine.delete).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'error', id: 1, message: 'Preface failed'})
    );
  });

  it('rejects overlapping load/send/reset commands and ignores malformed or stale cancellation', async () => {
    const {runtime, loadRuntime, library, postMessage} = setup();
    const importing = Promise.withResolvers<typeof library>();
    loadRuntime.mockReturnValueOnce(importing.promise);
    const loading = runtime.handle({type: 'load', id: 1});
    await runtime.handle({type: 'load', id: 2});
    await runtime.handle({type: 'send', id: 3, message: 'Hi'});
    await runtime.handle({type: 'reset', id: 4});
    expect(postMessage.mock.calls).toHaveLength(3);
    for (const [message] of postMessage.mock.calls)
      expect(message).toMatchObject({
        type: 'error',
        message: expect.stringMatching(/busy/i),
      });
    await runtime.handle(null);
    await runtime.handle({type: 'cancel', id: 900});
    importing.resolve(library);
    await loading;
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'result',
      id: 1,
      result: {contextTokens: 100},
    });
    await runtime.handle({type: 'unknown', id: 5});
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'error', id: 5})
    );
  });
});

describe('GemmaRuntime streaming and cancellation', () => {
  it('posts only visible ordered deltas followed by genuine benchmark and context counts', async () => {
    const {runtime, conversations, postMessage, engine} = await loaded();
    const current = conversations[0];
    current.sendMessageStreaming.mockReturnValueOnce(
      stream(
        {content: '', channels: {thinking: 'Hidden'}},
        {content: 'Amber'},
        {
          content: [
            {type: 'text', text: ' cube'},
            {type: 'image'},
            {type: 'text', text: '.'},
          ],
        },
        {channels: {thinking: 'Do not display'}}
      )
    );
    current.getTokenCount.mockResolvedValueOnce(456);
    await runtime.handle({type: 'send', id: 2, message: 'Describe the scene'});
    expect(current.sendMessageStreaming).toHaveBeenCalledWith(
      'Describe the scene'
    );
    expect(postMessage.mock.calls).toEqual([
      [{type: 'delta', id: 2, text: 'Amber'}],
      [{type: 'delta', id: 2, text: ' cube.'}],
      [
        {
          type: 'result',
          id: 2,
          result: {
            interrupted: false,
            contextTokens: 456,
            benchmark: {lastDecodeTokensPerSecond: 24, lastDecodeTokenCount: 6},
          },
        },
      ],
    ]);
    await runtime.handle({type: 'send', id: 3, message: 'Follow up'});
    expect(engine.createConversation).toHaveBeenCalledOnce();
  });

  it('cancels outside the command queue, waits for stream settlement and deletion, then starts fresh', async () => {
    const {runtime, conversations, postMessage, engine} = await loaded();
    const current = conversations[0];
    const pending = pendingStream();
    current.sendMessageStreaming.mockReturnValueOnce(pending.body);
    const sending = runtime.handle({type: 'send', id: 2, message: 'Hi'});
    await vi.waitFor(() =>
      expect(current.sendMessageStreaming).toHaveBeenCalled()
    );
    pending.controller.enqueue({content: 'Partial'});
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({
        type: 'delta',
        id: 2,
        text: 'Partial',
      })
    );
    await runtime.handle({type: 'cancel', id: 100});
    expect(current.cancel).not.toHaveBeenCalled();
    await runtime.handle({type: 'cancel', id: 2});
    await runtime.handle({type: 'cancel', id: 2});
    expect(current.cancel).toHaveBeenCalledOnce();
    expect(current.delete).not.toHaveBeenCalled();
    await runtime.handle({type: 'reset', id: 3});
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        id: 3,
        message: expect.stringMatching(/busy/i),
      })
    );
    const deletion = Promise.withResolvers<void>();
    current.delete.mockReturnValueOnce(deletion.promise);
    pending.controller.enqueue({content: 'Late'});
    pending.controller.error(new DOMException('Canceled', 'AbortError'));
    await vi.waitFor(() => expect(current.delete).toHaveBeenCalled());
    expect(
      postMessage.mock.calls.some(
        ([message]) => message.type === 'result' && message.id === 2
      )
    ).toBe(false);
    deletion.resolve();
    await sending;
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'result',
      id: 2,
      result: {interrupted: true, contextTokens: 0, benchmark: null},
    });
    expect(current.getBenchmarkInfo).not.toHaveBeenCalled();
    await runtime.handle({type: 'send', id: 4, message: 'Fresh'});
    expect(engine.createConversation).toHaveBeenCalledTimes(2);
    expect(conversations[1].sendMessageStreaming).toHaveBeenCalledOnce();
  });

  it('reports generation failure until an explicit reset and reports GPU errors as fatal', async () => {
    const {runtime, conversations, postMessage} = await loaded();
    conversations[0].sendMessageStreaming.mockImplementationOnce(() => {
      throw new Error('Context full');
    });
    await runtime.handle({type: 'send', id: 2, message: 'Hi'});
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'error',
      id: 2,
      name: 'Error',
      message: 'Context full',
      fatal: false,
    });
    await runtime.handle({type: 'send', id: 3, message: 'Again'});
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        id: 3,
        message: expect.stringMatching(/new chat|reset/i),
      })
    );
    await runtime.handle({type: 'reset', id: 4});
    expect(conversations[0].delete).toHaveBeenCalledOnce();
    conversations[1].getTokenCount.mockRejectedValueOnce(
      new Error('GPU device lost')
    );
    await runtime.handle({type: 'send', id: 5, message: 'Hi'});
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'error', id: 5, fatal: true})
    );
  });

  it('does not hide fatal failure after cancellation and does not reuse failed cleanup', async () => {
    const {runtime, conversations, postMessage} = await loaded();
    const current = conversations[0];
    const pending = pendingStream();
    current.sendMessageStreaming.mockReturnValueOnce(pending.body);
    const sending = runtime.handle({type: 'send', id: 2, message: 'Hi'});
    await vi.waitFor(() =>
      expect(current.sendMessageStreaming).toHaveBeenCalled()
    );
    current.cancel.mockImplementationOnce(() => {
      throw new Error('GPU cancellation failed');
    });
    await runtime.handle({type: 'cancel', id: 2});
    expect(current.delete).not.toHaveBeenCalled();
    pending.controller.close();
    await sending;
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        id: 2,
        message: 'GPU cancellation failed',
        fatal: true,
      })
    );
  });

  it('marks cancellation cleanup failure fatal rather than reusing the poisoned session', async () => {
    const {runtime, conversations, postMessage} = await loaded();
    const current = conversations[0];
    const pending = pendingStream();
    current.sendMessageStreaming.mockReturnValueOnce(pending.body);
    const sending = runtime.handle({type: 'send', id: 2, message: 'Hi'});
    await vi.waitFor(() =>
      expect(current.sendMessageStreaming).toHaveBeenCalled()
    );
    current.delete.mockRejectedValueOnce(new Error('Delete failed'));
    await runtime.handle({type: 'cancel', id: 2});
    pending.controller.close();
    await sending;
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'error',
        id: 2,
        message: 'Delete failed',
        fatal: true,
      })
    );
  });

  it('reports fresh-context capacity when Stop arrives during benchmark collection', async () => {
    const {runtime, conversations, postMessage} = await loaded();
    const current = conversations[0];
    const benchmark = Promise.withResolvers<{
      lastDecodeTokensPerSecond: number;
      lastDecodeTokenCount: number;
    }>();
    current.getBenchmarkInfo.mockReturnValueOnce(benchmark.promise);
    current.getTokenCount.mockResolvedValueOnce(7000);
    const sending = runtime.handle({type: 'send', id: 2, message: 'Hi'});
    await vi.waitFor(() => expect(current.getBenchmarkInfo).toHaveBeenCalled());
    await runtime.handle({type: 'cancel', id: 2});
    expect(current.cancel).not.toHaveBeenCalled();
    benchmark.resolve({lastDecodeTokensPerSecond: 24, lastDecodeTokenCount: 6});
    await sending;
    expect(current.delete).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'result',
      id: 2,
      result: {interrupted: true, contextTokens: 0, benchmark: null},
    });
  });
});

describe('GemmaRuntime disposal', () => {
  it('waits for generation to settle, deletes conversation before engine, then closes', async () => {
    const {runtime, conversations, engine, postMessage, close} = await loaded();
    const current = conversations[0];
    const pending = pendingStream();
    current.sendMessageStreaming.mockReturnValueOnce(pending.body);
    const sending = runtime.handle({type: 'send', id: 2, message: 'Hi'});
    await vi.waitFor(() =>
      expect(current.sendMessageStreaming).toHaveBeenCalled()
    );
    const disposing = runtime.handle({type: 'dispose', id: 3});
    expect(current.cancel).toHaveBeenCalledOnce();
    expect(current.delete).not.toHaveBeenCalled();
    expect(engine.delete).not.toHaveBeenCalled();
    pending.controller.close();
    await Promise.all([sending, disposing]);
    expect(current.delete).toHaveBeenCalledOnce();
    expect(engine.delete).toHaveBeenCalledOnce();
    expect(current.delete.mock.invocationCallOrder[0]).toBeLessThan(
      engine.delete.mock.invocationCallOrder[0]
    );
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'result',
      id: 3,
      result: {},
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for engine initialization and skips late conversation creation', async () => {
    const {runtime, engine, library, close} = setup();
    const creating = Promise.withResolvers<typeof engine>();
    library.Engine.create.mockReturnValueOnce(creating.promise);
    const loading = runtime.handle({type: 'load', id: 1});
    await vi.waitFor(() => expect(library.Engine.create).toHaveBeenCalled());
    const disposing = runtime.handle({type: 'dispose', id: 2});
    expect(engine.delete).not.toHaveBeenCalled();
    creating.resolve(engine);
    await Promise.all([loading, disposing]);
    expect(engine.createConversation).not.toHaveBeenCalled();
    expect(engine.delete).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for reset deletion without creating another conversation', async () => {
    const {runtime, conversations, engine} = await loaded();
    const deletion = Promise.withResolvers<void>();
    conversations[0].delete.mockReturnValueOnce(deletion.promise);
    const resetting = runtime.handle({type: 'reset', id: 2});
    await vi.waitFor(() => expect(conversations[0].delete).toHaveBeenCalled());
    const disposing = runtime.handle({type: 'dispose', id: 3});
    deletion.resolve();
    await Promise.all([resetting, disposing]);
    expect(conversations[0].delete).toHaveBeenCalledOnce();
    expect(engine.createConversation).toHaveBeenCalledOnce();
    expect(engine.delete).toHaveBeenCalledOnce();
  });

  it('attempts engine cleanup even when conversation deletion fails and closes with an error', async () => {
    const {runtime, conversations, engine, postMessage, close} = await loaded();
    conversations[0].delete.mockRejectedValueOnce(new Error('Delete failed'));
    await runtime.handle({type: 'dispose', id: 2});
    expect(engine.delete).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({type: 'error', id: 2, message: 'Delete failed'})
    );
    expect(close).toHaveBeenCalledOnce();
  });
});

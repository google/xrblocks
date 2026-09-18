import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {LiveConnectParameters, Session} from '@google/genai';

import {AI} from './AI';
import {GeminiOptions, OpenAIOptions} from './AIOptions';
import {Gemini} from './Gemini';
import {OpenAI} from './OpenAI';

const {connect} = vi.hoisted(() => ({
  connect: vi.fn<(params: LiveConnectParameters) => Promise<Session>>(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    live = {connect};
  },
  EndSensitivity: {},
  StartSensitivity: {},
  Modality: {AUDIO: 'AUDIO'},
  createPartFromUri: vi.fn(),
  createUserContent: vi.fn(),
}));

function createSession() {
  const session: Pick<Session, 'close'> = {close: vi.fn()};
  return session as Session;
}

function pendingConnection() {
  let resolve!: (session: Session) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Session>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function callbacks(index = 0) {
  return connect.mock.calls[index][0].callbacks;
}

async function pendingStart(gemini: Gemini) {
  const connection = pendingConnection();
  connect.mockReturnValueOnce(connection.promise);
  const started = gemini.startLiveSession();
  // Allow the provider call to begin without completing the connection.
  await Promise.resolve();
  return {connection, started};
}

let gemini: Gemini;

beforeEach(async () => {
  connect.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  gemini = new Gemini(new GeminiOptions());
  await gemini.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gemini live sessions', () => {
  it('shares one connection between concurrent starts', async () => {
    const {connection, started} = await pendingStart(gemini);
    const second = gemini.startLiveSession({}, 'ignored-second-model');
    const session = createSession();
    connection.resolve(session);

    expect(await started).toBe(session);
    expect(await second).toBe(session);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(gemini.liveSession).toBe(session);
  });

  it('shares the pending connection with a start reentered from onopen', async () => {
    const session = createSession();
    let joined: Promise<Session> | undefined;
    gemini.setLiveCallbacks({
      onmessage: vi.fn(),
      onopen: vi.fn().mockImplementationOnce(() => {
        joined = gemini.startLiveSession();
      }),
    });
    connect.mockImplementationOnce(async ({callbacks}) => {
      callbacks.onopen?.();
      return session;
    });

    expect(await gemini.startLiveSession()).toBe(session);
    expect(await joined).toBe(session);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('cancels an immediate start/stop before invoking the provider', async () => {
    const started = gemini.startLiveSession();
    const result = expect(started).rejects.toMatchObject({name: 'AbortError'});

    await gemini.stopLiveSession();

    await result;
    expect(connect).not.toHaveBeenCalled();
    expect(gemini.isLiveMode).toBe(false);
  });

  it('reuses an established session and forwards the first config', async () => {
    const session = createSession();
    connect.mockResolvedValue(session);
    const first = await gemini.startLiveSession(
      {inputAudioTranscription: {}},
      'custom-live-model'
    );

    expect(await gemini.startLiveSession()).toBe(first);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-live-model',
        config: expect.objectContaining({inputAudioTranscription: {}}),
      })
    );
  });

  it('closes a late connection after stop and rejects its start', async () => {
    const {connection, started} = await pendingStart(gemini);
    const result = expect(started).rejects.toMatchObject({name: 'AbortError'});

    await gemini.stopLiveSession();
    callbacks().onopen?.();
    const session = createSession();
    connection.resolve(session);

    await result;
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
  });

  it('keeps a replacement session when the cancelled connection resolves', async () => {
    const first = await pendingStart(gemini);
    const firstResult = expect(first.started).rejects.toMatchObject({
      name: 'AbortError',
    });
    await gemini.stopLiveSession();
    const second = await pendingStart(gemini);
    const current = createSession();
    callbacks(1).onopen?.();
    second.connection.resolve(current);
    await second.started;

    const cancelled = createSession();
    first.connection.resolve(cancelled);
    await firstResult;

    expect(cancelled.close).toHaveBeenCalledTimes(1);
    expect(current.close).not.toHaveBeenCalled();
    expect(gemini.liveSession).toBe(current);
    expect(gemini.isLiveMode).toBe(true);
  });

  it('does not clear a newer pending start when an older one fails', async () => {
    const first = await pendingStart(gemini);
    const firstResult = expect(first.started).rejects.toThrow('old failure');
    await gemini.stopLiveSession();
    const second = await pendingStart(gemini);

    first.connection.reject(new Error('old failure'));
    await firstResult;
    const joined = gemini.startLiveSession();
    const session = createSession();
    second.connection.resolve(session);

    expect(await second.started).toBe(session);
    expect(await joined).toBe(session);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from an older session after a restart', async () => {
    const first = createSession();
    const second = createSession();
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await gemini.startLiveSession();
    callbacks().onopen?.();
    await gemini.stopLiveSession();
    await gemini.startLiveSession();
    callbacks(1).onopen?.();
    const liveCallbacks = {
      onopen: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onclose: vi.fn(),
    };
    gemini.setLiveCallbacks(liveCallbacks);

    callbacks().onopen?.();
    callbacks().onmessage({text: undefined, data: undefined});
    callbacks().onerror?.(new ErrorEvent('error'));
    callbacks().onclose?.(new CloseEvent('close'));

    for (const callback of Object.values(liveCallbacks)) {
      expect(callback).not.toHaveBeenCalled();
    }
    expect(gemini.liveSession).toBe(second);
    expect(gemini.isLiveMode).toBe(true);
  });

  it('forwards current callbacks and clears the session on remote close', async () => {
    const session = createSession();
    connect.mockResolvedValue(session);
    const liveCallbacks = {
      onopen: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onclose: vi.fn(),
    };
    gemini.setLiveCallbacks(liveCallbacks);
    await gemini.startLiveSession();
    const error = new ErrorEvent('error');
    const close = new CloseEvent('close', {reason: 'remote shutdown'});

    callbacks().onopen?.();
    const message = {text: undefined, data: undefined};
    callbacks().onmessage(message);
    callbacks().onerror?.(error);
    expect(gemini.isLiveMode).toBe(true);
    callbacks().onclose?.(close);

    expect(liveCallbacks.onopen).toHaveBeenCalledTimes(1);
    expect(liveCallbacks.onmessage).toHaveBeenCalledWith(message);
    expect(liveCallbacks.onerror).toHaveBeenCalledWith(error);
    expect(liveCallbacks.onclose).toHaveBeenCalledWith(close);
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
  });

  it('preserves the local stop close notification without a restart', async () => {
    const session = createSession();
    connect.mockResolvedValue(session);
    const onclose = vi.fn();
    gemini.setLiveCallbacks({onmessage: vi.fn(), onclose});
    await gemini.startLiveSession();

    await gemini.stopLiveSession();
    const event = new CloseEvent('close');
    callbacks().onclose?.(event);

    expect(onclose).toHaveBeenCalledWith(event);
  });

  it('does not adopt a session that closed before connect resolved', async () => {
    const {connection, started} = await pendingStart(gemini);
    const result = expect(started).rejects.toMatchObject({name: 'AbortError'});
    callbacks().onopen?.();
    callbacks().onclose?.(new CloseEvent('close'));
    const session = createSession();
    connection.resolve(session);

    await result;
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
  });

  it('resets state after a failed connection and permits retry', async () => {
    const {connection, started} = await pendingStart(gemini);
    const result = expect(started).rejects.toThrow('connect failed');
    callbacks().onopen?.();
    connection.reject(new Error('connect failed'));
    await result;

    expect(gemini.isLiveMode).toBe(false);
    expect(gemini.liveSession).toBeUndefined();
    const session = createSession();
    connect.mockResolvedValueOnce(session);
    expect(await gemini.startLiveSession()).toBe(session);
  });

  it('closes an established session only once on repeated stops', async () => {
    const session = createSession();
    connect.mockResolvedValue(session);
    await gemini.startLiveSession();
    callbacks().onopen?.();

    await gemini.stopLiveSession();
    await gemini.stopLiveSession();

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
  });
});

describe('AI synchronous disposal', () => {
  it('closes the active Gemini session synchronously and only once', async () => {
    const ai = new AI();
    ai.model = gemini;
    const session = createSession();
    connect.mockResolvedValue(session);
    await ai.startLiveSession();
    callbacks().onopen?.();

    expect(ai.dispose()).toBeUndefined();
    expect(session.close).toHaveBeenCalledTimes(1);
    ai.dispose();
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(ai.getLiveSessionStatus()).toMatchObject({
      isActive: false,
      hasSession: false,
    });
  });

  it('invalidates an in-flight start without returning a teardown promise', async () => {
    const ai = new AI();
    ai.model = gemini;
    const connection = pendingConnection();
    connect.mockReturnValueOnce(connection.promise);
    const started = ai.startLiveSession();
    const result = expect(started).rejects.toMatchObject({name: 'AbortError'});
    await Promise.resolve();

    expect(ai.dispose()).toBeUndefined();
    const onopen = vi.fn();
    ai.setLiveCallbacks({onmessage: vi.fn(), onopen});
    callbacks().onopen?.();
    const session = createSession();
    connection.resolve(session);

    await result;
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(onopen).not.toHaveBeenCalled();
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
  });

  it('leaves a pending connect failure on the original start promise', async () => {
    const ai = new AI();
    ai.model = gemini;
    const {connection, started} = await pendingStart(gemini);
    const result = expect(started).rejects.toThrow('connect failed');

    expect(ai.dispose()).toBeUndefined();
    connection.reject(new Error('connect failed'));

    await result;
    expect(gemini.liveSession).toBeUndefined();
  });

  it('surfaces close failures synchronously after invalidating state', async () => {
    const ai = new AI();
    ai.model = gemini;
    const session = createSession();
    vi.mocked(session.close).mockImplementation(() => {
      throw new Error('close failed');
    });
    connect.mockResolvedValue(session);
    await ai.startLiveSession();
    callbacks().onopen?.();

    expect(() => ai.dispose()).toThrow('close failed');
    expect(gemini.liveSession).toBeUndefined();
    expect(gemini.isLiveMode).toBe(false);
    expect(() => ai.dispose()).not.toThrow();
  });

  it('supports an uninitialized AI and the non-live OpenAI backend', () => {
    const ai = new AI();
    expect(ai.dispose()).toBeUndefined();
    ai.model = new OpenAI(new OpenAIOptions());
    expect(ai.dispose()).toBeUndefined();
  });
});

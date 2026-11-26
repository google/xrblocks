import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {LiveConnectParameters, Session} from '@google/genai';
import {AI} from './AI';
import {AIOptions} from './AIOptions';
import {Gemini} from './Gemini';

// Replace the remote provider boundary. AI and Gemini run their real code.
const {connect, createInteraction, clientConfigs, liveConnectClients} =
  vi.hoisted(() => ({
    connect: vi.fn<(params: LiveConnectParameters) => Promise<Session>>(),
    createInteraction: vi.fn(),
    clientConfigs: [] as Array<{apiKey: string; apiVersion?: string}>,
    liveConnectClients: [] as Array<{apiKey: string; apiVersion?: string}>,
  }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    live: {connect: typeof connect};
    interactions = {create: createInteraction};
    constructor({
      apiKey,
      httpOptions,
    }: {
      apiKey: string;
      httpOptions?: {apiVersion?: string};
    }) {
      const config = {apiKey, apiVersion: httpOptions?.apiVersion};
      clientConfigs.push(config);
      this.live = {
        connect: ((params: LiveConnectParameters) => {
          liveConnectClients.push(config);
          return connect(params);
        }) as unknown as typeof connect,
      };
    }
  },
  EndSensitivity: {},
  StartSensitivity: {},
  Modality: {AUDIO: 'AUDIO'},
}));

function session() {
  const close = vi.fn();
  return {value: {close} as unknown as Session, close};
}
function pending() {
  let resolve!: (session: Session) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Session>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
const callbacks = (index = 0) => connect.mock.calls[index][0].callbacks;

let ai: AI;
let gemini: Gemini;
beforeEach(async () => {
  connect.mockReset();
  createInteraction.mockReset();
  clientConfigs.length = 0;
  liveConnectClients.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const options = new AIOptions();
  options.enabled = options.gemini.enabled = true;
  options.gemini.apiKey = 'query-key';
  ai = new AI();
  await ai.init({aiOptions: options});
  gemini = ai.model as Gemini;
});
afterEach(() => {
  ai.dispose();
  gemini.dispose();
  vi.restoreAllMocks();
});

async function startPending() {
  const connection = pending();
  const expectedCalls = connect.mock.calls.length + 1;
  connect.mockReturnValueOnce(connection.promise);
  const started = ai.startLiveSession();
  for (let i = 0; i < 5 && connect.mock.calls.length < expectedCalls; i++) {
    await Promise.resolve();
  }
  expect(connect).toHaveBeenCalledTimes(expectedCalls);
  return {connection, started};
}

describe('Gemini Live through AI', () => {
  it('connects API-key Live sessions on v1beta instead of default v1', async () => {
    const live = session();
    connect.mockResolvedValueOnce(live.value);
    await ai.startLiveSession();
    expect(liveConnectClients).toEqual([
      {apiKey: 'query-key', apiVersion: 'v1beta'},
    ]);
    expect(clientConfigs).toContainEqual({
      apiKey: 'query-key',
      apiVersion: undefined,
    });
  });

  it('obtains a fresh token on restart through the AI options', async () => {
    const tokens = ['auth_tokens/first', 'auth_tokens/second'];
    ai.options.gemini.tokenProvider = async () => tokens.shift()!;
    const first = session(),
      second = session();
    connect
      .mockResolvedValueOnce(first.value)
      .mockResolvedValueOnce(second.value);
    await ai.startLiveSession();
    await ai.stopLiveSession();
    await ai.startLiveSession();
    expect(liveConnectClients).toEqual([
      {apiKey: 'auth_tokens/first', apiVersion: 'v1alpha'},
      {apiKey: 'auth_tokens/second', apiVersion: 'v1alpha'},
    ]);
    expect(first.close).toHaveBeenCalledOnce();
    expect(ai.getLiveSessionStatus().hasSession).toBe(true);
  });

  it('rejects a failed token request and permits a later start', async () => {
    ai.options.gemini.tokenProvider = async () => {
      throw new Error('Token service unavailable');
    };
    await expect(ai.startLiveSession()).rejects.toThrow(
      'Token service unavailable'
    );
    expect(ai.getLiveSessionStatus().hasSession).toBe(false);
    expect(connect).not.toHaveBeenCalled();
    ai.options.gemini.tokenProvider = async () => 'auth_tokens/retry';
    const live = session();
    connect.mockResolvedValueOnce(live.value);
    await expect(ai.startLiveSession()).resolves.toBe(live.value);
  });

  it('does not open a connection with a token returned after cancellation', async () => {
    let resolve!: (token: string) => void;
    ai.options.gemini.tokenProvider = () =>
      new Promise<string>((yes) => {
        resolve = yes;
      });
    const started = ai.startLiveSession();
    const cancelled = expect(started).rejects.toMatchObject({
      name: 'AbortError',
    });
    await Promise.resolve();
    await ai.stopLiveSession();
    resolve('auth_tokens/cancelled');
    await cancelled;
    expect(connect).not.toHaveBeenCalled();
  });

  it('shares a pending connection across concurrent and reentrant starts', async () => {
    const {connection, started} = await startPending();
    const joined = ai.startLiveSession();
    let reentered: Promise<Session> | undefined;
    await ai.setLiveCallbacks({
      onmessage() {},
      onopen() {
        reentered = ai.startLiveSession();
      },
    });
    callbacks().onopen?.();
    const live = session();
    connection.resolve(live.value);
    expect(await started).toBe(live.value);
    expect(await joined).toBe(live.value);
    expect(await reentered).toBe(live.value);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('keeps a replacement session when a cancelled connection and stale callbacks arrive', async () => {
    const first = await startPending();
    const cancelled = expect(first.started).rejects.toMatchObject({
      name: 'AbortError',
    });
    await ai.stopLiveSession();
    const second = await startPending();
    const current = session();
    second.connection.resolve(current.value);
    await second.started;
    const messages: unknown[] = [];
    await ai.setLiveCallbacks({onmessage: (message) => messages.push(message)});
    const late = session();
    first.connection.resolve(late.value);
    await cancelled;
    callbacks().onmessage({text: 'stale'} as never);
    callbacks().onclose?.(new CloseEvent('close'));
    expect(late.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    callbacks(1).onopen?.();
    callbacks(1).onmessage({text: 'current'} as never);
    expect(messages).toEqual([{text: 'current'}]);
    callbacks(1).onclose?.(new CloseEvent('close'));
    expect(ai.getLiveSessionStatus().hasSession).toBe(false);
  });

  it('rejects a connection closed during setup and releases a late native session', async () => {
    const {connection, started} = await startPending();
    const closed = expect(started).rejects.toMatchObject({
      name: 'GeminiLiveSessionClosedError',
      code: 1007,
    });
    callbacks().onclose?.(
      new CloseEvent('close', {code: 1007, reason: 'Invalid payload'})
    );
    const late = session();
    connection.resolve(late.value);
    await closed;
    await Promise.resolve();
    expect(late.close).toHaveBeenCalledOnce();
    expect(ai.getLiveSessionStatus().hasSession).toBe(false);
  });

  it('can retry after a connection failure', async () => {
    const {connection, started} = await startPending();
    const failed = expect(started).rejects.toThrow('Connection failed');
    connection.reject(new Error('Connection failed'));
    await failed;
    const live = session();
    connect.mockResolvedValueOnce(live.value);
    await expect(ai.startLiveSession()).resolves.toBe(live.value);
  });

  it.each(['pending', 'active'])(
    'releases a %s session when its script is disposed',
    async (phase) => {
      const {connection, started} = await startPending();
      const live = session();
      if (phase === 'active') {
        connection.resolve(live.value);
        await started;
      }
      const cancelled =
        phase === 'pending'
          ? expect(started).rejects.toMatchObject({name: 'AbortError'})
          : undefined;
      ai.dispose();
      ai.dispose();
      if (phase === 'pending') {
        connection.resolve(live.value);
        await cancelled;
      }
      expect(live.close).toHaveBeenCalledOnce();
      expect(ai.getLiveSessionStatus()).toMatchObject({
        hasSession: false,
        isActive: false,
      });
    }
  );
});

describe('Gemini queries through AI', () => {
  it('sends multimodal input with caller settings and returns text without storing the interaction', async () => {
    ai.options.gemini.config = {system_instruction: 'Be concise'};
    createInteraction.mockResolvedValue({output_text: 'A tree', steps: []});
    expect(
      await ai.query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: 'image/png', data: 'QUFB'}},
          {text: 'What is this?'},
        ],
      })
    ).toEqual({text: 'A tree'});
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            type: 'user_input',
            content: [
              {type: 'image', mime_type: 'image/png', data: 'QUFB'},
              {type: 'text', text: 'What is this?'},
            ],
          },
        ],
        system_instruction: 'Be concise',
        store: false,
      })
    );
  });

  it('wraps base64 image queries in a user_input step', async () => {
    createInteraction.mockResolvedValue({output_text: 'A chair', steps: []});
    expect(
      await ai.query({
        type: 'base64',
        base64: 'QUFB',
        mimeType: 'image/jpeg',
      })
    ).toEqual({text: 'A chair'});
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            type: 'user_input',
            content: [{type: 'image', mime_type: 'image/jpeg', data: 'QUFB'}],
          },
        ],
        store: false,
      })
    );
  });

  it('returns a requested tool call instead of unrelated generated text', async () => {
    createInteraction.mockResolvedValue({
      output_text: 'Thinking',
      steps: [
        {
          type: 'function_call',
          id: 'call-1',
          name: 'weather',
          arguments: {city: 'Boston'},
        },
      ],
    });
    expect(await ai.query({prompt: 'Weather?'})).toEqual({
      toolCall: {name: 'weather', args: {city: 'Boston'}},
    });
  });

  it('generates an image with the requested model and image prompt', async () => {
    createInteraction.mockResolvedValue({
      steps: [
        {
          type: 'model_output',
          content: [{type: 'image', data: 'QkJC', mime_type: 'image/png'}],
        },
      ],
    });
    expect(
      await ai.generate(
        ['data:image/png;base64,QUFB', 'a red cube'],
        'image',
        'Draw a cube',
        'custom-image-model'
      )
    ).toBe('data:image/png;base64,QkJC');
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-image-model',
        system_instruction: 'Draw a cube',
        store: false,
        input: [
          {
            type: 'user_input',
            content: [
              {type: 'image', mime_type: 'image/png', data: 'QUFB'},
              {type: 'text', text: 'a red cube'},
            ],
          },
        ],
      })
    );
  });

  it('skips image generation when an array prompt produces no content blocks', async () => {
    expect(await ai.generate([])).toBeUndefined();
    expect(createInteraction).not.toHaveBeenCalled();
  });
});

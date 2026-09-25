import {Blob as NodeBlob} from 'node:buffer';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import {AI, AIOptions, Gemini, GeminiOptions} from 'xrblocks';

import {
  GeminiVoiceInput,
  VOICE_MAX_BYTES,
  VOICE_MAX_CHARACTERS,
  VOICE_MAX_DURATION_MS,
  VOICE_TRANSCRIPTION_TIMEOUT_MS,
  getVoiceFormat,
  transcribeGeminiAudio,
} from './GeminiVoice.js';

vi.mock('../../../src/singletons', () => ({}));

class TestTrack extends EventTarget {
  stop = vi.fn();
}

function microphoneStream() {
  const track = new TestTrack();
  return {
    track,
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

class TestRecorder {
  static instances: TestRecorder[] = [];
  static isTypeSupported(type: string) {
    return type === 'audio/webm;codecs=opus';
  }

  state = 'inactive';
  ondataavailable: ((event: {data: NodeBlob}) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    const handler = this.onstop;
    queueMicrotask(() => handler?.());
  });

  constructor(
    readonly stream: ReturnType<typeof microphoneStream>,
    readonly options: {mimeType: string; audioBitsPerSecond: number}
  ) {
    TestRecorder.instances.push(this);
  }

  data(bytes = [1, 2, 3]) {
    this.ondataavailable?.({data: new NodeBlob([new Uint8Array(bytes)])});
  }
}

function configuredAI() {
  const gemini = new Gemini(new GeminiOptions());
  const generateContent = vi.fn();
  gemini.ai = {models: {generateContent}} as unknown as Gemini['ai'];
  const ai = new AI();
  ai.options = new AIOptions();
  ai.options.gemini.model = 'gemini-test-model';
  ai.model = gemini;
  vi.spyOn(ai, 'isAvailable').mockReturnValue(true);
  return {ai, generateContent};
}

let ai: AI;
let generateContent: ReturnType<typeof vi.fn>;
let stream: ReturnType<typeof microphoneStream>;
let getUserMedia: ReturnType<typeof vi.fn>;
let voice: GeminiVoiceInput;
let onTranscript: Mock<(transcript: string) => void>;
let onError: Mock<(error: Error) => void>;
let onStateChange: Mock<(state: string) => void>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

const drain = () => new Promise((resolve) => setTimeout(resolve, 0));
const audio = () =>
  new NodeBlob([new Uint8Array([1, 2, 3])], {type: 'audio/webm'});
const transcribe = (blob = audio(), signal = new AbortController().signal) =>
  transcribeGeminiAudio(ai, blob as unknown as Blob, signal);

beforeEach(() => {
  ({ai, generateContent} = configuredAI());
  generateContent.mockResolvedValue({
    text: JSON.stringify({transcript: ' a red chair '}),
  });
  stream = microphoneStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  TestRecorder.instances = [];
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia}});
  vi.stubGlobal('MediaRecorder', TestRecorder);
  vi.stubGlobal('Blob', NodeBlob);
  onTranscript = vi.fn();
  onError = vi.fn();
  onStateChange = vi.fn();
  voice = new GeminiVoiceInput({
    getAI: () => ai,
    onStateChange,
    onTranscript,
    onError,
  });
});

afterEach(() => {
  voice.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Gemini transcription', () => {
  it('sends one inline recording to the configured model', async () => {
    const signal = new AbortController().signal;
    expect(await transcribe(audio(), signal)).toBe('a red chair');
    expect(generateContent).toHaveBeenCalledExactlyOnceWith({
      model: 'gemini-test-model',
      contents: [
        {
          role: 'user',
          parts: [{inlineData: {mimeType: 'audio/webm', data: 'AQID'}}],
        },
      ],
      config: expect.objectContaining({
        abortSignal: signal,
        // Thinking tokens count toward this limit, so keep Roomcraft's headroom.
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {transcript: {type: 'string'}},
          required: ['transcript'],
          additionalProperties: false,
        },
      }),
    });
  });

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{"transcript":5}',
    '{"transcript":"hello","extra":true}',
    '{"transcript":"   "}',
    JSON.stringify({transcript: 'a'.repeat(VOICE_MAX_CHARACTERS + 1)}),
  ])(
    'rejects missing, malformed, silent or overlong output (%#)',
    async (text) => {
      generateContent.mockResolvedValue({text});
      await expect(transcribe()).rejects.toThrow();
    }
  );

  it.each([401, 403, 429, 500])(
    'reports status %s without leaking request details',
    async (status) => {
      generateContent.mockRejectedValue(
        Object.assign(new Error('private-test-request-details'), {status})
      );
      const error = (await transcribe().catch((error) => error)) as Error;
      expect(error.message).toContain('Gemini');
      expect(error.message).not.toContain('private-test-request-details');
    }
  );

  it('rejects empty, oversized and unsupported recordings without contacting Gemini', async () => {
    for (const blob of [
      new NodeBlob([], {type: 'audio/webm'}),
      new NodeBlob([new Uint8Array(VOICE_MAX_BYTES + 1)], {type: 'audio/webm'}),
      new NodeBlob([new Uint8Array([1])], {type: 'audio/wav'}),
    ]) {
      await expect(transcribe(blob)).rejects.toThrow();
    }
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('does not send when Gemini is not ready', async () => {
    vi.mocked(ai.isAvailable).mockReturnValue(false);
    await expect(transcribe()).rejects.toThrow('Gemini');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('lets Gemini create its lazy client before checking it', async () => {
    const gemini = ai.model as Gemini;
    const client = gemini.ai;
    gemini.ai = undefined;
    vi.mocked(ai.isAvailable).mockImplementation(() => {
      gemini.ai = client;
      return true;
    });
    expect(await transcribe()).toBe('a red chair');
  });

  it('selects the first supported recording format', () => {
    expect(getVoiceFormat()).toEqual({
      record: 'audio/webm;codecs=opus',
      upload: 'audio/webm',
    });
    vi.stubGlobal('MediaRecorder', undefined);
    expect(getVoiceFormat()).toBeNull();
  });
});

describe('Bounded microphone recording', () => {
  it('records only after start, sends only after finish and stops the microphone first', async () => {
    expect(getUserMedia).not.toHaveBeenCalled();
    await voice.start();
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true},
      video: false,
    });
    const recorder = TestRecorder.instances[0];
    expect(recorder.options.mimeType).toBe('audio/webm;codecs=opus');
    expect(recorder.start).toHaveBeenCalledWith(250);
    expect(voice.state).toBe('recording');
    recorder.data();
    expect(generateContent).not.toHaveBeenCalled();

    voice.finish();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('transcribing');
    await vi.waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('a red chair')
    );
    expect(voice.state).toBe('idle');
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual([
      'starting',
      'recording',
      'transcribing',
      'idle',
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['a blocked microphone', 'NotAllowedError', 'microphone blocked'],
    ['a missing microphone', 'NotFoundError', 'no microphone'],
    ['a busy microphone', 'NotReadableError', 'in use'],
  ])('explains %s instead of waiting forever', async (_, name, message) => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('native'), {name}));
    await voice.start();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain(message);
    expect(voice.state).toBe('idle');
  });

  it('explains when the browser cannot record audio', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await voice.start();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain('record audio');
    expect(voice.state).toBe('idle');
  });

  it('asks for Gemini before requesting the microphone', async () => {
    vi.mocked(ai.isAvailable).mockReturnValue(false);
    await voice.start();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain('Gemini');
  });

  it('stops a late-granted stream after cancelling a pending permission request', async () => {
    const pending = deferred<ReturnType<typeof microphoneStream>>();
    getUserMedia.mockReturnValue(pending.promise);
    const starting = voice.start();
    expect(voice.state).toBe('starting');
    expect(voice.cancel()).toBe(true);
    pending.resolve(stream);
    await starting;
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(TestRecorder.instances).toHaveLength(0);
    expect(voice.state).toBe('idle');
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts transcription and ignores a late result after cancellation', async () => {
    const pending = deferred<{text: string}>();
    generateContent.mockReturnValue(pending.promise);
    await voice.start();
    TestRecorder.instances[0].data();
    voice.finish();
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const signal = generateContent.mock.calls[0][0].config.abortSignal;
    expect(voice.cancel()).toBe(true);
    expect(signal.aborted).toBe(true);
    pending.resolve({text: '{"transcript":"late"}'});
    await drain();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(voice.state).toBe('idle');
  });

  it('clears the time limit when a recording is cancelled', async () => {
    vi.useFakeTimers();
    await voice.start();
    TestRecorder.instances[0].data();
    expect(voice.cancel()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(VOICE_MAX_DURATION_MS);
    expect(generateContent).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('sends the recording automatically at the time limit', async () => {
    vi.useFakeTimers();
    await voice.start();
    TestRecorder.instances[0].data();
    vi.advanceTimersByTime(VOICE_MAX_DURATION_MS);
    expect(voice.state).toBe('transcribing');
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('a red chair')
    );
  });

  it('fails instead of uploading a truncated recording past the byte limit', async () => {
    await voice.start();
    TestRecorder.instances[0].ondataavailable?.({
      data: new NodeBlob([new Uint8Array(VOICE_MAX_BYTES + 1)]),
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain('too long');
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('idle');
    await drain();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('gives up on a stalled transcription at its deadline', async () => {
    vi.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => {}));
    await voice.start();
    TestRecorder.instances[0].data();
    voice.finish();
    await vi.advanceTimersByTimeAsync(VOICE_TRANSCRIPTION_TIMEOUT_MS);
    expect(onError.mock.calls[0][0].message).toContain('timed out');
    expect(voice.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases an active recording on disposal without sending it', async () => {
    await voice.start();
    TestRecorder.instances[0].data();
    voice.dispose();
    await drain();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    await voice.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

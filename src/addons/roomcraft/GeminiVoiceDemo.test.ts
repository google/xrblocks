import {Blob as NodeBlob} from 'node:buffer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MAX_SCENE_REQUEST_CHARACTERS} from './SceneTypes';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {
  GeminiVoiceInput,
  VOICE_MAX_BYTES,
  VOICE_MAX_CHARACTERS,
  VOICE_MAX_DURATION_MS,
  VOICE_TRANSCRIPTION_TIMEOUT_MS,
  getVoiceFormat,
  transcribeGeminiAudio,
} from '../../../demos/roomcraft/GeminiVoice.js';

const {TestGemini} = vi.hoisted(() => {
  class TestGemini {
    ai = {models: {generateContent: vi.fn()}};
  }
  return {TestGemini};
});
vi.mock('xrblocks', () => ({Gemini: TestGemini}));
vi.mock(
  'xrblocks/addons/roomcraft/index.js',
  async () => import('./SceneTypes')
);

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
  return {
    model: new TestGemini(),
    isAvailable: vi.fn(() => true),
    options: {
      model: 'gemini',
      gemini: {
        apiKey: 'test-key-only',
        model: 'gemini-test-model',
        config: {
          responseJsonSchema: {
            type: 'object',
            properties: {edits: {type: 'array'}},
          },
        },
      },
    },
  };
}

let ai: ReturnType<typeof configuredAI>;
let stream: ReturnType<typeof microphoneStream>;
let getUserMedia: ReturnType<typeof vi.fn>;
let voice: InstanceType<typeof GeminiVoiceInput>;
let onTranscript: ReturnType<typeof vi.fn>;
let onError: ReturnType<typeof vi.fn>;
let onStateChange: ReturnType<typeof vi.fn>;

const drain = () => new Promise((resolve) => setTimeout(resolve, 0));
const audio = () =>
  new NodeBlob([new Uint8Array([1, 2, 3])], {type: 'audio/webm'});

beforeEach(() => {
  ai = configuredAI();
  ai.model.ai.models.generateContent.mockResolvedValue({
    text: JSON.stringify({transcript: 'Add a floor lamp.'}),
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

describe('Gemini-only transcription', () => {
  it('accepts transcripts up to the shared scene instruction limit', async () => {
    expect(VOICE_MAX_CHARACTERS).toBe(MAX_SCENE_REQUEST_CHARACTERS);
    const transcript = 'a'.repeat(MAX_SCENE_REQUEST_CHARACTERS);
    ai.model.ai.models.generateContent.mockResolvedValue({
      text: JSON.stringify({transcript}),
    });
    await expect(
      transcribeGeminiAudio(ai, audio(), new AbortController().signal)
    ).resolves.toBe(transcript);
  });

  it('reuses the configured client and model without changing the scene-plan schema', async () => {
    const sceneConfig = structuredClone(ai.options.gemini.config);
    const signal = new AbortController().signal;
    expect(await transcribeGeminiAudio(ai, audio(), signal)).toBe(
      'Add a floor lamp.'
    );
    expect(ai.model.ai.models.generateContent).toHaveBeenCalledExactlyOnceWith({
      model: 'gemini-test-model',
      contents: [
        {
          role: 'user',
          parts: [{inlineData: {mimeType: 'audio/webm', data: 'AQID'}}],
        },
      ],
      config: expect.objectContaining({
        abortSignal: signal,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {transcript: {type: 'string'}},
          required: ['transcript'],
          additionalProperties: false,
        },
      }),
    });
    expect(ai.options.gemini.config).toEqual(sceneConfig);
  });

  it.each(['missing key', 'other model', 'other provider'])(
    'does not record or send through %s',
    async (reason) => {
      if (reason === 'missing key') ai.options.gemini.apiKey = '';
      if (reason === 'other model') ai.model = {ai: ai.model.ai};
      if (reason === 'other provider') ai.options.model = 'openai';
      await voice.start();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Connect Gemini'),
        })
      );
      expect(voice.state).toBe('idle');
    }
  );

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{"transcript":5}',
    '{"transcript":"hello","edits":[]}',
    '{"transcript":"   "}',
    JSON.stringify({transcript: 'a'.repeat(4001)}),
  ])(
    'rejects missing, malformed, silent or overlong output (%#)',
    async (text) => {
      ai.model.ai.models.generateContent.mockResolvedValue({text});
      await expect(
        transcribeGeminiAudio(ai, audio(), new AbortController().signal)
      ).rejects.toThrow();
    }
  );

  it.each([401, 403, 429, 500])(
    'reports status %s without leaking SDK request details',
    async (status) => {
      ai.model.ai.models.generateContent.mockRejectedValue(
        Object.assign(new Error('private-test-request-details'), {status})
      );
      const error = await transcribeGeminiAudio(
        ai,
        audio(),
        new AbortController().signal
      ).catch((error: Error) => error);
      expect(error.message).toContain('Gemini');
      expect(error.message).not.toContain('private-test-request-details');
      expect(error.cause).toBeUndefined();
    }
  );

  it('rejects empty, oversized and unsupported recordings without contacting Gemini', async () => {
    for (const blob of [
      new NodeBlob([], {type: 'audio/webm'}),
      new NodeBlob([new Uint8Array(VOICE_MAX_BYTES + 1)], {type: 'audio/webm'}),
      new NodeBlob(['not audio'], {type: 'text/plain'}),
    ]) {
      await expect(
        transcribeGeminiAudio(ai, blob, new AbortController().signal)
      ).rejects.toThrow();
    }
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('does not send an already-cancelled recording', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcribeGeminiAudio(ai, audio(), controller.signal)
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('does not send if the Gemini connection changes while reading the audio', async () => {
    const pending = Promise.withResolvers<ArrayBuffer>();
    const clip = audio();
    vi.spyOn(clip, 'arrayBuffer').mockReturnValue(pending.promise);
    const original = ai.model.ai.models.generateContent;
    const request = transcribeGeminiAudio(
      ai,
      clip,
      new AbortController().signal
    );
    ai.model = new TestGemini();
    pending.resolve(new Uint8Array([1, 2, 3]).buffer);
    await expect(request).rejects.toThrow('connection changed');
    expect(original).not.toHaveBeenCalled();
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('selects a supported recording format, including audio-only MP4 as M4A', () => {
    expect(getVoiceFormat()).toEqual({
      record: 'audio/webm;codecs=opus',
      upload: 'audio/webm',
    });
    vi.spyOn(TestRecorder, 'isTypeSupported').mockImplementation(
      (type) => type === 'audio/mp4'
    );
    expect(getVoiceFormat()).toEqual({
      record: 'audio/mp4',
      upload: 'audio/m4a',
    });
    vi.mocked(TestRecorder.isTypeSupported).mockReturnValue(false);
    expect(getVoiceFormat()).toBeNull();
  });
});

describe('Bounded microphone lifecycle', () => {
  it('rejects a changed Gemini model before sending the recording', async () => {
    await voice.start();
    TestRecorder.instances[0].data();
    ai.options.gemini.model = 'different-gemini-model';
    voice.finish();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toContain('connection changed');
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
  });

  it('records only on start, sends only on Finish and stops the microphone before upload', async () => {
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
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
    voice.finish();
    recorder.data([4, 5]);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('transcribing');
    await vi.waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('Add a floor lamp.', {
        requiresReview: false,
      })
    );
    expect(
      ai.model.ai.models.generateContent.mock.calls[0][0].contents[0].parts[0]
        .inlineData.data
    ).toBe('AQIDBAU=');
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('idle');
    expect(voice.operation).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('cancels pending permission and immediately stops a late-granted stream', async () => {
    const pending =
      Promise.withResolvers<ReturnType<typeof microphoneStream>>();
    getUserMedia.mockReturnValue(pending.promise);
    const starting = voice.start();
    expect(voice.state).toBe('starting');
    expect(voice.cancel()).toBe(true);
    pending.resolve(stream);
    await starting;
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(TestRecorder.instances).toHaveLength(0);
    expect(voice.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a fresh recording separate from an earlier cancelled permission request', async () => {
    const pending =
      Promise.withResolvers<ReturnType<typeof microphoneStream>>();
    const late = microphoneStream();
    getUserMedia
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(stream);
    const first = voice.start();
    voice.cancel();
    await voice.start();
    pending.resolve(late);
    await first;
    expect(late.track.stop).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).not.toHaveBeenCalled();
    expect(voice.state).toBe('recording');
    expect(TestRecorder.instances).toHaveLength(1);
  });

  it('ignores queued recording events after cancellation', async () => {
    await voice.start();
    const recorder = TestRecorder.instances[0];
    const queuedData = recorder.ondataavailable!;
    const queuedStop = recorder.onstop!;
    voice.cancel();
    queuedData({data: audio()});
    queuedStop();
    await drain();
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
  });

  it('aborts transcription and ignores a late result after cancellation', async () => {
    const pending = Promise.withResolvers<{text: string}>();
    ai.model.ai.models.generateContent.mockReturnValue(pending.promise);
    await voice.start();
    TestRecorder.instances[0].data();
    voice.finish();
    await vi.waitFor(() =>
      expect(ai.model.ai.models.generateContent).toHaveBeenCalledTimes(1)
    );
    const signal =
      ai.model.ai.models.generateContent.mock.calls[0][0].config.abortSignal;
    voice.cancel();
    expect(signal.aborted).toBe(true);
    pending.resolve({text: '{"transcript":"late instruction"}'});
    await drain();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(voice.state).toBe('idle');
  });

  it('ignores stale recorder callbacks once transcription owns the operation', async () => {
    const pending = Promise.withResolvers<{text: string}>();
    ai.model.ai.models.generateContent.mockReturnValue(pending.promise);
    await voice.start();
    const recorder = TestRecorder.instances[0];
    recorder.data();
    const data = recorder.ondataavailable!;
    const stopped = recorder.onstop!;
    const failed = recorder.onerror!;
    voice.finish();
    await vi.waitFor(() =>
      expect(ai.model.ai.models.generateContent).toHaveBeenCalledTimes(1)
    );
    data({data: audio()});
    stopped();
    failed();
    pending.resolve({text: '{"transcript":"Add a lamp."}'});
    await vi.waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('Add a lamp.', {
        requiresReview: false,
      })
    );
    expect(ai.model.ai.models.generateContent).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('releases a granted microphone if recorder construction fails', async () => {
    class UnsupportedRecorder extends TestRecorder {
      constructor(
        input: ReturnType<typeof microphoneStream>,
        settings: {mimeType: string; audioBitsPerSecond: number}
      ) {
        super(input, settings);
        throw new DOMException('Unsupported format', 'NotSupportedError');
      }
    }
    vi.stubGlobal('MediaRecorder', UnsupportedRecorder);
    await voice.start();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('idle');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('reports permission denial without leaking a native error payload', async () => {
    getUserMedia.mockRejectedValue(
      new DOMException('private-native-details', 'NotAllowedError')
    );
    await voice.start();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('permission was denied'),
      })
    );
    expect(onError.mock.calls[0][0].message).not.toContain(
      'private-native-details'
    );
    expect(voice.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it.each(['disconnect', 'recorder error', 'unexpected stop'])(
    'stops without uploading on %s',
    async (failure) => {
      await voice.start();
      const recorder = TestRecorder.instances[0];
      recorder.data();
      if (failure === 'disconnect')
        stream.track.dispatchEvent(new Event('ended'));
      if (failure === 'recorder error') recorder.onerror?.();
      if (failure === 'unexpected stop') recorder.stop();
      await drain();
      expect(stream.track.stop).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(voice.state).toBe('idle');
      expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
    }
  );

  it('stops microphone tracks even if the recorder cannot stop cleanly', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await voice.start();
    TestRecorder.instances[0].stop.mockImplementation(() => {
      throw new Error('Recorder stop failed.');
    });
    voice.finish();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('idle');
  });

  it('rejects the byte limit instead of uploading a truncated recording', async () => {
    await voice.start();
    TestRecorder.instances[0].ondataavailable?.({
      data: new NodeBlob([new Uint8Array(VOICE_MAX_BYTES + 1)]),
    });
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('too large')})
    );
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
  });

  it('requires transcript review at the recording time limit and clears its timers', async () => {
    vi.useFakeTimers();
    const response = Promise.withResolvers<{text: string}>();
    ai.model.ai.models.generateContent.mockReturnValue(response.promise);
    await voice.start();
    TestRecorder.instances[0].data();
    await vi.advanceTimersByTimeAsync(VOICE_MAX_DURATION_MS);
    voice.finish();
    response.resolve({text: '{"transcript":"Add a floor lamp."}'});
    await vi.waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(1));
    expect(onTranscript).toHaveBeenCalledWith('Add a floor lamp.', {
      requiresReview: true,
    });
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(voice.state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled transcription at its deadline', async () => {
    vi.useFakeTimers();
    ai.model.ai.models.generateContent.mockReturnValue(new Promise(() => {}));
    await voice.start();
    TestRecorder.instances[0].data();
    voice.finish();
    await vi.advanceTimersByTimeAsync(VOICE_TRANSCRIPTION_TIMEOUT_MS);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('timed out')})
    );
    expect(voice.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes an active recording without submitting it', async () => {
    await voice.start();
    TestRecorder.instances[0].data();
    voice.dispose();
    await drain();
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(ai.model.ai.models.generateContent).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });
});

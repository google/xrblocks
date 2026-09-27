// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {CaptionsDemo, levelPercent} from './CaptionsDemo.js';
import {PLACEHOLDER, formatMetrics} from './captions.js';
import {
  CACHED_LABEL,
  DOWNLOAD_LABEL,
  LOADED_LABEL,
  TOTAL_BYTES,
} from './modelConfig.js';
import {getLanguage} from './translationConfig.js';

vi.mock('xrblocks', async () => {
  const {Object3D} = await import('three');
  class UI extends Object3D {
    style;
    ready = true;
    disabled = false;
    label = '';
    onClick: undefined | (() => unknown);
    writes = 0;
    _text = '';
    scrollTop = 0;
    scrollHeight = 400;
    clientHeight = 200;
    constructor({children = [], style = {}, ...options} = {}) {
      super();
      this.style = {...style};
      Object.assign(this, options);
      this.add(...children);
    }
    get text() {
      return this._text;
    }
    set text(value) {
      this._text = value;
      this.writes++;
    }
    get maxScrollTop() {
      return Math.max(0, this.scrollHeight - this.clientHeight);
    }
    scrollTo(offset: number) {
      this.scrollTop = Math.min(this.maxScrollTop, Math.max(0, offset));
    }
  }
  return {
    Script: Object3D,
    UICard: class extends UI {},
    UIPanel: class extends UI {},
    UIText: class extends UI {},
    UIScrollView: class extends UI {},
    UIButton: class extends UI {},
    FollowHead: class extends Object3D {},
    FaceCamera: class extends Object3D {},
    user: {height: 1.6},
  };
});

const RATE = 48000;
const CHUNK = 2048;

function createClient() {
  let count = 0;
  const client = {
    loaded: false,
    state: 'idle',
    check: vi.fn(async () => ({})),
    download: vi.fn(
      async ({onProgress}: {onProgress?: (e: unknown) => void} = {}) => {
        onProgress?.({loaded: TOTAL_BYTES / 2, total: TOTAL_BYTES, file: 'a'});
        return {downloadedBytes: TOTAL_BYTES};
      }
    ),
    load: vi.fn(async () => {
      client.loaded = true;
      client.state = 'ready';
      return {loadMs: 1500, warmupMs: 100};
    }),
    transcribe: vi.fn(async (audio: Float32Array) => ({
      text: `words ${++count}`,
      inferenceMs: 100,
      audioMs: (audio.length / 16000) * 1000,
    })),
    stop: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  return client;
}

function createTranslator() {
  const translator = {
    loaded: false,
    language: null as null | string,
    download: vi.fn(async (_code: string, _options?: unknown) => ({
      downloadedBytes: 1,
    })),
    load: vi.fn(async (code: string) => {
      translator.loaded = true;
      translator.language = code;
      return {loadMs: 2000, warmupMs: 300};
    }),
    translate: vi.fn(async (text: string) => ({
      text: `[${translator.language}] ${text}`,
      language: translator.language!,
      translateMs: 250,
    })),
    unload: vi.fn(() => {
      translator.loaded = false;
      translator.language = null;
    }),
    stop: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  return translator;
}

function createMicrophone() {
  const microphone = {
    onAudio: null as null | ((samples: Float32Array, rate: number) => void),
    start: vi.fn(
      async (onAudio: (samples: Float32Array, rate: number) => void) => {
        microphone.onAudio = onAudio;
        return {sampleRate: RATE};
      }
    ),
    stop: vi.fn(async () => {
      microphone.onAudio = null;
    }),
  };
  return microphone;
}

function createStore(complete = false) {
  const store = {
    complete,
    translationComplete: false,
    inspectCache: vi.fn(async (options?: {assets?: unknown}) => {
      const done = options?.assets ? store.translationComplete : store.complete;
      return {complete: done, missingBytes: done ? 0 : TOTAL_BYTES};
    }),
    prepareStorage: vi.fn(async () => ({persistent: true})),
  };
  return store;
}

let clock = 0;
const now = () => clock;

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup({cached = false} = {}) {
  const client = createClient();
  const translator = createTranslator();
  const microphone = createMicrophone();
  const store = createStore(cached);
  const demo = new CaptionsDemo({
    client: client as never,
    translator: translator as never,
    microphone: microphone as never,
    store: store as never,
    now,
    follow: false,
  });
  return {demo, client, translator, microphone, store};
}

async function ready(options = {}) {
  const context = setup(options);
  await context.demo.init();
  context.store.complete = true;
  await context.demo.loadModel({allowDownload: true});
  return context;
}

/** Plays a tone (speech stand-in) or quiet noise through the fake microphone. */
async function play(
  context: Awaited<ReturnType<typeof ready>>,
  seconds: number,
  amplitude: number
) {
  const chunks = Math.round((seconds * RATE) / CHUNK);
  for (let i = 0; i < chunks; i++) {
    const samples = new Float32Array(CHUNK);
    for (let j = 0; j < CHUNK; j++) {
      samples[j] =
        amplitude * Math.sin((2 * Math.PI * 220 * (i * CHUNK + j)) / RATE) +
        0.001 * Math.sin(j * 1.7);
    }
    context.microphone.onAudio?.(samples, RATE);
    clock += (CHUNK / RATE) * 1000;
    context.demo.update();
    await settle();
  }
}

async function idle(demo: CaptionsDemo, ms = 500) {
  for (let t = 0; t < ms; t += 20) {
    clock += 20;
    demo.update();
    await settle();
  }
}

beforeEach(() => {
  clock = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('CaptionsDemo', () => {
  it('checks the browser and cache without downloading', async () => {
    const {demo, client, store} = setup();
    await demo.init();
    expect(client.check).toHaveBeenCalled();
    expect(store.inspectCache).toHaveBeenCalled();
    expect(client.download).not.toHaveBeenCalled();
    expect(demo.loadButton.label).toBe(DOWNLOAD_LABEL);
    expect(demo.loadButton.disabled).toBe(false);
    expect(demo.listenButton.disabled).toBe(true);
    expect(demo.card.position.z).toBe(-1);
    expect(demo.card.children).toContain(demo.captionView);
  });

  it('downloads only on an explicit click, then loads from the cache', async () => {
    const {demo, client, store} = setup();
    await demo.init();
    await demo.onLoadButton();
    expect(store.prepareStorage).toHaveBeenCalledWith(TOTAL_BYTES);
    expect(client.download).toHaveBeenCalledTimes(1);
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(demo.cached).toBe(true);
    expect(demo.status.text).toMatch(/Ready in 1\.5 s/);
    expect(demo.loadButton.disabled).toBe(true);
    expect(demo.loadButton.label).toBe(LOADED_LABEL);
    expect(demo.listenButton.disabled).toBe(false);
  });

  it('never turns a cache-only click into a download after eviction', async () => {
    const {demo, client, store} = setup({cached: true});
    await demo.init();
    expect(demo.loadButton.label).toBe(CACHED_LABEL);
    store.complete = false;
    await demo.onLoadButton();
    expect(client.download).not.toHaveBeenCalled();
    expect(store.prepareStorage).not.toHaveBeenCalled();
    expect(client.load).not.toHaveBeenCalled();
    expect(demo.status.text).toMatch(/Error: .*Choose Download/);
    expect(demo.loadButton.label).toBe(DOWNLOAD_LABEL);
  });

  it('cancels loading from the same button', async () => {
    const {demo, client} = setup();
    await demo.init();
    let release!: () => void;
    client.download.mockImplementationOnce(
      () =>
        new Promise(
          (resolve) => (release = () => resolve({downloadedBytes: 0}))
        )
    );
    const loading = demo.onLoadButton();
    await settle();
    expect(demo.loadButton.label).toBe('Cancel');
    await demo.onLoadButton();
    expect(client.stop).toHaveBeenCalled();
    release();
    await loading;
    expect(client.load).not.toHaveBeenCalled();
    expect(demo.status.text).toMatch(/canceled/);
  });

  it('captions speech with interim and final lines in one throttled text node', async () => {
    const context = await ready();
    const {demo, client, microphone} = context;
    const cardChildren = [...demo.card.children];
    const writeTimes: number[] = [];
    const node = demo.captionText as unknown as {_text: string};
    Object.defineProperty(demo.captionText, 'text', {
      get: () => node._text,
      set: (value: string) => {
        node._text = value;
        writeTimes.push(clock);
      },
    });

    expect(await demo.toggleListening()).toBe(true);
    expect(microphone.start).toHaveBeenCalled();
    expect(demo.listenButton.label).toBe('Stop listening');
    await play(context, 0.5, 0);
    await play(context, 1.8, 0.3);
    expect(demo.captionText.text).toMatch(/^words \d+ …$/);
    expect(demo.levelValue).toBeGreaterThan(50);
    await play(context, 1, 0);
    await idle(demo);
    await play(context, 1.2, 0.3);
    await play(context, 1, 0);
    await idle(demo);

    const lines = demo.captionText.text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => /^words \d+$/.test(line))).toBe(true);
    expect(demo.history).toHaveLength(2);
    for (const utterance of demo.history) {
      expect(utterance.finalLatencyMs).toBeGreaterThan(0);
      expect(utterance.finalLatencyMs).toBeLessThan(1000);
      expect(utterance.rtf).toBeGreaterThan(0);
    }
    expect(demo.metricsValues.firstCaptionMs).toBeGreaterThan(0);
    expect(demo.metrics.text).toMatch(/Real-time factor: 0\.\d\d/);
    for (let i = 1; i < writeTimes.length; i++) {
      expect(writeTimes[i] - writeTimes[i - 1]).toBeGreaterThanOrEqual(100);
    }
    expect(demo.card.children).toEqual(cardChildren);
    expect(demo.captionView.children).toEqual([demo.captionText]);
    const finals = client.transcribe.mock.calls.filter(
      ([audio]) => audio.length > 16000
    );
    expect(finals.length).toBeGreaterThanOrEqual(2);

    await demo.toggleListening();
    expect(microphone.stop).toHaveBeenCalled();
    expect(demo.levelValue).toBe(0);
    expect(demo.listenButton.label).toBe('Start listening');
  });

  it('finalizes speech that is still active when listening stops', async () => {
    const context = await ready();
    const {demo} = context;
    await demo.startListening();
    await play(context, 0.5, 0);
    await play(context, 1, 0.3);
    await demo.stopListening();
    await idle(demo);
    expect(demo.captionText.text).toMatch(/^words \d+$/);
  });

  it('keeps captions from new sessions after earlier ones and clears on demand', async () => {
    const context = await ready();
    const {demo} = context;
    for (let session = 0; session < 2; session++) {
      await demo.startListening();
      await play(context, 0.5, 0);
      await play(context, 1, 0.3);
      await play(context, 1, 0);
      await idle(demo);
      await demo.stopListening();
    }
    expect(demo.captionText.text.split('\n')).toHaveLength(2);
    expect(demo.clearButton.disabled).toBe(false);
    await demo.clearCaptions();
    expect(demo.captionText.text).toBe(PLACEHOLDER);
    expect(demo.metrics.text).toMatch(/First caption: -/);
    demo.refreshControls();
    expect(demo.clearButton.disabled).toBe(true);
  });

  it('ignores noise bursts shorter than a word', async () => {
    const context = await ready();
    const {demo, client} = context;
    await demo.startListening();
    await play(context, 0.5, 0);
    client.transcribe.mockClear();
    await play(context, 0.15, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    expect(client.transcribe).not.toHaveBeenCalled();
    expect(demo.captionText.text).toBe(PLACEHOLDER);
  });

  it('explains microphone permission errors', async () => {
    const {demo, microphone} = await ready();
    microphone.start.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), {name: 'NotAllowedError'})
    );
    expect(await demo.startListening()).toBe(false);
    expect(demo.status.text).toBe(
      'Error: Allow microphone access to caption speech.'
    );
    expect(demo.listening).toBeNull();
  });

  it.each([
    [
      'NotReadableError',
      'The microphone is busy in another tab or app. Close it and press Start again.',
    ],
    [
      'AbortError',
      'The microphone is busy in another tab or app. Close it and press Start again.',
    ],
    ['NotFoundError', 'No microphone found.'],
    ['OverconstrainedError', 'No microphone found.'],
  ])('explains %s and lets Start retry', async (name, message) => {
    const {demo, microphone} = await ready();
    microphone.start.mockRejectedValueOnce(
      Object.assign(new Error('Could not start audio source'), {name})
    );
    expect(await demo.startListening()).toBe(false);
    expect(demo.status.text).toBe(`Error: ${message}`);
    expect(demo.listening).toBeNull();
    expect(demo.listenButton.label).toBe('Start listening');
    expect(demo.listenButton.disabled).toBe(false);
    expect(await demo.startListening()).toBe(true);
    expect(demo.listening).not.toBeNull();
  });

  it('stops listening and asks for a reload when the worker crashes', async () => {
    const context = await ready();
    const {demo, client, microphone} = context;
    await demo.startListening();
    await play(context, 0.5, 0);
    client.transcribe.mockImplementation(async () => {
      client.loaded = false;
      client.state = 'idle';
      throw new Error('The captions worker crashed.');
    });
    await play(context, 1.5, 0.3);
    await idle(demo);
    expect(demo.listening).toBeNull();
    expect(microphone.stop).toHaveBeenCalled();
    expect(demo.status.text).toMatch(
      /^Error: The captions worker crashed\. Load the model again/
    );
    expect(demo.loadButton.disabled).toBe(false);
    expect(demo.listenButton.disabled).toBe(true);
  });

  it('feeds decoded audio through the same pipeline in debug mode', async () => {
    const {demo} = await ready();
    const samples = new Float32Array(RATE * 3);
    for (let i = RATE * 0.5; i < RATE * 1.8; i++) {
      samples[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    }
    vi.useFakeTimers();
    try {
      const feeding = demo.feed(samples, RATE, {realtime: false});
      for (let i = 0; i < 200; i++) {
        clock += 20;
        demo.update();
        await vi.advanceTimersByTimeAsync(20);
      }
      const history = await feeding;
      expect(history).toHaveLength(1);
      expect(demo.listening).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts with translation off and captions exactly as before', async () => {
    const context = await ready();
    const {demo, translator, store} = context;
    expect(demo.languageButton.label).toBe('Translate: Off');
    expect(demo.translateButton.label).toBe('Translation off');
    expect(demo.translateButton.disabled).toBe(true);
    await demo.startListening();
    await play(context, 0.5, 0);
    await play(context, 1.5, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    expect(demo.captionText.text).toMatch(/^words \d+$/);
    expect(translator.translate).not.toHaveBeenCalled();
    expect(demo.metrics.text).not.toMatch(/Translate/);
    expect(
      store.inspectCache.mock.calls.some(([options]) => options?.assets)
    ).toBe(false);
  });

  it('never downloads a language on selection, only on an explicit click', async () => {
    const {demo, translator, store} = await ready();
    await demo.cycleLanguage();
    expect(demo.language).toBe('es');
    expect(demo.languageButton.label).toBe('Translate: Spanish');
    expect(demo.translateButton.label).toBe(getLanguage('es').downloadLabel);
    expect(demo.status.text).toBe(
      'Download Spanish once to translate captions.'
    );
    expect(translator.download).not.toHaveBeenCalled();
    expect(demo.metrics.text).toBe(formatMetrics({translating: true}));

    await demo.onTranslateButton();
    expect(store.prepareStorage).toHaveBeenCalled();
    expect(translator.download).toHaveBeenCalledWith('es', expect.anything());
    expect(translator.load).toHaveBeenCalledWith('es');
    expect(demo.translateButton.label).toBe('Spanish ready');
    expect(demo.translateButton.disabled).toBe(true);
    expect(demo.status.text).toMatch(/^Spanish ready in 2\.0 s/);
  });

  it('loads a cached language without download consent', async () => {
    const {demo, translator, store} = await ready();
    store.translationComplete = true;
    await demo.selectLanguage('fr');
    expect(demo.translateButton.label).toBe('Load cached French');
    // Evicted between the check and the click: still no download.
    store.translationComplete = false;
    await demo.onTranslateButton();
    expect(translator.download).not.toHaveBeenCalled();
    expect(translator.load).not.toHaveBeenCalled();
    expect(demo.status.text).toMatch(/French is not cached\. Choose Download/);
  });

  it('translates finalized lines into the same text node', async () => {
    const context = await ready();
    const {demo, translator} = context;
    const cardChildren = [...demo.card.children];
    context.store.translationComplete = true;
    await demo.selectLanguage('de');
    await demo.onTranslateButton();
    await demo.startListening();
    await play(context, 0.5, 0);
    await play(context, 1.5, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    const [original, translated] = demo.captionText.text.split('\n');
    expect(original).toMatch(/^words \d+$/);
    expect(translated).toBe(`→ [de] ${original}`);
    // Interim text is never translated.
    expect(translator.translate).toHaveBeenCalledTimes(1);
    expect(demo.history[0]).toMatchObject({
      translation: `[de] ${original}`,
      language: 'de',
      translateMs: 250,
    });
    expect(demo.history[0].translationLatencyMs).toBeGreaterThanOrEqual(
      demo.history[0].finalLatencyMs
    );
    expect(demo.metrics.text).toMatch(/ · Translate: 250 ms$/);
    expect(demo.card.children).toEqual(cardChildren);
    expect(demo.captionView.children).toEqual([demo.captionText]);

    await demo.selectLanguage(null);
    await idle(demo);
    expect(translator.unload).toHaveBeenCalled();
    expect(demo.captionText.text).toBe(original);
    expect(demo.metrics.text).not.toMatch(/Translate/);
    expect(demo.status.text).toBe('Translation off. Captions only.');
  });

  it('drops a translation that finishes after a language change or Clear', async () => {
    const context = await ready();
    const {demo, translator} = context;
    context.store.translationComplete = true;
    let finish!: (value: unknown) => void;
    translator.translate.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );
    await demo.selectLanguage('es');
    await demo.onTranslateButton();
    await demo.startListening();
    await play(context, 0.5, 0);
    await play(context, 1.5, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    expect(translator.translate).toHaveBeenCalledTimes(1);
    await demo.selectLanguage('fr');
    finish({text: 'tarde', language: 'es', translateMs: 1});
    await idle(demo);
    expect(demo.captionText.text).not.toMatch(/tarde/);

    await demo.onTranslateButton();
    await play(context, 1.5, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    expect(translator.translate).toHaveBeenCalledTimes(2);
    await demo.clearCaptions();
    finish({text: 'trop tard', language: 'fr', translateMs: 1});
    await idle(demo);
    expect(demo.captionText.text).toBe(PLACEHOLDER);
  });

  it('asks to reload the language when the translation worker crashes', async () => {
    const context = await ready();
    const {demo, translator} = context;
    context.store.translationComplete = true;
    await demo.selectLanguage('es');
    await demo.onTranslateButton();
    translator.translate.mockImplementation(async () => {
      translator.loaded = false;
      translator.language = null;
      throw new Error('The captions worker crashed.');
    });
    await demo.startListening();
    await play(context, 0.5, 0);
    await play(context, 1.5, 0.3);
    await play(context, 1, 0);
    await idle(demo);
    expect(demo.status.text).toMatch(
      /Load Spanish again to keep translating\.$/
    );
    expect(demo.translateButton.label).toBe('Load cached Spanish');
    expect(demo.translateButton.disabled).toBe(false);
    // Captioning keeps going.
    expect(demo.listening).not.toBeNull();
    expect(demo.captionText.text).toMatch(/^words \d+$/);
  });

  it('cancels a translation download from the same button', async () => {
    const {demo, translator} = await ready();
    let release!: () => void;
    translator.download.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({downloadedBytes: 0});
        })
    );
    translator.stop.mockImplementation(async () => release());
    await demo.selectLanguage('es');
    const loading = demo.onTranslateButton();
    await settle();
    expect(demo.translateButton.label).toBe('Cancel');
    expect(demo.languageButton.disabled).toBe(true);
    await demo.onTranslateButton();
    await loading;
    expect(translator.load).not.toHaveBeenCalled();
    expect(demo.status.text).toMatch(/Spanish canceled/);
    expect(demo.languageButton.disabled).toBe(false);
  });

  it('maps microphone levels to a meter', () => {
    expect(levelPercent(0)).toBe(0);
    expect(levelPercent(0.001)).toBe(0);
    expect(levelPercent(0.03)).toBe(49);
    expect(levelPercent(1)).toBe(100);
  });

  it('disposes the microphone and worker', async () => {
    const {demo, client, translator, microphone} = await ready();
    await demo.startListening();
    await demo.dispose();
    expect(microphone.stop).toHaveBeenCalled();
    expect(client.dispose).toHaveBeenCalled();
    expect(translator.dispose).toHaveBeenCalled();
    expect(demo.loadButton.onClick).toBeUndefined();
  });
});

// @vitest-environment node
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GemmaVisionDemo} from './GemmaVisionDemo.js';
import {IMAGE_BUDGET, MODEL_BYTES, MODEL_FILES, MODELS} from './modelConfig.js';
import {PRESETS} from './conversation.js';
import {COMPACT_GEMMA_NOTE} from './modelChoice.js';

vi.mock('xrblocks', async () => {
  const {Object3D} = await import('three');
  class UI extends Object3D {
    style;
    ready = true;
    disabled = false;
    value = '';
    error = undefined;
    writes = 0;
    _text = '';
    scrollTop = 0;
    scrollHeight = 400;
    clientHeight = 200;
    constructor({children = [], style = {}, ...options} = {}) {
      super();
      this.style = style;
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
    scrollTo(offset) {
      this.scrollTop = Math.min(this.maxScrollTop, Math.max(0, offset));
    }
  }
  return {
    Script: Object3D,
    UICard: class extends UI {},
    UIPanel: class extends UI {},
    UIImage: class extends UI {},
    UIText: class extends UI {},
    UITextInput: class extends UI {},
    UIScrollView: class extends UI {},
    UIButton: class extends UI {},
    core: {deviceCamera: null},
    user: {height: 1.65},
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

function snapshot() {
  return {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
  };
}

type Snapshot = ReturnType<typeof snapshot>;
type GenerationResult = {
  text: string;
  interrupted?: boolean;
  truncated?: boolean;
  generatedTokens?: number;
  firstTextMs?: number;
  tokensPerSecond?: number;
};

class MockCamera extends THREE.EventDispatcher<{
  statechange: {state: string; error?: Error};
}> {
  state = 'streaming';
  width = 1920;
  height = 1080;
  texture = new THREE.Texture();
  simulatorCamera: Record<string, never> | undefined = {};
  getCurrentDevice?: () => {groupId: string};
  captureSnapshot = vi.fn<() => Promise<Snapshot | null>>(async () =>
    snapshot()
  );
  stop = vi.fn();
}

class MockCanvas {
  width = 0;
  height = 0;
  pixels: Uint8ClampedArray | null = null;
  getContext = vi.fn(() => ({
    putImageData: vi.fn((image: Snapshot) => {
      this.pixels = new Uint8ClampedArray(image.data);
    }),
  }));
}

function createClient() {
  const client = {
    loaded: false,
    modelKey: 'gemma' as string | null,
    state: 'idle',
    imageId: null as number | null,
    check: vi.fn(async () => ({})),
    load: vi.fn(async (_options) => {
      client.loaded = true;
      client.state = 'ready';
      return {cached: true};
    }),
    setImage: vi.fn(async (_image) => {
      client.imageId = (client.imageId ?? 0) + 1;
      return {imageId: client.imageId};
    }),
    generate: vi.fn(
      async (_question, _options): Promise<GenerationResult> => ({
        text: 'A sign.',
        interrupted: false,
        truncated: false,
        generatedTokens: 4,
        firstTextMs: 120,
        tokensPerSecond: 8.25,
      })
    ),
    clear: vi.fn(async () => ({})),
    stop: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  return client;
}

const scenes: GemmaVisionDemo[] = [];
let camera: MockCamera;
let clock: number;
let canvases: MockCanvas[];

function setup({
  cached = false,
  liteCached = false,
  initial = 'gemma',
  compact = false,
}: {
  cached?: boolean;
  liteCached?: boolean;
  initial?: string;
  compact?: boolean;
} = {}) {
  const client = createClient();
  const store = {
    inspectCache: vi.fn(async (model = MODELS.gemma) => {
      const complete = model === MODELS.lite ? liteCached : cached;
      return {complete, missingBytes: complete ? 0 : model.bytes};
    }),
    prepareStorage: vi.fn(async (_bytes) => ({})),
  };
  const choice = {initial, compact, save: vi.fn()};
  const scene = new GemmaVisionDemo({client, store, choice, now: () => clock});
  scenes.push(scene);
  return {scene, client, store, choice};
}

async function ready() {
  const fixture = setup();
  await fixture.scene.init();
  await fixture.scene.loadModel({allowDownload: true});
  await fixture.scene.capture();
  return fixture;
}

beforeEach(() => {
  clock = 0;
  canvases = [];
  camera = new MockCamera();
  xb.core.deviceCamera = camera;
  vi.stubGlobal('document', {
    createElement: vi.fn((tag) => {
      expect(tag).toBe('canvas');
      const canvas = new MockCanvas();
      canvases.push(canvas);
      return canvas;
    }),
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  for (const scene of scenes.splice(0)) await scene.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Gemma vision retained UI and startup', () => {
  it('constructs one card and transcript, with immediately available preload API', () => {
    const {scene, client, store} = setup();
    expect(scene.client).toBe(client);
    expect(scene.cached).toBe(false);
    expect(scene.busy).toBe(false);
    expect(scene.supported).toBe(false);
    expect(scene.status).toBeInstanceOf(xb.UIText);
    expect(scene.history.children).toEqual([scene.historyText]);
    expect(scene.card).toBeInstanceOf(xb.UICard);
    expect(scene.children).toEqual([scene.card]);
    expect(scene.loadButton.label).toBe('Download Gemma 4 (~3.4 GB)');
    expect(scene.presetButtons.map((button) => button.label)).toEqual(
      PRESETS.map(({label}) => label)
    );
    expect(client.check).not.toHaveBeenCalled();
    expect(client.load).not.toHaveBeenCalled();
    expect(store.inspectCache).not.toHaveBeenCalled();
    expect(scene.privacy.text).toContain('stay on this device');
    expect(scene.privacy.text).toContain('while the model remains loaded');
    expect(scene.card.children[1].text).toContain('Gemma 4');
    expect(scene.card.children[1].text).toContain('Lite');
    expect(scene.card.children[1].text).toContain('Chrome/WebGPU');
    expect(scene.card.children[1].text).not.toMatch(/shader|compil|pause/i);
    expect(scene.privacy.text).not.toMatch(/wrong|safety-critical/i);
  });

  it('initializes capabilities, cache and live camera without downloading', async () => {
    const {scene, client, store} = setup({cached: true});
    await scene.init();
    await scene.init();
    expect(client.check).toHaveBeenCalledTimes(1);
    expect(store.inspectCache.mock.calls).toEqual([
      [MODELS.gemma],
      [MODELS.lite],
    ]);
    expect(client.load).not.toHaveBeenCalled();
    expect(store.prepareStorage).not.toHaveBeenCalled();
    expect(scene.supported).toBe(true);
    expect(scene.cached).toBe(true);
    expect(scene.busy).toBe(false);
    expect(scene.loadButton.label).toBe('Load cached Gemma 4');
    expect(scene.preview.src).toBe(camera.texture);
    expect(scene.cameraStatus.text).toMatch(/simulator/i);
    expect(scene.askButton.disabled).toBe(true);
  });

  it('starts closer with readable desktop typography without adding UI panels', async () => {
    const {scene} = setup();
    const nodes = [];
    scene.traverse((node) => nodes.push(node));
    await scene.init();
    expect(scene.card.size.width).toBe(1.2);
    expect(scene.card.position.toArray()).toEqual([0, xb.user.height, -1]);
    expect(scene.card.children[0].style.fontSize).toBe(28);
    expect(scene.historyText.style.fontSize).toBe(22);
    expect(scene.composer.style.fontSize).toBe(22);
    expect(scene.buttons.every((button) => button.style.fontSize === 22)).toBe(
      true
    );
    expect(scene.status.style.fontSize).toBe(18);
    expect(scene.cameraStatus.style.fontSize).toBe(18);
    expect(scene.metrics.style.fontSize).toBe(18);
    const after = [];
    scene.traverse((node) => after.push(node));
    expect(after).toEqual(nodes);
  });

  it('reports unsupported worker capabilities and disables load', async () => {
    const {scene, client} = setup();
    client.check.mockRejectedValueOnce(
      new Error('WebGPU shader-f16 unavailable')
    );
    await scene.init();
    expect(scene.status.text).toMatch(/unsupported.*shader-f16/i);
    expect(scene.supported).toBe(false);
    expect(scene.busy).toBe(false);
    expect(scene.loadButton.disabled).toBe(true);
    expect(client.load).not.toHaveBeenCalled();
  });

  it('reports local cache errors without trying to fetch or retry', async () => {
    const {scene, client, store} = setup();
    store.inspectCache.mockRejectedValueOnce(new Error('Cache access denied'));
    await scene.init();
    expect(scene.status.text).toMatch(/cache access denied/i);
    expect(scene.cached).toBe(false);
    expect(scene.busy).toBe(false);
    expect(client.load).not.toHaveBeenCalled();
    expect(store.inspectCache).toHaveBeenCalledTimes(1);
  });
});

describe('explicit model loading', () => {
  it('keeps the original cached-load consent if the cache was evicted', async () => {
    const {scene, client, store} = setup({cached: true});
    await scene.init();
    store.inspectCache.mockResolvedValueOnce({
      complete: false,
      missingBytes: 100,
    });
    await scene.loadButton.onClick();
    expect(client.load).not.toHaveBeenCalled();
    expect(store.prepareStorage).not.toHaveBeenCalled();
    expect(scene.cached).toBe(false);
    expect(scene.status.text).toMatch(/download.*required|required.*download/i);
    expect(scene.loadButton.label).toBe('Download Gemma 4 (~3.4 GB)');
  });

  it('does not authorize downloads through the default load method', async () => {
    const {scene, client} = setup();
    await scene.init();
    await scene.loadModel();
    expect(client.load).not.toHaveBeenCalled();
    expect(scene.status.text).toMatch(/download.*required|required.*download/i);
  });

  it('prepares only missing bytes on an explicit download and keeps warnings visible', async () => {
    const {scene, client, store} = setup();
    await scene.init();
    store.inspectCache.mockResolvedValueOnce({
      complete: false,
      missingBytes: 123,
    });
    store.prepareStorage.mockResolvedValueOnce({
      warning: 'Storage persistence denied.',
    });
    client.load.mockImplementationOnce(async ({allowDownload}) => {
      expect(allowDownload).toBe(true);
      expect(scene.status.text).toContain('Storage persistence denied.');
      client.loaded = true;
      return {cached: false, cacheWarning: 'Model was not fully saved.'};
    });
    await scene.loadButton.onClick();
    expect(store.prepareStorage).toHaveBeenCalledWith(123);
    expect(scene.status.text).toContain('not fully saved');
    expect(scene.status.text).toContain('Storage persistence denied.');
    expect(scene.cached).toBe(false);
    expect(scene.loadButton.disabled).toBe(true);
  });

  it('loads cached assets without preparing download storage', async () => {
    const {scene, client, store} = setup({cached: true});
    await scene.init();
    await scene.loadButton.onClick();
    expect(client.load).toHaveBeenCalledWith({
      modelKey: 'gemma',
      allowDownload: false,
      onProgress: expect.any(Function),
    });
    expect(store.prepareStorage).not.toHaveBeenCalled();
    expect(scene.cached).toBe(true);
  });

  it('retains denied-persistence warnings after progress and successful cache verification', async () => {
    const {scene, client, store} = setup();
    await scene.init();
    store.prepareStorage.mockResolvedValueOnce({
      warning:
        'Storage persistence was denied; the browser may evict the model.',
    });
    client.load.mockImplementationOnce(async ({onProgress}) => {
      clock = 100;
      onProgress({status: 'done', file: 'onnx/embed_tokens_q4f16.onnx_data'});
      expect(scene.status.text).toContain('Storage persistence was denied');
      client.loaded = true;
      return {cached: true};
    });
    await scene.loadModel({allowDownload: true});
    expect(scene.cached).toBe(true);
    expect(scene.status.text).toContain('Ready');
    expect(scene.status.text).toContain('Storage persistence was denied');
    clock = 200;
    scene.update();
    expect(scene.status.text).toContain('Storage persistence was denied');
    expect(client.generate).not.toHaveBeenCalled();
  });

  it('normalizes known-file byte progress monotonically at no more than 10 Hz', async () => {
    const {scene, client} = setup();
    await scene.init();
    const pending = deferred<{cached: boolean}>();
    let progress;
    client.load.mockImplementationOnce(({onProgress}) => {
      client.state = 'loading';
      progress = onProgress;
      return pending.promise;
    });
    const loading = scene.loadModel({allowDownload: true});
    await vi.waitFor(() => expect(progress).toBeTypeOf('function'));
    const file = 'onnx/embed_tokens_q4f16.onnx_data';
    clock = 100;
    progress({status: 'progress', file, loaded: MODEL_FILES[file]});
    scene.update();
    const status = scene.status.text;
    expect(status).toContain(
      `${Math.floor((MODEL_FILES[file] / MODEL_BYTES) * 100)}%`
    );
    const writes = scene.status.writes;
    for (let i = 0; i < 100; i++) {
      progress({status: 'progress', file, loaded: 1});
      scene.update();
    }
    expect(scene.status.writes).toBe(writes);
    clock = 200;
    progress({status: 'progress', file: 'unknown', loaded: MODEL_BYTES * 2});
    scene.update();
    expect(scene.status.text).toBe(status);
    client.loaded = true;
    client.state = 'ready';
    pending.resolve({cached: true});
    await loading;
    expect(scene.status.text).toMatch(/ready/i);
  });

  it('leaves failed loading recoverable with no automatic retry', async () => {
    const {scene, client} = setup();
    await scene.init();
    client.load.mockRejectedValueOnce(new Error('GPU memory exhausted'));
    await scene.loadModel({allowDownload: true});
    expect(scene.status.text).toContain('GPU memory exhausted');
    expect(scene.busy).toBe(false);
    expect(scene.loadButton.disabled).toBe(false);
    scene.update();
    expect(client.load).toHaveBeenCalledTimes(1);
  });

  it('blocks a known quota failure before downloading model bytes', async () => {
    const {scene, client, store} = setup();
    await scene.init();
    store.prepareStorage.mockRejectedValueOnce(
      new Error('Insufficient browser storage')
    );
    await scene.loadModel({allowDownload: true});
    expect(client.load).not.toHaveBeenCalled();
    expect(scene.status.text).toContain('Insufficient browser storage');
    expect(scene.busy).toBe(false);
    expect(scene.loadButton.disabled).toBe(false);
  });

  it('cancels preparation before it can start a model download', async () => {
    const {scene, client, store} = setup();
    await scene.init();
    const storage = deferred<{warning?: string}>();
    store.prepareStorage.mockReturnValueOnce(storage.promise);
    const loading = scene.loadModel({allowDownload: true});
    await vi.waitFor(() => expect(store.prepareStorage).toHaveBeenCalled());
    expect(scene.stopButton.disabled).toBe(false);
    await scene.stop();
    storage.resolve({});
    await loading;
    expect(client.load).not.toHaveBeenCalled();
    expect(scene.status.text).toMatch(/cancel/i);
    expect(scene.busy).toBe(false);
  });

  it('cancels an active model load without accepting subsequent progress', async () => {
    const {scene, client} = setup();
    await scene.init();
    const pending = deferred<{cached: boolean}>();
    let progress;
    client.load.mockImplementationOnce(({onProgress}) => {
      client.state = 'loading';
      progress = onProgress;
      return pending.promise;
    });
    const loading = scene.loadModel({allowDownload: true});
    await vi.waitFor(() => expect(progress).toBeTypeOf('function'));
    client.stop.mockImplementationOnce(async () => {
      client.state = 'idle';
      pending.reject(new Error('Model loading canceled'));
    });
    await scene.stop();
    await loading;
    const status = scene.status.text;
    clock = 100;
    progress({
      status: 'done',
      file: 'onnx/embed_tokens_q4f16.onnx_data',
    });
    scene.update();
    expect(scene.status.text).toBe(status);
    expect(status).toMatch(/canceled/i);
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(scene.busy).toBe(false);
    expect(scene.cached).toBe(false);
  });
});

describe('camera snapshots and ownership', () => {
  it('captures with exact SDK scaling and freezes pixels before transfer', async () => {
    const {scene, client} = setup();
    await scene.init();
    const original = snapshot();
    camera.captureSnapshot.mockResolvedValueOnce(original);
    client.setImage.mockImplementationOnce(async (image) => {
      expect(canvases[0].pixels).toEqual(original.data);
      const received = structuredClone(image, {transfer: [image.buffer]});
      expect(image.buffer.byteLength).toBe(0);
      expect(received.buffer.byteLength).toBe(8);
      client.imageId = 1;
      return {imageId: 1};
    });
    await scene.capture();
    expect(camera.captureSnapshot).toHaveBeenCalledWith({
      outputFormat: 'imageData',
      width: 768,
      height: 432,
    });
    expect(scene.thumbnail.src).toBeInstanceOf(THREE.CanvasTexture);
    expect(scene.thumbnail.src.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(scene.thumbnail.src.image).toBe(canvases[0]);
    expect([...original.data]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(client.load).not.toHaveBeenCalled();
  });

  it('replaces and disposes only its own frozen texture', async () => {
    const {scene} = await ready();
    const old = scene.thumbnail.src;
    const disposeOld = vi.spyOn(old, 'dispose');
    const disposePreview = vi.spyOn(camera.texture, 'dispose');
    await scene.ask('Describe.');
    await scene.capture();
    expect(disposeOld).toHaveBeenCalledTimes(1);
    expect(disposePreview).not.toHaveBeenCalled();
    expect(scene.historyText.text).toBe('');
    expect(scene.messages).toEqual([]);
  });

  it('does not replace a usable capture when the next camera read returns null', async () => {
    const {scene, client} = await ready();
    const old = scene.thumbnail.src;
    camera.captureSnapshot.mockResolvedValueOnce(null);
    await scene.capture();
    expect(scene.status.text).toMatch(/capture.*fail|no.*frame/i);
    expect(scene.thumbnail.src).toBe(old);
    expect(client.setImage).toHaveBeenCalledTimes(1);
    expect(scene.busy).toBe(false);
  });

  it('disposes a failed replacement while preserving the previous thumbnail', async () => {
    const {scene, client} = await ready();
    const old = scene.thumbnail.src;
    const disposed = vi.spyOn(THREE.Texture.prototype, 'dispose');
    client.setImage.mockRejectedValueOnce(new Error('Worker rejected capture'));
    await scene.capture();
    expect(scene.thumbnail.src).toBe(old);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(scene.status.text).toContain('Worker rejected capture');
  });

  it('reports permission and unavailable-camera states without owning the camera lifecycle', async () => {
    const {scene} = setup();
    await scene.init();
    camera.state = 'error';
    camera.dispatchEvent({
      type: 'statechange',
      state: 'error',
      error: new Error('Permission denied'),
    });
    expect(scene.cameraStatus.text).toMatch(/permission denied/i);
    expect(scene.captureButton.disabled).toBe(true);
    camera.simulatorCamera = undefined;
    camera.state = 'streaming';
    camera.dispatchEvent({type: 'statechange', state: 'streaming'});
    expect(scene.cameraStatus.text).toMatch(/device camera/i);
    expect(scene.captureButton.disabled).toBe(false);
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it('does not label a physical camera as simulated just because a simulator is registered', async () => {
    const {scene} = setup();
    camera.getCurrentDevice = () => ({groupId: 'physical-camera'});
    await scene.init();
    expect(scene.cameraStatus.text).toMatch(/device camera/i);
    expect(scene.cameraStatus.text).not.toMatch(/simulator/i);
  });

  it('reports missing camera and rejects capture without starting model loading', async () => {
    xb.core.deviceCamera = undefined;
    const {scene, client} = setup();
    await scene.init();
    await scene.capture();
    expect(scene.captureButton.disabled).toBe(true);
    expect(scene.status.text).toMatch(/camera unavailable/i);
    expect(client.setImage).not.toHaveBeenCalled();
    expect(client.load).not.toHaveBeenCalled();
  });

  it('ignores a late capture after disposal and removes camera listeners', async () => {
    const {scene, client} = setup();
    await scene.init();
    const pending = deferred<Snapshot | null>();
    camera.captureSnapshot.mockReturnValueOnce(pending.promise);
    const capture = scene.capture();
    await scene.dispose();
    const status = scene.cameraStatus.text;
    camera.dispatchEvent({type: 'statechange', state: 'error'});
    pending.resolve(snapshot());
    await capture;
    expect(scene.cameraStatus.text).toBe(status);
    expect(client.setImage).not.toHaveBeenCalled();
    expect(canvases).toHaveLength(0);
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it('disposes a pending thumbnail exactly once if disposed while image transfer is awaiting acknowledgement', async () => {
    const {scene, client} = setup();
    await scene.init();
    const pending = deferred<{imageId: number}>();
    client.setImage.mockReturnValueOnce(pending.promise);
    const release = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const capture = scene.capture();
    await vi.waitFor(() => expect(client.setImage).toHaveBeenCalled());
    await scene.dispose();
    pending.resolve({imageId: 1});
    await capture;
    expect(release).toHaveBeenCalledTimes(1);
    expect(scene.thumbnail.src).not.toBeInstanceOf(THREE.Texture);
    expect(scene.textures.size).toBe(0);
  });
});

describe('retained conversation and generation', () => {
  it('asks only after model and capture are ready; presets never capture or download', async () => {
    const {scene, client} = setup();
    await scene.init();
    await scene.ask('What is this?');
    expect(client.generate).not.toHaveBeenCalled();
    expect(scene.presetButtons.every((button) => button.disabled)).toBe(true);
    await scene.loadModel({allowDownload: true});
    await scene.ask('What is this?');
    expect(client.generate).not.toHaveBeenCalled();
    await scene.capture();
    for (let index = 0; index < PRESETS.length; index++) {
      await scene.presetButtons[index].onClick();
      expect(client.generate).toHaveBeenLastCalledWith(PRESETS[index].prompt, {
        imageBudget: IMAGE_BUDGET,
        onText: expect.any(Function),
      });
    }
    expect(camera.captureSnapshot).toHaveBeenCalledTimes(1);
    expect(client.load).toHaveBeenCalledTimes(1);
  });

  it('binds the real text input submit contract and keeps user text literal', async () => {
    const {scene, client} = await ready();
    scene.composer.value = ' What does **this** say? ';
    scene.composer.onInput(scene.composer.value);
    expect(scene.askButton.disabled).toBe(false);
    await scene.composer.onSubmit(scene.composer.value);
    expect(client.generate.mock.calls[0][0]).toBe('What does **this** say?');
    expect(scene.historyText.text).toContain('You\nWhat does **this** say?');
    expect(scene.composer.value).toBe('');
  });

  it('rejects empty or overlength questions without starting generation', async () => {
    const {scene, client} = await ready();
    await scene.ask('  ');
    await scene.ask('a'.repeat(2001));
    expect(client.generate).not.toHaveBeenCalled();
    expect(scene.historyText.text).toBe('');
    expect(scene.busy).toBe(false);
  });

  it('throttles cumulative text to 10 Hz, preserves UI identity and flushes final text', async () => {
    const {scene, client} = await ready();
    const pending = deferred<GenerationResult>();
    let onText;
    client.generate.mockImplementationOnce((_question, options) => {
      client.state = 'generating';
      onText = options.onText;
      return pending.promise;
    });
    const nodes = [];
    scene.traverse((node) => nodes.push(node));
    const asking = scene.ask('Read the sign.');
    const text = scene.historyText;
    const writes = text.writes;
    for (clock = 1; clock < 100; clock++) {
      onText(`**Bonjour ${clock}`);
      scene.update();
    }
    expect(text.writes).toBe(writes);
    expect(scene.captureButton.disabled).toBe(true);
    expect(scene.stopButton.disabled).toBe(false);
    scene.update();
    expect(text.writes).toBe(writes + 1);
    expect(text.text).toContain('Bonjour 99');
    clock = 150;
    onText('Final **Bonjour**');
    pending.resolve({text: 'Final **Bonjour**', interrupted: false});
    await asking;
    expect(text.text).toContain('Final Bonjour');
    expect(text.writes).toBe(writes + 2);
    const after = [];
    scene.traverse((node) => after.push(node));
    expect(after).toEqual(nodes);
    expect(scene.historyText).toBe(text);
    expect(scene.history.children).toEqual([text]);
    onText('Stale callback');
    clock = 300;
    scene.update();
    expect(text.text).not.toContain('Stale callback');
  });

  it('follows new layout only if the user was already at the bottom', async () => {
    const {scene, client} = await ready();
    const pending = deferred<GenerationResult>();
    let onText;
    client.generate.mockImplementationOnce((_question, options) => {
      onText = options.onText;
      return pending.promise;
    });
    scene.history.scrollTop = 200;
    const asking = scene.ask('Describe.');
    scene.history.scrollHeight = 500;
    clock = 100;
    scene.update();
    expect(scene.history.scrollTop).toBe(300);
    scene.history.scrollTo(50);
    onText('A longer answer.');
    clock = 200;
    scene.update();
    scene.history.scrollHeight = 600;
    clock = 300;
    scene.update();
    expect(scene.history.scrollTop).toBe(50);
    pending.resolve({text: 'Final answer.', interrupted: false});
    await asking;
    expect(scene.history.scrollTop).toBe(50);
  });

  it('cancels queued bottom following when the user scrolls before layout catches up', async () => {
    const {scene} = await ready();
    scene.history.scrollTop = 200;
    await scene.ask('Describe.');
    scene.history.scrollTo(50);
    scene.history.scrollHeight = 700;
    clock = 100;
    scene.update();
    expect(scene.history.scrollTop).toBe(50);
  });

  it('uses actual token metrics and marks capped output without HTML injection', async () => {
    const {scene, client} = await ready();
    client.generate.mockResolvedValueOnce({
      text: '## Read\n\n- Bonjour\n  - café\n\n<script>bad()</script>',
      interrupted: false,
      truncated: true,
      firstTextMs: 123.6,
      tokensPerSecond: 8.25,
      generatedTokens: 128,
    });
    await scene.ask('Read.');
    expect(scene.metrics.text).toContain('124 ms');
    expect(scene.metrics.text).toContain('8.3 tokens/s');
    expect(scene.metrics.text).toContain('128 tokens');
    expect(scene.historyText.text).toContain('READ');
    expect(scene.historyText.text).toContain('\u00a0\u00a0• café');
    expect(scene.historyText.text).not.toContain('<script>');
    expect(scene.historyText.text).toMatch(/output limit|token limit/i);
    expect(scene.status.text).toMatch(/output limit|token limit/i);
  });

  it('does not fabricate token metrics when they are unavailable', async () => {
    const {scene, client} = await ready();
    client.generate.mockResolvedValueOnce({text: 'Many characters here.'});
    await scene.ask('Describe.');
    expect(scene.metrics.text).toContain('unavailable');
    expect(scene.metrics.text).not.toMatch(/\d.*tokens\/s/);
  });

  it('stops generation, retains marked partial text and prevents conflicting actions', async () => {
    const {scene, client} = await ready();
    const pending = deferred<GenerationResult>();
    client.generate.mockImplementationOnce((_question, {onText}) => {
      client.state = 'generating';
      onText('Partial **answer**');
      return pending.promise;
    });
    const asking = scene.ask('Read.');
    await scene.capture();
    await scene.clearConversation();
    await scene.ask('Other question.');
    expect(camera.captureSnapshot).toHaveBeenCalledTimes(1);
    expect(client.clear).not.toHaveBeenCalled();
    expect(client.generate).toHaveBeenCalledTimes(1);
    client.stop.mockImplementationOnce(async () => {
      client.state = 'ready';
      pending.resolve({text: 'Partial **answer**', interrupted: true});
    });
    await scene.stop();
    await asking;
    expect(scene.historyText.text).toContain('Partial answer');
    expect(scene.historyText.text).toContain('[Interrupted]');
    expect(scene.status.text).toMatch(/not.*model history|not.*conversation/i);
    expect(scene.busy).toBe(false);
  });

  it('keeps a failed partial reply visible without treating it as completed history', async () => {
    const {scene, client} = await ready();
    client.generate.mockImplementationOnce(async (_question, {onText}) => {
      onText('Partial OCR');
      throw new Error('GPU device lost');
    });
    await scene.ask('Read.');
    expect(scene.historyText.text).toContain('Partial OCR');
    expect(scene.historyText.text).toMatch(/\[Failed/);
    expect(scene.messages[0].state).toBe('failed');
    expect(scene.status.text).toContain('GPU device lost');
    expect(scene.busy).toBe(false);
  });

  it('preserves the actionable worker error while explaining recovery after a reset', async () => {
    const {scene, client} = await ready();
    client.generate.mockImplementationOnce(async () => {
      client.loaded = false;
      client.imageId = null;
      client.state = 'idle';
      throw new Error('WebGPU device lost: out of memory');
    });
    await scene.ask('Describe.');
    expect(scene.status.text).toContain('WebGPU device lost: out of memory');
    expect(scene.status.text).toMatch(/load.*again|reload/i);
    expect(scene.askButton.disabled).toBe(true);
  });

  it('does not mutate retained text after disposal even if generation resolves late', async () => {
    const {scene, client} = await ready();
    const pending = deferred<GenerationResult>();
    let onText;
    client.generate.mockImplementationOnce((_question, options) => {
      onText = options.onText;
      return pending.promise;
    });
    const asking = scene.ask('Describe.');
    await scene.dispose();
    const text = scene.historyText.text;
    const status = scene.status.text;
    onText('Late text');
    pending.resolve({text: 'Late final answer'});
    await asking;
    clock = 100;
    scene.update();
    expect(scene.historyText.text).toBe(text);
    expect(scene.status.text).toBe(status);
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });

  it('clears UI and worker history but retains the loaded model and captured image', async () => {
    const {scene, client} = await ready();
    await scene.ask('Describe.');
    const texture = scene.thumbnail.src;
    const imageId = client.imageId;
    await scene.clearConversation();
    expect(client.clear).toHaveBeenCalledTimes(1);
    expect(client.loaded).toBe(true);
    expect(client.imageId).toBe(imageId);
    expect(scene.thumbnail.src).toBe(texture);
    expect(scene.messages).toEqual([]);
    expect(scene.historyText.text).toBe('');
    expect(scene.history.scrollTop).toBe(0);
  });

  it('polls control state at 10 Hz and disables asking after a worker reset', async () => {
    const {scene, client} = await ready();
    const refresh = vi.spyOn(scene, 'refreshControls');
    scene.update();
    refresh.mockClear();
    for (clock = 1; clock < 100; clock++) scene.update();
    expect(refresh).not.toHaveBeenCalled();
    client.loaded = false;
    client.state = 'idle';
    client.imageId = null;
    scene.update();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(scene.askButton.disabled).toBe(true);
    expect(scene.status.text).toMatch(/reload|load.*again/i);
  });

  it('disposes own texture, callbacks and client once without disposing the SDK preview', async () => {
    const {scene, client} = await ready();
    const own = vi.spyOn(scene.thumbnail.src, 'dispose');
    const preview = vi.spyOn(camera.texture, 'dispose');
    await scene.dispose();
    await scene.dispose();
    expect(own).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(scene.composer.onSubmit).toBeUndefined();
    expect(scene.loadButton.onClick).toBeUndefined();
    expect(scene.children).toHaveLength(0);
    expect(scene.askButton.disabled).toBe(true);
    expect(camera.stop).not.toHaveBeenCalled();
  });
});

describe('model chooser', () => {
  it('notes the Gemma size only when Gemma is selected on a compact device', async () => {
    const {scene} = setup({initial: 'lite', compact: true});
    await scene.init();
    expect(scene.status.text).not.toContain(COMPACT_GEMMA_NOTE);
    expect(scene.modelButtons[0].disabled).toBe(false);
    await scene.modelButtons[0].onClick();
    expect(scene.status.text).toContain(COMPACT_GEMMA_NOTE);
    expect(scene.loadButton.disabled).toBe(false);
    await scene.modelButtons[1].onClick();
    expect(scene.status.text).not.toContain(COMPACT_GEMMA_NOTE);
  });

  it('keeps the note off desktops', async () => {
    const {scene} = setup({cached: true});
    await scene.init();
    expect(scene.modelKey).toBe('gemma');
    expect(scene.status.text).not.toContain(COMPACT_GEMMA_NOTE);
  });

  it('starts from the injected choice and labels both models on one retained row', async () => {
    const {scene} = setup({initial: 'lite', liteCached: true});
    expect(scene.modelKey).toBe('lite');
    expect(scene.modelButtons.map((button) => button.label)).toEqual([
      MODELS.gemma.choiceLabel,
      MODELS.lite.choiceLabel,
    ]);
    expect(scene.card.children[2].children).toEqual(scene.modelButtons);
    for (const button of scene.modelButtons) {
      expect(button.style).toMatchObject({flexBasis: 0, whiteSpace: 'nowrap'});
    }
    expect(scene.modelButtons[1].ariaLabel).toContain('selected');
    await scene.init();
    expect(scene.cached).toBe(true);
    expect(scene.loadButton.label).toBe('Load cached Lite');
    expect(scene.status.text).toContain('Lite cached');
  });

  it('switches selection without loading, downloading or adding UI, and persists it', async () => {
    const {scene, client, store, choice} = setup({cached: true});
    await scene.init();
    const nodes = [];
    scene.traverse((node) => nodes.push(node));
    expect(scene.loadButton.label).toBe('Load cached Gemma 4');
    await scene.modelButtons[1].onClick();
    expect(scene.modelKey).toBe('lite');
    expect(choice.save).toHaveBeenCalledWith('lite');
    expect(scene.loadButton.label).toBe('Download Lite (~360 MB)');
    expect(scene.modelButtons[1].style.backgroundColor).not.toBe(
      scene.modelButtons[0].style.backgroundColor
    );
    expect(client.load).not.toHaveBeenCalled();
    expect(store.prepareStorage).not.toHaveBeenCalled();
    const after = [];
    scene.traverse((node) => after.push(node));
    expect(after).toEqual(nodes);
  });

  it('downloads the selected model with its own size and progress', async () => {
    const {scene, client, store} = setup({initial: 'lite'});
    await scene.init();
    let progress;
    client.load.mockImplementationOnce(async (options) => {
      progress = options.onProgress;
      clock = 100;
      progress({
        status: 'progress',
        file: 'onnx/decoder_model_merged_q4f16.onnx',
        loaded: MODELS.lite.files['onnx/decoder_model_merged_q4f16.onnx'],
      });
      expect(scene.status.text).toContain('of 361 MB');
      client.loaded = true;
      client.modelKey = options.modelKey;
      return {cached: true};
    });
    await scene.loadButton.onClick();
    expect(store.prepareStorage).toHaveBeenCalledWith(MODELS.lite.bytes);
    expect(client.load).toHaveBeenCalledWith(
      expect.objectContaining({modelKey: 'lite', allowDownload: true})
    );
    expect(scene.status.text).toContain('Lite saved locally');
  });

  it('never downloads when loading a cached model that was evicted', async () => {
    const {scene, client, store} = setup({initial: 'lite', liteCached: true});
    await scene.init();
    store.inspectCache.mockResolvedValueOnce({
      complete: false,
      missingBytes: 10,
    });
    await scene.loadButton.onClick();
    expect(client.load).not.toHaveBeenCalled();
    expect(store.prepareStorage).not.toHaveBeenCalled();
    expect(scene.loadButton.label).toBe('Download Lite (~360 MB)');
  });

  it('switches the loaded model, clears the transcript and keeps the capture', async () => {
    const {scene, client, store} = await ready();
    await scene.ask('Describe');
    expect(scene.historyText.text).toContain('Gemma 4\nA sign.');
    store.inspectCache.mockResolvedValue({complete: true, missingBytes: 0});
    scene.cacheState.set('lite', true);
    scene.selectModel('lite');
    expect(scene.loadButton.disabled).toBe(false);
    client.load.mockImplementationOnce(async (options) => {
      client.modelKey = options.modelKey;
      return {cached: true};
    });
    await scene.loadButton.onClick();
    expect(client.load).toHaveBeenLastCalledWith(
      expect.objectContaining({modelKey: 'lite', allowDownload: false})
    );
    expect(scene.historyText.text).toBe('');
    expect(scene.status.text).toBe(
      'Ready. Lite saved locally; ask about the captured image.'
    );
    expect(scene.loadButton.disabled).toBe(true);
    expect(client.imageId).toBe(1);
    await scene.ask('Describe');
    expect(client.generate).toHaveBeenLastCalledWith('Describe', {
      imageBudget: MODELS.lite.imageBudget,
      onText: expect.any(Function),
    });
    expect(scene.historyText.text).toContain('Lite\nA sign.');
  });

  it('offers only the presets the loaded model handles', async () => {
    const {scene, client} = await ready();
    const translate = PRESETS.findIndex(({id}) => id === 'translate');
    expect(scene.presetButtons.every((button) => !button.disabled)).toBe(true);
    client.modelKey = 'lite';
    scene.refreshControls();
    expect(scene.presetButtons[translate].disabled).toBe(true);
    expect(
      scene.presetButtons.filter((_, index) => index !== translate)
    ).toSatisfy((buttons) => buttons.every((button) => !button.disabled));
  });

  it('locks the chooser while a model is loading', async () => {
    const {scene, client, choice} = setup();
    await scene.init();
    const pending = deferred<{cached: boolean}>();
    client.load.mockImplementationOnce(() => {
      client.state = 'loading';
      return pending.promise;
    });
    const loading = scene.loadModel({allowDownload: true});
    await vi.waitFor(() => expect(client.load).toHaveBeenCalled());
    expect(scene.modelButtons.every((button) => button.disabled)).toBe(true);
    scene.selectModel('lite');
    expect(scene.modelKey).toBe('gemma');
    expect(choice.save).not.toHaveBeenCalled();
    client.loaded = true;
    client.state = 'ready';
    pending.resolve({cached: true});
    await loading;
    expect(scene.modelButtons.every((button) => !button.disabled)).toBe(true);
  });
});

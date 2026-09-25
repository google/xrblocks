import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {GemmaScene, compactSceneContext} from './GemmaScene.js';
import {GemmaClient} from './GemmaClient.js';
import {downloadModel, hasCachedModel} from './modelStore.js';
import {UITextInput} from '../../src/ui/components/UITextInput';
import {UIScrollView} from '../../src/ui/components/UIScrollView';

vi.mock('xrblocks', async () => {
  const [script, card, panel, text, input, scroll, button, element] =
    await Promise.all([
      import('../../src/core/Script'),
      import('../../src/ui/components/UICard'),
      import('../../src/ui/components/UIPanel'),
      import('../../src/ui/components/UIText'),
      import('../../src/ui/components/UITextInput'),
      import('../../src/ui/components/UIScrollView'),
      import('../../src/ui/components/UIButton'),
      import('../../src/ui/UIElement'),
    ]);
  return {
    Script: script.Script,
    MeshScript: script.MeshScript,
    Context: class {},
    UICard: card.UICard,
    UIPanel: panel.UIPanel,
    UIText: text.UIText,
    UITextInput: input.UITextInput,
    UIScrollView: scroll.UIScrollView,
    UIButton: button.UIButton,
    UIElement: element.UIElement,
  };
});

vi.mock('./modelStore.js', () => ({
  MODEL_BYTES: 2008432640,
  hasCachedModel: vi.fn(),
  downloadModel: vi.fn(),
}));

vi.mock('./GemmaClient.js', () => ({
  MAX_PROMPT_LENGTH: 2000,
  GemmaClient: vi.fn(
    class {
      state = 'idle';
      loaded = false;
      needsNewChat = false;
      onState: (state: string) => void;
      constructor({onState}: {onState: (state: string) => void}) {
        this.onState = onState;
      }
      setState = (state: string) => {
        this.state = state;
        this.onState(state);
      };
      load = vi.fn(async () => {
        this.setState('loading');
        this.loaded = true;
        this.setState('ready');
      });
      send = vi.fn(async () => ({
        text: 'The amber cube is selected.',
        interrupted: false,
        firstTextMs: 120,
        tokensPerSecond: 17.5,
        tokenCount: 42,
      }));
      stop = vi.fn(async () => {});
      newChat = vi.fn(async () => {
        this.needsNewChat = false;
        this.setState('ready');
      });
      dispose = vi.fn(async () => this.setState('disposed'));
    }
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

function snapshot(objects: THREE.Object3D[]) {
  return {
    nodes: Object.fromEntries(
      objects.map((object) => [
        `node-${object.id}`,
        {
          id: `node-${object.id}`,
          objectId: object.id,
          name: object.name,
          type: object.type,
          position: object.position.toArray(),
          bounds: {center: object.position.toArray(), size: [0.2, 0.2, 0.2]},
          text: 'Do not send transcript text.',
          children: ['unrelated'],
          view: {image: 'not-a-camera-input'},
        },
      ])
    ),
  };
}

describe('compactSceneContext', () => {
  it('includes only owned objects and whitelisted metadata with a selected semantic ID', () => {
    const cube = new THREE.Mesh();
    cube.name = 'Amber cube';
    cube.position.set(1, 2, 3);
    const transcript = new THREE.Object3D();
    transcript.name = 'Private chat transcript';
    const result = compactSceneContext(
      snapshot([cube, transcript]),
      [cube],
      cube
    );
    expect(result).toEqual({
      selectedId: `node-${cube.id}`,
      objects: [
        {
          id: `node-${cube.id}`,
          name: 'Amber cube',
          type: 'Mesh',
          position: [1, 2, 3],
          bounds: {center: [1, 2, 3], size: [0.2, 0.2, 0.2]},
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /transcript|image|children|objectId/
    );
  });

  it('reads fresh positions, omits absent bounds, and never selects an unowned node', () => {
    const cube = new THREE.Mesh();
    const other = new THREE.Object3D();
    const first = compactSceneContext(snapshot([cube]), [cube], other);
    cube.position.set(4, 5, 6);
    const tree = snapshot([cube]);
    delete tree.nodes[`node-${cube.id}`].bounds;
    const next = compactSceneContext(tree, [cube], cube);
    expect(first.selectedId).toBeNull();
    expect(first.objects[0].position).toEqual([0, 0, 0]);
    expect(next.objects[0].position).toEqual([4, 5, 6]);
    expect(next.objects[0]).not.toHaveProperty('bounds');
  });
});

describe('GemmaScene', () => {
  let scene: GemmaScene;
  let adapter: ReturnType<typeof vi.fn>;
  let context: {scene: {runContextDetection: ReturnType<typeof vi.fn>}};
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('caches', {});
    vi.stubGlobal('Worker', vi.fn());
    adapter = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', {gpu: {requestAdapter: adapter}});
    vi.mocked(hasCachedModel).mockResolvedValue(false);
    vi.mocked(downloadModel).mockResolvedValue(undefined);
    vi.spyOn(UITextInput.prototype, 'ready', 'get').mockReturnValue(true);
    log = vi.spyOn(console, 'error').mockImplementation(() => {});
    context = {
      scene: {
        runContextDetection: vi.fn(async () => ({
          semanticTree: snapshot([...scene.objects, scene.panel]),
        })),
      },
    };
    scene = new GemmaScene();
  });

  afterEach(async () => {
    await scene.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function ready() {
    await scene.init({context});
    await scene.loadModel();
  }

  it('constructs real public UI and movable named objects without loading weights', async () => {
    await scene.init({context});
    expect(scene.objects.map((object) => object.name)).toEqual([
      'Amber cube',
      'Blue sphere',
      'Green cylinder',
    ]);
    expect(scene.objects.every((object) => object.xb.manipulation)).toBe(true);
    expect(scene.panel.xb.manipulation).toBeTruthy();
    expect(scene.panel.size.width).toBe(0.98);
    expect(scene.panel.position.toArray()).toEqual([0, 1.65, -0.75]);
    expect(
      scene.objects.every(
        (object) =>
          object.position.y < scene.panel.position.y &&
          object.position.z < scene.panel.position.z
      )
    ).toBe(true);
    expect(scene.composer).toBeInstanceOf(UITextInput);
    expect(scene.composer.maxLength).toBe(2000);
    expect(scene.keyboard.open).toBe(false);
    expect(scene.keyboardToggle.xb.preserveTextFocus).toBe(true);
    expect(scene.loadButton.label).toBe('Download Gemma 4 (~2 GB)');
    expect(scene.sendButton.disabled).toBe(true);
    expect(downloadModel).not.toHaveBeenCalled();
    expect(adapter).not.toHaveBeenCalled();
    expect(GemmaClient).toHaveBeenCalledOnce();

    scene.objects[0].onObjectSelectStart({stopPropagation: vi.fn()});
    expect(scene.selected).toBe(scene.objects[0]);
    expect(scene.objects[0].material.emissive.getHex()).not.toBe(0);
    scene.objects[1].onObjectTouchStart({stopPropagation: vi.fn()});
    expect(scene.selected).toBe(scene.objects[1]);
    expect(scene.objects[0].material.emissive.getHex()).toBe(0);
    expect(scene.selectionLabel.text).toContain('Blue sphere');
    expect(downloadModel).not.toHaveBeenCalled();
    expect(scene.client.send).not.toHaveBeenCalled();
    expect(context.scene.runContextDetection).not.toHaveBeenCalled();
  });

  it('passes the optional worker factory to its client without eagerly creating a worker', async () => {
    const createWorker = vi.fn();
    scene = new GemmaScene({createWorker});
    await scene.init({context});
    expect(GemmaClient).toHaveBeenCalledWith({
      createWorker,
      onState: expect.any(Function),
    });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('offers cached load and lets the worker open the model without downloading again', async () => {
    vi.mocked(hasCachedModel).mockResolvedValue(true);
    await scene.init({context});
    expect(scene.loadButton.label).toBe('Load cached Gemma 4');
    await scene.loadButton.onClick();
    expect(adapter).toHaveBeenCalledOnce();
    expect(downloadModel).not.toHaveBeenCalled();
    expect(scene.client.load).toHaveBeenCalledWith();
    expect(scene.status.text).toMatch(/ready/i);
    expect(scene.loadButton.disabled).toBe(true);
  });

  it.each(['secure context', 'WebGPU', 'Cache API', 'Worker'])(
    'shows unsupported %s and does not begin a download',
    async (capability) => {
      if (capability === 'secure context')
        vi.stubGlobal('isSecureContext', false);
      if (capability === 'WebGPU') vi.stubGlobal('navigator', {});
      if (capability === 'Cache API') vi.stubGlobal('caches', undefined);
      if (capability === 'Worker') vi.stubGlobal('Worker', undefined);
      await scene.init({context});
      await scene.loadModel();
      expect(scene.status.text).toMatch(/unsupported/i);
      expect(scene.status.text).toContain(capability);
      expect(scene.loadButton.disabled).toBe(true);
      expect(hasCachedModel).not.toHaveBeenCalled();
      expect(downloadModel).not.toHaveBeenCalled();
    }
  );

  it('fails an unavailable adapter before fetching 2 GB', async () => {
    await scene.init({context});
    adapter.mockResolvedValue(null);
    await scene.loadModel();
    expect(scene.status.text).toMatch(/WebGPU adapter/i);
    expect(downloadModel).not.toHaveBeenCalled();
    expect(scene.loadButton.disabled).toBe(false);
  });

  it('surfaces cache and load errors and leaves a retry action', async () => {
    vi.mocked(hasCachedModel).mockRejectedValueOnce(
      new Error('Cache access denied')
    );
    await scene.init({context});
    expect(scene.status.text).toContain('Cache access denied');
    expect(scene.loadButton.disabled).toBe(false);
    scene.client.load.mockRejectedValueOnce(new Error('Cache evicted'));
    await scene.loadModel();
    expect(scene.status.text).toContain('Cache evicted');
    expect(scene.loadButton.disabled).toBe(false);
    expect(scene.client.load).toHaveBeenCalledWith();
    expect(log).toHaveBeenCalled();
  });

  it('shows worker initialization failures without retrying on the main thread', async () => {
    await scene.init({context});
    scene.client.load.mockRejectedValueOnce(
      new Error('Worker initialization failed')
    );
    await expect(scene.loadButton.onClick()).resolves.toBeUndefined();
    expect(scene.status.text).toContain('Worker initialization failed');
    expect(scene.loadButton.disabled).toBe(false);
    expect(scene.client.load).toHaveBeenCalledOnce();
  });

  it('reports progress and cancels a download without claiming the model is loaded', async () => {
    await scene.init({context});
    let signal: AbortSignal;
    vi.mocked(downloadModel).mockImplementationOnce(async (options) => {
      signal = options.signal;
      options.onProgress({
        received: 1000000000,
        total: 2000000000,
        phase: 'downloading',
      });
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('Cancelled', 'AbortError'))
        );
      });
    });
    const loading = scene.loadModel();
    await vi.waitFor(() => expect(downloadModel).toHaveBeenCalledOnce());
    expect(scene.status.text).toContain('50%');
    expect(scene.stopButton.disabled).toBe(false);
    expect(scene.sendButton.disabled).toBe(true);
    expect(scene.newChatButton.disabled).toBe(true);
    await scene.stopButton.onClick();
    await loading;
    expect(signal.aborted).toBe(true);
    expect(scene.status.text).toMatch(/cancel/i);
    expect(scene.client.load).not.toHaveBeenCalled();
    expect(scene.loadButton.disabled).toBe(false);
  });

  it('throttles download chunks to 10 Hz while showing saving immediately', async () => {
    await scene.init({context});
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const download = deferred<void>();
    let progress: (value: {
      received: number;
      total: number;
      phase: string;
    }) => void;
    vi.mocked(downloadModel).mockImplementationOnce((options) => {
      progress = options.onProgress;
      return download.promise;
    });
    const loading = scene.loadModel();
    await vi.waitFor(() => expect(downloadModel).toHaveBeenCalledOnce());
    const status = vi.spyOn(scene.status, 'text', 'set');
    const report = (received: number, phase = 'downloading') =>
      progress({received, total: 2000000000, phase});
    report(100000000);
    for (let chunk = 1; chunk <= 1000; chunk++) {
      now = 50;
      report(100000000 + chunk * 1000000);
    }
    expect(status).toHaveBeenCalledOnce();
    expect(scene.status.text).toContain('5%');
    now = 100;
    report(1500000000);
    expect(status).toHaveBeenCalledTimes(2);
    expect(scene.status.text).toContain('75%');
    now = 110;
    report(2000000000, 'saving');
    expect(status).toHaveBeenCalledTimes(3);
    expect(scene.status.text).toMatch(/Saving.*100%/);
    report(2000000000, 'saving');
    expect(status).toHaveBeenCalledTimes(3);
    download.resolve();
    await loading;
    expect(scene.status.text).toMatch(/ready/i);
    report(2000000000, 'saving');
    expect(scene.status.text).toMatch(/ready/i);
  });

  it('disallows overlapping actions during initialization, which cannot be aborted', async () => {
    await scene.init({context});
    const loading = deferred<void>();
    scene.client.load.mockImplementationOnce(() => loading.promise);
    const operation = scene.loadModel();
    await vi.waitFor(() => expect(scene.client.load).toHaveBeenCalledOnce());
    expect(scene.status.text).toMatch(/initializ/i);
    expect(scene.stopButton.disabled).toBe(true);
    expect(scene.newChatButton.disabled).toBe(true);
    await scene.loadModel();
    await scene.send();
    expect(scene.client.load).toHaveBeenCalledOnce();
    expect(scene.client.send).not.toHaveBeenCalled();
    loading.resolve();
    await operation;
  });

  it('validates model/input readiness, blank text, length, and New chat requirements', async () => {
    await scene.init({context});
    scene.composer.value = 'What is selected?';
    await scene.send();
    expect(scene.status.text).toMatch(/load|ready/i);
    await scene.loadModel();
    vi.spyOn(UITextInput.prototype, 'ready', 'get').mockReturnValue(false);
    await scene.send();
    expect(scene.status.text).toMatch(/input.*ready/i);
    vi.spyOn(UITextInput.prototype, 'ready', 'get').mockReturnValue(true);
    scene.composer.value = '  ';
    await scene.send();
    expect(scene.status.text).toMatch(/enter|empty/i);
    scene.composer.value = 'x'.repeat(2001);
    await scene.send();
    expect(scene.status.text).toContain('2,000');
    scene.composer.value = 'Compare the objects';
    scene.client.needsNewChat = true;
    scene.update();
    expect(scene.sendButton.disabled).toBe(true);
    await scene.send();
    expect(scene.status.text).toMatch(/new chat/i);
    expect(scene.client.send).not.toHaveBeenCalled();
    expect(context.scene.runContextDetection).not.toHaveBeenCalled();
  });

  it('fills presets without sending, toggles keyboard, and submits one fresh metadata snapshot', async () => {
    await ready();
    scene.presetButtons[0].onClick();
    expect(scene.composer.value).not.toBe('');
    expect(scene.client.send).not.toHaveBeenCalled();
    scene.keyboardToggle.onClick();
    expect(scene.keyboard.open).toBe(true);
    scene.objects[2].position.set(2, 3, -1);
    scene.objects[2].onObjectSelectStart({stopPropagation: vi.fn()});
    await scene.composer.onSubmit(scene.composer.value);
    expect(context.scene.runContextDetection).toHaveBeenCalledWith({
      semanticTree: true,
      visibleObjects: false,
      setOfMark: false,
    });
    const sent = scene.client.send.mock.calls[0][1];
    expect(sent.selectedId).toBe(`node-${scene.objects[2].id}`);
    expect(sent.objects).toHaveLength(3);
    expect(sent.objects.map((object) => object.type)).toEqual([
      'cube',
      'sphere',
      'cylinder',
    ]);
    expect(sent.objects[2].position).toEqual([2, 3, -1]);
    expect(JSON.stringify(sent)).not.toContain('Gemma');
    expect(scene.contextLabel.text).toMatch(/metadata.*not camera vision/i);
    expect(scene.metrics.text).toMatch(/120|0\.12/);
    expect(scene.metrics.text).toContain('17.5');
  });

  it('does not dirty unchanged button labels on every frame', async () => {
    await ready();
    const loadLabel = vi.spyOn(scene.loadButton, 'label', 'set');
    const stopLabel = vi.spyOn(scene.stopButton, 'label', 'set');
    scene.update();
    scene.update();
    expect(loadLabel).not.toHaveBeenCalled();
    expect(stopLabel).not.toHaveBeenCalled();
  });

  it('surfaces input backend failures and disables Send even if the backend still reports ready', async () => {
    await ready();
    scene.composer.value = 'Hello';
    vi.spyOn(UITextInput.prototype, 'error', 'get').mockReturnValue(
      new Error('Native input unavailable')
    );
    scene.update();
    expect(scene.status.text).toContain('Native input unavailable');
    expect(scene.sendButton.disabled).toBe(true);
  });

  it('shows missing-context and inference errors without rejecting UI callbacks', async () => {
    await ready();
    scene.composer.value = 'Hello';
    context.scene.runContextDetection.mockResolvedValueOnce({});
    await expect(scene.sendButton.onClick()).resolves.toBeUndefined();
    expect(scene.status.text).toMatch(/context|semantic/i);
    expect(scene.client.send).not.toHaveBeenCalled();
    scene.client.send.mockRejectedValueOnce(new Error('GPU device lost'));
    await expect(scene.sendButton.onClick()).resolves.toBeUndefined();
    expect(scene.status.text).toContain('GPU device lost');
    expect(log).toHaveBeenCalled();
  });

  it('paces accumulated text to 10 Hz, preserves a scrolled viewport, and flushes final text', async () => {
    await ready();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(UIScrollView.prototype, 'ready', 'get').mockReturnValue(true);
    vi.spyOn(UIScrollView.prototype, 'scrollHeight', 'get').mockReturnValue(
      800
    );
    vi.spyOn(UIScrollView.prototype, 'clientHeight', 'get').mockReturnValue(
      200
    );
    const scroll = vi.spyOn(scene.history, 'scrollTo');
    const result = deferred<object>();
    let onText: (text: string) => void;
    scene.client.send.mockImplementationOnce((_, __, options) => {
      onText = options.onText;
      scene.client.setState('generating');
      return result.promise;
    });
    scene.composer.value = 'Describe this scene';
    const sending = scene.send();
    await vi.waitFor(() => expect(scene.client.send).toHaveBeenCalledOnce());
    expect(scene.sendButton.disabled).toBe(true);
    expect(scene.newChatButton.disabled).toBe(true);
    expect(scene.stopButton.disabled).toBe(false);
    await scene.send();
    expect(scene.client.send).toHaveBeenCalledOnce();
    onText('First');
    scene.update();
    expect(scene.response.text).toBe('First');
    now = 30;
    onText('First second');
    scene.update();
    expect(scene.response.text).toBe('First');
    now = 100;
    scene.update();
    expect(scene.response.text).toBe('First second');
    expect(scroll).not.toHaveBeenCalled();
    now = 110;
    result.resolve({text: 'First second final', interrupted: false});
    await sending;
    expect(scene.response.text).toBe('First second final');
    expect(scene.metrics.text).toMatch(/unavailable/i);
  });

  it('follows a growing transcript only when the user remained at the bottom', async () => {
    await ready();
    let height = 200;
    vi.spyOn(UIScrollView.prototype, 'ready', 'get').mockReturnValue(true);
    vi.spyOn(UIScrollView.prototype, 'scrollHeight', 'get').mockImplementation(
      () => height
    );
    vi.spyOn(UIScrollView.prototype, 'clientHeight', 'get').mockReturnValue(
      200
    );
    scene.composer.value = 'Hello';
    await scene.send();
    height = 400;
    scene.update();
    expect(scene.history.scrollTop).toBe(200);
    scene.composer.value = 'Hello again';
    await scene.send();
    scene.history.scrollTo(100);
    height = 600;
    scene.update();
    expect(scene.history.scrollTop).toBe(100);
  });

  it('keeps an interrupted reply, requires fresh conversation guidance, and clears only on New chat', async () => {
    await ready();
    scene.client.send.mockResolvedValueOnce({
      text: 'Partial answer',
      interrupted: true,
    });
    scene.composer.value = 'Compare';
    await scene.send();
    expect(scene.response.text).toContain('Partial answer');
    expect(scene.response.text).toMatch(/interrupt/i);
    expect(scene.status.text).toMatch(/fresh|new conversation/i);
    await scene.newChatButton.onClick();
    expect(scene.client.newChat).toHaveBeenCalledOnce();
    expect(scene.history.children).toHaveLength(0);
    expect(downloadModel).toHaveBeenCalledOnce();
    expect(scene.client.loaded).toBe(true);
  });

  it('catches Stop and New chat failures without losing the visible transcript', async () => {
    await ready();
    const result = deferred<object>();
    scene.client.send.mockImplementationOnce((_, __, options) => {
      scene.client.setState('generating');
      options.onText('Partial');
      return result.promise;
    });
    scene.composer.value = 'Describe';
    const sending = scene.send();
    await vi.waitFor(() => expect(scene.client.send).toHaveBeenCalledOnce());
    scene.client.stop.mockRejectedValueOnce(new Error('Cancel failed'));
    await expect(scene.stopButton.onClick()).resolves.toBeUndefined();
    expect(scene.status.text).toContain('Cancel failed');
    scene.client.setState('ready');
    result.resolve({text: 'Partial', interrupted: true});
    await sending;
    scene.client.newChat.mockRejectedValueOnce(new Error('Reset failed'));
    await expect(scene.newChatButton.onClick()).resolves.toBeUndefined();
    expect(scene.status.text).toContain('Reset failed');
    expect(scene.history.children).toHaveLength(2);
    expect(scene.newChatButton.disabled).toBe(false);
    expect(scene.client.stop).toHaveBeenCalledOnce();
  });

  it('ignores old stream callbacks after New chat and during a later response', async () => {
    await ready();
    let lateText: (text: string) => void;
    scene.client.send.mockImplementationOnce(async (_, __, options) => {
      lateText = options.onText;
      return {text: 'First response'};
    });
    scene.composer.value = 'First question';
    await scene.send();
    await scene.newChat();
    const result = deferred<object>();
    scene.client.send.mockImplementationOnce((_, __, options) => {
      options.onText('Current response');
      return result.promise;
    });
    scene.composer.value = 'Second question';
    const sending = scene.send();
    await vi.waitFor(() => expect(scene.client.send).toHaveBeenCalledTimes(2));
    lateText('Stale response');
    scene.update();
    expect(scene.response.text).toBe('Current response');
    result.resolve({text: 'Current response'});
    await sending;
  });

  it('disposes geometry, materials, keyboard, and client and ignores late stream callbacks', async () => {
    await ready();
    const resources = scene.objects.flatMap((object) => [
      vi.spyOn(object.geometry, 'dispose'),
      vi.spyOn(object.material, 'dispose'),
    ]);
    const keyboard = vi.spyOn(scene.keyboard, 'dispose');
    const result = deferred<object>();
    let onText: (text: string) => void;
    scene.client.send.mockImplementationOnce((_, __, options) => {
      onText = options.onText;
      return result.promise;
    });
    scene.composer.value = 'Describe';
    const sending = scene.send();
    await vi.waitFor(() => expect(scene.client.send).toHaveBeenCalledOnce());
    const response = scene.response;
    const previous = response.text;
    scene.client.dispose.mockRejectedValueOnce(new Error('GPU cleanup failed'));
    await expect(scene.dispose()).resolves.toBeUndefined();
    onText('late text');
    result.resolve({text: 'late final'});
    await sending;
    scene.update();
    expect(response.text).toBe(previous);
    for (const dispose of resources) expect(dispose).toHaveBeenCalledOnce();
    expect(keyboard).toHaveBeenCalledOnce();
    expect(scene.client.dispose).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(scene.children).toHaveLength(0);
  });
});

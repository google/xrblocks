import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getDeltaTime, getUrlParamBool} from 'xrblocks';

import {LayersScene} from './LayersScene.js';
import {TestCard} from './TestCard.js';

vi.mock('xrblocks', async () => {
  const {Script} = await import('../../src/core/Script');
  const {LayerManager} = await import('../../src/layers/LayerManager');
  const {VideoLayer} = await import('../../src/layers/VideoLayer');
  const {UICard} = await import('../../src/ui/components/UICard');
  const {UIText} = await import('../../src/ui/components/UIText');
  return {
    Script,
    LayerManager,
    VideoLayer,
    UICard,
    UIText,
    getDeltaTime: vi.fn(() => 0),
    getUrlParamBool: vi.fn(() => false),
  };
});

const callbacks = new Map<number, FrameRequestCallback>();
const captures: {stream: MediaStream; stop: ReturnType<typeof vi.fn>}[] = [];
const cards: TestCard[] = [];
const captureStreamDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'captureStream'
);

beforeEach(() => {
  let nextFrame = 0;
  callbacks.clear();
  captures.length = 0;
  cards.length = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const id = nextFrame++;
      callbacks.set(id, cb);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      callbacks.delete(id);
    })
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value: vi.fn(() => {
      const stop = vi.fn();
      const stream = {getTracks: () => [{stop}]} as unknown as MediaStream;
      captures.push({stream, stop});
      return stream;
    }),
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('XRMediaBinding', undefined);
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      constructor(
        readonly position = {x: 0, y: 0, z: 0},
        readonly orientation = {x: 0, y: 0, z: 0, w: 1}
      ) {}
    }
  );
  vi.mocked(getDeltaTime).mockReturnValue(0);
  vi.mocked(getUrlParamBool).mockReturnValue(false);
});

afterEach(() => {
  for (const card of cards) card.stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (captureStreamDescriptor) {
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'captureStream',
      captureStreamDescriptor
    );
  } else {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
  }
});

function drawFrame() {
  const pending = [...callbacks.values()];
  callbacks.clear();
  for (const callback of pending) callback(16);
}

describe('TestCard producer and consumers', () => {
  it('feeds two independent videos with one drawing loop', () => {
    const card = new TestCard();
    cards.push(card);
    const first = card.start();
    const second = card.start();

    expect(first).not.toBe(second);
    expect(first.srcObject).toBe(captures[0].stream);
    expect(second.srcObject).toBe(captures[1].stream);
    expect(first.srcObject).not.toBe(second.srcObject);
    expect(document.querySelectorAll('video')).toHaveLength(2);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(card.canvas.captureStream).toHaveBeenNthCalledWith(1, 30);
    expect(card.canvas.captureStream).toHaveBeenNthCalledWith(2, 30);
    expect(card.frame).toBe(1);
    expect(callbacks.size).toBe(1);

    for (let i = 0; i < 10; i++) drawFrame();

    expect(card.frame).toBe(11);
    expect(callbacks.size).toBe(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(11);
  });

  it('cancels even frame ID zero and releases every consumer exactly once', () => {
    const card = new TestCard();
    cards.push(card);
    const videos = [card.start(), card.start()];

    card.stop();
    card.stop();
    drawFrame();

    expect(cancelAnimationFrame).toHaveBeenCalledExactlyOnceWith(0);
    expect(callbacks.size).toBe(0);
    expect(card.frame).toBe(1);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
    for (const {stop} of captures) expect(stop).toHaveBeenCalledOnce();
    for (const video of videos) {
      expect(video.srcObject).toBeNull();
      expect(video.isConnected).toBe(false);
    }
  });

  it('starts one new producer after stopping', () => {
    const card = new TestCard();
    cards.push(card);
    const oldVideo = card.start();
    card.stop();
    const newVideo = card.start();
    drawFrame();

    expect(newVideo).not.toBe(oldVideo);
    expect([...document.querySelectorAll('video')]).toEqual([newVideo]);
    expect(callbacks.size).toBe(1);
    expect(captures[0].stop).toHaveBeenCalledOnce();
    expect(captures[1].stop).not.toHaveBeenCalled();
    expect(card.frame).toBe(3);
  });
});

function setVideoReady(
  video: HTMLVideoElement,
  width = 2048,
  height = 1152,
  readyState = HTMLMediaElement.HAVE_CURRENT_DATA
) {
  Object.defineProperties(video, {
    videoWidth: {configurable: true, value: width},
    videoHeight: {configurable: true, value: height},
    readyState: {configurable: true, value: readyState},
  });
}

function setupScene({media = false, forced = false, ready = true} = {}) {
  const makeQuad = (init: XRQuadLayerInit | XRMediaQuadLayerInit) =>
    ({
      ...init,
      needsRedraw: false,
      destroy: vi.fn(),
    }) as unknown as XRQuadLayer;
  const createQuadLayer = vi.fn(makeQuad);
  const createMediaQuad = vi.fn(
    (_video: HTMLVideoElement, init: XRMediaQuadLayerInit) => makeQuad(init)
  );
  if (media) {
    vi.stubGlobal(
      'XRMediaBinding',
      class {
        createQuadLayer = createMediaQuad;
      }
    );
  }
  vi.mocked(getUrlParamBool).mockReturnValue(forced);
  const gl = {
    ACTIVE_TEXTURE: 34016,
    TEXTURE_BINDING_2D: 32873,
    UNPACK_FLIP_Y_WEBGL: 37440,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    getParameter: vi.fn(() => 0),
    pixelStorei: vi.fn(),
    bindTexture: vi.fn(),
    texSubImage2D: vi.fn(),
    activeTexture: vi.fn(),
  };
  const binding = {
    createQuadLayer,
    getSubImage: vi.fn(() => ({colorTexture: {}})),
  };
  let session: XRSession | null = null;
  const space = {} as XRReferenceSpace;
  const baseLayer = {} as XRLayer;
  const renderer = {
    getContext: () => gl,
    xr: {
      isPresenting: false,
      getSession: () => session,
      getReferenceSpace: () => space,
      getBinding: vi.fn(() => binding),
      getBaseLayer: () => baseLayer,
      getFrame: () => (session ? ({} as XRFrame) : undefined),
    },
  };
  const scene = new LayersScene();
  scene.init({renderer});
  cards.push(scene.card);
  if (ready) setVideoReady(scene.layerVideo);
  const enter = () => {
    const updateRenderState = vi.fn();
    session = {updateRenderState} as unknown as XRSession;
    renderer.xr.isPresenting = true;
    scene.onXRSessionStarted();
    return updateRenderState;
  };
  const exit = (notifyScene = true) => {
    session = null;
    renderer.xr.isPresenting = false;
    if (notifyScene) scene.onXRSessionEnded();
  };
  return {
    scene,
    renderer,
    binding,
    gl,
    createQuadLayer,
    createMediaQuad,
    enter,
    exit,
  };
}

describe('LayersScene layer lifetime', () => {
  it.each([
    {name: 'WebGL', media: false, forced: false, scale: 1, path: 'webgl'},
    {name: 'media', media: true, forced: false, scale: 0.5, path: 'media'},
    {
      name: 'forced WebGL',
      media: true,
      forced: true,
      scale: 0.5,
      path: 'webgl',
    },
  ])('moves the same $name quad through many swaps', (options) => {
    const {scene, createQuadLayer, createMediaQuad, enter, binding} =
      setupScene(options);
    const submit = enter();
    const quad = scene.videoLayer.getLayer();
    expect(quad).not.toBeNull();
    if (!quad) throw new Error('Expected a quad layer');
    expect(scene.videoLayer.getPath()).toBe(options.path);
    expect(quad.width).toBeCloseTo(1.2 * options.scale);
    expect(quad.height).toBeCloseTo((1.2 / (16 / 9)) * options.scale);

    for (let i = 0; i < 101; i++) {
      scene.swap();
      scene.update();
      expect(scene.videoLayer.getLayer()).toBe(quad);
      expect(quad.transform.position).toMatchObject({
        x: i % 2 === 0 ? 0.7 : -0.7,
        y: 1.4,
        z: -2,
      });
      expect(scene.leftMesh.position.x).toBe(quad.transform.position.x);
      expect(scene.rightMesh.position.x).toBe(-quad.transform.position.x);
    }

    expect(createQuadLayer).toHaveBeenCalledTimes(
      options.path === 'webgl' ? 1 : 0
    );
    expect(createMediaQuad).toHaveBeenCalledTimes(
      options.path === 'media' ? 1 : 0
    );
    expect(quad.destroy).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledOnce();
    expect(scene.manager.getLayers()).toEqual([quad]);
    expect(scene.leftMesh.visible).toBe(false);
    expect(scene.rightMesh.visible).toBe(true);
    expect(binding.getSubImage).toHaveBeenCalledTimes(
      options.path === 'webgl' ? 1 : 0
    );
  });

  it('keeps three-second automatic swaps and resets the timer on select', () => {
    const {scene, enter, createQuadLayer} = setupScene();
    enter();
    vi.mocked(getDeltaTime).mockReturnValue(1);
    scene.update();
    scene.update();
    expect(scene.layerOnLeft).toBe(true);
    scene.update();
    expect(scene.layerOnLeft).toBe(false);
    expect(scene.sinceSwap).toBe(0);
    scene.update();
    scene.onSelectEnd();
    expect(scene.layerOnLeft).toBe(true);
    expect(scene.sinceSwap).toBe(0);
    scene.update();
    scene.update();
    expect(scene.layerOnLeft).toBe(true);
    scene.update();
    expect(scene.layerOnLeft).toBe(false);
    expect(createQuadLayer).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'waits for dimensions and a frame (media: %s)',
    (media) => {
      const {scene, enter, createQuadLayer, createMediaQuad} = setupScene({
        media,
        ready: false,
      });
      const create = media ? createMediaQuad : createQuadLayer;
      enter();
      for (let i = 0; i < 60; i++) scene.update();
      expect(create).not.toHaveBeenCalled();
      setVideoReady(scene.layerVideo, 2048, 0);
      scene.update();
      expect(create).not.toHaveBeenCalled();
      setVideoReady(
        scene.layerVideo,
        2048,
        1152,
        HTMLMediaElement.HAVE_METADATA
      );
      for (let i = 0; i < 60; i++) scene.update();
      expect(create).not.toHaveBeenCalled();
      expect(scene.leftMesh.visible).toBe(true);
      expect(scene.everAttached).toBe(false);
      scene.swap();

      setVideoReady(scene.layerVideo);
      scene.update();
      expect(create).toHaveBeenCalledOnce();
      expect(scene.videoLayer.getLayer()?.transform.position.x).toBe(0.7);
      expect(scene.attached).toBe(true);
      expect(scene.leftMesh.visible).toBe(false);
      scene.update();
      expect(create).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    'bounds refusal retries to one per session (media: %s)',
    (media) => {
      const {scene, enter, exit, createQuadLayer, createMediaQuad} = setupScene(
        {media}
      );
      const create = media ? createMediaQuad : createQuadLayer;
      const error = new Error('Platform refused this video');
      create.mockImplementation(() => {
        throw error;
      });
      enter();
      for (let i = 0; i < 360; i++) scene.update();
      scene.onSelectEnd();

      expect(create).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalledWith(expect.any(String), error);
      expect(scene.attached).toBe(false);
      expect(scene.everAttached).toBe(false);
      expect(scene.leftMesh.visible).toBe(true);
      expect(scene.rightMesh.visible).toBe(true);
      expect(scene.videoLayer.getLayer()).toBeNull();
      expect(scene.manager.getLayers()).toEqual([]);

      exit();
      enter();
      for (let i = 0; i < 360; i++) scene.update();
      expect(create).toHaveBeenCalledTimes(2);
      expect(scene.attached).toBe(false);
      expect(scene.leftMesh.visible).toBe(true);
      expect(console.warn).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the current side and live fallback across session re-entry', () => {
    const {scene, enter, exit, createQuadLayer} = setupScene();
    const submit = enter();
    const first = scene.videoLayer.getLayer();
    scene.swap();
    exit();

    expect(first?.destroy).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(scene.manager.getLayers()).toEqual([]);
    expect(scene.videoLayer.getLayer()).toBeNull();
    expect(scene.leftMesh.visible).toBe(true);
    expect(scene.rightMesh.visible).toBe(true);
    expect(scene.everAttached).toBe(false);
    expect(scene.leftMesh.position.x).toBe(0.7);
    expect(callbacks.size).toBe(1);
    for (const {stop} of captures) expect(stop).not.toHaveBeenCalled();

    enter();
    const second = scene.videoLayer.getLayer();
    expect(second).not.toBe(first);
    expect(second?.transform.position.x).toBe(0.7);
    expect(scene.leftMesh.position.x).toBe(0.7);
    expect(scene.rightMesh.position.x).toBe(-0.7);
    expect(createQuadLayer).toHaveBeenCalledTimes(2);
    expect(scene.leftMesh.visible).toBe(false);
  });

  it('keeps both scene videos when no layer binding is supported', () => {
    const {scene, renderer, enter, createQuadLayer} = setupScene();
    renderer.xr.getBinding.mockImplementation(() => {
      throw new Error('No binding');
    });
    enter();
    for (let i = 0; i < 120; i++) scene.update();
    scene.swap();

    expect(createQuadLayer).not.toHaveBeenCalled();
    expect(scene.manager.getCapability()).toBe('unsupported');
    expect(scene.describe()).toMatchObject({
      layerAttached: false,
      layerPath: 'none',
      autoSwapping: false,
    });
    expect(scene.leftMesh.visible).toBe(true);
    expect(scene.rightMesh.visible).toBe(true);
    expect(scene.leftMesh.position.x).toBe(0.7);
    expect(scene.rightMesh.position.x).toBe(-0.7);
  });

  it.each(['active', 'ended', 'rejected removal'])(
    'releases all resources on Script disposal (%s)',
    (sessionState) => {
      const {scene, enter, exit} = setupScene();
      const submit = enter();
      const removalError = new Error('Layer removal rejected');
      if (sessionState === 'ended') {
        // Core ends XR before disposing scripts, without delivering session-end hooks.
        exit(false);
        submit.mockImplementation(() => {
          throw new Error('Session has ended');
        });
      } else if (sessionState === 'rejected removal') {
        submit.mockImplementationOnce(() => {
          throw removalError;
        });
      }
      const quad = scene.videoLayer.getLayer();
      const meshes = [scene.leftMesh, scene.rightMesh];
      const resources = meshes.flatMap((mesh) => [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material, 'dispose'),
        vi.spyOn(mesh.material.map, 'dispose'),
      ]);
      if (sessionState === 'rejected removal') {
        expect(() => scene.dispose()).toThrow(removalError);
      } else {
        scene.dispose();
      }
      scene.dispose();

      expect(quad?.destroy).toHaveBeenCalledOnce();
      expect(callbacks.size).toBe(0);
      expect(document.querySelectorAll('video')).toHaveLength(0);
      for (const {stop} of captures) expect(stop).toHaveBeenCalledOnce();
      for (const dispose of resources) expect(dispose).toHaveBeenCalledOnce();
      for (const mesh of meshes) expect(mesh.parent).toBeNull();
      expect(scene.manager.getLayers()).toEqual([]);
      expect(scene.manager.getBinding()).toBeNull();
      expect(submit).toHaveBeenCalledTimes(sessionState === 'ended' ? 1 : 2);
    }
  );
});

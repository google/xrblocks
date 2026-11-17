import * as THREE from 'three';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {LayerManager} from './LayerManager';
import {VideoLayer} from './VideoLayer';

const space = {} as XRReferenceSpace;
const layers: VideoLayer[] = [];
beforeEach(() => {
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      constructor(
        readonly position: unknown,
        readonly orientation: unknown
      ) {}
    }
  );
});
afterEach(() => {
  for (const layer of layers.splice(0)) layer.detach();
  vi.unstubAllGlobals();
});

function video(width = 1920, height = 1080) {
  const element = document.createElement('video');
  Object.defineProperties(element, {
    videoWidth: {value: width, configurable: true},
    videoHeight: {value: height, configurable: true},
  });
  return element;
}

function setup(binding?: XRWebGLBinding, gl?: WebGL2RenderingContext) {
  const session = {
    updateRenderState(_state: XRRenderStateInit) {},
  } as XRSession;
  const manager = new LayerManager();
  manager.setSession(session, binding, gl);
  manager.setBaseLayer({} as XRLayer);
  const layer = new VideoLayer(manager);
  layers.push(layer);
  return {session, manager, layer};
}

it.each([
  {media: false, forceWebGL: false, path: 'webgl', width: 3.2, height: 1.8},
  {media: true, forceWebGL: false, path: 'media', width: 1.6, height: 0.9},
  {media: true, forceWebGL: true, path: 'webgl', width: 1.6, height: 0.9},
])(
  'presents a correctly sized and placed quad on $path (media: $media)',
  ({media, forceWebGL, path, width, height}) => {
    let placed: XRQuadLayerInit | undefined;
    let destroyed = 0;
    const quad = {
      destroy() {
        destroyed++;
      },
    } as unknown as XRQuadLayer;
    const createQuadLayer = (init: XRQuadLayerInit) => {
      placed = init;
      return quad;
    };
    if (media)
      vi.stubGlobal(
        'XRMediaBinding',
        class {
          createQuadLayer(_video: HTMLVideoElement, init: XRQuadLayerInit) {
            return createQuadLayer(init);
          }
        }
      );
    const {session, manager, layer} = setup({
      createQuadLayer,
    } as XRWebGLBinding);
    manager.setPreferWebGL(forceWebGL);
    expect(
      layer.attach(video(), session, space, {
        width: 3.2,
        position: new THREE.Vector3(1, 2, -3),
      })
    ).toBe(true);
    expect(layer.getPath()).toBe(path);
    expect(placed?.width).toBeCloseTo(width);
    expect(placed?.height).toBeCloseTo(height);
    expect(placed?.transform?.position).toMatchObject({x: 1, y: 2, z: -3});
    if (path === 'webgl')
      expect(placed).toMatchObject({
        viewPixelWidth: 1920,
        viewPixelHeight: 1080,
      });
    layer.detach();
    layer.detach();
    expect(destroyed).toBe(1);
    expect(manager.getLayers()).toEqual([]);
  }
);

it('falls back without platform support or loaded video metadata', () => {
  const unsupported = setup();
  expect(unsupported.layer.attach(video(), unsupported.session, space)).toBe(
    false
  );
  expect(unsupported.layer.getState()).toBe('fallback');
  const supported = setup({createQuadLayer: () => ({})} as XRWebGLBinding);
  expect(supported.layer.attach(video(0, 0), supported.session, space)).toBe(
    false
  );
  expect(supported.manager.getLayers()).toEqual([]);
});

it('releases a quad after rejected submission or removal without hiding the error', () => {
  let destroyed = 0;
  const {session, manager, layer} = setup({
    createQuadLayer: () => ({
      destroy() {
        destroyed++;
      },
    }),
  } as unknown as XRWebGLBinding);
  const accept = session.updateRenderState;
  session.updateRenderState = () => {
    throw new Error('Submission rejected');
  };
  expect(() => layer.attach(video(), session, space)).toThrow(
    'Submission rejected'
  );
  expect(destroyed).toBe(1);
  expect(manager.getLayers()).toEqual([]);
  session.updateRenderState = accept;
  layer.attach(video(), session, space);
  session.updateRenderState = () => {
    throw new Error('Removal rejected');
  };
  expect(() => layer.detach()).toThrow('Removal rejected');
  expect(destroyed).toBe(2);
  expect(layer.getState()).toBe('fallback');
  expect(manager.getLayers()).toEqual([]);
});

it('uploads new video frames, restores GL state, and recovers from a delayed native layer', () => {
  const originalTexture = {} as WebGLTexture,
    colorTexture = {} as WebGLTexture;
  const state = new Map<number, unknown>([
    [34016, 33984],
    [32873, originalTexture],
    [37440, false],
  ]);
  const originalState = new Map(state);
  const uploads: unknown[] = [];
  // Native texture operations are unavailable in jsdom. Record their effects.
  const gl = {
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    ACTIVE_TEXTURE: 34016,
    TEXTURE_BINDING_2D: 32873,
    UNPACK_FLIP_Y_WEBGL: 37440,
    getParameter: (key: number) => state.get(key),
    bindTexture: (_target: number, texture: WebGLTexture) => {
      state.set(32873, texture);
    },
    pixelStorei: (key: number, value: unknown) => {
      state.set(key, value);
    },
    activeTexture: (unit: number) => {
      state.set(34016, unit);
    },
    texSubImage2D(...args: unknown[]) {
      uploads.push({
        video: args.at(-1),
        texture: state.get(32873),
        flipped: state.get(37440),
      });
    },
  } as unknown as WebGL2RenderingContext;
  let ready = false;
  const quad = {needsRedraw: false, destroy() {}};
  const binding = {
    createQuadLayer: () => quad,
    getSubImage() {
      if (!ready) throw new Error('Layer not submitted yet');
      return {colorTexture};
    },
  } as unknown as XRWebGLBinding;
  const {session, layer} = setup(binding, gl);
  const source = video();
  layer.attach(source, session, space);
  layer.update({} as XRFrame);
  expect(layer.getState()).toBe('layer');
  expect(uploads).toEqual([]);
  ready = true;
  source.currentTime = 1;
  layer.update({} as XRFrame);
  layer.update({} as XRFrame);
  expect(uploads).toEqual([
    {video: source, texture: colorTexture, flipped: true},
  ]);
  expect(state).toEqual(originalState);
  expect(state.get(gl.TEXTURE_BINDING_2D)).toBe(originalTexture);
  quad.needsRedraw = true;
  layer.update({} as XRFrame);
  expect(uploads).toHaveLength(2);
  expect(layer.getUploadCount()).toBe(2);
  Object.defineProperty(source, 'videoWidth', {value: 2048});
  source.currentTime = 2;
  layer.update({} as XRFrame);
  expect(uploads).toHaveLength(2);
});

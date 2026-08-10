import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {LayerManager} from './LayerManager';
import {aspectRatioOf, VideoLayer} from './VideoLayer';

/** Video element stand-in, since jsdom has no real one. */
function fakeVideo(width = 1920, height = 1080) {
  return {
    videoWidth: width,
    videoHeight: height,
    currentTime: 0,
  } as HTMLVideoElement;
}

function fakeSession() {
  return {updateRenderState: vi.fn()} as unknown as XRSession;
}

const space = {} as XRReferenceSpace;

/** Installs a media binding that records what it was asked for. */
function installMediaBinding(
  createQuadLayer: (
    video: HTMLVideoElement,
    init: Record<string, unknown>
  ) => unknown
) {
  (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding = function (
    this: unknown
  ) {
    return {createQuadLayer};
  } as unknown;
}

function readyManager() {
  const manager = new LayerManager();
  manager.setSession(fakeSession());
  manager.setBaseLayer({} as XRLayer);
  return manager;
}

describe('aspectRatioOf', () => {
  it('measures a loaded video', () => {
    expect(aspectRatioOf(fakeVideo(1920, 1080))).toBeCloseTo(16 / 9);
  });

  it('assumes 16:9 before metadata arrives', () => {
    // videoWidth is 0 until then, and dividing by it would give Infinity.
    expect(aspectRatioOf(fakeVideo(0, 0))).toBeCloseTo(16 / 9);
  });
});

describe('VideoLayer', () => {
  beforeEach(() => {
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
    (globalThis as {XRRigidTransform?: unknown}).XRRigidTransform = function (
      this: Record<string, unknown>,
      position: unknown,
      orientation: unknown
    ) {
      this.position = position;
      this.orientation = orientation;
    } as unknown;
  });

  it('falls back when the platform has no layers at all', () => {
    const manager = new LayerManager();
    manager.setSession(fakeSession(), {} as XRWebGLBinding);
    manager.setBaseLayer({} as XRLayer);
    const layer = new VideoLayer(manager);

    expect(layer.attach(fakeVideo(), fakeSession(), space)).toBe(false);
    expect(layer.getState()).toBe('fallback');
  });

  it('creates a quad layer when media binding is available', () => {
    installMediaBinding(() => ({}) as XRQuadLayer);
    const layer = new VideoLayer(readyManager());

    expect(layer.attach(fakeVideo(), fakeSession(), space)).toBe(true);
    expect(layer.getState()).toBe('layer');
    expect(layer.getLayer()).not.toBeNull();
  });

  it('sizes the quad from the video aspect ratio', () => {
    let init: Record<string, unknown> = {};
    installMediaBinding((_video, i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(readyManager());

    layer.attach(fakeVideo(1920, 1080), fakeSession(), space, {width: 3.2});

    // Half-extents, and 3.2 wide at 16:9 is 1.8 tall.
    expect(init.width).toBeCloseTo(1.6);
    expect(init.height).toBeCloseTo(0.9);
  });

  it('honours an explicit height rather than deriving one', () => {
    let init: Record<string, unknown> = {};
    installMediaBinding((_video, i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(readyManager());

    layer.attach(fakeVideo(), fakeSession(), space, {width: 2, height: 2});

    expect(init.width).toBeCloseTo(1);
    expect(init.height).toBeCloseTo(1);
  });

  it('falls back when the platform refuses the video', () => {
    // Advertising the binding does not guarantee any given element works.
    installMediaBinding(() => {
      throw new Error('cannot use this video');
    });
    const layer = new VideoLayer(readyManager());

    expect(layer.attach(fakeVideo(), fakeSession(), space)).toBe(false);
    expect(layer.getState()).toBe('fallback');
    expect(layer.getLayer()).toBeNull();
  });

  it('falls back when the manager has no base layer to compose with', () => {
    installMediaBinding(() => ({}) as XRQuadLayer);
    const manager = new LayerManager();
    manager.setSession(fakeSession());
    const layer = new VideoLayer(manager);

    expect(layer.attach(fakeVideo(), fakeSession(), space)).toBe(false);
    expect(layer.getState()).toBe('fallback');
  });

  it('removes the layer on detach', () => {
    const destroy = vi.fn();
    installMediaBinding(() => ({destroy}) as unknown as XRQuadLayer);
    const manager = readyManager();
    const layer = new VideoLayer(manager);
    layer.attach(fakeVideo(), fakeSession(), space);

    layer.detach();

    expect(destroy).toHaveBeenCalled();
    expect(manager.getLayers()).toHaveLength(0);
    expect(layer.getState()).toBe('fallback');
  });

  it('does not leave the old layer behind when attached twice', () => {
    installMediaBinding(() => ({destroy: vi.fn()}) as unknown as XRQuadLayer);
    const manager = readyManager();
    const layer = new VideoLayer(manager);

    layer.attach(fakeVideo(), fakeSession(), space);
    layer.attach(fakeVideo(), fakeSession(), space);

    expect(manager.getLayers()).toHaveLength(1);
  });

  it('places the quad where it was asked to', () => {
    let init: Record<string, unknown> = {};
    installMediaBinding((_video, i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(readyManager());

    layer.attach(fakeVideo(), fakeSession(), space, {
      position: new THREE.Vector3(1, 1.5, -3),
    });

    const transform = init.transform as {position: {x: number; z: number}};
    expect(transform.position.x).toBeCloseTo(1);
    expect(transform.position.z).toBeCloseTo(-3);
  });
});

describe('VideoLayer on the WebGL path', () => {
  beforeEach(() => {
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
    (globalThis as {XRRigidTransform?: unknown}).XRRigidTransform = function (
      this: Record<string, unknown>,
      position: unknown,
      orientation: unknown
    ) {
      this.position = position;
      this.orientation = orientation;
    } as unknown;
  });

  /** Records the GL calls the upload path is expected to make. */
  function fakeGl() {
    return {
      TEXTURE_2D: 3553,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      UNPACK_FLIP_Y_WEBGL: 37440,
      ACTIVE_TEXTURE: 34016,
      TEXTURE_BINDING_2D: 32873,
      pixelStorei: vi.fn(),
      bindTexture: vi.fn(),
      texSubImage2D: vi.fn(),
      activeTexture: vi.fn(),
      getParameter: vi.fn(() => 0),
    } as unknown as WebGL2RenderingContext & Record<string, ReturnType<typeof vi.fn>>;
  }

  function webglManager(
    createQuadLayer: (init: Record<string, unknown>) => unknown,
    gl = fakeGl(),
    getSubImage = vi.fn()
  ) {
    const manager = new LayerManager();
    const binding = {createQuadLayer, getSubImage} as unknown as XRWebGLBinding;
    manager.setSession(fakeSession(), binding, gl);
    manager.setBaseLayer({} as XRLayer);
    return {manager, gl, getSubImage};
  }

  it('creates a quad layer through the WebGL binding', () => {
    const {manager} = webglManager(() => ({}) as XRQuadLayer);
    const layer = new VideoLayer(manager);

    expect(layer.attach(fakeVideo(), fakeSession(), space)).toBe(true);
    expect(layer.getState()).toBe('layer');
  });

  it('passes full extents, not the halved ones the media path needs', () => {
    // Chromium hands width and height straight to OpenXR, which treats them as
    // the full size of the quad. Halving here, as three.js and A-Frame do to
    // work around Quest, would render it at half size.
    // See immersive-web/layers#324.
    let init: Record<string, unknown> = {};
    const {manager} = webglManager((i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(manager);

    layer.attach(fakeVideo(1920, 1080), fakeSession(), space, {width: 3.2});

    expect(init.width).toBeCloseTo(3.2);
    expect(init.height).toBeCloseTo(1.8);
  });

  it('asks for a texture big enough for the source', () => {
    let init: Record<string, unknown> = {};
    const {manager} = webglManager((i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(manager);

    layer.attach(fakeVideo(1920, 1080), fakeSession(), space);

    expect(init.viewPixelWidth).toBe(1920);
    expect(init.viewPixelHeight).toBe(1080);
    // A video changes every frame, so the layer cannot be static: getSubImage
    // throws InvalidStateError on a static layer once needsRedraw goes false.
    expect(init.isStatic).toBe(false);
    // 'default' is a TypeError for quad layers.
    expect(init.layout).toBe('mono');
  });

  it('uploads the current frame into the layer texture', () => {
    const video = fakeVideo();
    const colorTexture = {} as WebGLTexture;
    const getSubImage = vi.fn(() => ({colorTexture}));
    const gl = fakeGl();
    const {manager} = webglManager(() => ({}) as XRQuadLayer, gl, getSubImage);
    const layer = new VideoLayer(manager);
    layer.attach(video, fakeSession(), space);

    layer.update({} as XRFrame);

    expect(getSubImage).toHaveBeenCalled();
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, colorTexture);
    expect(gl.texSubImage2D).toHaveBeenCalled();
    // Without this the video arrives upside down.
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
  });

  it('does nothing on update when it never got a layer', () => {
    const {manager, getSubImage} = webglManager(() => {
      throw new Error('refused');
    });
    const layer = new VideoLayer(manager);
    layer.attach(fakeVideo(), fakeSession(), space);

    layer.update({} as XRFrame);

    expect(getSubImage).not.toHaveBeenCalled();
  });

  it('keeps presenting when a single upload fails', () => {
    // getSubImage throws until updateRenderState has actually taken effect,
    // which is a frame or two after the layer is added.
    const getSubImage = vi.fn(() => {
      throw new Error('layer not in renderState yet');
    });
    const {manager} = webglManager(
      () => ({}) as XRQuadLayer,
      fakeGl(),
      getSubImage
    );
    const layer = new VideoLayer(manager);
    layer.attach(fakeVideo(), fakeSession(), space);

    expect(() => layer.update({} as XRFrame)).not.toThrow();
    expect(layer.getState()).toBe('layer');
  });
});

describe('VideoLayer quad sizing across platforms', () => {
  beforeEach(() => {
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
    (globalThis as {XRRigidTransform?: unknown}).XRRigidTransform = function (
      this: Record<string, unknown>
    ) {} as unknown;
  });

  function webglOnly(createQuadLayer: (init: Record<string, unknown>) => unknown) {
    const manager = new LayerManager();
    const binding = {
      createQuadLayer,
      getSubImage: vi.fn(),
    } as unknown as XRWebGLBinding;
    manager.setSession(fakeSession(), binding, {} as WebGL2RenderingContext);
    manager.setBaseLayer({} as XRLayer);
    return manager;
  }

  it('halves on the webgl path too when the platform is a Quest', () => {
    // The Quest compositor halves every quad layer, not just media ones, so
    // taking the webgl path there still needs the correction. Passing full
    // extents renders the quad at twice the size, which is what showed up on
    // device as one side being much bigger than the other.
    (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding = function () {};
    let init: Record<string, unknown> = {};
    const manager = webglOnly((i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    manager.setPreferWebGL(true);
    const layer = new VideoLayer(manager);

    layer.attach(fakeVideo(1920, 1080), fakeSession(), space, {width: 3.2});

    expect(layer.getPath()).toBe('webgl');
    expect(init.width).toBeCloseTo(1.6);
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
  });

  it('passes full extents where the compositor follows the spec', () => {
    let init: Record<string, unknown> = {};
    const manager = webglOnly((i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    const layer = new VideoLayer(manager);

    layer.attach(fakeVideo(1920, 1080), fakeSession(), space, {width: 3.2});

    expect(init.width).toBeCloseTo(3.2);
  });

  it('waits for real video dimensions before making a layer', () => {
    // The layer texture is allocated once at the size given. Guessing, then
    // uploading a frame of a different size, raises a GL error every frame and
    // can take the session down with it.
    const create = vi.fn(() => ({}) as XRQuadLayer);
    const manager = webglOnly(create);
    const layer = new VideoLayer(manager);

    expect(layer.attach(fakeVideo(0, 0), fakeSession(), space)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('sizes the layer texture from the source, not a guess', () => {
    let init: Record<string, unknown> = {};
    const manager = webglOnly((i) => {
      init = i;
      return {} as XRQuadLayer;
    });
    new VideoLayer(manager).attach(fakeVideo(2048, 1152), fakeSession(), space);

    expect(init.viewPixelWidth).toBe(2048);
    expect(init.viewPixelHeight).toBe(1152);
  });

  it('counts only uploads that actually landed', () => {
    let fail = false;
    const getSubImage = vi.fn(() => {
      if (fail) throw new Error('not in renderState yet');
      return {colorTexture: {} as WebGLTexture};
    });
    const gl = {
      TEXTURE_2D: 3553,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      UNPACK_FLIP_Y_WEBGL: 37440,
      ACTIVE_TEXTURE: 34016,
      TEXTURE_BINDING_2D: 32873,
      pixelStorei: vi.fn(),
      bindTexture: vi.fn(),
      texSubImage2D: vi.fn(),
      activeTexture: vi.fn(),
      getParameter: vi.fn(() => 0),
    } as unknown as WebGL2RenderingContext;
    const manager = new LayerManager();
    manager.setSession(
      fakeSession(),
      {createQuadLayer: () => ({}), getSubImage} as unknown as XRWebGLBinding,
      gl
    );
    manager.setBaseLayer({} as XRLayer);
    const layer = new VideoLayer(manager);
    const video = fakeVideo(1920, 1080);
    layer.attach(video, fakeSession(), space);
    expect(layer.getUploadCount()).toBe(0);

    layer.update({} as XRFrame);
    video.currentTime = 1 / 30;
    layer.update({} as XRFrame);
    expect(layer.getUploadCount()).toBe(2);

    fail = true;
    layer.update({} as XRFrame);
    expect(layer.getUploadCount()).toBe(2);
  });
});

describe('VideoLayer upload throttling', () => {
  beforeEach(() => {
    delete (globalThis as {XRMediaBinding?: unknown}).XRMediaBinding;
    (globalThis as {XRRigidTransform?: unknown}).XRRigidTransform = function (
      this: Record<string, unknown>
    ) {} as unknown;
  });

  function throttleSetup(layerObj: Record<string, unknown>) {
    const gl = {
      TEXTURE_2D: 3553,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      UNPACK_FLIP_Y_WEBGL: 37440,
      ACTIVE_TEXTURE: 34016,
      TEXTURE_BINDING_2D: 32873,
      pixelStorei: vi.fn(),
      bindTexture: vi.fn(),
      texSubImage2D: vi.fn(),
      activeTexture: vi.fn(),
      getParameter: vi.fn(() => 0),
    } as unknown as WebGL2RenderingContext;
    const manager = new LayerManager();
    manager.setSession(
      fakeSession(),
      {
        createQuadLayer: () => layerObj,
        getSubImage: vi.fn(() => ({colorTexture: {} as WebGLTexture})),
      } as unknown as XRWebGLBinding,
      gl
    );
    manager.setBaseLayer({} as XRLayer);
    return manager;
  }

  it('skips a frame the video has not advanced past', () => {
    // The source runs at 30fps and the headset at 90, so two of every three
    // frames would push an identical 2048x1152 image for nothing.
    const manager = throttleSetup({needsRedraw: false});
    const layer = new VideoLayer(manager);
    const video = fakeVideo(1920, 1080);
    layer.attach(video, fakeSession(), space);

    layer.update({} as XRFrame);
    layer.update({} as XRFrame);
    layer.update({} as XRFrame);

    expect(layer.getUploadCount()).toBe(1);
  });

  it('uploads anyway when the compositor lost the layer contents', () => {
    const manager = throttleSetup({needsRedraw: true});
    const layer = new VideoLayer(manager);
    const video = fakeVideo(1920, 1080);
    layer.attach(video, fakeSession(), space);

    layer.update({} as XRFrame);
    layer.update({} as XRFrame);

    expect(layer.getUploadCount()).toBe(2);
  });

  it('puts the texture binding back so three.js state stays valid', () => {
    // three.js caches bindings and skips redundant calls; leaving the layer
    // texture bound makes it render with the wrong one.
    const manager = throttleSetup({needsRedraw: true});
    const gl = manager.getContext() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const layer = new VideoLayer(manager);
    layer.attach(fakeVideo(1920, 1080), fakeSession(), space);

    layer.update({} as XRFrame);

    const binds = gl.bindTexture.mock.calls;
    expect(binds.length).toBeGreaterThanOrEqual(2);
    // Last bind restores whatever getParameter reported, not null.
    expect(binds[binds.length - 1][1]).toBe(0);
    expect(gl.activeTexture).toHaveBeenCalled();
  });
});

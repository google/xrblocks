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

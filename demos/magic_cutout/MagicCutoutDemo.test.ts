import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  getCameraParametersSnapshot: vi.fn(),
  transformRgbUvToWorld: vi.fn(),
  resolveDeviceCameraTarget: vi.fn(() => 'galaxyxr'),
  detectDeviceCameraTarget: vi.fn(() => 'galaxyxr'),
  core: {
    deviceCamera: null as Record<string, unknown> | null,
    depth: null as Record<string, unknown> | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: {xr: {getCamera: () => null}},
  },
}));

vi.mock('xrblocks', async () => {
  const three = await import('three');
  class UI extends three.Object3D {
    style: Record<string, unknown>;
    disabled = false;
    ariaLabel = '';
    onClick: undefined | (() => unknown);
    _text = '';
    _src: unknown = '';
    constructor({
      children = [],
      style = {},
      ...options
    }: {
      children?: THREE.Object3D[];
      style?: Record<string, unknown>;
      [key: string]: unknown;
    } = {}) {
      super();
      this.style = {...style};
      Object.assign(this, options);
      if (children.length > 0) this.add(...children);
    }
    get text() {
      return this._text;
    }
    set text(value: string) {
      this._text = value;
    }
    get src() {
      return this._src;
    }
    set src(value: unknown) {
      this._src = value;
    }
  }
  return {
    Script: three.Object3D,
    UICard: class extends UI {},
    UIPanel: class extends UI {},
    UIImage: class extends UI {},
    UIButton: class extends UI {},
    UIText: class extends UI {},
    user: {height: 1.6},
    core: mocks.core,
    getCameraParametersSnapshot: mocks.getCameraParametersSnapshot,
    transformRgbUvToWorld: mocks.transformRgbUvToWorld,
    resolveDeviceCameraTarget: mocks.resolveDeviceCameraTarget,
    detectDeviceCameraTarget: mocks.detectDeviceCameraTarget,
  };
});

import {MagicCutoutDemo} from './MagicCutoutDemo.js';

function makeSnapshot(width = 64, height = 64) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    data[p] = 80;
    data[p + 1] = 180;
    data[p + 2] = 240;
    data[p + 3] = 255;
  }
  return {data, width, height};
}

function makeMaskOutput(width = 64, height = 64, empty = false) {
  const conf = new Float32Array(width * height);
  if (!empty) {
    for (let y = 16; y < 48; y++) {
      for (let x = 16; x < 48; x++) {
        conf[y * width + x] = 0.95;
      }
    }
  }
  return {
    categoryMask: null,
    confidenceMasks: [{width, height, data: conf}],
    ms: 14,
    delegate: 'GPU',
  };
}

function makeCamera(snapshot: ReturnType<typeof makeSnapshot> | null) {
  return {
    state: 'streaming',
    width: 64,
    height: 64,
    targetDevice: 'quest3',
    texture: new THREE.Texture(),
    isUsingXRCameraAccess: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    waitForFreshFrame: vi.fn(async () => {}),
    captureSnapshot: vi.fn(async () => snapshot),
  };
}

function makeFakeSegmenter(result = makeMaskOutput()) {
  return {
    delegate: 'GPU',
    fallbackReason: '',
    loadMs: 120,
    warmupMs: 25,
    init: vi.fn(async () => {}),
    segmentAt: vi.fn(async () => result),
    dispose: vi.fn(),
  };
}

function setupDepthMesh() {
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const clonedDispose = vi.fn();
  const originalClone = baseGeometry.clone.bind(baseGeometry);
  const cloneSpy = vi.spyOn(baseGeometry, 'clone').mockImplementation(() => {
    const cloned = originalClone();
    const realDispose = cloned.dispose.bind(cloned);
    vi.spyOn(cloned, 'dispose').mockImplementation(() => {
      clonedDispose();
      realDispose();
    });
    return cloned;
  });
  const depthMesh = new THREE.Mesh(baseGeometry) as THREE.Mesh & {
    downsampledGeometry: THREE.BufferGeometry;
  };
  depthMesh.downsampledGeometry = baseGeometry;
  return {depthMesh, clonedDispose, baseGeometry, cloneSpy};
}

describe('MagicCutoutDemo lifecycle, pose capture, and 3D pinning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const renderCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    renderCamera.position.set(0, 1.6, 0);
    renderCamera.updateMatrixWorld(true);
    renderCamera.updateProjectionMatrix();
    mocks.core.camera = renderCamera;
    mocks.getCameraParametersSnapshot.mockReturnValue({
      clipFromView: renderCamera.projectionMatrix.clone(),
      viewFromClip: renderCamera.projectionMatrixInverse.clone(),
      worldFromView: renderCamera.matrixWorld.clone(),
      worldFromClip: renderCamera.matrixWorld
        .clone()
        .multiply(renderCamera.projectionMatrixInverse),
    });
    mocks.transformRgbUvToWorld.mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -2.0),
      worldNormal: new THREE.Vector3(0, 0, 1),
      depthInMeters: 2.0,
    });
  });

  it('does not clone depth geometry when captureSnapshot returns null', async () => {
    const camera = makeCamera(null);
    const {depthMesh, cloneSpy} = setupDepthMesh();
    mocks.core.deviceCamera = camera;
    mocks.core.depth = {
      depthMesh,
      options: {depthMesh: {updateFullResolutionGeometry: false}},
    };

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    await demo.segmentAtPoint({u: 0.5, v: 0.5});

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(segmenter.segmentAt).not.toHaveBeenCalled();
  });

  it('passes camera targetDevice and always disposes cloned depth mesh on success, error, and stale disposal', async () => {
    const camera = makeCamera(makeSnapshot());
    const {depthMesh, clonedDispose} = setupDepthMesh();
    mocks.core.deviceCamera = camera;
    mocks.core.depth = {
      depthMesh,
      options: {depthMesh: {updateFullResolutionGeometry: false}},
    };

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    await demo.segmentAtPoint({u: 0.5, v: 0.5});

    expect(mocks.getCameraParametersSnapshot).toHaveBeenCalledWith(
      mocks.core.camera,
      null,
      camera,
      'quest3'
    );
    expect(clonedDispose).toHaveBeenCalledTimes(1);
    expect(demo.currentCutout).not.toBeNull();

    // Error during segmentation also disposes the depth snapshot.
    segmenter.segmentAt.mockRejectedValueOnce(new Error('inference crash'));
    await demo.segmentAtPoint({u: 0.5, v: 0.5});
    expect(clonedDispose).toHaveBeenCalledTimes(2);
    expect(demo.statusText.text).toContain('inference crash');

    // Disposing while segmentation is in flight still disposes the depth snapshot.
    let resolveInFlight!: (value: ReturnType<typeof makeMaskOutput>) => void;
    segmenter.segmentAt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInFlight = resolve;
        })
    );
    const inFlight = demo.segmentAtPoint({u: 0.5, v: 0.5});
    await vi.waitFor(() => {
      expect(segmenter.segmentAt).toHaveBeenCalledTimes(3);
    });
    demo.dispose();
    resolveInFlight(makeMaskOutput());
    await inFlight;
    expect(clonedDispose).toHaveBeenCalledTimes(3);
  });

  it('re-renders cutout when switching style without re-running segmentation', async () => {
    const camera = makeCamera(makeSnapshot());
    mocks.core.deviceCamera = camera;
    mocks.core.depth = null;

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    await demo.segmentAtPoint({u: 0.5, v: 0.5});
    expect(segmenter.segmentAt).toHaveBeenCalledTimes(1);
    const firstTexture = demo.cutoutImage.src;

    demo.setStyle('glow');
    expect(segmenter.segmentAt).toHaveBeenCalledTimes(1);
    expect(demo.cutoutImage.src).not.toBe(firstTexture);
  });

  it('falls back to 1.10 m camera-ray placement when depth mesh is absent', async () => {
    const camera = makeCamera(makeSnapshot());
    mocks.core.deviceCamera = camera;
    mocks.core.depth = null;

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    await demo.segmentAtPoint({u: 0.5, v: 0.5});
    demo.pinCurrentCutout();

    expect(demo.stickers).toHaveLength(1);
    expect(demo.stickers[0].position.z).toBeCloseTo(-1.07, 1);
    expect(demo.statusText.text).toContain('depth unavailable');
  });

  it('pins manipulable 3D cutout sticker in room, evicts oldest past limit, and cleans up on undo/dispose', async () => {
    const camera = makeCamera(makeSnapshot());
    const {depthMesh} = setupDepthMesh();
    mocks.core.deviceCamera = camera;
    mocks.core.depth = {
      depthMesh,
      options: {depthMesh: {updateFullResolutionGeometry: false}},
    };

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();
    await demo.segmentAtPoint({u: 0.5, v: 0.5});

    demo.pinCurrentCutout();
    expect(demo.stickers).toHaveLength(1);

    const sticker = demo.stickers[0] as THREE.Group & {
      xb?: Record<string, unknown>;
    };
    expect(sticker.name).toBe('Spatial cutout sticker');
    // Offset 3 cm toward viewer at z=0 from depth hit at z=-2.0 => z=-1.97
    expect(sticker.position.z).toBeCloseTo(-1.97, 3);
    expect(sticker.xb?.manipulation).toBeDefined();

    const mesh = sticker.children[0] as THREE.Mesh;
    const geoDispose = vi.spyOn(mesh.geometry, 'dispose');
    const matDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    // Pinning past MAX_STICKERS (12) evicts and disposes the oldest sticker.
    for (let i = 0; i < 12; i++) {
      demo.pinCurrentCutout();
    }
    expect(demo.stickers).toHaveLength(12);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);

    demo.undoSticker();
    expect(demo.stickers).toHaveLength(11);

    demo.dispose();
    expect(demo.stickers).toHaveLength(0);
    expect(segmenter.dispose).toHaveBeenCalledTimes(1);
  });

  it('triggers segmentation from viewfinder UV tap and restores live preview', async () => {
    const camera = makeCamera(makeSnapshot());
    mocks.core.deviceCamera = camera;
    mocks.core.depth = null;

    const segmenter = makeFakeSegmenter();
    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    // The panel needs a fill to be hit-testable; without one XR rays land on
    // the frame behind it and these handlers never run.
    expect(demo.viewfinder.style.backgroundColor).toBeTruthy();
    expect(demo.preview.xb?.pointerEvents ?? 'none').toBe('none');

    const stopPropagation = vi.fn();
    demo.viewfinder.onObjectSelectStart({
      stopPropagation,
      intersection: {uv: new THREE.Vector2(0.25, 0.75)},
    });
    demo.viewfinder.onObjectSelectEnd({
      stopPropagation,
      intersection: {uv: new THREE.Vector2(0.25, 0.75)},
    });

    await vi.waitFor(() => {
      expect(segmenter.segmentAt).toHaveBeenCalledTimes(1);
    });
    expect(segmenter.segmentAt).toHaveBeenCalledWith(expect.anything(), {
      u: 0.25,
      v: 0.25,
    });
    expect(demo.preview.src).not.toBe(camera.texture);

    demo.showLiveView();
    expect(demo.preview.src).toBe(camera.texture);
  });

  it('sets dark hover/disabled button states, fits cutout aspect proportionally, and places card left of center', async () => {
    const camera = makeCamera(makeSnapshot(128, 64));
    mocks.core.deviceCamera = camera;
    mocks.core.depth = null;

    // Non-square tall mask (width ~18, height ~48 after 6px pad) inside 128x64 image.
    const width = 128;
    const height = 64;
    const conf = new Float32Array(width * height);
    for (let y = 10; y < 58; y++) {
      for (let x = 58; x < 76; x++) {
        conf[y * width + x] = 0.95;
      }
    }
    const segmenter = makeFakeSegmenter({
      categoryMask: null,
      confidenceMasks: [{width, height, data: conf}],
      ms: 12,
      delegate: 'GPU',
    });

    const demo = new MagicCutoutDemo({segmenter});
    demo.init();
    await demo.loadModel();

    expect(demo.card.position.x).toBeLessThan(0);
    for (const button of [
      ...demo.styleButtons,
      demo.segmentCenterButton,
      demo.liveViewButton,
      demo.pinButton,
      demo.undoButton,
      demo.clearButton,
    ]) {
      expect(button.style[':hover']?.backgroundColor).toBeDefined();
      expect(button.style[':hover']?.backgroundColor).not.toBe('#f0f1f5');
      expect(button.style[':disabled']?.backgroundColor).toBeDefined();
    }

    await demo.segmentAtPoint({u: 0.5, v: 0.5});

    expect(demo.cutoutImage.style.objectFit).toBe('fill');
    expect(demo.cutoutImage.style.width).toBeLessThanOrEqual(204);
    expect(demo.cutoutImage.style.height).toBe(204);
    expect(demo.cutoutImage.style.width).toBeLessThan(
      demo.cutoutImage.style.height
    );
  });
});

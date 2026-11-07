// @vitest-environment node
import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import * as xb from 'xrblocks';

import {
  FALLBACK_DISTANCE_M,
  PRESETS,
  SPIN_PER_FRAME,
  VisualSearchDemo,
} from './VisualSearchDemo.js';
import {
  CACHED_LABEL,
  DOWNLOAD_LABEL,
  LOADED_LABEL,
  TOTAL_BYTES,
} from './modelConfig.js';
import {squareGrid} from './search.js';

const xbMock = vi.hoisted(() => ({
  core: {} as Record<string, unknown>,
  depthHit: null as null | {
    worldPosition: unknown;
    depthInMeters: number;
  },
}));

vi.mock('xrblocks', async () => {
  const {Object3D, Matrix4} = await import('three');
  class UI extends Object3D {
    style: Record<string, unknown>;
    disabled = false;
    label = '';
    text = '';
    value = '';
    src: unknown;
    onClick: undefined | (() => unknown);
    constructor({children = [], style = {}, ...options} = {}) {
      super();
      this.style = {...style};
      Object.assign(this, options);
      this.add(...(children as Object3D[]));
    }
  }
  return {
    Script: Object3D,
    UICard: class extends UI {},
    UIPanel: class extends UI {},
    UIText: class extends UI {},
    UIImage: class extends UI {},
    UIButton: class extends UI {},
    UITextInput: class extends UI {},
    user: {height: 1.6},
    get core() {
      return xbMock.core;
    },
    detectDeviceCameraTarget: () => 'galaxyxr',
    getCameraParametersSnapshot: vi.fn(() => ({
      worldFromView: new Matrix4().makeTranslation(0, 1.5, 0),
      worldFromClip: new Matrix4().makeTranslation(0, 1.5, 0),
    })),
    transformRgbUvToWorld: vi.fn(() => xbMock.depthHit),
  };
});

type SearchResult = {
  scores: number[];
  probabilities: number[];
  textMs: number;
  visionMs: number;
};

function fakeClient() {
  const client = {
    loaded: false,
    check: vi.fn(async () => ({})),
    download: vi.fn(
      async ({onProgress}: {onProgress?: (event: unknown) => void} = {}) => {
        onProgress?.({loaded: 5, total: 10, file: 'a'});
        return {downloadedBytes: 10};
      }
    ),
    load: vi.fn(async () => {
      client.loaded = true;
      return {loadMs: 1000, warmupMs: 500};
    }),
    search: vi.fn(
      async (
        _image: unknown,
        tiles: unknown[],
        _query: string
      ): Promise<SearchResult> => ({
        scores: tiles.map((_, i) => (i === 0 ? 0.3 : 0.2)),
        probabilities: tiles.map((_, i) => (i === 0 ? 0.9 : 0.01)),
        textMs: 10,
        visionMs: 2000,
      })
    ),
    stop: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  return client;
}

function fakeStore(complete = false) {
  return {
    inspectCache: vi.fn(async () => ({complete, missingBytes: TOTAL_BYTES})),
    prepareStorage: vi.fn(async () => ({persistent: true, quotaKnown: true})),
  };
}

function fakeCamera(width = 400, height = 300) {
  return {
    state: 'streaming',
    width,
    height,
    texture: {name: 'live'},
    isUsingXRCameraAccess: false,
    waitForFreshFrame: vi.fn(async () => {}),
    captureSnapshot: vi.fn(async () => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({width: 0, height: 0, getContext: () => null}),
  });
  xbMock.depthHit = null;
  xbMock.core = {
    camera: new THREE.PerspectiveCamera(),
    renderer: {xr: {getCamera: () => null}},
    depth: {
      options: {depthMesh: {updateFullResolutionGeometry: false}},
      depthMesh: Object.assign(new THREE.Mesh(), {
        downsampledGeometry: new THREE.PlaneGeometry(),
      }),
    },
    deviceCamera: fakeCamera(),
  };
});

async function setup({cached = false, loaded = false} = {}) {
  const client = fakeClient();
  const store = fakeStore(cached);
  const scene = new VisualSearchDemo({client, store} as never);
  await scene.init();
  if (loaded) await scene.loadModel({allowDownload: true});
  return {scene, client, store};
}

describe('VisualSearchDemo', () => {
  it('builds the card with one-tap presets and a hidden marker', async () => {
    const {scene} = await setup();
    expect(scene.presetButtons.map((b: {label: string}) => b.label)).toEqual(
      PRESETS
    );
    expect(scene.marker.visible).toBe(false);
    expect(scene.loadButton.label).toBe(DOWNLOAD_LABEL);
    expect(scene.status.text).toMatch(/Download the model once/);
    expect(scene.searchButton.disabled).toBe(true);
    for (const preset of scene.presetButtons)
      expect(preset.disabled).toBe(true);
    expect(scene.preview.src).toEqual({name: 'live'});
  });

  it('offers a cache-only load when the model is cached', async () => {
    const {scene, client} = await setup({cached: true});
    expect(scene.loadButton.label).toBe(CACHED_LABEL);
    expect(scene.status.text).toMatch(/Model cached/);
    await scene.loadModel();
    expect(client.download).not.toHaveBeenCalled();
    expect(scene.loadButton.label).toBe(LOADED_LABEL);
    expect(scene.status.text).toBe('Ready in 1.5 s. Type or tap what to find.');
  });

  it('downloads only with consent', async () => {
    const {scene, client, store} = await setup();
    await scene.loadModel();
    expect(client.download).not.toHaveBeenCalled();
    expect(scene.status.text).toMatch(/incomplete. Choose Download/);
    await scene.loadModel({allowDownload: true});
    expect(store.prepareStorage).toHaveBeenCalledWith(TOTAL_BYTES);
    expect(client.download).toHaveBeenCalled();
    expect(client.loaded).toBe(true);
    for (const preset of scene.presetButtons) {
      expect(preset.disabled).toBe(false);
    }
  });

  it('searches a fresh frame with the default crops and outlines the match', async () => {
    const {scene, client} = await setup({loaded: true});
    const camera = xbMock.core.deviceCamera as ReturnType<typeof fakeCamera>;
    const match = await scene.search('  cup ');
    expect(camera.waitForFreshFrame).toHaveBeenCalled();
    const [image, tiles, query] = client.search.mock.calls[0];
    expect(query).toBe('cup');
    expect(image).toMatchObject({width: 400, height: 300});
    expect(tiles).toEqual(squareGrid(400, 300));
    expect(match.confidence).toBe('strong');
    expect(scene.status.text).toBe('Found cup.');
    expect(scene.queryInput.value).toBe('cup');
    expect(scene.box.style.opacity).toBe(1);
    expect(scene.box.style.left).toBe('0%');
    expect(scene.metrics.text).toMatch(/crops · score 0.300 · 2000 ms image/);
    expect(scene.busy).toBe(false);
  });

  it('pins the marker on the depth hit when one is in range', async () => {
    const {scene} = await setup({loaded: true});
    xbMock.depthHit = {
      worldPosition: new THREE.Vector3(0.2, 0.8, -1.1),
      depthInMeters: 1.4,
    };
    await scene.search('cup');
    expect(scene.marker.visible).toBe(true);
    expect(scene.placement.source).toBe('depth');
    expect(scene.marker.position.toArray()).toEqual([0.2, 0.8, -1.1]);
  });

  it('falls back to the camera ray when depth has no usable hit', async () => {
    const {scene} = await setup({loaded: true});
    xbMock.depthHit = {
      worldPosition: new THREE.Vector3(0, 1.5, 0),
      depthInMeters: 0,
    };
    await scene.search('cup');
    expect(scene.placement.source).toBe('ray');
    const origin = new THREE.Vector3(0, 1.5, 0);
    expect(scene.marker.position.distanceTo(origin)).toBeCloseTo(
      FALLBACK_DISTANCE_M
    );
  });

  it('hides the outline and marker when nothing matches', async () => {
    const {scene, client} = await setup({loaded: true});
    client.search.mockImplementationOnce(async (_i, tiles) => ({
      scores: tiles.map(() => 0.2),
      probabilities: tiles.map(() => 0.1),
      textMs: 1,
      visionMs: 1,
    }));
    const match = await scene.search('keys');
    expect(match.confidence).toBe('none');
    expect(scene.status.text).toMatch(/^No clear keys/);
    expect(scene.box.style.opacity).toBe(0);
    expect(scene.marker.visible).toBe(false);
  });

  it('ignores searches while busy, without a model, or without a query', async () => {
    const unloaded = await setup();
    expect(await unloaded.scene.search('cup')).toBeNull();
    expect(unloaded.client.search).not.toHaveBeenCalled();

    const {scene, client} = await setup({loaded: true});
    expect(await scene.search('   ')).toBeNull();
    expect(scene.status.text).toMatch(/Type what to look for/);
    const first = scene.search('cup');
    expect(await scene.search('book')).toBeNull();
    await first;
    expect(client.search).toHaveBeenCalledTimes(1);
  });

  it('waits for a streaming camera', async () => {
    const {scene, client} = await setup({loaded: true});
    (xbMock.core.deviceCamera as {state: string}).state = 'paused';
    expect(await scene.search('cup')).toBeNull();
    expect(scene.status.text).toBe('Camera is not ready yet.');
    expect(client.search).not.toHaveBeenCalled();
  });

  it('reports search errors and stays usable', async () => {
    const {scene, client} = await setup({loaded: true});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    client.search.mockRejectedValueOnce(new Error('boom'));
    expect(await scene.search('cup')).toBeNull();
    expect(scene.status.text).toBe('Error: boom');
    expect(scene.busy).toBe(false);
    expect(await scene.search('cup')).not.toBeNull();
  });

  it('disposes the worker client once', async () => {
    const {scene, client} = await setup({loaded: true});
    const camera = xbMock.core.deviceCamera as ReturnType<typeof fakeCamera>;
    await Promise.all([scene.dispose(), scene.dispose()]);
    expect(client.dispose).toHaveBeenCalledTimes(1);
    expect(camera.removeEventListener).toHaveBeenCalled();
    expect(await scene.search('cup')).toBeNull();
  });

  it('faces the viewer, spins in that plane and reuses one vector', async () => {
    const {scene} = await setup({loaded: true});
    await scene.search('cup');
    const viewer = xbMock.core.camera as THREE.PerspectiveCamera;
    viewer.position.set(0.5, 1.6, 1);
    viewer.updateMatrixWorld(true);
    const spy = vi.spyOn(viewer, 'getWorldPosition');
    const ringPosition = scene.ring.getWorldPosition(new THREE.Vector3());
    const toViewer = viewer.position.clone().sub(ringPosition).normalize();
    const normalAfter = () =>
      new THREE.Vector3(0, 0, 1)
        .applyQuaternion(scene.ring.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
    const localX = () =>
      new THREE.Vector3(1, 0, 0).applyQuaternion(scene.ring.quaternion);

    scene.update();
    const first = localX();
    expect(normalAfter().dot(toViewer)).toBeCloseTo(1, 5);
    scene.update();
    expect(normalAfter().dot(toViewer)).toBeCloseTo(1, 5);
    // The spin survives lookAt: the ring's own x axis keeps turning.
    expect(localX().angleTo(first)).toBeCloseTo(SPIN_PER_FRAME, 5);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBe(spy.mock.calls[1][0]);
    expect(spy.mock.calls[0][0]).toBe(scene.viewerPosition);
  });

  it('passes the camera target device when the camera has one', async () => {
    const params = vi.mocked(xb.getCameraParametersSnapshot);
    const {scene} = await setup({loaded: true});
    await scene.search('cup');
    expect(params.mock.calls.at(-1)![3]).toBe('galaxyxr');
    (xbMock.core.deviceCamera as Record<string, unknown>).targetDevice =
      'pixel';
    await scene.search('cup');
    expect(params.mock.calls.at(-1)![3]).toBe('pixel');
  });

  describe('depth snapshot cleanup', () => {
    function spies() {
      return {
        geometry: vi.spyOn(THREE.BufferGeometry.prototype, 'dispose'),
        material: vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose'),
        clone: vi.spyOn(
          (
            xbMock.core.depth as {
              depthMesh: {downsampledGeometry: THREE.BufferGeometry};
            }
          ).depthMesh.downsampledGeometry,
          'clone'
        ),
      };
    }

    it('frees the copy after a successful search', async () => {
      const {scene} = await setup({loaded: true});
      const s = spies();
      await scene.search('cup');
      expect(s.clone).toHaveBeenCalledTimes(1);
      expect(s.geometry).toHaveBeenCalledTimes(1);
      expect(s.material).toHaveBeenCalledTimes(1);
    });

    it('does not copy depth when the camera returns no snapshot', async () => {
      const {scene} = await setup({loaded: true});
      const camera = xbMock.core.deviceCamera as ReturnType<typeof fakeCamera>;
      camera.captureSnapshot.mockResolvedValueOnce(null as never);
      const s = spies();
      expect(await scene.search('cup')).toBeNull();
      expect(scene.status.text).toMatch(/snapshot is unavailable/);
      expect(s.clone).not.toHaveBeenCalled();
    });

    it('frees the copy when the search fails', async () => {
      const {scene, client} = await setup({loaded: true});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      client.search.mockRejectedValueOnce(new Error('boom'));
      const s = spies();
      expect(await scene.search('cup')).toBeNull();
      expect(s.clone).toHaveBeenCalledTimes(1);
      expect(s.geometry).toHaveBeenCalledTimes(1);
      expect(s.material).toHaveBeenCalledTimes(1);
    });

    it('frees the copy when the search goes stale', async () => {
      const {scene, client} = await setup({loaded: true});
      let resolve!: (value: SearchResult) => void;
      client.search.mockImplementationOnce(
        () => new Promise<SearchResult>((r) => (resolve = r))
      );
      const s = spies();
      const pending = scene.search('cup');
      await vi.waitFor(() => expect(client.search).toHaveBeenCalled());
      const disposing = scene.dispose();
      resolve({scores: [0.3], probabilities: [0.9], textMs: 1, visionMs: 1});
      expect(await pending).toBeNull();
      await disposing;
      expect(s.clone).toHaveBeenCalledTimes(1);
      // One geometry for the depth copy, plus the scene's own on dispose.
      expect(s.geometry.mock.contexts).toContain(s.clone.mock.results[0].value);
      expect(s.material).toHaveBeenCalled();
      expect(scene.marker.visible).toBe(false);
    });
  });
});

import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AI, World, disposeObjectTree, type InteractionSource} from 'xrblocks';

import {Roomcraft} from './Roomcraft';
import type {
  SceneAsset,
  SceneLayout,
  SceneObject,
  ScenePlanner,
} from './SceneTypes';
import type {ControllerEventMap} from '../../input/Controller';
import {DetectedPlane} from '../../world/planes/DetectedPlane';
import {PlaneDetector} from '../../world/planes/PlaneDetector';

vi.mock('xrblocks', async () => ({
  ...(await import('../../core/Script')),
  ...(await import('../../ai/AI')),
  ...(await import('../../world/World')),
  ...(await import('../../utils/ThreeDisposal')),
  ...(await import('../../utils/ObjectPlacement')),
  ...(await import('../../utils/ModelLoader')),
}));

function object(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'one',
    asset: 'box',
    name: 'First object',
    position: [0, 0, 0],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#aa7755',
    ...overrides,
  };
}

function layout(...objects: SceneObject[]): SceneLayout {
  return {title: 'Studio', objects};
}

function asset(overrides: Partial<SceneAsset> = {}): SceneAsset {
  return {
    id: 'box',
    description: 'Test box',
    size: [1, 2, 3],
    create: vi.fn((color: string) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 6),
        new THREE.MeshStandardMaterial({color})
      );
      mesh.position.set(4, 5, -2);
      return mesh;
    }),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return {promise, resolve, reject};
}

const rooms: Roomcraft[] = [];

function createRoom(catalog = [asset()], planner?: ScenePlanner) {
  const room = new Roomcraft({catalog, planner});
  rooms.push(room);
  return room;
}

afterEach(() => {
  rooms.splice(0).forEach((room) => room.dispose());
  vi.restoreAllMocks();
});

describe('Roomcraft objects and ownership', () => {
  it('creates grounded objects at physical catalog dimensions, without calling AI', async () => {
    const planner = vi.fn<ScenePlanner>();
    const room = createRoom([asset()], planner);
    await room.applyLayout(layout(object()));
    const owner = room.getObject('one')!;
    const bounds = new THREE.Box3().setFromObject(owner);
    expect(bounds.min.toArray()).toEqual([-0.5, 0, -1.5]);
    expect(bounds.max.toArray()).toEqual([0.5, 2, 1.5]);
    expect(owner.xb?.manipulation).toMatchObject({
      actions: {translate: true, scale: {minScale: 0.05, maxScale: 5}},
    });
    expect(planner).not.toHaveBeenCalled();
  });

  it('normalizes authored root matrices even when automatic matrix updates are disabled', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 6),
      new THREE.MeshStandardMaterial()
    );
    mesh.position.set(4, 5, -2);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    const room = createRoom([asset({create: () => mesh})]);
    await room.applyLayout(layout(object()));
    const bounds = new THREE.Box3().setFromObject(room);
    expect(bounds.min.toArray()).toEqual([-0.5, 0, -1.5]);
    expect(bounds.max.toArray()).toEqual([0.5, 2, 1.5]);
  });

  it('keeps owner and geometry identities during transform-only and unrelated edits', async () => {
    const box = asset();
    const room = createRoom([box]);
    await room.applyLayout(layout(object(), object({id: 'two'})));
    const first = room.getObject('one')!;
    const second = room.getObject('two')!;
    const content = first.children[0];
    second.position.set(2, 0.2, 1);

    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {scale: [0.5, 0.5, 0.5]}}],
    });
    expect(room.getObject('one')).toBe(first);
    expect(room.getObject('two')).toBe(second);
    expect(first.children[0]).toBe(content);
    expect(second.position.toArray()).toEqual([2, 0.2, 1]);
    expect(box.create).toHaveBeenCalledTimes(2);
    expect(
      new THREE.Box3()
        .setFromObject(first)
        .getSize(new THREE.Vector3())
        .toArray()
    ).toEqual([0.5, 1, 1.5]);
  });

  it('replaces asset content, not the manipulation owner, when recoloring or swapping', async () => {
    const box = asset();
    const lamp = asset({id: 'lamp'});
    const room = createRoom([box, lamp]);
    await room.applyLayout(layout(object()));
    const owner = room.getObject('one')!;
    const original = owner.children[0];
    const mesh = original.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const dispose = vi.spyOn(original, 'removeFromParent');
    room.select('one');

    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#ffffff'}}],
    });
    expect(room.getObject('one')).toBe(owner);
    expect(owner.children[0]).not.toBe(original);
    expect(dispose).toHaveBeenCalled();
    expect(room.selectedId).toBe('one');

    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {asset: 'lamp'}}],
    });
    expect(room.getObject('one')).toBe(owner);
    expect(lamp.create).toHaveBeenCalledTimes(1);
  });

  it('returns detached snapshots and reads native hand transforms', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    const owner = room.getObject('one')!;
    owner.position.set(1, 0.5, 2);
    owner.rotation.y = Math.PI / 3;
    owner.scale.set(2, 1, 0.5);
    const snapshot = room.layout;
    expect(snapshot.objects[0].position).toEqual([1, 0.5, 2]);
    expect(snapshot.objects[0].rotation).toBeCloseTo(Math.PI / 3);
    expect(snapshot.objects[0].scale).toEqual([2, 1, 0.5]);
    snapshot.objects[0].position[0] = 99;
    snapshot.objects[0].scale[0] = 99;
    expect(room.layout.objects[0].position[0]).toBe(1);
    expect(room.layout.objects[0].scale[0]).toBe(2);
  });

  it('removes targeted objects and clears a removed selection', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object(), object({id: 'two'})));
    const removed = room.getObject('one')!;
    const kept = room.getObject('two')!;
    room.select('one');
    const select = vi.fn();
    room.addEventListener('selectionchange', select);
    await room.applyPlan({title: 'Studio', edits: [{op: 'remove', id: 'one'}]});
    expect(room.getObject('one')).toBeUndefined();
    expect(removed.parent).toBeNull();
    expect(room.getObject('two')).toBe(kept);
    expect(room.selectedId).toBeNull();
    expect(select).toHaveBeenCalledWith(expect.objectContaining({id: null}));
    expect(() => room.select('missing')).toThrow('missing');
  });

  it('resolves bubbled selection and native manipulation to the persistent owner', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    const owner = room.getObject('one')!;
    const mesh = owner.children[0].children[0];
    const source: InteractionSource = {
      type: 'mouse',
      handedness: 'none',
      controller: new THREE.Object3D<ControllerEventMap>(),
    };
    room.onObjectSelectStart({
      source,
      target: mesh,
      surface: mesh,
      stopPropagation: vi.fn(),
    });
    expect(room.selectedId).toBe('one');
    room.select(null);
    const event = {
      action: 'translate' as const,
      source,
      sources: [source],
      target: owner,
      surface: mesh,
      owner,
      currentTarget: room,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      point: new THREE.Vector3(),
      delta: new THREE.Vector3(),
      position: owner.position.clone(),
      worldPosition: owner.position.clone(),
    };
    room.onObjectManipulate({...event, phase: 'start'});
    expect(room.selectedId).toBe('one');
    const changed = vi.fn();
    room.addEventListener('change', changed);
    owner.position.x = 2;
    room.onObjectManipulate({...event, phase: 'end'});
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({layout: layout(object({position: [2, 0, 0]}))})
    );
  });

  it('does not expose catalog factories or mutate caller-owned metadata', () => {
    const box = asset();
    const room = createRoom([box]);
    const metadata = room.catalog;
    expect(Object.keys(metadata[0]).sort()).toEqual([
      'description',
      'id',
      'size',
    ]);
    metadata[0].size[0] = 99;
    box.size[0] = 88;
    expect(room.catalog[0].size).toEqual([1, 2, 3]);
  });

  it('rejects invalid catalogs before creating objects', () => {
    expect(() => new Roomcraft({catalog: []})).toThrow('catalog');
    expect(() => new Roomcraft({catalog: [asset(), asset()]})).toThrow(
      'Duplicate'
    );
    expect(() => new Roomcraft({catalog: [asset({size: [0, 1, 1]})]})).toThrow(
      'Invalid'
    );
    expect(() => new Roomcraft({catalog: [asset({id: '../file'})]})).toThrow(
      'Scene IDs'
    );
  });
});

describe('Roomcraft atomic changes and resource lifecycle', () => {
  it('keeps the entire old scene on invalid input or any asset load failure', async () => {
    const prepared = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    const cleanup = vi.spyOn(prepared.geometry, 'dispose');
    const bad = asset({
      id: 'bad',
      create: vi.fn().mockRejectedValue(new Error('Model unavailable')),
    });
    const fresh = asset({id: 'fresh', create: () => prepared});
    const room = createRoom([asset(), fresh, bad]);
    await room.applyLayout(layout(object()));
    room.select('one');
    const owner = room.getObject('one');
    const before = room.layout;

    await expect(
      room.applyLayout(layout(object({asset: 'unknown'})))
    ).rejects.toThrow('Unknown');
    await expect(
      room.applyLayout(
        layout(object({asset: 'fresh'}), object({id: 'two', asset: 'bad'}))
      )
    ).rejects.toThrow('Model unavailable');
    expect(room.layout).toEqual(before);
    expect(room.getObject('one')).toBe(owner);
    expect(room.selectedId).toBe('one');
    expect(cleanup).toHaveBeenCalled();
    expect(room.busy).toBe(false);
  });

  it('rejects geometry without volume and disposes it', async () => {
    const flat = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshBasicMaterial()
    );
    const cleanup = vi.spyOn(flat.geometry, 'dispose');
    const room = createRoom([asset({create: () => flat})]);
    await expect(room.applyLayout(layout(object()))).rejects.toThrow('bounds');
    expect(cleanup).toHaveBeenCalled();
    expect(room.layout.objects).toHaveLength(0);
  });

  it('does not steal or dispose an object attached to another scene', async () => {
    const other = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial()
    );
    other.add(mesh);
    const cleanup = vi.spyOn(mesh.geometry, 'dispose');
    const room = createRoom([asset({create: () => mesh})]);
    await expect(room.applyLayout(layout(object()))).rejects.toThrow(
      'detached'
    );
    expect(mesh.parent).toBe(other);
    expect(cleanup).not.toHaveBeenCalled();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('does not overwrite a transform that changes during asynchronous model loading', async () => {
    const pending = deferred<THREE.Object3D>();
    const room = createRoom([
      asset(),
      asset({id: 'model', create: () => pending.promise}),
    ]);
    await room.applyLayout(layout(object()));
    const edit = room.applyPlan({
      title: 'New scene',
      edits: [{op: 'add', object: object({id: 'model-one', asset: 'model'})}],
    });
    room.getObject('one')!.position.x = 2;
    const loaded = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    const cleanup = vi.spyOn(loaded.geometry, 'dispose');
    pending.resolve(loaded);
    await expect(edit).rejects.toThrow('moved while assets were loading');
    expect(room.layout.title).toBe('Studio');
    expect(room.layout.objects).toHaveLength(1);
    expect(room.getObject('one')!.position.x).toBe(2);
    expect(cleanup).toHaveBeenCalled();
  });

  it('ignores late loading results after disposal and releases their resources', async () => {
    const pending = deferred<THREE.Object3D>();
    const room = createRoom([asset({create: () => pending.promise})]);
    const loading = room.applyLayout(layout(object()));
    room.dispose();
    const texture = new THREE.Texture();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({map: texture})
    );
    const geometryCleanup = vi.spyOn(mesh.geometry, 'dispose');
    const textureCleanup = vi.spyOn(texture, 'dispose');
    pending.resolve(mesh);
    await expect(loading).rejects.toThrow('disposed');
    expect(room.children).toHaveLength(0);
    expect(geometryCleanup).toHaveBeenCalled();
    expect(textureCleanup).toHaveBeenCalledOnce();
    await expect(room.applyLayout(layout())).rejects.toThrow('disposed');
    room.dispose();
    expect(textureCleanup).toHaveBeenCalledOnce();
  });

  it('disposes meshes, materials, and shared textures when removing owned content', async () => {
    const texture = new THREE.Texture();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({map: texture, roughnessMap: texture})
    );
    const geometryCleanup = vi.spyOn(mesh.geometry, 'dispose');
    const materialCleanup = vi.spyOn(mesh.material, 'dispose');
    const textureCleanup = vi.spyOn(texture, 'dispose');
    const room = createRoom([asset({create: () => mesh})]);
    await room.applyLayout(layout(object()));
    room.dispose();
    room.dispose();
    expect(geometryCleanup).toHaveBeenCalledOnce();
    expect(materialCleanup).toHaveBeenCalledOnce();
    expect(textureCleanup).toHaveBeenCalledOnce();
  });
});

describe('Roomcraft planning and undo', () => {
  it('grounds the planner in selected identity, catalog, and actual transforms', async () => {
    const pending = deferred<unknown>();
    const planner = vi.fn<ScenePlanner>().mockReturnValue(pending.promise);
    const room = createRoom([asset()], planner);
    await room.applyLayout(layout(object()));
    room.select('one');
    room.getObject('one')!.position.x = 1;
    const request = room.request('  Make this blue  ');
    expect(planner).toHaveBeenCalledWith({
      prompt: 'Make this blue',
      scene: layout(object({position: [1, 0, 0]})),
      selectedId: 'one',
      catalog: room.catalog,
    });

    expect(room.status).toBe('planning');
    room.getObject('one')!.position.x = 2;
    pending.resolve({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#0000ff'}}],
    });
    await request;
    expect(room.layout.objects[0]).toEqual(
      object({position: [2, 0, 0], color: '#0000ff'})
    );
    expect(room.status).toBe('ready');
  });

  it('rejects competing operations and stale transforms without losing hand edits', async () => {
    const pending = deferred<unknown>();
    const room = createRoom([asset()], () => pending.promise);
    await room.applyLayout(layout(object()));
    const request = room.request('Move it right');
    await expect(room.request('Move it left')).rejects.toThrow('busy');
    await expect(room.applyLayout(layout())).rejects.toThrow('busy');
    await expect(room.undo()).rejects.toThrow('busy');
    room.getObject('one')!.position.x = 1;
    pending.resolve({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {position: [2, 0, 0]}}],
    });
    await expect(request).rejects.toThrow('changed while planning');
    expect(room.getObject('one')!.position.x).toBe(1);
    expect(room.busy).toBe(false);
  });

  it('keeps its conflict baseline separate from a custom planner context', async () => {
    const pending = deferred<unknown>();
    const room = createRoom([asset()], (request) => {
      request.scene.objects[0].position[0] = 1;
      return pending.promise;
    });
    await room.applyLayout(layout(object()));
    const request = room.request('Move it right');
    room.getObject('one')!.position.x = 1;
    pending.resolve({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {position: [2, 0, 0]}}],
    });
    await expect(request).rejects.toThrow('changed while planning');
  });

  it('does not apply a provider response after disposal', async () => {
    const pending = deferred<unknown>();
    const room = createRoom([asset()], () => pending.promise);
    const request = room.request('Create a studio');
    room.dispose();
    pending.resolve({title: 'Studio', edits: [{op: 'add', object: object()}]});
    await expect(request).rejects.toThrow('disposed');
    expect(room.children).toHaveLength(0);
  });

  it('uses the public AI facade and surfaces empty responses and provider failures', async () => {
    const room = createRoom();
    const ai = new AI();
    const query = vi.spyOn(ai, 'query').mockResolvedValue({
      text: JSON.stringify({
        title: 'Studio',
        edits: [{op: 'add', object: object()}],
      }),
    });
    room.init({ai, world: new World(), camera: new THREE.PerspectiveCamera()});
    await room.request('Create a box');
    expect(query).toHaveBeenCalledWith({
      prompt: expect.stringContaining('You are Roomcraft'),
    });
    const before = room.layout;
    for (const result of [null, {text: null}, {text: ''}]) {
      query.mockResolvedValueOnce(result);
      await expect(room.request('Add a lamp')).rejects.toThrow('no scene plan');
      expect(room.layout).toEqual(before);
    }
    query.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(room.request('Add a lamp')).rejects.toThrow('Quota exceeded');
    expect(room.busy).toBe(false);
    expect(room.layout).toEqual(before);
  });

  it('requires initialization or an explicit planner and nonempty bounded prompts', async () => {
    const room = createRoom();
    await expect(room.request('Create a box')).rejects.toThrow('Initialize');
    const planner = vi.fn<ScenePlanner>();
    const custom = createRoom([asset()], planner);
    for (const prompt of ['', '  ', 'x'.repeat(4001)]) {
      await expect(custom.request(prompt)).rejects.toThrow('4000');
    }
    expect(planner).not.toHaveBeenCalled();
  });

  it('restores hand-edited snapshots and exposes correct undo state to observers', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    const owner = room.getObject('one')!;
    owner.position.set(2, 0, 1);
    await room.applyPlan({
      title: 'Blue studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#0000ff'}}],
    });
    await room.undo();
    expect(room.getObject('one')).toBe(owner);
    expect(room.layout.objects[0]).toEqual(object({position: [2, 0, 1]}));
    const undoStates: boolean[] = [];
    room.addEventListener('change', () => undoStates.push(room.canUndo));
    await room.undo();
    expect(room.layout.objects).toHaveLength(0);
    expect(undoStates).toEqual([false]);
    await expect(room.undo()).rejects.toThrow('no scene edit');
  });

  it('does not consume undo history for a no-op plan', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    await room.applyPlan({title: 'Studio', edits: []});
    await room.undo();
    expect(room.layout.objects).toHaveLength(0);
    expect(room.canUndo).toBe(false);
  });

  it('bounds undo history to the twenty most recent successful edits', async () => {
    const room = createRoom();
    for (let index = 0; index < 22; index++) {
      await room.applyPlan({title: `Scene ${index}`, edits: []});
    }
    for (let index = 0; index < 20; index++) await room.undo();
    expect(room.layout.title).toBe('Scene 1');
    expect(room.canUndo).toBe(false);
  });
});

describe('Roomcraft placement API', () => {
  it('uses initialized plane detection and exposes a placement operation', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    const surface = new DetectedPlane(null, new THREE.MeshBasicMaterial(), {
      type: 'horizontal',
      label: 'floor',
      area: 64,
      position: new THREE.Vector3(0, 0, -2),
      quaternion: new THREE.Quaternion(),
      polygon: [
        new THREE.Vector2(-4, -4),
        new THREE.Vector2(4, -4),
        new THREE.Vector2(4, 4),
        new THREE.Vector2(-4, 4),
      ],
    });
    const world = new World();
    world.planes = new PlaneDetector();
    vi.spyOn(world.planes, 'get').mockReturnValue([surface]);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 2);
    camera.lookAt(0, 0, -2);
    room.init({ai: new AI(), world, camera});
    const statuses: string[] = [];
    room.addEventListener('statuschange', ({status}) => statuses.push(status));
    const before = room.layout;
    expect(await room.placeOnSurface()).toBe(true);
    expect(new THREE.Box3().setFromObject(room).min.y).toBeCloseTo(0);
    expect(room.layout).toEqual(before);
    expect(statuses).toEqual(['placing', 'ready']);
    disposeObjectTree(surface);
  });

  it('retains the preview and reports false while no planes are detected', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    room.position.set(0, 1, -2);
    const before = room.position.clone();
    room.init({
      ai: new AI(),
      world: new World(),
      camera: new THREE.PerspectiveCamera(),
    });
    expect(await room.placeOnSurface()).toBe(false);
    expect(room.position.equals(before)).toBe(true);
  });

  it('requires initialization and visible scene content before placement', async () => {
    const room = createRoom();
    await expect(room.placeOnSurface()).rejects.toThrow('Initialize');
    room.init({
      ai: new AI(),
      world: new World(),
      camera: new THREE.PerspectiveCamera(),
    });
    await expect(room.placeOnSurface()).rejects.toThrow('Create a scene');
    expect(room.busy).toBe(false);
  });
});

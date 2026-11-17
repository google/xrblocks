vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AI, World, disposeObjectTree} from 'xrblocks';

import {Roomcraft} from './Roomcraft';

import type {
  SceneAsset,
  SceneCatalogObject,
  SceneLandscapeObject,
  SceneLayout,
  SceneObject,
  ScenePlan,
  ScenePlanner,
  SceneProceduralObject,
  SceneSwingMotion,
} from './SceneTypes';

import {DetectedPlane} from '../../world/planes/DetectedPlane';
import {PlaneDetector} from '../../world/planes/PlaneDetector';

function object(
  overrides: Partial<SceneCatalogObject> = {}
): SceneCatalogObject {
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

function design(
  overrides: Partial<SceneProceduralObject> = {}
): SceneProceduralObject {
  return {
    id: 'robot',
    name: 'Little robot',
    position: [0, 0, 0],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#ffffff',
    parts: [
      {
        id: 'body',
        name: 'Body',
        shape: 'box',
        parent: null,
        position: [0.1, 0.5, -0.05],
        rotation: [0, 0, 0],
        size: [0.4, 0.5, 0.3],
        color: '#88bb99',
      },
      {
        id: 'arm',
        name: 'Arm',
        shape: 'capsule',
        parent: 'body',
        position: [0.35, 0, 0],
        rotation: [0, 0, 0],
        size: [0.1, 0.4, 0.1],
        color: '#cc7733',
      },
      {
        id: 'hand',
        name: 'Hand',
        shape: 'sphere',
        parent: 'arm',
        position: [0, -0.25, 0],
        rotation: [0, 0, 0],
        size: [0.1, 0.1, 0.1],
        color: '#cc7733',
      },
    ],
    ...overrides,
  };
}

function partMesh(owner: THREE.Object3D, id: string) {
  const mesh = owner.getObjectByName(id)?.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error(`Missing part "${id}".`);
  return mesh;
}

function movingDesign(): SceneProceduralObject {
  const object = design();
  object.parts[1].motion = {
    kind: 'swing',
    axis: 'z',
    pivot: [0, 0.2, 0],
    amplitude: 0.6,
    period: 2,
  };
  return object;
}

function motionClock(room: Roomcraft, deltaSeconds = 0.25) {
  const timer = new THREE.Timer();
  const delta = vi.spyOn(timer, 'getDelta').mockReturnValue(deltaSeconds);
  room.init({
    ai: new AI(),
    world: new World(),
    camera: new THREE.PerspectiveCamera(),
    timer,
  });
  return delta;
}

function layout(...objects: SceneObject[]): SceneLayout {
  return {title: 'Studio', objects};
}

function garden(...objects: SceneObject[]): SceneLayout {
  return {
    title: 'Japanese garden',
    environment: {
      size: [14, 12],
      groundColor: '#40513a',
      timeOfDay: 'moonlight',
    },
    objects,
  };
}

function pond(): SceneLandscapeObject {
  return {
    id: 'pond',
    name: 'Garden pond',
    position: [-1, 0, -1],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#397a80',
    landscape: {kind: 'pond', size: [3, 2], bankWidth: 0.25},
  };
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

function createRoom(
  catalog = [asset()],
  planner?: ScenePlanner,
  repairInvalidPlans = false
) {
  const room = new Roomcraft({catalog, planner, repairInvalidPlans});
  rooms.push(room);
  return room;
}

afterEach(() => {
  rooms.splice(0).forEach((room) => room.dispose());
  vi.restoreAllMocks();
});

describe('Roomcraft plan correction', () => {
  const malformed = '{"title":"Market","edits":[';
  const oversized = {
    title: 'Market',
    edits: [
      {
        op: 'add',
        object: design({
          parts: [
            {
              ...design().parts[0],
              id: 'west',
              position: [-5, 0.5, 0],
              size: [4, 1, 1],
            },
            {
              ...design().parts[0],
              id: 'east',
              position: [5, 0.5, 0],
              size: [4, 1, 1],
            },
          ],
        }),
      },
    ],
  };
  const corrected: ScenePlan = {
    title: 'Market',
    environment: {
      size: [20, 20],
      groundColor: '#40513a',
      timeOfDay: 'daylight',
    },
    edits: [
      {op: 'remove', id: 'one'},
      {op: 'add', object: design({id: 'west', position: [-5, 0, 0]})},
      {op: 'add', object: design({id: 'east', position: [5, 0, 0]})},
    ],
  };

  it.each([
    {reason: 'incomplete or invalid JSON', invalid: malformed},
    {reason: 'at most 10 meters across', invalid: oversized},
    {
      reason: 'Unknown catalog asset',
      invalid: {
        title: 'Market',
        edits: [
          {op: 'add', object: object({id: 'unknown', asset: 'invented'})},
        ],
      },
    },
  ])(
    'corrects $reason before committing a whole world once',
    async ({reason, invalid}) => {
      const correction = deferred<unknown>();
      const planner = vi
        .fn<ScenePlanner>()
        .mockResolvedValueOnce(invalid)
        .mockReturnValueOnce(correction.promise);
      const room = createRoom([asset()], planner, true);
      const before = layout(object());
      await room.applyLayout(before);
      room.select('one');
      const owner = room.getObject('one');
      const changed = vi.fn();
      room.addEventListener('change', changed);

      const pending = room.request('Create a whole 20 meter market.');
      await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(2));
      expect(room.status).toBe('repairing');
      expect(room.busy).toBe(true);
      expect(room.layout).toEqual(before);
      expect(room.getObject('one')).toBe(owner);
      expect(room.selectedId).toBe('one');
      expect(changed).not.toHaveBeenCalled();
      expect(planner.mock.calls[0][0]).not.toHaveProperty('repair');
      expect(planner.mock.calls[1][0]).toEqual({
        ...planner.mock.calls[0][0],
        repair: {reason: expect.stringContaining(reason)},
      });

      correction.resolve(corrected);
      await pending;
      expect(room.layout.environment?.size).toEqual([20, 20]);
      expect(room.layout.objects.map((object) => object.id)).toEqual([
        'west',
        'east',
      ]);
      expect(changed).toHaveBeenCalledTimes(1);
      await room.undo();
      expect(room.layout).toEqual(before);
      expect(room.status).toBe('ready');
      expect(planner).toHaveBeenCalledTimes(2);
    }
  );

  it.each([false, true])(
    'bounds correction attempts and preserves a moving design and redo (enabled=%s)',
    async (enabled) => {
      const planner = vi.fn<ScenePlanner>().mockResolvedValue(malformed);
      const room = createRoom([], planner, enabled);
      motionClock(room);
      await room.applyLayout(layout(movingDesign()));
      await room.applyPlan({
        title: 'Studio',
        edits: [{op: 'update', id: 'robot', changes: {color: '#2244aa'}}],
      });
      await room.undo();
      room.select('robot');
      const before = room.layout;
      const owner = room.getObject('robot')!;
      const arm = owner.getObjectByName('arm')!;
      const rotation = arm.quaternion.clone();
      await expect(room.request('Add a market')).rejects.toThrow(
        'invalid JSON'
      );
      expect(planner).toHaveBeenCalledTimes(enabled ? 2 : 1);
      expect(room.layout).toEqual(before);
      expect(room.getObject('robot')).toBe(owner);
      expect(room.selectedId).toBe('robot');
      expect(room.canRedo).toBe(true);
      expect(room.busy).toBe(false);
      room.update();
      expect(arm.quaternion.angleTo(rotation)).toBeGreaterThan(0.1);
    }
  );

  it.each([false, true])(
    'does not correct stale plans or overwrite hand edits (during correction=%s)',
    async (repairing) => {
      const response = deferred<unknown>();
      const planner = vi.fn<ScenePlanner>();
      if (repairing) planner.mockResolvedValueOnce(malformed);
      planner.mockReturnValue(response.promise);
      const room = createRoom([asset()], planner, true);
      await room.applyLayout(layout(object()));
      const pending = room.request('Move it right.');
      await vi.waitFor(() =>
        expect(planner).toHaveBeenCalledTimes(repairing ? 2 : 1)
      );
      room.getObject('one')!.position.x = 1;
      response.resolve({
        title: 'Studio',
        edits: [{op: 'update', id: 'one', changes: {position: [2, 0, 0]}}],
      });
      await expect(pending).rejects.toThrow('changed while planning');
      expect(planner).toHaveBeenCalledTimes(repairing ? 2 : 1);
      expect(room.getObject('one')!.position.x).toBe(1);
      expect(room.busy).toBe(false);
    }
  );

  it.each([false, true])(
    'ignores responses after disposal (during correction=%s)',
    async (repairing) => {
      const response = deferred<unknown>();
      const planner = vi.fn<ScenePlanner>();
      if (repairing) planner.mockResolvedValueOnce(malformed);
      planner.mockReturnValue(response.promise);
      const room = createRoom([asset()], planner, true);
      const pending = room.request('Build a market.');
      await vi.waitFor(() =>
        expect(planner).toHaveBeenCalledTimes(repairing ? 2 : 1)
      );
      room.dispose();
      response.resolve(malformed);
      await expect(pending).rejects.toThrow('disposed');
      expect(planner).toHaveBeenCalledTimes(repairing ? 2 : 1);
      expect(room.children).toHaveLength(0);
    }
  );
});

describe('Roomcraft virtual environments', () => {
  it('keeps the old environment while staging and releases a failed replacement', async () => {
    const download = deferred<THREE.Object3D>();
    const room = createRoom([
      asset({id: 'late', create: () => download.promise}),
    ]);
    await room.applyLayout(garden(pond()));
    const before = room.layout;
    const children = [...room.children];
    const oldDisposal = vi.fn();
    room.traverse((child) => {
      if (child instanceof THREE.Mesh)
        child.geometry.addEventListener('dispose', oldDisposal);
    });
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const pending = room.applyPlan({
      title: before.title,
      environment: {timeOfDay: 'sunrise'},
      edits: [{op: 'add', object: object({asset: 'late'})}],
    });
    expect(room.layout).toEqual(before);
    expect(room.children).toEqual(children);
    download.reject(new Error('Download failed'));
    await expect(pending).rejects.toThrow('Download failed');
    expect(room.layout).toEqual(before);
    expect(room.children).toEqual(children);
    expect(oldDisposal).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    expect(room.status).toBe('ready');
  });

  it('disposes landscape instance buffers, atmosphere resources, and shadow maps', async () => {
    const room = createRoom();
    const trees: SceneLandscapeObject = {
      ...pond(),
      landscape: {
        kind: 'scatter',
        style: 'tree',
        size: [4, 3],
        count: 4,
        seed: 1,
        height: 2,
      },
    };
    await room.applyLayout(garden(trees));
    const geometryDisposals = new Set<ReturnType<typeof vi.spyOn>>();
    const instanceDisposals: ReturnType<typeof vi.spyOn>[] = [];
    const shadowDisposals: ReturnType<typeof vi.spyOn>[] = [];
    room.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        geometryDisposals.add(vi.spyOn(child.geometry, 'dispose'));
      }
      if (child instanceof THREE.InstancedMesh) {
        instanceDisposals.push(vi.spyOn(child, 'dispose'));
      }
      if (child instanceof THREE.DirectionalLight) {
        shadowDisposals.push(vi.spyOn(child.shadow, 'dispose'));
      }
    });
    expect(geometryDisposals.size).toBeGreaterThan(0);
    expect(instanceDisposals.length).toBeGreaterThan(0);
    expect(shadowDisposals.length).toBeGreaterThan(0);
    room.dispose();
    for (const dispose of [
      ...geometryDisposals,
      ...instanceDisposals,
      ...shadowDisposals,
    ]) {
      expect(dispose).toHaveBeenCalled();
    }
    expect(room.children).toHaveLength(0);
    expect(room.layout).not.toHaveProperty('environment');
  });
});

describe('Roomcraft part motion', () => {
  it('preserves a moving joint and cycle phase while extending a limb', async () => {
    const room = createRoom();
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    room.select('robot');
    const owner = room.getObject('robot')!;
    owner.position.set(1, 0.2, -2);
    room.update();
    const arm = owner.getObjectByName('arm')!;
    const rotation = arm.quaternion.clone();
    const hinge = arm.localToWorld(new THREE.Vector3(0, 0.2, 0));
    const motion: SceneSwingMotion = {
      kind: 'swing',
      axis: 'z',
      pivot: [0, 0.3, 0],
      amplitude: 0.6,
      period: 2,
    };
    await room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {
              op: 'update',
              id: 'arm',
              changes: {
                position: [0.35, -0.1, 0],
                size: [0.1, 0.6, 0.1],
                motion,
              },
            },
            {op: 'update', id: 'hand', changes: {position: [0, -0.35, 0]}},
          ],
        },
      ],
    });
    const updated = owner.getObjectByName('arm')!;
    expect(room.getObject('robot')).toBe(owner);
    expect(updated).not.toBe(arm);
    expect(updated.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(
      updated.localToWorld(new THREE.Vector3(0, 0.3, 0)).distanceTo(hinge)
    ).toBeLessThan(1e-8);
    expect(owner.position.toArray()).toEqual([1, 0.2, -2]);
    expect(room.selectedId).toBe('robot');
    room.update();
    expect(updated.rotation.z).toBeCloseTo(0.6);
  });
});

describe('Roomcraft absolute motion time', () => {
  it('aligns late-created designs and background tabs without consuming frame deltas', async () => {
    let time = 0;
    const source = vi.fn(() => time);
    const early = createRoom();
    const delta = motionClock(early);
    early.setMotionTimeSource(source);
    const recipe = movingDesign();
    recipe.parts[0].motion = {
      kind: 'spin',
      axis: 'y',
      pivot: [0.1, 0, 0],
      speed: -Math.PI,
      phase: 0.125,
    };
    await early.applyLayout(layout(recipe));
    for (let step = 0; step < 10; step++) {
      time += 0.125;
      early.update();
    }
    // No frames run during this jump, as in a background tab.
    time = 400.5;
    early.update();
    const late = createRoom();
    late.setMotionTimeSource(source);
    await late.applyLayout(layout(recipe));
    expect(early.motionTimeSource).toBe(source);
    for (const id of ['body', 'arm', 'hand']) {
      const first = early.getObject('robot')!.getObjectByName(id)!;
      const second = late.getObject('robot')!.getObjectByName(id)!;
      first.updateWorldMatrix(true, false);
      second.updateWorldMatrix(true, false);
      expect(first.matrixWorld.elements).toEqual(second.matrixWorld.elements);
    }
    source.mockClear();
    early.update();
    expect(source).toHaveBeenCalledOnce();
    expect(delta).not.toHaveBeenCalled();
  });

  it('freezes the displayed sample through paused content replacement and realigns on resume', async () => {
    const room = createRoom();
    let time = 0.25;
    const source = vi.fn(() => time);
    room.setMotionTimeSource(source);
    await room.applyLayout(layout(movingDesign()));
    const held = room
      .getObject('robot')!
      .getObjectByName('arm')!
      .quaternion.clone();
    time = 0.5;
    source.mockClear();
    room.setMotionPaused(true);
    room.update();
    expect(source).not.toHaveBeenCalled();
    time = 60.5;
    await room.applyPlan({
      title: 'Studio',
      edits: [
        {op: 'update', id: 'robot', changes: {color: '#2244aa'}},
        {op: 'add', object: {...movingDesign(), id: 'new-robot'}},
      ],
    });
    for (const id of ['robot', 'new-robot']) {
      expect(
        room.getObject(id)!.getObjectByName('arm')!.quaternion.equals(held)
      ).toBe(true);
    }
    expect(source).not.toHaveBeenCalled();
    time = 61.5;
    room.setMotionPaused(false);
    expect(source).toHaveBeenCalledOnce();
    for (const id of ['robot', 'new-robot']) {
      expect(
        room.getObject(id)!.getObjectByName('arm')!.rotation.z
      ).toBeCloseTo(-0.6);
    }
  });
});

describe('Roomcraft objects and ownership', () => {
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
});

describe('Roomcraft procedural objects', () => {
  it('refines parts without recentering the design or replacing its hand-moved owner', async () => {
    const room = createRoom();
    await room.applyLayout(layout(design(), object({id: 'other'})));
    room.select('robot');
    const owner = room.getObject('robot')!;
    owner.position.set(2, 0.3, -1);
    owner.rotation.y = Math.PI / 4;
    owner.scale.set(1.5, 1, 0.8);
    owner.updateWorldMatrix(true, true);
    const pose = owner.matrixWorld.clone();
    const bodyBefore = partMesh(owner, 'body').getWorldPosition(
      new THREE.Vector3()
    );
    const other = room.getObject('other');
    const otherContent = other!.children[0];
    const snapshot = room.layout;
    const oldArm = partMesh(owner, 'arm');
    const disposed = vi.spyOn(oldArm.geometry, 'dispose');
    await room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
            {op: 'update', id: 'hand', changes: {position: [0, -0.45, 0]}},
            {
              op: 'add',
              part: {
                id: 'backpack',
                name: 'Backpack',
                shape: 'box',
                parent: 'body',
                position: [0, 0, -0.3],
                rotation: [0, 0, 0],
                size: [0.3, 0.3, 0.2],
                color: '#4455aa',
              },
            },
          ],
        },
      ],
    });
    expect(room.getObject('robot')).toBe(owner);
    owner.updateWorldMatrix(true, true);
    expect(owner.matrixWorld.equals(pose)).toBe(true);
    expect(
      partMesh(owner, 'body')
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(bodyBefore)
    ).toBeLessThan(1e-9);
    expect(room.getObject('other')).toBe(other);
    expect(other!.children[0]).toBe(otherContent);
    expect(room.selectedId).toBe('robot');
    expect(room.layout.objects[0].parts).toHaveLength(4);
    expect(disposed).toHaveBeenCalledOnce();
    const after = room.layout;
    const imported = createRoom();
    await imported.applyLayout(JSON.stringify(after));
    expect(imported.layout).toEqual(after);
    await room.undo();
    expect(room.getObject('robot')).toBe(owner);
    expect(room.layout).toEqual(snapshot);
  });

  it('aborts a layout import promptly and disposes only its unused staging', async () => {
    const pending = deferred<THREE.Object3D>();
    const room = createRoom([
      asset({id: 'slow', create: () => pending.promise}),
    ]);
    await room.applyLayout(layout(design()));
    const before = room.layout;
    const owner = room.getObject('robot')!;
    const content = owner.children[0];
    const currentDisposed = vi.spyOn(
      partMesh(owner, 'arm').geometry,
      'dispose'
    );
    const stagedDisposal = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const controller = new AbortController();
    const importing = room.applyLayout(
      garden(design({color: '#ffffff'}), object({asset: 'slow'})),
      {signal: controller.signal}
    );
    controller.abort();
    await expect(importing).rejects.toMatchObject({name: 'AbortError'});
    expect(room.busy).toBe(false);
    expect(room.status).toBe('ready');
    expect(room.layout).toEqual(before);
    expect(owner.children[0]).toBe(content);
    expect(currentDisposed).not.toHaveBeenCalled();
    expect(stagedDisposal).toHaveBeenCalled();
    stagedDisposal.mockRestore();
    await room.applyPlan({title: 'Local work can continue', edits: []});
    const late = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    const lateGeometry = vi.spyOn(late.geometry, 'dispose');
    const lateMaterial = vi.spyOn(late.material, 'dispose');
    pending.resolve(late);
    await vi.waitFor(() => expect(lateGeometry).toHaveBeenCalledOnce());
    expect(lateMaterial).toHaveBeenCalledOnce();
    expect(room.layout.title).toBe('Local work can continue');
    expect(room.getObject('robot')).toBe(owner);
    expect(currentDisposed).not.toHaveBeenCalled();
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
});

describe('Roomcraft redo', () => {
  async function prepareColorRedo(room: Roomcraft) {
    await room.applyLayout(layout(object()));
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#2244aa'}}],
    });
    await room.undo();
  }

  it('keeps the current content and both histories when rebuilding for redo fails', async () => {
    const create = vi.fn<SceneAsset['create']>(asset().create);
    const room = createRoom([asset({create})]);
    await prepareColorRedo(room);
    const before = room.layout;
    const owner = room.getObject('one')!;
    const content = owner.children[0];
    create.mockRejectedValueOnce(new Error('Model could not reload'));
    await expect(room.redo()).rejects.toThrow('Model could not reload');
    expect(room.layout).toEqual(before);
    expect(owner.children[0]).toBe(content);
    expect(room.canUndo).toBe(true);
    expect(room.canRedo).toBe(true);
    expect(room.busy).toBe(false);
    await room.redo();
    expect(room.layout.objects[0].color).toBe('#2244aa');
    expect(room.getObject('one')).toBe(owner);
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
});

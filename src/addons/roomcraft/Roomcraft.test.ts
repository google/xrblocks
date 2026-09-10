import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AI, World, disposeObjectTree, type InteractionSource} from 'xrblocks';

import {Roomcraft} from './Roomcraft';
import * as SceneProtocol from './ScenePlan';
import {SceneValidationError} from './SceneValidationError';
import type {
  SceneAsset,
  SceneCatalogObject,
  SceneLandscapeObject,
  SceneLayout,
  SceneObject,
  ScenePlan,
  ScenePlanner,
  SceneProceduralObject,
  SceneRequest,
  SceneSwingMotion,
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

  it('corrects an invalid combined part edit, not just invalid add objects', async () => {
    const planner = vi
      .fn<ScenePlanner>()
      .mockResolvedValueOnce({
        title: 'Studio',
        edits: [
          {
            op: 'update',
            id: 'robot',
            changes: {},
            partEdits: [
              {op: 'update', id: 'body', changes: {position: [5, 0.5, 0]}},
              {op: 'update', id: 'arm', changes: {position: [5, 0, 0]}},
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        title: 'Studio',
        edits: [
          {
            op: 'update',
            id: 'robot',
            changes: {},
            partEdits: [
              {op: 'update', id: 'arm', changes: {position: [0.5, 0, 0]}},
            ],
          },
        ],
      });
    const room = createRoom([], planner, true);
    await room.applyLayout(layout(design()));
    await room.request('Extend the arm.');
    expect(planner).toHaveBeenCalledTimes(2);
    expect(planner.mock.calls[1][0].repair?.reason).toContain(
      'Procedural geometry'
    );
    expect(room.layout.objects[0].parts![1].position).toEqual([0.5, 0, 0]);
  });

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

  it('keeps correction context detached from mutations made by a custom planner', async () => {
    const planner = vi
      .fn<ScenePlanner>()
      .mockImplementationOnce(async (request) => {
        request.scene.objects[0].position[0] = 9;
        request.prompt = 'Changed by the planner';
        request.catalog[0].description = 'Changed catalog';
        return malformed;
      })
      .mockResolvedValueOnce({title: 'Studio', edits: []});
    const room = createRoom([asset()], planner, true);
    const before = layout(object());
    await room.applyLayout(before);
    await room.request('Keep the scene.');
    expect(planner.mock.calls[1][0].scene).toEqual(before);
    expect(planner.mock.calls[1][0].prompt).toBe('Keep the scene.');
    expect(planner.mock.calls[1][0].catalog[0].description).toBe('Test box');
  });

  it.each([false, true])(
    'does not retry provider errors (during correction=%s)',
    async (repairing) => {
      const planner = vi.fn<ScenePlanner>();
      if (repairing) planner.mockResolvedValueOnce(malformed);
      planner.mockRejectedValueOnce(new Error('Quota exceeded'));
      const room = createRoom([asset()], planner, true);
      await expect(room.request('Build a market')).rejects.toThrow(
        'Quota exceeded'
      );
      expect(planner).toHaveBeenCalledTimes(repairing ? 2 : 1);
      expect(room.layout.objects).toEqual([]);
      expect(room.busy).toBe(false);
    }
  );

  it('does not retry explicit imports or asset-loading failures', async () => {
    const planner = vi.fn<ScenePlanner>().mockResolvedValue({
      title: 'Studio',
      edits: [{op: 'add', object: object()}],
    });
    const broken = asset({
      create: () => {
        throw new Error('Download failed');
      },
    });
    const room = createRoom([broken], planner, true);
    await expect(room.applyLayout(malformed)).rejects.toThrow('invalid JSON');
    await expect(room.applyPlan(oversized)).rejects.toThrow(
      'Procedural geometry'
    );
    expect(planner).not.toHaveBeenCalled();
    await expect(room.request('Add a box')).rejects.toThrow('Download failed');
    expect(planner).toHaveBeenCalledTimes(1);
    expect(room.layout.objects).toEqual([]);
  });

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

  it('sends correction feedback through the existing AI facade', async () => {
    const room = createRoom([asset()], undefined, true);
    const ai = new AI();
    const query = vi
      .spyOn(ai, 'query')
      .mockResolvedValueOnce({text: malformed})
      .mockResolvedValueOnce({text: '{"title":"Studio","edits":[]}'});
    room.init({ai, world: new World(), camera: new THREE.PerspectiveCamera()});
    await room.request('Build a market.');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toEqual({
      prompt: expect.stringContaining('"repair":{"reason":'),
    });
    expect(query.mock.calls[1][0]).toEqual({
      prompt: expect.stringContaining('incomplete or invalid JSON'),
    });
  });

  it('does not relax geometry bounds when the correction is still oversized', async () => {
    const planner = vi.fn<ScenePlanner>().mockResolvedValue(oversized);
    const room = createRoom([], planner, true);
    await expect(room.request('Create a large market.')).rejects.toThrow(
      'The corrected scene plan is still invalid. Procedural geometry'
    );
    expect(planner).toHaveBeenCalledTimes(2);
    expect(room.layout.objects).toEqual([]);
    expect(room.canUndo).toBe(false);
  });

  it('does not retry unexpected validator exceptions or planner-thrown validation errors', async () => {
    const planner = vi
      .fn<ScenePlanner>()
      .mockRejectedValueOnce(
        new SceneValidationError('Remote validation failed')
      )
      .mockResolvedValueOnce({title: 'Studio', edits: []});
    const room = createRoom([], planner, true);
    await expect(room.request('Create a market')).rejects.toThrow(
      'Remote validation'
    );
    expect(planner).toHaveBeenCalledTimes(1);
    vi.spyOn(SceneProtocol, 'readScenePlan').mockImplementation(() => {
      throw new TypeError('Unexpected validator failure');
    });
    await expect(room.request('Create a market')).rejects.toThrow(TypeError);
    expect(planner).toHaveBeenCalledTimes(2);
    expect(room.busy).toBe(false);
  });

  it('does not start a correction if a status observer disposes the room', async () => {
    const planner = vi.fn<ScenePlanner>().mockResolvedValue(malformed);
    const room = createRoom([], planner, true);
    room.addEventListener('statuschange', ({status}) => {
      if (status === 'repairing') room.dispose();
    });
    await expect(room.request('Create a market')).rejects.toThrow('disposed');
    expect(planner).toHaveBeenCalledTimes(1);
  });

  it('bounds validation feedback without including the rejected response', async () => {
    const planner = vi
      .fn<ScenePlanner>()
      .mockResolvedValueOnce({['x'.repeat(3000)]: 'Rejected response contents'})
      .mockResolvedValueOnce({title: 'Studio', edits: []});
    const room = createRoom([], planner, true);
    await room.request('Create a market');
    const retry = planner.mock.calls[1][0];
    expect(retry.repair?.reason).toHaveLength(1000);
    expect(JSON.stringify(retry)).not.toContain('Rejected response contents');
  });

  it('rejects non-boolean correction settings rather than enabling extra requests', () => {
    // @ts-expect-error Exercise invalid JavaScript configuration.
    expect(() => new Roomcraft({repairInvalidPlans: 'true'})).toThrow(
      'boolean'
    );
  });
});

describe('Roomcraft virtual environments', () => {
  it('builds an owned environment and landscape without loading catalog assets', async () => {
    const box = asset();
    const room = createRoom([box]);
    const expected = garden(pond());
    await room.applyLayout(expected);
    expect(room.layout).toEqual(expected);
    expect(room.children).toHaveLength(2);
    expect(room.getObject('pond')?.children).toHaveLength(1);
    expect(box.create).not.toHaveBeenCalled();
    const snapshot = room.layout;
    snapshot.environment!.size[0] = 20;
    const water = snapshot.objects[0].landscape;
    if (water?.kind !== 'pond') throw new Error('Expected a pond.');
    water.size[0] = 9;
    expect(room.layout).toEqual(expected);
  });

  it('changes moonlight to sunrise without touching hand poses, selection, geometry, or motion', async () => {
    const room = createRoom();
    motionClock(room);
    await room.applyLayout(garden(pond(), movingDesign()));
    const water = room.getObject('pond')!;
    const robot = room.getObject('robot')!;
    const waterContent = water.children[0];
    const robotContent = robot.children[0];
    const setting = room.children.find(
      (child) => child !== water && child !== robot
    )!;
    water.position.set(25, -2, 0);
    water.rotation.y = 0.731;
    room.select('pond');
    room.update();
    const arm = robot.getObjectByName('arm')!;
    const cycle = arm.quaternion.clone();
    const before = room.layout;
    const events = vi.fn();
    room.addEventListener('change', events);
    await room.applyPlan({
      title: before.title,
      edits: [],
      environment: {timeOfDay: 'sunrise'},
    });
    expect(room.layout.environment).toEqual({
      ...before.environment,
      timeOfDay: 'sunrise',
    });
    expect(room.layout.objects).toEqual(before.objects);
    expect(room.getObject('pond')).toBe(water);
    expect(water.children[0]).toBe(waterContent);
    expect(robot.children[0]).toBe(robotContent);
    expect(arm.quaternion.equals(cycle)).toBe(true);
    expect(room.selectedId).toBe('pond');
    expect(setting.parent).toBeNull();
    expect(events).toHaveBeenCalledOnce();
    await room.undo();
    expect(room.layout).toEqual(before);
    expect(robot.children[0]).toBe(robotContent);
    await room.redo();
    expect(room.layout.environment?.timeOfDay).toBe('sunrise');
    expect(water.children[0]).toBe(waterContent);
    room.update();
    expect(arm.quaternion.equals(cycle)).toBe(false);
  });

  it('enlarges only the selected pond and replays the same recipes through history', async () => {
    const planting: SceneLandscapeObject = {
      ...pond(),
      id: 'trees',
      landscape: {
        kind: 'scatter',
        style: 'tree',
        size: [4, 3],
        count: 24,
        seed: 17,
        height: 2.5,
      },
    };
    const room = createRoom();
    await room.applyLayout(garden(pond(), planting));
    const water = room.getObject('pond')!;
    const trees = room.getObject('trees')!;
    const waterContent = water.children[0];
    const treeContent = trees.children[0];
    const setting = room.children.find(
      (child) => child !== water && child !== trees
    );
    water.position.set(1.5, 0.1, -2);
    room.select('pond');
    const before = room.layout;
    await room.applyPlan({
      title: before.title,
      edits: [
        {
          op: 'update',
          id: 'pond',
          changes: {landscape: {kind: 'pond', size: [4, 3], bankWidth: 0.25}},
        },
      ],
    });
    const after = room.layout;
    expect(water.children[0]).not.toBe(waterContent);
    expect(trees.children[0]).toBe(treeContent);
    expect(after.objects[1]).toEqual(before.objects[1]);
    expect(after.objects[0].position).toEqual(before.objects[0].position);
    expect(room.children).toContain(setting);
    expect(room.getObject('pond')).toBe(water);
    await room.undo();
    expect(room.layout).toEqual(before);
    await room.redo();
    expect(room.layout).toEqual(after);
    expect(trees.children[0]).toBe(treeContent);
    expect(room.selectedId).toBe('pond');
  });

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

  it('removes and restores the setting without removing authored objects', async () => {
    const room = createRoom();
    await room.applyLayout(garden(pond()));
    const water = room.getObject('pond')!;
    const content = water.children[0];
    await room.applyPlan({
      title: 'Japanese garden',
      environment: null,
      edits: [],
    });
    expect(room.layout).toEqual({title: 'Japanese garden', objects: [pond()]});
    expect(room.children).toEqual([water]);
    expect(water.children[0]).toBe(content);
    await room.undo();
    expect(room.layout).toEqual(garden(pond()));
    expect(water.children[0]).toBe(content);
    await room.applyLayout(layout(pond()));
    expect(room.layout).not.toHaveProperty('environment');
  });

  it('switches among procedural motion, landscape, and catalog content on one owner', async () => {
    const room = createRoom();
    motionClock(room);
    await room.applyLayout(garden(movingDesign()));
    const owner = room.getObject('robot')!;
    expect(room.hasMotion).toBe(true);
    await room.applyPlan({
      title: 'Japanese garden',
      edits: [
        {op: 'update', id: 'robot', changes: {landscape: pond().landscape}},
      ],
    });
    expect(room.hasMotion).toBe(false);
    expect(room.layout.objects[0]).not.toHaveProperty('parts');
    expect(room.layout.objects[0]).not.toHaveProperty('asset');
    expect(room.getObject('robot')).toBe(owner);
    room.update();
    await room.applyPlan({
      title: 'Japanese garden',
      edits: [{op: 'update', id: 'robot', changes: {asset: 'box'}}],
    });
    expect(room.layout.objects[0]).not.toHaveProperty('landscape');
    expect(room.getObject('robot')).toBe(owner);
    await room.undo();
    await room.undo();
    expect(room.hasMotion).toBe(true);
    expect(room.getObject('robot')).toBe(owner);
  });

  it('does not attach a staged environment after disposal during an asset load', async () => {
    const download = deferred<THREE.Object3D>();
    const room = createRoom([asset({create: () => download.promise})]);
    const pending = room.applyLayout(garden(object()));
    expect(room.children).toHaveLength(0);
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    room.dispose();
    download.resolve(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    );
    await expect(pending).rejects.toThrow('disposed');
    expect(dispose).toHaveBeenCalled();
    expect(room.children).toHaveLength(0);
    expect(room.layout).not.toHaveProperty('environment');
  });

  it('does not rebuild an unchanged environment or discard redo for a no-op patch', async () => {
    const room = createRoom();
    await room.applyLayout(garden());
    await room.applyPlan({
      title: 'Japanese garden',
      edits: [],
      environment: {timeOfDay: 'sunrise'},
    });
    await room.undo();
    const setting = room.children[0];
    await room.applyPlan({
      title: 'Japanese garden',
      edits: [],
      environment: {timeOfDay: 'moonlight'},
    });
    expect(room.children[0]).toBe(setting);
    expect(room.canRedo).toBe(true);
    await room.redo();
    expect(room.layout.environment?.timeOfDay).toBe('sunrise');
  });

  it('frames the transformed ground, not the sky, and keeps object-only bounds separate', async () => {
    const room = createRoom();
    await room.applyLayout(garden());
    room.position.set(2, 3, -1);
    room.rotation.y = Math.PI / 3;
    room.scale.set(2, 1, 1.5);
    room.updateWorldMatrix(true, false);
    const ground = new THREE.Box3(
      new THREE.Vector3(-7, 0, -6),
      new THREE.Vector3(7, 0, 6)
    ).applyMatrix4(room.matrixWorld);
    const bounds = room.getWorldBounds();
    expect(bounds.min.x).toBeCloseTo(ground.min.x);
    expect(bounds.max.x).toBeCloseTo(ground.max.x);
    expect(bounds.min.z).toBeCloseTo(ground.min.z);
    expect(bounds.max.z).toBeCloseTo(ground.max.z);
    expect(bounds.max.y).toBeCloseTo(3);
    expect(bounds.min.y).toBeGreaterThan(2);
    await room.applyLayout(garden(pond()));
    expect(
      room.getWorldBounds('pond').getSize(new THREE.Vector3()).x
    ).toBeLessThan(room.getWorldBounds().getSize(new THREE.Vector3()).x);
  });

  it('includes environment metadata in provider context without exposing live references', async () => {
    const planner: ScenePlanner = vi.fn((request) => {
      expect(request.scene.environment).toEqual(garden().environment);
      request.scene.environment!.size[0] = 20;
      return {
        title: request.scene.title,
        edits: [],
        environment: {timeOfDay: 'sunrise'},
      };
    });
    const room = createRoom([], planner);
    await room.applyLayout(garden());
    await room.request('Change to sunrise');
    expect(room.layout.environment).toEqual({
      ...garden().environment,
      timeOfDay: 'sunrise',
    });
  });

  it('rejects detected-surface fitting for a fully virtual setting', async () => {
    const room = createRoom();
    await room.applyLayout(garden(pond()));
    await expect(room.placeOnSurface()).rejects.toThrow('virtual environment');
    expect(room.status).toBe('ready');
    expect(room.layout).toEqual(garden(pond()));
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
  it('uses the SDK timer to move parts and their children without editing the saved scene', async () => {
    const room = createRoom();
    motionClock(room);
    expect(Roomcraft.dependencies.timer).toBe(THREE.Timer);
    await room.applyLayout(layout(movingDesign()));
    room.select('robot');
    const owner = room.getObject('robot')!;
    owner.position.set(2, 0.3, -1);
    owner.rotation.y = 0.4;
    owner.scale.set(1.2, 0.8, 1.5);
    const before = room.layout;
    const pose = owner.quaternion.clone();
    const arm = owner.getObjectByName('arm')!;
    const hand = owner.getObjectByName('hand')!;
    const handPosition = hand.getWorldPosition(new THREE.Vector3());
    const change = vi.fn();
    room.addEventListener('change', change);
    expect(room.hasMotion).toBe(true);
    room.update();
    const angle = 0.6 * Math.sin(Math.PI / 4);
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      angle
    );
    expect(arm.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(
      hand.getWorldPosition(new THREE.Vector3()).distanceTo(handPosition)
    ).toBeGreaterThan(0.1);
    expect(owner.quaternion.equals(pose)).toBe(true);
    expect(room.layout).toEqual(before);
    expect(room.selectedId).toBe('robot');
    expect(change).not.toHaveBeenCalled();
  });

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

  it('copies the current cycle at commit time, not before asynchronous asset loading', async () => {
    const download = deferred<THREE.Object3D>();
    const room = createRoom([
      asset(),
      asset({id: 'slow', create: () => download.promise}),
    ]);
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    room.update();
    const owner = room.getObject('robot')!;
    const pending = room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [{op: 'update', id: 'body', changes: {color: '#3366aa'}}],
        },
        {op: 'add', object: object({id: 'slow-object', asset: 'slow'})},
      ],
    });
    expect(room.busy).toBe(true);
    room.update();
    const rotation = owner.getObjectByName('arm')!.quaternion.clone();
    download.resolve(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    );
    await pending;
    expect(
      owner.getObjectByName('arm')!.quaternion.angleTo(rotation)
    ).toBeLessThan(1e-7);
    expect(owner.getObjectByName('arm')!.rotation.z).toBeCloseTo(0.6);
  });

  it('keeps the live motion and content when another staged asset fails', async () => {
    const download = deferred<THREE.Object3D>();
    const room = createRoom([
      asset(),
      asset({id: 'slow', create: () => download.promise}),
    ]);
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    const before = room.layout;
    const arm = room.getObject('robot')!.getObjectByName('arm')!;
    const pending = room.applyPlan({
      title: 'Studio',
      edits: [
        {op: 'update', id: 'robot', changes: {color: '#2244aa'}},
        {op: 'add', object: object({id: 'slow-object', asset: 'slow'})},
      ],
    });
    room.update();
    const rotation = arm.quaternion.clone();
    download.reject(new Error('Model download failed'));
    await expect(pending).rejects.toThrow('Model download failed');
    expect(room.layout).toEqual(before);
    expect(room.getObject('robot')!.getObjectByName('arm')).toBe(arm);
    room.update();
    expect(arm.quaternion.angleTo(rotation)).toBeGreaterThan(0.1);
  });

  it('plans against detached rest data while playback continues', async () => {
    const pending = deferred<unknown>();
    const requests: SceneRequest[] = [];
    const room = createRoom([asset()], async (request) => {
      requests.push(request);
      return pending.promise;
    });
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    const before = room.layout;
    const request = room.request('Make its arm orange.');
    room.update();
    expect(requests[0].scene).toEqual(before);
    requests[0].scene.objects[0].parts![1].motion!.pivot[0] = 4;
    expect(room.layout).toEqual(before);
    pending.resolve({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [{op: 'update', id: 'arm', changes: {color: '#ff9900'}}],
        },
      ],
    });
    await request;
    expect(room.layout.objects[0].parts![1].motion!.pivot).toEqual([0, 0.2, 0]);
    expect(
      room.getObject('robot')!.getObjectByName('arm')!.rotation.z
    ).toBeCloseTo(0.6 * Math.sin(Math.PI / 4));
  });

  it('keeps a moving design and its redo branch after incomplete provider JSON', async () => {
    const room = createRoom(
      [],
      async () => '{"title":"Studio","edits":[{"op":"remove","id":"robot"},'
    );
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
    await expect(room.request('Add a moving bird')).rejects.toThrow(
      'incomplete or invalid JSON'
    );
    room.update();
    expect(room.busy).toBe(false);
    expect(room.layout).toEqual(before);
    expect(room.getObject('robot')).toBe(owner);
    expect(room.selectedId).toBe('robot');
    expect(room.canRedo).toBe(true);
    expect(arm.quaternion.angleTo(rotation)).toBeGreaterThan(0.1);
  });

  it('pauses inspection without touching layout, placement, selection, or redo', async () => {
    const room = createRoom();
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'robot', changes: {color: '#2244aa'}}],
    });
    await room.undo();
    room.select('robot');
    room.position.set(1, 0.5, -2);
    const before = room.layout;
    const events = vi.fn();
    room.addEventListener('motionstatechange', events);
    room.update();
    const arm = room.getObject('robot')!.getObjectByName('arm')!;
    const rotation = arm.quaternion.clone();
    room.setMotionPaused(true);
    room.setMotionPaused(true);
    room.update();
    expect(room.motionPaused).toBe(true);
    expect(arm.quaternion.equals(rotation)).toBe(true);
    expect(events).toHaveBeenCalledOnce();
    expect(room.layout).toEqual(before);
    expect(room.position.toArray()).toEqual([1, 0.5, -2]);
    expect(room.selectedId).toBe('robot');
    expect(room.canRedo).toBe(true);
    room.setMotionPaused(false);
    room.update();
    expect(arm.quaternion.angleTo(rotation)).toBeGreaterThan(0.1);
    expect(events).toHaveBeenCalledTimes(2);
    expect(room.canRedo).toBe(true);
  });

  it('records motion definitions in history and exports, not current playback phase', async () => {
    const room = createRoom();
    motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    const saved = room.layout;
    room.update();
    await room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [{op: 'update', id: 'arm', changes: {motion: null}}],
        },
      ],
    });
    expect(room.hasMotion).toBe(false);
    expect(room.getObject('robot')!.getObjectByName('arm')!.rotation.z).toBe(0);
    await room.undo();
    expect(room.hasMotion).toBe(true);
    expect(room.layout).toEqual(saved);
    room.update();
    expect(room.canRedo).toBe(true);
    const restored = createRoom();
    motionClock(restored);
    await restored.applyLayout(JSON.stringify(room.layout));
    expect(restored.layout).toEqual(saved);
    expect(
      restored.getObject('robot')!.getObjectByName('arm')!.rotation.z
    ).toBeCloseTo(0, 12);
    await room.redo();
    expect(room.hasMotion).toBe(false);
  });

  it('returns detached world-space envelopes covering all phases and transformed parents', async () => {
    const room = createRoom();
    const delta = motionClock(room);
    await room.applyLayout(layout(movingDesign()));
    const parent = new THREE.Group();
    parent.position.set(1, 2, -1);
    parent.rotation.set(0.2, 0.4, -0.1);
    parent.scale.set(1.3, 0.8, 1.7);
    parent.add(room);
    room.rotation.y = 0.5;
    const owner = room.getObject('robot')!;
    owner.scale.set(1.2, 0.9, 0.7);
    const bounds = room.getWorldBounds('robot');
    const padded = bounds.clone().expandByScalar(1e-6);
    delta.mockReturnValue(2 / 80);
    for (let index = 0; index < 80; index++) {
      room.update();
      expect(padded.containsBox(new THREE.Box3().setFromObject(owner))).toBe(
        true
      );
      expect(room.getWorldBounds('robot').equals(bounds)).toBe(true);
    }
    expect(room.getWorldBounds().equals(bounds)).toBe(true);
    bounds.min.setScalar(-999);
    expect(room.getWorldBounds().min.x).toBeGreaterThan(-999);
    expect(() => room.getWorldBounds('missing')).toThrow();
    expect(() => room.getWorldBounds('Invalid Id')).toThrow();
  });

  it('keeps static behavior inert and fails clearly if moving content has no frame timer', async () => {
    const room = createRoom();
    expect(room.getWorldBounds().isEmpty()).toBe(true);
    expect(room.hasMotion).toBe(false);
    expect(() => room.update()).not.toThrow();
    await room.applyLayout(layout(object()));
    expect(
      room.getWorldBounds().equals(new THREE.Box3().setFromObject(room))
    ).toBe(true);
    await room.applyLayout(layout(movingDesign()));
    expect(() => room.update()).toThrow('frame timer');
    room.dispose();
    expect(room.hasMotion).toBe(false);
    expect(() => room.update()).not.toThrow();
    expect(() => room.setMotionPaused(true)).toThrow('disposed');
  });
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
    expect(
      () => new Roomcraft({catalog: Array.from({length: 129}, () => asset())})
    ).toThrow('catalog');
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

describe('Roomcraft procedural objects', () => {
  it('creates an entire new design as one manipulation owner without a catalog', async () => {
    const room = createRoom([]);
    await room.applyLayout(layout(design()));
    expect(room.catalog).toEqual([]);
    expect(room.children).toHaveLength(1);
    const owner = room.getObject('robot')!;
    expect(owner.name).toBe('Little robot');
    expect(owner.xb?.manipulation?.actions?.translate).toBe(true);
    expect(
      partMesh(owner, 'hand')
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(0.45, 0.25, -0.05))
    ).toBeLessThan(1e-9);
    expect(room.layout.objects[0]).not.toHaveProperty('asset');
    expect(room.layout.objects[0].parts).toEqual(design().parts);
  });

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

  it('keeps nested recipes detached from callers, snapshots, and planner context', async () => {
    const pending = deferred<unknown>();
    const room = createRoom([], (request) => {
      request.scene.objects[0].parts![0].size[0] = 4;
      request.scene.objects[0].parts![1].position[0] = 4;
      return pending.promise;
    });
    const original = layout(design());
    await room.applyLayout(original);
    const snapshot = room.layout;
    original.objects[0].parts![0].color = '#000000';
    snapshot.objects[0].parts![1].rotation[0] = 1;
    expect(room.layout.objects[0].parts).toEqual(design().parts);
    const request = room.request('Make its arm blue');
    pending.resolve({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [{op: 'update', id: 'arm', changes: {color: '#2244aa'}}],
        },
      ],
    });
    await request;
    const result = room.layout.objects[0].parts!;
    expect(result[0].size).toEqual(design().parts[0].size);
    expect(result[1].position).toEqual(design().parts[1].position);
    expect(result[1].color).toBe('#2244aa');
  });

  it('preserves movement during planning when the request only edits parts', async () => {
    const pending = deferred<unknown>();
    const room = createRoom([], () => pending.promise);
    await room.applyLayout(layout(design()));
    room.select('robot');
    const owner = room.getObject('robot')!;
    const request = room.request('Give this longer arms');
    owner.position.set(12, 0.4, -2);
    owner.scale.setScalar(2);
    pending.resolve({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
          ],
        },
      ],
    });
    await request;
    expect(room.getObject('robot')).toBe(owner);
    expect(room.layout.objects[0].position).toEqual([12, 0.4, -2]);
    expect(room.layout.objects[0].scale).toEqual([2, 2, 2]);
    expect(room.layout.objects[0].parts![1].size).toEqual([0.1, 0.8, 0.1]);
  });

  it('keeps the live design on invalid graphs and downstream loading failure', async () => {
    const failing = asset({
      id: 'failed',
      create: () => Promise.reject(new Error('Model failed')),
    });
    const room = createRoom([failing]);
    await room.applyLayout(layout(design()));
    const owner = room.getObject('robot')!;
    const before = room.layout;
    const content = owner.children[0];
    const originalGeometry = partMesh(owner, 'body').geometry;
    const originalDisposed = vi.spyOn(originalGeometry, 'dispose');
    await expect(
      room.applyPlan({
        title: 'Studio',
        edits: [
          {
            op: 'update',
            id: 'robot',
            changes: {},
            partEdits: [{op: 'update', id: 'body', changes: {parent: 'hand'}}],
          },
        ],
      })
    ).rejects.toThrow();
    const stagedDisposal = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    await expect(
      room.applyPlan({
        title: 'Studio',
        edits: [
          {
            op: 'update',
            id: 'robot',
            changes: {},
            partEdits: [
              {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
            ],
          },
          {op: 'add', object: object({asset: 'failed'})},
        ],
      })
    ).rejects.toThrow('Model failed');
    expect(room.layout).toEqual(before);
    expect(owner.children[0]).toBe(content);
    expect(originalDisposed).not.toHaveBeenCalled();
    expect(stagedDisposal).toHaveBeenCalled();
    expect(room.getObject('one')).toBeUndefined();
    expect(room.busy).toBe(false);
  });

  it('rejects movement while a mixed procedural/model transaction is loading', async () => {
    const pending = deferred<THREE.Object3D>();
    const slow = asset({id: 'slow', create: () => pending.promise});
    const room = createRoom([slow]);
    await room.applyLayout(layout(design()));
    const owner = room.getObject('robot')!;
    const oldArm = partMesh(owner, 'arm');
    const loading = room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
          ],
        },
        {op: 'add', object: object({asset: 'slow'})},
      ],
    });
    owner.position.x = 2;
    pending.resolve(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    );
    await expect(loading).rejects.toThrow('moved while assets were loading');
    expect(room.getObject('robot')).toBe(owner);
    expect(partMesh(owner, 'arm')).toBe(oldArm);
    expect(room.layout.objects[0].position[0]).toBe(2);
    expect(room.getObject('one')).toBeUndefined();
  });

  it('supports content-source swaps and no-op refinements without losing undo semantics', async () => {
    const room = createRoom();
    await room.applyLayout(layout(design()));
    const owner = room.getObject('robot')!;
    const body = partMesh(owner, 'body');
    await room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm', changes: {size: [0.1, 0.4, 0.1]}},
          ],
        },
      ],
    });
    expect(partMesh(owner, 'body')).toBe(body);
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'robot', changes: {asset: 'box'}}],
    });
    expect(room.getObject('robot')).toBe(owner);
    expect(room.layout.objects[0]).not.toHaveProperty('parts');
    await room.undo();
    expect(room.getObject('robot')).toBe(owner);
    expect(room.layout.objects[0].parts).toEqual(design().parts);
    await room.undo();
    expect(room.layout.objects).toHaveLength(0);
    expect(room.canUndo).toBe(false);
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
    for (let index = 0; index < 20; index++) await room.redo();
    expect(room.layout.title).toBe('Scene 21');
    expect(room.canRedo).toBe(false);
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

  it('reports empty history explicitly and releases redo state on disposal', async () => {
    const room = createRoom();
    expect(room.canRedo).toBe(false);
    await expect(room.redo()).rejects.toThrow('no scene edit to redo');
    expect(room.busy).toBe(false);
    await prepareColorRedo(room);
    expect(room.canRedo).toBe(true);
    room.dispose();
    expect(room.canRedo).toBe(false);
    await expect(room.redo()).rejects.toThrow('disposed');
  });

  it('replays procedural edits with the same owner and saved hand pose, without AI', async () => {
    const planner = vi.fn<ScenePlanner>();
    const room = createRoom([], planner);
    await room.applyLayout(layout(design()));
    const owner = room.getObject('robot')!;
    owner.position.set(2, 0.3, -1);
    owner.scale.setScalar(1.5);
    owner.rotation.y = 0.4;
    const rotation = owner.quaternion.clone();
    room.select('robot');
    const before = room.layout;
    const result = await room.applyPlan({
      title: 'Studio',
      edits: [
        {
          op: 'update',
          id: 'robot',
          changes: {},
          partEdits: [
            {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
            {op: 'update', id: 'hand', changes: {position: [0, -0.45, 0]}},
          ],
        },
      ],
    });
    const states: boolean[] = [];
    room.addEventListener('change', () => states.push(room.canRedo));
    await room.undo();
    expect(room.layout).toEqual(before);
    expect(room.canRedo).toBe(true);
    result.objects[0].parts![0].color = '#000000';
    await room.redo();
    expect(room.layout.objects[0].parts![0]).toEqual(design().parts[0]);
    expect(room.layout.objects[0].parts![1].size).toEqual([0.1, 0.8, 0.1]);
    expect(owner.position.toArray()).toEqual([2, 0.3, -1]);
    expect(owner.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    expect(owner.quaternion.equals(rotation)).toBe(true);
    expect(room.getObject('robot')).toBe(owner);
    expect(room.selectedId).toBe('robot');
    expect(states).toEqual([true, false]);
    expect(planner).not.toHaveBeenCalled();
  });

  it('restores the complete pose captured immediately before undo', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#2244aa'}}],
    });
    room.getObject('one')!.position.set(3, 0.5, -2);
    const beforeUndo = room.layout;
    await room.undo();
    await room.redo();
    expect(room.layout).toEqual(beforeUndo);
  });

  it('replays removal and explicit replacement without retaining disposed objects', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    await room.applyLayout(layout(design()));
    await room.undo();
    const restored = room.getObject('one')!;
    const geometry = new THREE.Box3().setFromObject(restored);
    expect(geometry.isEmpty()).toBe(false);
    await room.redo();
    expect(room.getObject('one')).toBeUndefined();
    expect(restored.parent).toBeNull();
    expect(room.layout).toEqual(layout(design()));
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'remove', id: 'robot'}],
    });
    await room.undo();
    await room.redo();
    expect(room.children).toHaveLength(0);
  });

  it('keeps redo after failed or no-op commands, but clears it on a new edit', async () => {
    const room = createRoom();
    await prepareColorRedo(room);
    await expect(
      room.applyPlan({
        title: 'Studio',
        edits: [{op: 'remove', id: 'missing'}],
      })
    ).rejects.toThrow('does not exist');
    expect(room.canRedo).toBe(true);
    await room.applyPlan({title: 'Studio', edits: []});
    expect(room.canRedo).toBe(true);
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {color: '#44aa22'}}],
    });
    expect(room.canRedo).toBe(false);
    await expect(room.redo()).rejects.toThrow('no scene edit to redo');
  });

  it.each(['one', 'two', 'three'])(
    'restores scene order when undoing removal of %s',
    async (id) => {
      const room = createRoom();
      await room.applyLayout({
        title: 'Studio',
        objects: ['one', 'two', 'three'].map((id) => object({id})),
      });
      const before = room.layout;
      await room.applyPlan({title: 'Studio', edits: [{op: 'remove', id}]});
      const removed = room.layout;
      await expect(room.undo()).resolves.toEqual(before);
      await expect(room.redo()).resolves.toEqual(removed);
      await expect(room.undo()).resolves.toEqual(before);
    }
  );

  it('restores an explicitly reordered layout without replacing its owners', async () => {
    const room = createRoom();
    await room.applyLayout({
      title: 'Studio',
      objects: [object({id: 'one'}), object({id: 'two'})],
    });
    const before = room.layout;
    const owner = room.getObject('one');
    const reversed = {...before, objects: [...before.objects].reverse()};
    await expect(room.applyLayout(reversed)).resolves.toEqual(reversed);
    expect(room.getObject('one')).toBe(owner);
    await expect(room.undo()).resolves.toEqual(before);
    await expect(room.redo()).resolves.toEqual(reversed);
  });

  it.each([0.3, 0.4, 1.15, -0.7])(
    'preserves redo through a no-op on an object rotated by %s radians',
    async (rotation) => {
      const room = createRoom();
      await room.applyLayout(layout(object({rotation})));
      await room.applyPlan({
        title: 'Studio',
        edits: [{op: 'update', id: 'one', changes: {color: '#2244aa'}}],
      });
      await room.undo();
      const before = room.layout;
      await room.applyPlan({title: 'Studio', edits: []});
      expect(room.layout).toEqual(before);
      expect(room.canRedo).toBe(true);
      await room.redo();
      expect(room.layout.objects[0].color).toBe('#2244aa');
    }
  );

  it('does not overwrite post-undo movement or retain an abandoned redo branch', async () => {
    const room = createRoom();
    await prepareColorRedo(room);
    room.select('one');
    room.position.set(0, 1, -2);
    expect(room.canRedo).toBe(true);
    room.getObject('one')!.position.x = 3;
    const moved = room.layout;
    expect(room.canRedo).toBe(false);
    await expect(room.redo()).rejects.toThrow('changed since undo');
    expect(room.layout).toEqual(moved);
    await room.undo();
    expect(room.layout.objects).toHaveLength(0);
    await room.redo();
    expect(room.layout).toEqual(moved);
    expect(room.canRedo).toBe(false);
  });

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

  it('rejects movement during asynchronous redo without applying the stored edit', async () => {
    const create = vi.fn<SceneAsset['create']>(asset().create);
    const room = createRoom([asset({create})]);
    await prepareColorRedo(room);
    const owner = room.getObject('one')!;
    const content = owner.children[0];
    const pending = deferred<THREE.Object3D>();
    create.mockReturnValueOnce(pending.promise);
    const redo = room.redo();
    owner.position.x = 2;
    pending.resolve(await asset().create('#2244aa'));
    await expect(redo).rejects.toThrow('moved while assets were loading');
    expect(room.getObject('one')).toBe(owner);
    expect(owner.children[0]).toBe(content);
    expect(room.layout.objects[0]).toEqual(object({position: [2, 0, 0]}));
    expect(room.canRedo).toBe(false);
    expect(room.canUndo).toBe(true);
  });

  it('consumes undo and redo steps even when the pose already matches their snapshot', async () => {
    const room = createRoom();
    await room.applyLayout(layout(object()));
    await room.applyPlan({
      title: 'Studio',
      edits: [{op: 'update', id: 'one', changes: {position: [1, 0, 0]}}],
    });
    room.getObject('one')!.position.x = 0;
    await room.undo();
    expect(room.canRedo).toBe(true);
    await room.redo();
    expect(room.canRedo).toBe(false);
    await room.undo();
    await room.undo();
    expect(room.layout.objects).toHaveLength(0);
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

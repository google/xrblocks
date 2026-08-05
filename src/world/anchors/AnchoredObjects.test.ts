import {describe, it, expect, vi, afterEach} from 'vitest';
import * as THREE from 'three';

import {WorldOptions} from '../WorldOptions';

import {AnchorManager} from './AnchorManager';
import {AnchoredObjects} from './AnchoredObjects';
import {AnchorStore} from './AnchorStore';
import {AnchorRecord} from './AnchorTypes';

function memoryStore(seed: AnchorRecord[] = []): AnchorStore {
  const records = [...seed];
  return {
    load: () => [...records],
    save: (r) => {
      const i = records.findIndex((x) => x.uuid === r.uuid);
      if (i >= 0) records[i] = r;
      else records.push(r);
      return true;
    },
    remove: (uuid) => {
      const i = records.findIndex((x) => x.uuid === uuid);
      if (i >= 0) records.splice(i, 1);
    },
    clear: () => void records.splice(0, records.length),
  };
}

/**
 * Builds a manager on the simulator fallback, so the helper can be exercised
 * without a headset.
 * @param store - Backing store to share between managers.
 * @returns A ready manager.
 */
function makeManager(store: AnchorStore) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  options.anchors.simulatorFallback = true;
  const manager = new AnchorManager(store);
  manager.init({options});
  manager.update(0, undefined);
  return manager;
}

function makeObject(x: number, y: number, z: number) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  object.position.set(x, y, z);
  return object;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnchoredObjects', () => {
  it('anchors an object at its current world position', async () => {
    const scene = new THREE.Group();
    const anchored = new AnchoredObjects(makeManager(memoryStore()), scene);
    const object = makeObject(1, 2, 3);
    scene.add(object);
    const tracked = await anchored.anchor(object, 'lamp');
    expect(tracked).not.toBeNull();
    expect(tracked!.label).toBe('lamp');
  });

  it('adds the object to the scene when it is not already there', async () => {
    const scene = new THREE.Group();
    const anchored = new AnchoredObjects(makeManager(memoryStore()), scene);
    const object = makeObject(0, 1, 0);
    await anchored.anchor(object, 'lamp');
    expect(scene.children).toContain(object);
  });

  it('saves the anchor so it survives a reload', async () => {
    const store = memoryStore();
    const anchored = new AnchoredObjects(makeManager(store), new THREE.Group());
    await anchored.anchor(makeObject(1, 2, 3), 'lamp');
    expect(store.load()).toHaveLength(1);
    expect(store.load()[0].label).toBe('lamp');
  });

  it('rebuilds saved objects through the supplied factory', async () => {
    const store = memoryStore();
    const first = new AnchoredObjects(makeManager(store), new THREE.Group());
    await first.anchor(makeObject(1, 2, 3), 'lamp');

    const scene = new THREE.Group();
    const second = new AnchoredObjects(makeManager(store), scene);
    const factory = vi.fn((label: string) => makeObject(0, 0, 0));
    const restored = await second.restore(factory);

    expect(restored).toBe(1);
    expect(factory).toHaveBeenCalledWith('lamp', expect.anything());
    expect(scene.children).toHaveLength(1);
  });

  it('places restored objects at their saved pose', async () => {
    const store = memoryStore();
    const first = new AnchoredObjects(makeManager(store), new THREE.Group());
    await first.anchor(makeObject(1.5, 2.5, -3.5), 'lamp');

    const scene = new THREE.Group();
    const second = new AnchoredObjects(makeManager(store), scene);
    await second.restore(() => makeObject(0, 0, 0));
    second.update();

    const restored = scene.children[0] as THREE.Object3D;
    expect(restored.position.x).toBeCloseTo(1.5);
    expect(restored.position.y).toBeCloseTo(2.5);
    expect(restored.position.z).toBeCloseTo(-3.5);
  });

  it('skips records the factory declines to build', async () => {
    const store = memoryStore();
    const first = new AnchoredObjects(makeManager(store), new THREE.Group());
    await first.anchor(makeObject(1, 1, 1), 'lamp');

    const scene = new THREE.Group();
    const second = new AnchoredObjects(makeManager(store), scene);
    const restored = await second.restore(() => null);
    expect(restored).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('removing an object detaches it from the scene and storage', async () => {
    const store = memoryStore();
    const scene = new THREE.Group();
    const anchored = new AnchoredObjects(makeManager(store), scene);
    const object = makeObject(1, 1, 1);
    const tracked = await anchored.anchor(object, 'lamp');
    anchored.remove(tracked!.id);
    expect(scene.children).not.toContain(object);
    expect(store.load()).toHaveLength(0);
  });

  it('update leaves objects alone when no pose is available', async () => {
    const manager = makeManager(memoryStore());
    const scene = new THREE.Group();
    const anchored = new AnchoredObjects(manager, scene);
    const object = makeObject(4, 4, 4);
    await anchored.anchor(object, 'lamp');
    vi.spyOn(manager, 'getPose').mockReturnValue(null);
    anchored.update();
    expect(object.position.x).toBeCloseTo(4);
  });

  it('returns null and adds nothing when the anchor cannot be created', async () => {
    const options = new WorldOptions();
    options.anchors.enable();
    const manager = new AnchorManager(memoryStore());
    manager.init({options});
    manager.update(0, undefined);
    const scene = new THREE.Group();
    const anchored = new AnchoredObjects(manager, scene);
    const object = makeObject(1, 1, 1);
    await expect(anchored.anchor(object, 'lamp')).resolves.toBeNull();
    expect(scene.children).not.toContain(object);
  });
});

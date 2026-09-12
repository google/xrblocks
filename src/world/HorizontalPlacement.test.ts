import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {WaitFrame} from '../core/components/WaitFrame';

import {placeOnHorizontalSurface} from './HorizontalPlacement';
import {DetectedPlane} from './planes/DetectedPlane';
import {PlaneDetector} from './planes/PlaneDetector';

function createPlacement() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.y = 1.6;
  const planes = new PlaneDetector();
  const plane = new DetectedPlane(null, new THREE.MeshBasicMaterial(), {
    type: 'horizontal',
    label: 'table',
    area: 9,
    position: new THREE.Vector3(0, 0.7, -1.5),
    quaternion: new THREE.Quaternion(),
    polygon: [
      new THREE.Vector2(-1.5, -1.5),
      new THREE.Vector2(1.5, -1.5),
      new THREE.Vector2(1.5, 1.5),
      new THREE.Vector2(-1.5, 1.5),
    ],
  });
  planes.add(plane);
  vi.spyOn(planes, 'get').mockReturnValue([plane]);

  const object = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  object.position.set(0, 2, 1);
  const distant = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  distant.position.x = 10;
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8));
  blocker.position.set(0, 1, -1.5);
  scene.add(camera, planes, object, distant, blocker);
  scene.updateMatrixWorld(true);

  let elapsed = 0;
  const timer = new THREE.Timer();
  vi.spyOn(timer, 'getElapsed').mockImplementation(() => elapsed);
  const waitFrame = new WaitFrame();
  const wait = vi.spyOn(waitFrame, 'waitFrame').mockImplementation(async () => {
    elapsed = 1;
  });

  return {
    scene,
    object,
    distant,
    blocker,
    wait,
    place: () =>
      placeOnHorizontalSurface(
        object,
        camera,
        scene,
        planes,
        undefined,
        waitFrame,
        timer,
        {milliseconds: 500},
        9
      ),
  };
}

/**
 * Records which objects get an entry in the obstacle bounds cache, so tests can
 * assert both that caching happens and that it is skipped where it must be.
 */
function recordCachedBounds() {
  const cached: THREE.Object3D[] = [];
  const original = Map.prototype.set;
  vi.spyOn(Map.prototype, 'set').mockImplementation(function (
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown
  ) {
    if (value instanceof THREE.Box3) cached.push(key as THREE.Object3D);
    return original.call(this, key, value);
  });
  return cached;
}

describe('horizontal placement obstacle bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes fixed bounds at most twice across rejected candidates', async () => {
    const {object, distant, blocker, place} = createPlacement();
    const originalPosition = object.position.clone();
    const originalQuaternion = object.quaternion.clone();
    const bounds = vi.spyOn(THREE.Box3.prototype, 'setFromObject');

    await expect(place()).resolves.toBe(false);

    for (const obstacle of [distant, blocker]) {
      expect(
        bounds.mock.calls.filter(([target]) => target === obstacle).length
      ).toBe(2);
    }
    expect(object.position).toEqual(originalPosition);
    expect(object.quaternion.equals(originalQuaternion)).toBe(true);
  });

  it('refreshes obstacle bounds when retrying after the next frame', async () => {
    const {object, blocker, wait, place} = createPlacement();
    wait.mockImplementationOnce(async () => {
      blocker.position.x = 10;
    });
    const bounds = vi.spyOn(THREE.Box3.prototype, 'setFromObject');

    await expect(place()).resolves.toBe(true);

    expect(wait).toHaveBeenCalledOnce();
    expect(
      bounds.mock.calls.filter(([target]) => target === blocker).length
    ).toBe(3);
    expect(
      new THREE.Box3()
        .setFromObject(object)
        .intersectsBox(new THREE.Box3().setFromObject(blocker))
    ).toBe(false);
  });

  it('never caches ancestor bounds that include the moving object', async () => {
    const {scene, object, distant, blocker, place} = createPlacement();
    scene.remove(blocker);
    const ancestor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    ancestor.add(object);
    scene.add(ancestor);
    const cached = recordCachedBounds();

    // Caching the ancestor would let a later candidate pass against bounds
    // captured while the object sat somewhere else.
    await expect(place()).resolves.toBe(false);

    expect(cached).toContain(distant);
    expect(cached).not.toContain(ancestor);
  });

  it('reuses one scratch box when the first candidate succeeds', async () => {
    const {blocker, distant, place} = createPlacement();
    blocker.position.x = 10;
    const receivers: THREE.Box3[] = [];
    const original = THREE.Box3.prototype.setFromObject;
    vi.spyOn(THREE.Box3.prototype, 'setFromObject').mockImplementation(
      function (this: THREE.Box3, target: THREE.Object3D, precise?: boolean) {
        if (target === blocker || target === distant) receivers.push(this);
        return original.call(this, target, precise);
      }
    );
    const cached = recordCachedBounds();

    await expect(place()).resolves.toBe(true);

    expect(receivers).toHaveLength(2);
    expect(receivers[0]).toBe(receivers[1]);
    expect(cached).toHaveLength(0);
  });
});

import * as THREE from 'three';
import {expect, it} from 'vitest';
import {WaitFrame} from '../core/components/WaitFrame';
import {PlaneDetector} from './planes/PlaneDetector';
import {placeOnHorizontalSurface} from './HorizontalPlacement';

it('retries changing obstacles and preserves the pose when placement times out', async () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  camera.position.y = 1.6;
  const planes = new PlaneDetector();
  planes.setSimulatorPlanes([
    {
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
    },
  ]);
  const object = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  object.position.set(0, 2, 1);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8));
  blocker.position.set(0, 1, -1.5);
  scene.add(camera, planes, object, blocker);
  scene.updateMatrixWorld(true);
  const timer = new THREE.Timer(),
    frames = new WaitFrame();
  timer.update(0);
  const place = () =>
    placeOnHorizontalSurface(
      object,
      camera,
      scene,
      planes,
      undefined,
      frames,
      timer,
      {milliseconds: 500},
      9
    );
  let ancestor: THREE.Mesh | undefined;
  try {
    const original = object.position.clone();
    const failed = place();
    timer.update(600);
    frames.onFrame();
    expect(await failed).toBe(false);
    expect(object.position).toEqual(original);
    const retry = place();
    blocker.position.x = 10;
    blocker.updateMatrixWorld(true);
    frames.onFrame();
    expect(await retry).toBe(true);
    expect(
      new THREE.Box3()
        .setFromObject(object)
        .intersectsBox(new THREE.Box3().setFromObject(blocker))
    ).toBe(false);
    expect(object.position.y).toBeCloseTo(0.8);
    ancestor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    ancestor.add(object);
    scene.add(ancestor);
    scene.updateMatrixWorld(true);
    const beforeAncestorAttempt = object.position.clone();
    const blockedByParent = place();
    timer.update(1200);
    frames.onFrame();
    expect(await blockedByParent).toBe(false);
    expect(object.position).toEqual(beforeAncestorAttempt);
  } finally {
    ancestor?.geometry.dispose();
    planes.dispose();
    object.geometry.dispose();
    blocker.geometry.dispose();
    timer.dispose();
  }
});

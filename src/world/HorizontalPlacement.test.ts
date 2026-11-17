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

it('places a scaled multi-mesh and custom-bounds hierarchy flush on the surface without obstacle overlap', async () => {
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

  const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8));
  blocker.position.set(0, 0.7, -1.5);

  const group = new THREE.Group();
  group.scale.set(1.2, 0.8, 1.5);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  base.position.set(0, -0.25, 0);
  const customBounded = Object.assign(new THREE.Object3D(), {
    boundingBox: new THREE.Box3(
      new THREE.Vector3(-0.15, -0.05, -0.05),
      new THREE.Vector3(0.15, 0.3, 0.05)
    ),
  });
  group.add(base, customBounded);
  scene.add(camera, planes, blocker, group);
  scene.updateMatrixWorld(true);

  const timer = new THREE.Timer(),
    frames = new WaitFrame();
  timer.update(0);
  try {
    expect(
      await placeOnHorizontalSurface(
        group,
        camera,
        scene,
        planes,
        undefined,
        frames,
        timer,
        {milliseconds: 500},
        9
      )
    ).toBe(true);

    const placedBounds = new THREE.Box3().setFromObject(group);
    const blockerBounds = new THREE.Box3().setFromObject(blocker);
    // Base mesh min local y is -0.35; scaled by group.scale.y (0.8) -> -0.28 below group.position.y
    expect(placedBounds.min.y).toBeCloseTo(0.7, 5);
    expect(placedBounds.intersectsBox(blockerBounds)).toBe(false);
  } finally {
    planes.dispose();
    base.geometry.dispose();
    blocker.geometry.dispose();
    timer.dispose();
  }
});

it('throttles unchanged retries until the retry interval elapses unless an XRPlane updates', async () => {
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
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8));
  blocker.position.set(0, 1, -1.5);
  scene.add(camera, planes, object, blocker);
  scene.updateMatrixWorld(true);

  const timer = new THREE.Timer(),
    frames = new WaitFrame();
  timer.update(0);
  try {
    let resolved = false;
    const throttled = placeOnHorizontalSurface(
      object,
      camera,
      scene,
      planes,
      undefined,
      frames,
      timer,
      {milliseconds: 1000},
      9
    ).then((ok) => {
      resolved = true;
      return ok;
    });

    blocker.position.x = 10;
    blocker.updateMatrixWorld(true);

    for (const ms of [50, 100, 150, 200]) {
      timer.update(ms);
      frames.onFrame();
      await Promise.resolve();
      await Promise.resolve();
      expect(resolved).toBe(false);
    }

    timer.update(250);
    frames.onFrame();
    expect(await throttled).toBe(true);

    // Block again and verify an XRPlane lastChangedTime update wakes on the very next 14ms frame.
    blocker.position.x = 0;
    blocker.updateMatrixWorld(true);
    const detectedPlane = planes.get()[0];
    const xrPlane = {
      lastChangedTime: 100,
      polygon: [
        {x: -1.5, y: 0, z: -1.5},
        {x: 1.5, y: 0, z: -1.5},
        {x: 1.5, y: 0, z: 1.5},
        {x: -1.5, y: 0, z: 1.5},
      ],
    };
    detectedPlane.xrPlane = xrPlane as unknown as XRPlane;
    detectedPlane.simulatorPlane = undefined;

    const planeWake = placeOnHorizontalSurface(
      object,
      camera,
      scene,
      planes,
      undefined,
      frames,
      timer,
      {milliseconds: 1000},
      9
    );
    blocker.position.x = 10;
    blocker.updateMatrixWorld(true);
    xrPlane.lastChangedTime = 114;
    timer.update(264);
    frames.onFrame();
    expect(await planeWake).toBe(true);
  } finally {
    planes.dispose();
    object.geometry.dispose();
    blocker.geometry.dispose();
    timer.dispose();
  }
});

import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {FaceCamera} from './FaceCamera';
import {FollowHead} from './FollowHead';
import {FollowObject} from './FollowObject';
import {VisibilityTransition} from './VisibilityTransition';
import {
  resumeTransformScripts,
  suspendTransformScripts,
} from './TransformScript';

const timer = {getDelta: () => 1} as THREE.Timer;

function expectVector(actual: THREE.Vector3, expected: THREE.Vector3) {
  expect(actual.distanceTo(expected)).toBeCloseTo(0);
}

function expectQuaternion(
  actual: THREE.Quaternion,
  expected: THREE.Quaternion
) {
  expect(Math.abs(actual.dot(expected))).toBeCloseTo(1);
}

function createTransformedObjects() {
  const scene = new THREE.Scene();
  const targetParent = new THREE.Object3D();
  targetParent.position.set(3, -1, 2);
  targetParent.rotation.set(0.2, 0.5, -0.1);
  targetParent.scale.setScalar(1.5);
  const target = new THREE.Object3D();
  target.position.set(1, 2, -3);
  target.rotation.set(-0.3, 0.1, 0.4);
  targetParent.add(target);

  const objectParent = new THREE.Object3D();
  objectParent.position.set(-4, 2, 1);
  objectParent.rotation.set(-0.2, -0.4, 0.3);
  objectParent.scale.setScalar(0.75);
  const object = new THREE.Object3D();
  objectParent.add(object);

  scene.add(targetParent, objectParent);
  return {scene, target, object};
}

describe('placement scripts', () => {
  it('follows world position under transformed parents', () => {
    const {target, object} = createTransformedObjects();
    const offset = new THREE.Vector3(0.5, -0.25, 1);
    const follow = new FollowObject({target, positionOffset: offset});
    object.add(follow);

    const expected = target.getWorldPosition(new THREE.Vector3()).add(offset);
    follow.update();

    expectVector(object.getWorldPosition(new THREE.Vector3()), expected);
  });

  it('follows world rotation under transformed parents', () => {
    const {target, object} = createTransformedObjects();
    const offset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, -0.2, 0.3)
    );
    const follow = new FollowObject({
      target,
      mode: 'rotation',
      rotationOffset: offset,
    });
    object.add(follow);

    const expected = target
      .getWorldQuaternion(new THREE.Quaternion())
      .multiply(offset);
    follow.update();

    expectQuaternion(
      object.getWorldQuaternion(new THREE.Quaternion()),
      expected
    );
  });

  it('follows a world pose under transformed parents', () => {
    const {target, object} = createTransformedObjects();
    const positionOffset = new THREE.Vector3(-1, 0.5, 0.25);
    const rotationOffset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.2, 0.15, 0.1)
    );
    const follow = new FollowObject({
      target,
      mode: 'pose',
      positionOffset,
      rotationOffset,
    });
    object.add(follow);

    const expectedPosition = target
      .getWorldPosition(new THREE.Vector3())
      .add(positionOffset);
    const expectedRotation = target
      .getWorldQuaternion(new THREE.Quaternion())
      .multiply(rotationOffset);
    follow.update();

    expectVector(
      object.getWorldPosition(new THREE.Vector3()),
      expectedPosition
    );
    expectQuaternion(
      object.getWorldQuaternion(new THREE.Quaternion()),
      expectedRotation
    );
  });

  it('faces the camera under transformed parents', () => {
    const scene = new THREE.Scene();
    const cameraParent = new THREE.Object3D();
    cameraParent.position.set(4, 1, -2);
    cameraParent.rotation.set(0.1, 0.5, 0);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 5);
    cameraParent.add(camera);

    const objectParent = new THREE.Object3D();
    objectParent.position.set(-2, 1, 3);
    objectParent.rotation.set(-0.3, 0.2, 0.1);
    const object = new THREE.Object3D();
    object.position.set(1, -0.5, 2);
    objectParent.add(object);
    scene.add(cameraParent, objectParent);

    const faceCamera = new FaceCamera({mode: 'spherical', smoothing: 1});
    object.add(faceCamera);
    faceCamera.init({camera, timer});

    const expected = new THREE.Object3D();
    expected.position.copy(object.getWorldPosition(new THREE.Vector3()));
    expected.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    faceCamera.update();

    expectQuaternion(
      object.getWorldQuaternion(new THREE.Quaternion()),
      expected.quaternion
    );
  });

  it('rebases a head offset in world space after manipulation', () => {
    const scene = new THREE.Scene();
    const cameraParent = new THREE.Object3D();
    cameraParent.position.set(2, 1, -3);
    cameraParent.rotation.set(0.1, 0.4, -0.2);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0.5, 1, 2);
    cameraParent.add(camera);

    const objectParent = new THREE.Object3D();
    objectParent.position.set(-3, 0.5, 1);
    objectParent.rotation.set(-0.2, 0.25, 0.15);
    objectParent.scale.setScalar(1.25);
    const object = new THREE.Object3D();
    objectParent.add(object);
    scene.add(cameraParent, objectParent);

    const follow = new FollowHead({
      offset: new THREE.Vector3(0, 0, -1),
      smoothing: 1,
    });
    object.add(follow);
    follow.init({camera, timer});
    follow.update();

    suspendTransformScripts(object);
    const manipulatedPosition = new THREE.Vector3(5, 2, -4);
    object.position.copy(manipulatedPosition);
    objectParent.worldToLocal(object.position);
    cameraParent.position.add(new THREE.Vector3(1, 0, 2));
    follow.update();
    expectVector(
      object.getWorldPosition(new THREE.Vector3()),
      manipulatedPosition
    );

    resumeTransformScripts(object);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const cameraRotation = camera.getWorldQuaternion(new THREE.Quaternion());
    const rebasedOffset = manipulatedPosition
      .clone()
      .sub(cameraPosition)
      .applyQuaternion(cameraRotation.clone().invert());

    cameraParent.position.add(new THREE.Vector3(-2, 1, 0.5));
    cameraParent.rotateY(0.3);
    const expected = rebasedOffset
      .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
      .add(camera.getWorldPosition(new THREE.Vector3()));
    follow.update();

    expectVector(object.getWorldPosition(new THREE.Vector3()), expected);
  });

  it('rebases a followed object after manipulation', () => {
    const target = new THREE.Object3D();
    const object = new THREE.Object3D();
    const follow = new FollowObject({target});
    object.add(follow);

    target.position.x = 1;
    follow.update();
    expect(object.position.x).toBe(1);

    suspendTransformScripts(object);
    object.position.x = 5;
    target.position.x = 2;
    follow.update();
    expect(object.position.x).toBe(5);

    resumeTransformScripts(object);
    target.position.x = 3;
    follow.update();
    expect(object.position.x).toBe(6);
  });

  it('shows and hides its parent without replacing visibility assignment', () => {
    const object = new THREE.Object3D();
    object.scale.setScalar(2);
    const transition = new VisibilityTransition({duration: 0.1});
    object.add(transition);
    transition.init({timer: {getDelta: () => 0.1} as THREE.Timer});

    transition.hide();
    transition.update();
    expect(object.visible).toBe(false);
    expect(object.scale.x).toBe(0);

    transition.show();
    transition.update();
    expect(object.visible).toBe(true);
    expect(object.scale.x).toBe(2);
  });
});

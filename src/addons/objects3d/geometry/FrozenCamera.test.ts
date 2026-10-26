import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {buildFrozenCamera} from './FrozenCamera';

/** Build reference matrices from a plain PerspectiveCamera. */
function referenceCamera(
  fov: number,
  aspect: number,
  position: THREE.Vector3,
  lookAt: THREE.Vector3
): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
  cam.position.copy(position);
  cam.lookAt(lookAt);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe('buildFrozenCamera', () => {
  it('derives fov and aspect from the projection matrix', () => {
    const ref = referenceCamera(
      48,
      16 / 9,
      new THREE.Vector3(0, 1.6, 0),
      new THREE.Vector3(0, 1.6, -1)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
    });
    expect(frozen.fov).toBeCloseTo(48, 5);
    expect(frozen.aspect).toBeCloseTo(16 / 9, 5);
  });

  it('defaults snapAspect to the projection aspect (identity uvToNdc)', () => {
    const ref = referenceCamera(
      60,
      1.5,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
    });
    expect(frozen.userData.snapAspect).toBeCloseTo(1.5, 5);
  });

  it('keeps an explicit snapAspect override', () => {
    const ref = referenceCamera(
      60,
      1.5,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
      snapAspect: 1.0,
    });
    expect(frozen.userData.snapAspect).toBeCloseTo(1.0, 5);
  });

  it('decomposes the pose from worldFromView', () => {
    const ref = referenceCamera(
      70,
      1,
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(0, 2, 0)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
    });
    expect(frozen.position.distanceTo(ref.position)).toBeLessThan(1e-6);
    expect(Math.abs(frozen.quaternion.dot(ref.quaternion))).toBeCloseTo(1, 6);
  });

  it('raycasts identically to the reference camera', () => {
    const ref = referenceCamera(
      50,
      1.25,
      new THREE.Vector3(0.5, 1.2, 2),
      new THREE.Vector3(0, 1, -2)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
      viewFromClip: ref.projectionMatrixInverse.clone(),
    });
    const refRay = new THREE.Raycaster();
    const frozenRay = new THREE.Raycaster();
    for (const [x, y] of [
      [0, 0],
      [0.7, -0.3],
      [-1, 1],
    ]) {
      refRay.setFromCamera(new THREE.Vector2(x, y), ref);
      frozenRay.setFromCamera(new THREE.Vector2(x, y), frozen);
      expect(frozenRay.ray.origin.distanceTo(refRay.ray.origin)).toBeLessThan(
        1e-6
      );
      expect(
        frozenRay.ray.direction.distanceTo(refRay.ray.direction)
      ).toBeLessThan(1e-6);
    }
  });

  it('a centre ray from an off-axis pose hits the expected world point', () => {
    // Camera at (0, 1, 5) looking straight down -Z: the NDC-centre ray must
    // hit a plane at z = 0 exactly at (0, 1, 0).
    const ref = referenceCamera(
      45,
      1.7,
      new THREE.Vector3(0, 1, 5),
      new THREE.Vector3(0, 1, 0)
    );
    const frozen = buildFrozenCamera({
      worldFromView: ref.matrixWorld.clone(),
      clipFromView: ref.projectionMatrix.clone(),
    });
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), frozen);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(plane, hit);
    expect(hit.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
  });
});

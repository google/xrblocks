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

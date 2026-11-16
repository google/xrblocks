import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {PoseRing} from './PoseRing';

function translation(x: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, 0, 0);
}

describe('PoseRing', () => {
  it('returns the nearest pose by timestamp', () => {
    const ring = new PoseRing(4);
    ring.push(100, translation(1));
    ring.push(200, translation(2));
    ring.push(300, translation(3));
    const m = ring.lookup(190);
    expect(m).not.toBeNull();
    expect(new THREE.Vector3().setFromMatrixPosition(m!).x).toBe(2);
  });

  it('estimates linear and angular speed around a timestamp', () => {
    const ring = new PoseRing(8);
    // 0.1 m and 0.1 rad about Y per 100 ms → 1 m/s and 1 rad/s.
    for (let i = 0; i < 5; ++i) {
      const pose = new THREE.Matrix4()
        .makeRotationY(0.1 * i)
        .setPosition(0.1 * i, 0, 0);
      ring.push(100 * i, pose);
    }
    const velocity = ring.velocityAround(200, 150)!;
    expect(velocity.linearMetersPerSec).toBeCloseTo(1, 5);
    expect(velocity.angularRadPerSec).toBeCloseTo(1, 5);
  });
});

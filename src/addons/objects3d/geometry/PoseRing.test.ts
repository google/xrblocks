import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {PoseRing} from './PoseRing';

function translation(x: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, 0, 0);
}

describe('PoseRing', () => {
  it('returns null when empty', () => {
    const ring = new PoseRing(4);
    expect(ring.lookup(100)).toBeNull();
  });

  it('returns the nearest pose by timestamp', () => {
    const ring = new PoseRing(4);
    ring.push(100, translation(1));
    ring.push(200, translation(2));
    ring.push(300, translation(3));
    const m = ring.lookup(190);
    expect(m).not.toBeNull();
    expect(new THREE.Vector3().setFromMatrixPosition(m!).x).toBe(2);
  });

  it('rejects samples older than maxAgeMs', () => {
    const ring = new PoseRing(4);
    ring.push(100, translation(1));
    expect(ring.lookup(700, 500)).toBeNull();
    expect(ring.lookup(600, 500)).not.toBeNull();
  });

  it('overwrites oldest entries once capacity is exceeded', () => {
    const ring = new PoseRing(2);
    ring.push(100, translation(1));
    ring.push(200, translation(2));
    ring.push(300, translation(3));
    expect(ring.size).toBe(2);
    // t=100 was evicted; nearest to 100 within 150ms is t=200.
    const m = ring.lookup(100, 150);
    expect(new THREE.Vector3().setFromMatrixPosition(m!).x).toBe(2);
  });

  it('copies the pushed matrix rather than retaining the reference', () => {
    const ring = new PoseRing(2);
    const m = translation(5);
    ring.push(100, m);
    m.makeTranslation(9, 0, 0);
    const stored = ring.lookup(100)!;
    expect(new THREE.Vector3().setFromMatrixPosition(stored).x).toBe(5);
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

  it('returns null velocity without two separated samples', () => {
    const ring = new PoseRing(4);
    expect(ring.velocityAround(100)).toBeNull();
    ring.push(100, translation(1));
    expect(ring.velocityAround(100)).toBeNull();
  });

  it('clear() empties the ring', () => {
    const ring = new PoseRing(4);
    ring.push(100, translation(1));
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.lookup(100)).toBeNull();
  });
});

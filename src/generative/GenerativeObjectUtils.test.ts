import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {
  computeBillboardScale,
  poseInFrontOfCamera,
} from './GenerativeObjectUtils';

describe('computeBillboardScale', () => {
  it('keeps a landscape image within maxSize on its longest side', () => {
    const size = computeBillboardScale(200, 100, 0.6);
    expect(size.x).toBeCloseTo(0.6);
    expect(size.y).toBeCloseTo(0.3);
  });

  it('keeps a portrait image within maxSize on its longest side', () => {
    const size = computeBillboardScale(100, 200, 0.6);
    expect(size.x).toBeCloseTo(0.3);
    expect(size.y).toBeCloseTo(0.6);
  });

  it('returns a square for a square image', () => {
    const size = computeBillboardScale(512, 512, 0.6);
    expect(size.x).toBeCloseTo(0.6);
    expect(size.y).toBeCloseTo(0.6);
  });

  it('falls back to a square for degenerate dimensions', () => {
    const size = computeBillboardScale(0, 0, 0.6);
    expect(size.x).toBeCloseTo(0.6);
    expect(size.y).toBeCloseTo(0.6);
  });

  it('writes into the provided target vector', () => {
    const target = new THREE.Vector2();
    const result = computeBillboardScale(200, 100, 0.6, target);
    expect(result).toBe(target);
  });
});

describe('poseInFrontOfCamera', () => {
  it('places the object distance meters along the camera forward axis', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const {position} = poseInFrontOfCamera(camera, 1.0);
    // Default camera looks down -Z.
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(-1);
  });

  it('offsets from the camera world position', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 1, 3);
    camera.updateMatrixWorld(true);
    const {position} = poseInFrontOfCamera(camera, 2.0);
    expect(position.x).toBeCloseTo(2);
    expect(position.y).toBeCloseTo(1);
    expect(position.z).toBeCloseTo(1); // 3 + (-1 * 2)
  });

  it('faces the user (+Z toward the camera)', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const {position, quaternion} = poseInFrontOfCamera(camera, 1.0);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    // The plane normal should point from the object back toward the camera.
    const toCamera = camera.position.clone().sub(position).normalize();
    expect(normal.dot(toCamera)).toBeGreaterThan(0.99);
  });
});

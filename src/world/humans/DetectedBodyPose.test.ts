import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  DetectedBodyPose,
  PoseJointName,
  PoseLandmark,
} from './DetectedBodyPose';

/**
 * Builds a landmark list where every entry is projected, so tests only vary
 * the visibility the pose model reported.
 */
function makeLandmarks(
  overrides: Record<number, Partial<PoseLandmark>> = {}
): PoseLandmark[] {
  return Array.from({length: 33}, (_, i) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
    worldPosition: new THREE.Vector3(i, i, i),
    ...overrides[i],
  }));
}

function makePose(overrides?: Record<number, Partial<PoseLandmark>>) {
  return new DetectedBodyPose(0, makeLandmarks(overrides), new THREE.Box2());
}

describe('DetectedBodyPose.getJointPosition', () => {
  it('returns every joint when no threshold is given', () => {
    const pose = makePose({27: {visibility: 0.01}});

    expect(pose.getJointPosition(PoseJointName.LeftAnkle)).not.toBeNull();
  });

  it('drops joints the model is not confident about', () => {
    const pose = makePose({27: {visibility: 0.1}});

    expect(
      pose.getJointPosition(PoseJointName.LeftAnkle, {minVisibility: 0.5})
    ).toBeNull();
  });

  it('keeps confident joints when a threshold is given', () => {
    const pose = makePose({11: {visibility: 0.99}});

    expect(
      pose.getJointPosition(PoseJointName.LeftShoulder, {minVisibility: 0.5})
    ).not.toBeNull();
  });

  it('treats a missing visibility as not confident', () => {
    const pose = makePose({27: {visibility: undefined}});

    expect(
      pose.getJointPosition(PoseJointName.LeftAnkle, {minVisibility: 0.5})
    ).toBeNull();
  });

  it('applies the threshold to the parts of a composite joint', () => {
    // Hips averages landmarks 23 and 24. Only one is trustworthy, so the
    // result must come from that one alone rather than the midpoint.
    const pose = makePose({
      23: {worldPosition: new THREE.Vector3(1, 0, 0), visibility: 0.9},
      24: {worldPosition: new THREE.Vector3(3, 0, 0), visibility: 0.1},
    });

    const hips = pose.getJointPosition(PoseJointName.Hips, {
      minVisibility: 0.5,
    });

    expect(hips!.x).toBeCloseTo(1);
  });

  it('drops a composite joint when none of its parts are confident', () => {
    const pose = makePose({
      23: {visibility: 0.1},
      24: {visibility: 0.1},
    });

    expect(
      pose.getJointPosition(PoseJointName.Hips, {minVisibility: 0.5})
    ).toBeNull();
  });

  it('forwards the threshold through nested composite joints', () => {
    // Spine is built from Hips and Chest, which are themselves composites.
    const pose = makePose({
      11: {visibility: 0.1},
      12: {visibility: 0.1},
      23: {visibility: 0.1},
      24: {visibility: 0.1},
    });

    expect(
      pose.getJointPosition(PoseJointName.Spine, {minVisibility: 0.5})
    ).toBeNull();
  });

  it('still positions the object at the hips regardless of visibility', () => {
    const pose = makePose({
      23: {worldPosition: new THREE.Vector3(2, 0, 0), visibility: 0.01},
      24: {worldPosition: new THREE.Vector3(4, 0, 0), visibility: 0.01},
    });

    expect(pose.position.x).toBeCloseTo(3);
  });
});

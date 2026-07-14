import {describe, it, expect, vi} from 'vitest';

// Importing from 'xrblocks' boots the Core singleton, which constructs a
// THREE.AudioListener (and thus an AudioContext) jsdom can't provide. Stub it
// before the barrel import, matching src/core/Core.test.ts.
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {
  Handedness,
  SimulatorHandPose,
  type SimulatorHandPoseJoints,
} from 'xrblocks';

import {
  AgentHand,
  applyAgentHandAppearance,
  lerpBonesToJoints,
} from './AgentHand';

describe('lerpBonesToJoints', () => {
  it('moves a bone fully to the target when lerp is 1', () => {
    const bone = new THREE.Object3D();
    const joints: SimulatorHandPoseJoints = [{t: [1, 2, 3], r: [0, 0, 0, 1]}];
    lerpBonesToJoints([bone], joints, 1);
    expect(bone.position.x).toBeCloseTo(1);
    expect(bone.position.y).toBeCloseTo(2);
    expect(bone.position.z).toBeCloseTo(3);
  });

  it('moves a bone partway when lerp is 0.5', () => {
    const bone = new THREE.Object3D();
    bone.position.set(0, 0, 0);
    const joints: SimulatorHandPoseJoints = [{t: [2, 0, 0], r: [0, 0, 0, 1]}];
    lerpBonesToJoints([bone], joints, 0.5);
    expect(bone.position.x).toBeCloseTo(1);
  });

  it('skips undefined bones without throwing', () => {
    const joints: SimulatorHandPoseJoints = [{t: [1, 1, 1], r: [0, 0, 0, 1]}];
    expect(() => lerpBonesToJoints([undefined], joints, 1)).not.toThrow();
  });

  it('ignores joints with no matching bone', () => {
    const bone = new THREE.Object3D();
    const joints: SimulatorHandPoseJoints = [{t: [1, 0, 0], r: [0, 0, 0, 1]}];
    // Two bones, one joint -> the second bone is left untouched.
    const second = new THREE.Object3D();
    lerpBonesToJoints([bone, second], joints, 1);
    expect(bone.position.x).toBeCloseTo(1);
    expect(second.position.x).toBeCloseTo(0);
  });
});

describe('AgentHand', () => {
  it('defaults to a relaxed pose before loading', () => {
    const hand = new AgentHand(Handedness.RIGHT);
    expect(hand.currentPose).toBe(SimulatorHandPose.RELAXED);
    expect(hand.loaded).toBe(false);
  });

  it('setPose updates the target pose', () => {
    const hand = new AgentHand(Handedness.LEFT);
    hand.setPose(SimulatorHandPose.POINTING);
    expect(hand.currentPose).toBe(SimulatorHandPose.POINTING);
  });

  it('animate is a no-op until loaded', () => {
    const hand = new AgentHand(Handedness.RIGHT);
    expect(() => hand.animate()).not.toThrow();
  });
});

describe('applyAgentHandAppearance', () => {
  it('makes every mesh a semi-transparent blue material', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({color: 0xffffff})
    );
    root.add(mesh);
    applyAgentHandAppearance(root);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThan(1);
    expect(mat.color.b).toBeGreaterThan(mat.color.r);
    // The hands must not block the UI selection beam behind them.
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
  });

  it('leaves non-mesh objects untouched', () => {
    const root = new THREE.Group();
    const group = new THREE.Group();
    root.add(group);
    expect(() => applyAgentHandAppearance(root)).not.toThrow();
  });
});

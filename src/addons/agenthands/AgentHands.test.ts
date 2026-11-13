import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {SimulatorHandPose} from 'xrblocks';

import {AgentHands} from './AgentHands';

describe('AgentHands', () => {
  it('points the hand on the target side in the rig frame', async () => {
    const load = vi
      .spyOn(GLTFLoader.prototype, 'loadAsync')
      .mockImplementation(async () => ({scene: new THREE.Group()}) as GLTF);
    const hands = new AgentHands();
    try {
      await hands.load();
      hands.rotation.y = Math.PI;
      hands.updateMatrixWorld(true);
      hands.pointAt(new THREE.Vector3(2, 1, 0), 'both');
      expect(hands.left.currentPose).toBe(SimulatorHandPose.POINTING);
      expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
      hands.rest();
      expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
    } finally {
      hands.dispose();
      load.mockRestore();
    }
  });

  it('animates hand motion over time', () => {
    const hands = new AgentHands();
    hands.updateMatrixWorld(true);
    let now = 1_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    hands.beat('both');
    let maxDrop = 0;
    for (let i = 0; i < 20; i++) {
      now += 30;
      hands.update();
      maxDrop = Math.max(maxDrop, Math.abs(hands.left.motionOffset.y));
    }
    clock.mockRestore();

    expect(maxDrop).toBeGreaterThan(0.02);
  });
});

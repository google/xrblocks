import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import type {SimulatorHandPoseJoints} from 'xrblocks';

import {lerpBonesToJoints} from './AgentHand';

describe('AgentHand helpers', () => {
  it('interpolates matching bones and ignores incomplete hand data', () => {
    const bone = new THREE.Object3D();
    const joints: SimulatorHandPoseJoints = [{t: [2, 0, 0], r: [0, 0, 0, 1]}];

    lerpBonesToJoints([bone, undefined], joints, 0.5);

    expect(bone.position.x).toBeCloseTo(1);
  });
});

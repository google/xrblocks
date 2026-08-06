import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import type {SimulatorHandPoseJoints} from 'xrblocks';

import {applyAgentHandAppearance, lerpBonesToJoints} from './AgentHand';

describe('AgentHand helpers', () => {
  it('interpolates matching bones and ignores incomplete hand data', () => {
    const bone = new THREE.Object3D();
    const joints: SimulatorHandPoseJoints = [{t: [2, 0, 0], r: [0, 0, 0, 1]}];

    lerpBonesToJoints([bone, undefined], joints, 0.5);

    expect(bone.position.x).toBeCloseTo(1);
  });

  it('makes hand meshes translucent and transparent to selection rays', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({color: 0xffffff})
    );
    root.add(mesh);

    applyAgentHandAppearance(root);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(1);
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
  });
});

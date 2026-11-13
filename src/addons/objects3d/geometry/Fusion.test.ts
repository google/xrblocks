import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {fuseIntoBoxes, snapBoxToFloor, type FusionRecord} from './Fusion';

describe('snapBoxToFloor', () => {
  it('snaps the box bottom to the floor when it dips below', () => {
    const obb = {
      center: new THREE.Vector3(0, 0.4, 0),
      size: new THREE.Vector3(1, 1, 1),
      angle: 0,
    };
    // bottom = 0.4 - 0.5 = -0.1, floorY = 0, slack = 0.05
    // -0.1 < 0 - 0.05 = -0.05 → snap
    snapBoxToFloor(obb, 0, 0.05);
    // top stays at 0.4 + 0.5 = 0.9
    // new sizeY = 0.9 - 0 = 0.9
    // new centerY = 0 + 0.9/2 = 0.45
    expect(obb.size.y).toBeCloseTo(0.9);
    expect(obb.center.y).toBeCloseTo(0.45);
  });
});

describe('fuseIntoBoxes', () => {
  function makeRecord(label: string): FusionRecord {
    return {
      label,
      category: 'furniture',
      _fusionCenter: new THREE.Vector3(),
      _fusionSize: new THREE.Vector3(1, 1, 1),
      _fusionAngle: 0,
      _fusionSamples: 1,
    };
  }

  const overlappingObb = {
    center: new THREE.Vector3(0.1, 0, 0),
    size: new THREE.Vector3(1, 1, 1),
    angle: 0,
  };
  const adjacentObb = {
    center: new THREE.Vector3(0.75, 0, 0),
    size: new THREE.Vector3(1, 1, 1),
    angle: 0,
  };

  it('fuses nearby observations with the same normalized label', () => {
    const chair = makeRecord('Chair');

    expect(fuseIntoBoxes([chair], overlappingObb, 'furniture', ' chair ')).toBe(
      chair
    );
  });

  it('does not fuse adjacent objects that only share a category', () => {
    const chair = makeRecord('chair');

    expect(fuseIntoBoxes([chair], adjacentObb, 'furniture', 'sofa')).toBeNull();
    expect(chair._fusionSamples).toBe(1);
  });
});

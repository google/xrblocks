import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {PoseSnapshot} from '../codec/PoseCodec';

import {InterpolatedPose} from './InterpolatedPose';

function makeSnap(x: number): PoseSnapshot {
  return {
    head: {
      position: new THREE.Vector3(x, 0, 0),
      quaternion: new THREE.Quaternion(0, 0, 0, 1),
    },
    hands: [
      {
        present: false,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
      {
        present: false,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
    ],
  };
}

describe('InterpolatedPose', () => {
  it('drops out-of-order snapshots', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(2), 200);
    ip.push(makeSnap(1), 150); // late, should be dropped
    expect(ip.latestTs).toBe(200);
  });

  it('lerps linearly between two snapshots at midpoint', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    const s = ip.sample(150);
    expect(s.head.position.x).toBeCloseTo(5, 5);
  });

  describe('hand interpolation', () => {
    function snapWithHand(x: number, present = true): PoseSnapshot {
      const s = makeSnap(0);
      s.hands[0] = {
        present,
        position: new THREE.Vector3(x, 0, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1),
      };
      return s;
    }

    it('skips lerp when the new snapshot has the hand absent', () => {
      const ip = new InterpolatedPose();
      ip.push(snapWithHand(0, true), 100);
      ip.push(snapWithHand(10, false), 200);
      const s = ip.sample(150);
      expect(s.hands[0].present).toBe(false);
    });
  });
});

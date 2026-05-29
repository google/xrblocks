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
  it('hasData is false until a snapshot is pushed', () => {
    const ip = new InterpolatedPose();
    expect(ip.hasData).toBe(false);
  });

  it('latestTs reflects the newest pushed snapshot', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    expect(ip.latestTs).toBe(100);
    ip.push(makeSnap(1), 150);
    expect(ip.latestTs).toBe(150);
  });

  it('drops out-of-order snapshots', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(2), 200);
    ip.push(makeSnap(1), 150); // late, should be dropped
    expect(ip.latestTs).toBe(200);
  });

  it('returns the only snapshot when no prev exists', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(7), 100);
    const s = ip.sample(100);
    expect(s.head.position.x).toBe(7);
  });

  it('lerps linearly between two snapshots at midpoint', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    const s = ip.sample(150);
    expect(s.head.position.x).toBeCloseTo(5, 5);
  });

  it('reaches the new snapshot at t=1', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    const s = ip.sample(200);
    expect(s.head.position.x).toBeCloseTo(10, 5);
  });

  it('clamps `now` before the prev snapshot to t=0', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    const s = ip.sample(50); // before prev
    expect(s.head.position.x).toBeCloseTo(0, 5);
  });

  it('extrapolates up to MAX_EXTRAPOLATION (25%) past the latest', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    // 250 → t = 1.5; clamped to 1.25 → x = 12.5
    const s = ip.sample(250);
    expect(s.head.position.x).toBeCloseTo(12.5, 5);
  });

  it('handles zero-span (same ts) without dividing by zero', () => {
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 100); // same ts
    expect(() => ip.sample(100)).not.toThrow();
  });

  it('returns the same scratch object reference across calls', () => {
    // Documented contract: callers must clone the result if they want to keep it.
    const ip = new InterpolatedPose();
    ip.push(makeSnap(0), 100);
    ip.push(makeSnap(10), 200);
    const a = ip.sample(120);
    const b = ip.sample(180);
    expect(a).toBe(b);
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

    it('lerps hand position when both snapshots have the hand present', () => {
      const ip = new InterpolatedPose();
      ip.push(snapWithHand(0), 100);
      ip.push(snapWithHand(10), 200);
      const s = ip.sample(150);
      expect(s.hands[0].present).toBe(true);
      expect(s.hands[0].position.x).toBeCloseTo(5, 5);
    });

    it('skips lerp when the new snapshot has the hand absent', () => {
      const ip = new InterpolatedPose();
      ip.push(snapWithHand(0, true), 100);
      ip.push(snapWithHand(10, false), 200);
      const s = ip.sample(150);
      expect(s.hands[0].present).toBe(false);
    });

    it('snaps to the new pose when the prev snapshot lacked the hand', () => {
      const ip = new InterpolatedPose();
      ip.push(snapWithHand(0, false), 100);
      ip.push(snapWithHand(10, true), 200);
      const s = ip.sample(150);
      expect(s.hands[0].present).toBe(true);
      expect(s.hands[0].position.x).toBeCloseTo(10, 5);
    });
  });
});

import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {AgentHands} from './AgentHands';

describe('AgentHands', () => {
  it('applies and clears poses for both hands', () => {
    const hands = new AgentHands();
    hands.gesture(SimulatorHandPose.FIST);
    expect(hands.left.currentPose).toBe(SimulatorHandPose.FIST);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.FIST);

    hands.rest();
    expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('can direct a gesture to one hand', () => {
    const hands = new AgentHands();
    hands.gesture(SimulatorHandPose.THUMBS_UP, 'right');

    expect(hands.right.currentPose).toBe(SimulatorHandPose.THUMBS_UP);
    expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('chooses the pointing hand from the target side in local space', () => {
    const hands = new AgentHands();
    hands.rotation.y = Math.PI;
    hands.updateMatrixWorld(true);
    const left = vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
    const right = vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});

    hands.pointAt(new THREE.Vector3(2, 1, 0), 'both');

    expect(left).toHaveBeenCalledOnce();
    expect(right).not.toHaveBeenCalled();
  });

  it('rests the hand that stops pointing', () => {
    const hands = new AgentHands();
    vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
    vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
    hands.pointAt(new THREE.Vector3(2, 1, -1), 'right');
    hands.right.setPose(SimulatorHandPose.POINTING);

    hands.pointAt(new THREE.Vector3(-2, 1, -1), 'left');

    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('selects count poses and returns to rest for unsupported counts', () => {
    const hands = new AgentHands();
    hands.showCount(1);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.POINTING);
    hands.showCount(2);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.VICTORY);
    hands.showCount(5);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
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

  it('shows a requested size by separating both hands', () => {
    const hands = new AgentHands();
    hands.left.root.position.set(-0.16, 0, 0);
    hands.right.root.position.set(0.16, 0, 0);
    let now = 2_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    hands.showSize(0.5);
    let maxSeparation = 0;
    for (let i = 0; i < 40; i++) {
      now += 30;
      hands.update();
      maxSeparation = Math.max(
        maxSeparation,
        hands.left.motionOffset.distanceTo(hands.right.motionOffset)
      );
    }
    clock.mockRestore();

    expect(maxSeparation).toBeGreaterThan(0.2);
  });
});

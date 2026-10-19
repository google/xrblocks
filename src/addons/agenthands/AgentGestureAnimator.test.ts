import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {AgentGestureAnimator} from './AgentGestureAnimator';
import {AgentHands} from './AgentHands';

function makeHands() {
  const hands = new AgentHands();
  hands.updateMatrixWorld(true);
  vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
  vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
  return hands;
}

describe('AgentGestureAnimator', () => {
  it('applies a static pose and clears an active orientation', () => {
    const hands = makeHands();
    const animator = new AgentGestureAnimator(hands);
    animator.fireStep({at: 0, charIndex: 0, pose: SimulatorHandPose.VICTORY});

    expect(hands.left.currentPose).toBe(SimulatorHandPose.VICTORY);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.VICTORY);
  });

  it('translates motion markup into hand actions', () => {
    const hands = makeHands();
    const animator = new AgentGestureAnimator(hands);
    const beat = vi.spyOn(hands, 'beat');
    const size = vi.spyOn(hands, 'showSize');
    const count = vi.spyOn(hands, 'showCount');

    animator.fireStep({at: 0, charIndex: 0, motion: 'beat'});
    animator.fireStep({at: 0, charIndex: 0, motion: 'size', param: 'big'});
    animator.fireStep({at: 0, charIndex: 0, motion: 'count', param: '2'});

    expect(beat).toHaveBeenCalledOnce();
    expect(size).toHaveBeenCalledWith(0.55);
    expect(count).toHaveBeenCalledWith(2);
  });

  it('aims at a point on the matching side and rests after the gesture', () => {
    const hands = makeHands();
    const animator = new AgentGestureAnimator(hands);
    const target = new THREE.Vector3(2, 1, -1);

    animator.fireStep({at: 0, charIndex: 0, point: target});
    expect(hands.right.aimAt).toHaveBeenCalledWith(target);

    animator.rest();
    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
  });
});

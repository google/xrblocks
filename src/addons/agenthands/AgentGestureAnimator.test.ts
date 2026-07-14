import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {AgentGestureAnimator} from './AgentGestureAnimator';
import {AgentHands} from './AgentHands';

// Aims are no-op'd because the hand rig is unloaded in tests; we assert on the
// animator's state and the calls it makes, not on the rig geometry.
function makeHands() {
  const hands = new AgentHands();
  hands.updateMatrixWorld(true);
  vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
  vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
  return hands;
}

describe('AgentGestureAnimator', () => {
  it('fires a static pose and clears any aim', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const gesture = vi.spyOn(hands, 'gesture');
    const clear = vi.spyOn(hands, 'clearOrientation');
    anim.fireStep({at: 0, charIndex: 0, pose: SimulatorHandPose.VICTORY});
    expect(gesture).toHaveBeenCalledWith(SimulatorHandPose.VICTORY);
    expect(clear).toHaveBeenCalled();
    expect(anim.pointing).toBe(false);
  });

  it('dispatches a beat motion to the hands', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const beat = vi.spyOn(hands, 'beat');
    anim.fireStep({at: 0, charIndex: 0, motion: 'beat'});
    expect(beat).toHaveBeenCalled();
  });

  it('maps size params to a separation width', () => {
    const anim = new AgentGestureAnimator(makeHands());
    expect(anim.sizeWidth('small')).toBeCloseTo(0.18);
    expect(anim.sizeWidth('big')).toBeCloseTo(0.55);
    expect(anim.sizeWidth('0.4')).toBeCloseTo(0.4);
    expect(anim.sizeWidth('nonsense')).toBeCloseTo(0.35);
  });

  it('shows size using the mapped width', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const showSize = vi.spyOn(hands, 'showSize');
    anim.fireStep({at: 0, charIndex: 0, motion: 'size', param: 'big'});
    expect(showSize).toHaveBeenCalledWith(anim.sizeWidth('big'));
  });

  it('counts via showCount', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const showCount = vi.spyOn(hands, 'showCount');
    anim.fireStep({at: 0, charIndex: 0, motion: 'count', param: '2'});
    expect(showCount).toHaveBeenCalledWith(2);
  });

  it('flattens the right hand to neutral for a wave', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const gesture = vi.spyOn(hands, 'gesture');
    anim.fireStep({at: 0, charIndex: 0, motion: 'wave'});
    expect(gesture).toHaveBeenCalledWith(SimulatorHandPose.NEUTRAL, 'right');
  });

  it('points at a world target and tracks the active hand', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const target = new THREE.Vector3(2, 1, -1);
    anim.fireStep({at: 0, charIndex: 0, point: target});
    expect(anim.pointing).toBe(true);
    expect(anim.target).toBe(target);
    // Target on the +x side, hands unrotated: the right hand points.
    expect(anim.activeHand).toBe(hands.right);
  });

  it('re-aims the active hand at the current target', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const target = new THREE.Vector3(2, 1, -1);
    anim.pointAt(target);
    const rightAim = hands.right.aimAt as ReturnType<typeof vi.fn>;
    rightAim.mockClear();
    anim.reaim();
    expect(rightAim).toHaveBeenCalledWith(target);
  });

  it('stops pointing when a non-point gesture follows a point', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    anim.pointAt(new THREE.Vector3(2, 1, -1));
    anim.fireStep({at: 0, charIndex: 0, motion: 'beat'});
    expect(anim.pointing).toBe(false);
    expect(anim.target).toBeNull();
    expect(anim.activeHand).toBeNull();
  });

  it('rest() relaxes the hands and clears pointing', () => {
    const hands = makeHands();
    const anim = new AgentGestureAnimator(hands);
    const rest = vi.spyOn(hands, 'rest');
    anim.pointAt(new THREE.Vector3(2, 1, -1));
    anim.rest();
    expect(rest).toHaveBeenCalled();
    expect(anim.pointing).toBe(false);
    expect(anim.target).toBeNull();
  });
});

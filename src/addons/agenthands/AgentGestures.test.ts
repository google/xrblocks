import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {buildGestureSteps, parseAgentGestures} from './AgentGestures';

describe('AgentGestures', () => {
  it('removes pose markup and schedules poses in text order', () => {
    const {text, gestures} = parseAgentGestures(
      'Yes [gesture:thumbs_up] and [gesture:point] there.'
    );

    expect(text).toBe('Yes and there.');
    expect(gestures.map((gesture) => gesture.pose)).toEqual([
      SimulatorHandPose.THUMBS_UP,
      SimulatorHandPose.POINTING,
    ]);
    expect(gestures[0].index).toBeLessThan(gestures[1].index);
  });

  it('grounds point markup to a copied world position', () => {
    const {text, gestures} = parseAgentGestures('over [point:the lamp] there');
    const lamp = new THREE.Vector3(1, 2, -3);
    const [step] = buildGestureSteps(text, gestures, 2, (target) =>
      target === 'the lamp' ? lamp : null
    );

    expect(step.point?.equals(lamp)).toBe(true);
    expect(step.point).not.toBe(lamp);
  });
});

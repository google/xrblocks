import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {
  buildGestureSteps,
  gestureNameToMotion,
  gestureNameToPose,
  parseAgentGestures,
} from './AgentGestures';

describe('AgentGestures', () => {
  it('normalizes supported pose names and rejects unknown names', () => {
    expect(gestureNameToPose('point')).toBe(SimulatorHandPose.POINTING);
    expect(gestureNameToPose('fist')).toBe(SimulatorHandPose.FIST);
    expect(gestureNameToPose('Thumbs Up')).toBe(SimulatorHandPose.THUMBS_UP);
    expect(gestureNameToPose('thumbs-up')).toBe(SimulatorHandPose.THUMBS_UP);
    expect(gestureNameToPose('wiggle')).toBeUndefined();
  });

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

  it('accepts bare markup and safely removes unknown markup', () => {
    const parsed = parseAgentGestures(
      'Great [thumbs up]! Hmm [gesture:wiggle].'
    );

    expect(parsed.text).toBe('Great ! Hmm .');
    expect(parsed.gestures).toHaveLength(1);
    expect(parsed.gestures[0].pose).toBe(SimulatorHandPose.THUMBS_UP);
  });

  it('preserves normalized text indexes for gesture scheduling', () => {
    const {text, gestures} = parseAgentGestures(
      '  Look   over [gesture:point] there  '
    );

    expect(text).toBe('Look over there');
    expect(text.slice(0, gestures[0].index)).toBe('Look over ');
  });

  it('parses motion gestures and their parameters', () => {
    const {text, gestures} = parseAgentGestures(
      'Hi [wave] [size:big] [count:2] [beat].'
    );

    expect(text).toBe('Hi .');
    expect(gestures.map((gesture) => [gesture.motion, gesture.param])).toEqual([
      ['wave', undefined],
      ['size', 'big'],
      ['count', '2'],
      ['beat', undefined],
    ]);
    expect(gestureNameToMotion('emphasize')).toBe('beat');
  });

  it('turns gesture character offsets into a bounded timeline', () => {
    const {text, gestures} = parseAgentGestures(
      'Hi there [wave] and welcome [beat] friend.'
    );
    const steps = buildGestureSteps(text, gestures, 4);

    expect(steps.map((step) => step.motion)).toEqual(['wave', 'beat']);
    expect(steps[0].at).toBeLessThan(steps[1].at);
    expect(steps[1].at).toBeLessThanOrEqual(4);
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

  it('extracts the named target from point markup', () => {
    const {text, gestures} = parseAgentGestures(
      'It is right [gesture:point:the table] there.'
    );

    expect(text).toBe('It is right there.');
    expect(gestures[0]).toMatchObject({
      pose: SimulatorHandPose.POINTING,
      target: 'the table',
    });
  });

  it('leaves unresolved point markup without a target point', () => {
    const {text, gestures} = parseAgentGestures('over [point:the moon] there');
    const [step] = buildGestureSteps(text, gestures, 2, () => null);

    expect(step.point).toBeUndefined();
  });
});

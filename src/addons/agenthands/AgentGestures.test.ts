import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import {SimulatorHandPose} from 'xrblocks';

import * as THREE from 'three';

import {
  buildGestureSteps,
  gestureNameToMotion,
  gestureNameToPose,
  parseAgentGestures,
} from './AgentGestures';

describe('gestureNameToPose', () => {
  it('maps direct names', () => {
    expect(gestureNameToPose('point')).toBe(SimulatorHandPose.POINTING);
    expect(gestureNameToPose('fist')).toBe(SimulatorHandPose.FIST);
    expect(gestureNameToPose('victory')).toBe(SimulatorHandPose.VICTORY);
  });

  it('normalizes spaces, hyphens, and case', () => {
    expect(gestureNameToPose('Thumbs Up')).toBe(SimulatorHandPose.THUMBS_UP);
    expect(gestureNameToPose('thumbs-up')).toBe(SimulatorHandPose.THUMBS_UP);
    expect(gestureNameToPose('THUMBSUP')).toBe(SimulatorHandPose.THUMBS_UP);
  });

  it('returns undefined for unknown names', () => {
    expect(gestureNameToPose('wiggle')).toBeUndefined();
  });
});

describe('parseAgentGestures', () => {
  it('strips markup and returns clean text', () => {
    const {text} = parseAgentGestures('Look [gesture:point] over there.');
    expect(text).toBe('Look over there.');
  });

  it('captures gestures in order with their text index', () => {
    const {gestures} = parseAgentGestures(
      'Yes [gesture:thumbs_up] and that [gesture:point] one.'
    );
    expect(gestures.map((g) => g.pose)).toEqual([
      SimulatorHandPose.THUMBS_UP,
      SimulatorHandPose.POINTING,
    ]);
    expect(gestures[0].index).toBeLessThan(gestures[1].index);
  });

  it('accepts bare [name] markup without the gesture: prefix', () => {
    const {text, gestures} = parseAgentGestures('Great [thumbs up]!');
    expect(text).toBe('Great !');
    expect(gestures[0].pose).toBe(SimulatorHandPose.THUMBS_UP);
  });

  it('drops unknown gesture markup but keeps surrounding text', () => {
    const {text, gestures} = parseAgentGestures('Hmm [gesture:wiggle] ok.');
    expect(text).toBe('Hmm ok.');
    expect(gestures).toHaveLength(0);
  });

  it('returns no gestures for plain text', () => {
    const {text, gestures} = parseAgentGestures('Just talking.');
    expect(text).toBe('Just talking.');
    expect(gestures).toHaveLength(0);
  });

  it('captures a point target from [point:label] markup', () => {
    const {text, gestures} = parseAgentGestures(
      'It is right [point:the table] there.'
    );
    expect(text).toBe('It is right there.');
    expect(gestures).toHaveLength(1);
    expect(gestures[0].pose).toBe(SimulatorHandPose.POINTING);
    expect(gestures[0].target).toBe('the table');
  });

  it('captures a target from the gesture: prefixed form too', () => {
    const {gestures} = parseAgentGestures('Over [gesture:point:sofa] here.');
    expect(gestures[0].pose).toBe(SimulatorHandPose.POINTING);
    expect(gestures[0].target).toBe('sofa');
  });

  it('leaves target undefined for gestures without one', () => {
    const {gestures} = parseAgentGestures('Nice [gesture:thumbs_up]!');
    expect(gestures[0].target).toBeUndefined();
  });

  it('anchors gesture index to the normalized (collapsed) text', () => {
    // Leading/!double spaces around the markup must not shift the index past
    // the end of the collapsed text the caller schedules against.
    const {text, gestures} = parseAgentGestures(
      '  Look   over [gesture:point] there  '
    );
    expect(text).toBe('Look over there');
    expect(gestures[0].index).toBeLessThanOrEqual(text.length);
    // "Look over " -> index 10 in the normalized string.
    expect(text.slice(0, gestures[0].index)).toBe('Look over ');
  });

  it('parses motion gestures with and without a parameter', () => {
    const {text, gestures} = parseAgentGestures(
      'Hi [wave] it was [size:big] huge and [count:2] options [beat] done.'
    );
    expect(text).toBe('Hi it was huge and options done.');
    expect(gestures.map((g) => g.motion)).toEqual([
      'wave',
      'size',
      'count',
      'beat',
    ]);
    expect(gestures[1].param).toBe('big');
    expect(gestures[2].param).toBe('2');
    // Motion events carry no pose.
    expect(gestures[0].pose).toBeUndefined();
  });

  it('maps motion synonyms', () => {
    expect(gestureNameToMotion('hello')).toBe('wave');
    expect(gestureNameToMotion('emphasize')).toBe('beat');
    expect(gestureNameToMotion('this big')).toBe('size');
    expect(gestureNameToMotion('thumbs_up')).toBeUndefined();
  });
});

describe('buildGestureSteps', () => {
  it('places each gesture on the timeline by its character offset', () => {
    const {text, gestures} = parseAgentGestures(
      'Hi there [wave] and welcome [beat] friend.'
    );
    const duration = 4;
    const steps = buildGestureSteps(text, gestures, duration);
    expect(steps).toHaveLength(2);
    expect(steps[0].motion).toBe('wave');
    expect(steps[1].motion).toBe('beat');
    // Timeline is monotonic and bounded by the duration.
    expect(steps[0].at).toBeLessThan(steps[1].at);
    expect(steps[1].at).toBeLessThanOrEqual(duration);
    expect(steps[0].charIndex).toBe(gestures[0].index);
  });

  it('carries pose, motion, and param through to the step', () => {
    const {text, gestures} = parseAgentGestures(
      'about [size:big] this and [gesture:victory] that'
    );
    const steps = buildGestureSteps(text, gestures, 2);
    expect(steps[0].motion).toBe('size');
    expect(steps[0].param).toBe('big');
    expect(steps[1].pose).toBe(gestures[1].pose);
    expect(steps[1].param).toBeUndefined();
  });

  it('grounds a point gesture to the resolved world position (cloned)', () => {
    const {text, gestures} = parseAgentGestures('over [point:the lamp] there');
    const lamp = new THREE.Vector3(1, 2, -3);
    const steps = buildGestureSteps(text, gestures, 2, (target) =>
      target === 'the lamp' ? lamp : null
    );
    expect(steps[0].point).toBeInstanceOf(THREE.Vector3);
    expect(steps[0].point!.equals(lamp)).toBe(true);
    // Cloned, so the caller can mutate without affecting the source.
    expect(steps[0].point).not.toBe(lamp);
  });

  it('leaves a point gesture without a point when it does not resolve', () => {
    const {text, gestures} = parseAgentGestures('over [point:the moon] there');
    const steps = buildGestureSteps(text, gestures, 2, () => null);
    expect(steps[0].point).toBeUndefined();
  });
});

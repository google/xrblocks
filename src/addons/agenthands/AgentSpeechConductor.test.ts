import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import {SimulatorHandPose} from 'xrblocks';

import {
  AgentSpeechConductor,
  estimateSpeechDuration,
} from './AgentSpeechConductor';
import type {GestureStep} from './AgentGestures';

function harness(synthesizer?: {
  speak: () => Promise<unknown> | void;
  onBoundaryCallback?: ((charIndex: number) => void) | undefined;
}) {
  const fired: GestureStep[] = [];
  const nexts: number[] = [];
  const state = {rests: 0};
  const conductor = new AgentSpeechConductor({
    synthesizer,
    onStep: (step) => fired.push(step),
    onRest: () => (state.rests += 1),
    onNext: (index) => nexts.push(index),
  });
  return {conductor, fired, nexts, state};
}

const steps: GestureStep[] = [
  {at: 1, charIndex: 5, pose: SimulatorHandPose.VICTORY},
  {at: 2, charIndex: 10, motion: 'beat'},
];

describe('estimateSpeechDuration', () => {
  it('scales with length but never drops below the floor', () => {
    expect(estimateSpeechDuration('')).toBeCloseTo(1.2);
    expect(estimateSpeechDuration('hi')).toBeCloseTo(1.2); // floor
    // 100 chars * 0.06 = 6s, above the floor.
    expect(estimateSpeechDuration('x'.repeat(100))).toBeCloseTo(6);
  });
});

describe('AgentSpeechConductor', () => {
  it('marks itself speaking and fires steps then rests as time passes', () => {
    const {conductor, fired, state} = harness();
    conductor.speak('some words here', steps, 2);
    expect(conductor.speaking).toBe(true);

    conductor.tick(0.5);
    expect(fired).toHaveLength(0);
    conductor.tick(0.6); // timer 1.1 >= step[0].at
    expect(fired).toEqual([steps[0]]);
    conductor.tick(1.0); // timer 2.1 >= step[1].at
    expect(fired).toEqual([steps[0], steps[1]]);
    expect(conductor.speaking).toBe(true);

    conductor.tick(1.0); // timer 3.1 >= duration + 0.8 (rest)
    expect(state.rests).toBe(1);
    expect(conductor.speaking).toBe(false);
  });

  it('fires steps early on word boundaries when the voice emits them', async () => {
    let boundary: ((charIndex: number) => void) | undefined;
    const synth = {
      speak: () => Promise.resolve(),
      get onBoundaryCallback() {
        return boundary;
      },
      set onBoundaryCallback(cb) {
        boundary = cb;
      },
    };
    const {conductor, fired} = harness(synth);
    conductor.speak('some words here', steps, 2);
    expect(typeof boundary).toBe('function');

    boundary!(6); // past charIndex 5
    expect(fired).toEqual([steps[0]]);
    boundary!(20); // past charIndex 10
    expect(fired).toEqual([steps[0], steps[1]]);

    await Promise.resolve();
    await Promise.resolve();
    expect(boundary).toBeUndefined();
  });

  it('still plays via the timed queue with no synthesizer', () => {
    const {conductor, fired, state} = harness();
    conductor.speak('some words here', steps, 2);
    conductor.tick(3);
    expect(fired).toEqual([steps[0], steps[1]]);
    expect(state.rests).toBe(1);
  });

  it('plays a bare timeline and advances via onNext', () => {
    const {conductor, fired, nexts} = harness();
    const pose: GestureStep = {
      at: 0.5,
      charIndex: 0,
      pose: SimulatorHandPose.FIST,
    };
    conductor.playTimeline([
      {at: 0.5, step: pose},
      {at: 1, next: 2},
    ]);
    conductor.tick(1.2);
    expect(fired).toEqual([pose]);
    expect(nexts).toEqual([2]);
  });

  it('does not double-fire a step already fired on a word boundary', () => {
    let boundary: ((charIndex: number) => void) | undefined;
    const synth = {
      speak: () => Promise.resolve(),
      get onBoundaryCallback() {
        return boundary;
      },
      set onBoundaryCallback(cb) {
        boundary = cb;
      },
    };
    const {conductor, fired, state} = harness(synth);
    conductor.speak('some words here', steps, 2);

    boundary!(20); // fire both steps early via boundaries
    expect(fired).toEqual([steps[0], steps[1]]);

    // The timed queue reaches the same steps but must not replay them.
    conductor.tick(3);
    expect(fired).toEqual([steps[0], steps[1]]);
    expect(state.rests).toBe(1);
  });

  it('clears the boundary callback when speak() throws synchronously', () => {
    let boundary: ((charIndex: number) => void) | undefined = () => {};
    const synth = {
      speak: () => {
        throw new Error('speak failed');
      },
      get onBoundaryCallback() {
        return boundary;
      },
      set onBoundaryCallback(cb) {
        boundary = cb;
      },
    };
    const {conductor} = harness(synth);
    expect(() => conductor.speak('some words here', steps, 2)).not.toThrow();
    expect(boundary).toBeUndefined();
  });

  it('does nothing when ticked with an empty timeline', () => {
    const {conductor, fired, state} = harness();
    expect(() => conductor.tick(5)).not.toThrow();
    expect(fired).toHaveLength(0);
    expect(state.rests).toBe(0);
  });
});

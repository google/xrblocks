import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import {SimulatorHandPose} from 'xrblocks';

import {AgentSpeechConductor} from './AgentSpeechConductor';
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
});

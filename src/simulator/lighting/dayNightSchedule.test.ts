import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import type {ModelLoader} from '../../utils/ModelLoader';
import {DayNightCycle} from './DayNightCycle';
import {dayNightSchedule} from './dayNightSchedule';

describe('dayNightSchedule', () => {
  it('clamps the input time to [0, 1]', () => {
    expect(dayNightSchedule(-3).t).toBe(0);
    expect(dayNightSchedule(2).t).toBe(1);
    expect(dayNightSchedule(0.5).t).toBe(0.5);
  });

  it('renders the raw day bake at t=0 (endpoint purity)', () => {
    const values = dayNightSchedule(0);
    expect(values.mixU).toBe(0);
    expect(values.sunIntensity).toBe(0);
    expect(values.bounceIntensity).toBe(0);
    expect(values.skyFillIntensity).toBe(0);
  });

  it('renders the raw night bake at t=1 (endpoint purity)', () => {
    const values = dayNightSchedule(1);
    expect(values.mixU).toBe(1);
    expect(values.sunIntensity).toBe(0);
    expect(values.bounceIntensity).toBe(0);
    expect(values.skyFillIntensity).toBe(0);
    expect(values.blindsRoll).toBe(1);
  });

  it('fades the base crossfade monotonically', () => {
    let previous = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const {mixU} = dayNightSchedule(t);
      expect(mixU).toBeGreaterThanOrEqual(previous);
      previous = mixU;
    }
  });

  it('rolls the blinds down over the night half', () => {
    expect(dayNightSchedule(0.5).blindsRoll).toBe(0);
    expect(dayNightSchedule(0.85).blindsRoll).toBe(1);
  });

  it('fades the day-only rug out by t=0.65', () => {
    expect(dayNightSchedule(0.65).rugOpacity).toBe(0);
    expect(dayNightSchedule(1).rugOpacity).toBe(0);
    expect(dayNightSchedule(0).rugOpacity).toBe(1);
  });
});

describe('DayNightCycle.create', () => {
  it('resolves to null without a WebGL renderer', async () => {
    const cycle = await DayNightCycle.create({
      renderer: {isWebGLRenderer: false},
      root: new THREE.Group(),
      dayScene: new THREE.Group(),
      loader: {} as ModelLoader,
      lighting: {
        kind: 'dayNight',
        nightScenePath: 'XREmulatorscene_Dark.glb',
        pairing: 'bake-crossfade-v1',
      },
    });
    expect(cycle).toBeNull();
  });
});

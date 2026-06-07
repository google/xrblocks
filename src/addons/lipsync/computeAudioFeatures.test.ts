import {describe, it, expect} from 'vitest';

import type {AudioFeatureInputs} from './computeAudioFeatures';
import {computeAudioFeatures} from './computeAudioFeatures';

const SAMPLE_RATE = 48000;
const NUM_BINS = 512;
const FFT_SIZE = NUM_BINS * 2;

function silentInputs(): AudioFeatureInputs {
  return {
    freqData: new Uint8Array(NUM_BINS),
    freqDataFloat: new Float32Array(NUM_BINS).fill(-120),
    timeData: new Uint8Array(FFT_SIZE).fill(128), // 128 == 0 amplitude
    mfcc: new Float32Array(13),
  };
}

describe('computeAudioFeatures', () => {
  it('silent input produces rms=0, voiced=false, formants=0', () => {
    const f = computeAudioFeatures(silentInputs(), SAMPLE_RATE);
    expect(f.rms).toBe(0);
    expect(f.voiced).toBe(false);
    expect(f.f1Hz).toBe(0);
    expect(f.f2Hz).toBe(0);
  });

  it('a sine wave in time-domain gives a non-zero rms', () => {
    const inputs = silentInputs();
    // Half-amplitude sine in [0,255] domain (128 == 0 in -1..+1 mapping).
    for (let i = 0; i < inputs.timeData.length; i++) {
      inputs.timeData[i] = 128 + Math.round(64 * Math.sin((i / 16) * Math.PI));
    }
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.rms).toBeGreaterThan(0.1);
    expect(f.rms).toBeLessThanOrEqual(1);
  });

  it('energy concentrated at low frequencies → low band > high band, low centroid', () => {
    const inputs = silentInputs();
    // Crank up the first 20 bins (~< 1 kHz at this sampleRate).
    for (let i = 0; i < 20; i++) inputs.freqData[i] = 255;
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.low).toBeGreaterThan(f.high);
    expect(f.centroid).toBeLessThan(2000);
  });

  it('energy concentrated at high frequencies → high band > low band, high centroid', () => {
    const inputs = silentInputs();
    // Bin index for ~5kHz at this rate: 5000 / (24000/512) ≈ 107.
    for (let i = 100; i < 150; i++) inputs.freqData[i] = 255;
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.high).toBeGreaterThan(f.low);
    expect(f.centroid).toBeGreaterThan(3000);
  });

  it('peak in 800–1000 Hz range surfaces as f1Hz, peak in 2000-2500 Hz as f2Hz', () => {
    const inputs = silentInputs();
    const binHz = SAMPLE_RATE / 2 / NUM_BINS; // ~46.875 Hz/bin
    const f1Bin = Math.round(900 / binHz);
    const f2Bin = Math.round(2200 / binHz);
    // f1 peak below the f2 search range floor so it doesn't dominate
    // the f2 search; in real speech the second formant is also typically
    // stronger than the first formant tail.
    inputs.freqData[f1Bin] = 200;
    inputs.freqData[f2Bin] = 255;
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.f1Hz).toBeGreaterThan(700);
    expect(f.f1Hz).toBeLessThan(1100);
    expect(f.f2Hz).toBeGreaterThan(2000);
    expect(f.f2Hz).toBeLessThan(2500);
  });

  it('f2 search ignores strong energy in adjacent bins outside the search range', () => {
    // Boundary contamination check: with a wide 5-bin moving-average
    // peak picker, a very loud single bin just below the F2 search
    // range floor (800 Hz) could otherwise leak into the average for
    // the lowest in-range bin and make it win against a real F2
    // plateau higher up.
    const inputs = silentInputs();
    const binHz = SAMPLE_RATE / 2 / NUM_BINS;
    const justBelowF2Bin = Math.floor(700 / binHz);
    const realF2Bin = Math.round(2200 / binHz);
    inputs.freqData[justBelowF2Bin] = 255;
    for (let k = -2; k <= 2; k++) inputs.freqData[realF2Bin + k] = 140;
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.f2Hz).toBeGreaterThan(1800);
    expect(f.f2Hz).toBeLessThan(2500);
  });

  it('forwards the supplied mfcc vector through to the output', () => {
    const inputs = silentInputs();
    inputs.mfcc = Float32Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.mfcc).toBeDefined();
    expect(Array.from(f.mfcc!)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('omits the mfcc field when none is supplied', () => {
    const inputs = silentInputs();
    inputs.mfcc = undefined;
    const f = computeAudioFeatures(inputs, SAMPLE_RATE);
    expect(f.mfcc).toBeUndefined();
  });
});

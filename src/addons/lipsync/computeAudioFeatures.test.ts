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
});

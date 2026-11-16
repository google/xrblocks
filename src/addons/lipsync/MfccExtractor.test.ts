import {describe, it, expect} from 'vitest';

import {MfccExtractor, NUM_MFCC} from './MfccExtractor';

// Build a synthetic dB spectrum that puts most of its energy in a single
// FFT bin (i.e. a single sine tone), so we can reason about the MFCC output.
function makeTone(numBins: number, bin: number, peakDb = 0): Float32Array {
  const arr = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) arr[i] = -120;
  arr[bin] = peakDb;
  return arr;
}

describe('MfccExtractor', () => {
  const sampleRate = 44100;
  const fftSize = 512; // numBins = 256

  it('a strong low-frequency tone produces different MFCCs than a strong high-frequency tone', () => {
    const ext = new MfccExtractor({sampleRate, fftSize});
    const lowOut = Float32Array.from(ext.extract(makeTone(256, 5, 0)));
    const highOut = Float32Array.from(ext.extract(makeTone(256, 200, 0)));
    // The two should differ measurably across the higher cepstral bands
    // (c1..c12 are the shape descriptors).
    let totalDiff = 0;
    for (let i = 1; i < NUM_MFCC; i++)
      totalDiff += Math.abs(lowOut[i] - highOut[i]);
    expect(totalDiff).toBeGreaterThan(1);
  });
});

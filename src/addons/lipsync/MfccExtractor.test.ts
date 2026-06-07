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

  it('produces NUM_MFCC coefficients per frame', () => {
    const ext = new MfccExtractor({sampleRate, fftSize});
    const out = ext.extract(makeTone(256, 5));
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(NUM_MFCC);
    expect(NUM_MFCC).toBe(13);
  });

  it('is deterministic: same input twice produces the same coefficients', () => {
    const ext = new MfccExtractor({sampleRate, fftSize});
    const input = makeTone(256, 30, -20);
    const a = Float32Array.from(ext.extract(input));
    const b = Float32Array.from(ext.extract(input));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('silence (all -120 dB) yields finite, small-magnitude coefficients', () => {
    const ext = new MfccExtractor({sampleRate, fftSize});
    const silent = new Float32Array(256).fill(-120);
    const out = ext.extract(silent);
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // c1..c12 should all be ~0 (no spectral structure to capture).
    for (let i = 1; i < NUM_MFCC; i++) {
      expect(Math.abs(out[i])).toBeLessThan(1);
    }
  });

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

  it('handles different FFT sizes (256 and 1024)', () => {
    for (const size of [256, 1024]) {
      const ext = new MfccExtractor({sampleRate, fftSize: size});
      const out = ext.extract(makeTone(size / 2, 10, -10));
      expect(out).toHaveLength(NUM_MFCC);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

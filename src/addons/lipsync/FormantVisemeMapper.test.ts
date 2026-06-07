import {describe, it, expect} from 'vitest';

import {FormantVisemeMapper, type AudioFeatures} from './FormantVisemeMapper';

function silence(): AudioFeatures {
  return {
    rms: 0,
    centroid: 0,
    low: 0,
    mid: 0,
    high: 0,
    f1Hz: 0,
    f2Hz: 0,
    voiced: false,
  };
}

function vowel(f1Hz: number, f2Hz: number): AudioFeatures {
  return {
    rms: 0.15,
    centroid: 1500,
    low: 0.6,
    mid: 0.3,
    high: 0.05,
    f1Hz,
    f2Hz,
    voiced: true,
  };
}

// Settle the mapper into steady state at the given features by running
// many frames at the same dt. Returns the converged viseme weights.
function settle(
  mapper: FormantVisemeMapper,
  features: AudioFeatures,
  dt = 0.016,
  frames = 200
) {
  let out = mapper.update(features, dt);
  for (let i = 0; i < frames - 1; i++) out = mapper.update(features, dt);
  return out;
}

describe('FormantVisemeMapper', () => {
  it('silent input → all zero visemes', () => {
    const m = new FormantVisemeMapper();
    const out = settle(m, silence());
    expect(out.jawOpen).toBeLessThan(0.05);
    expect(out.aa).toBe(0);
    expect(out.oo).toBe(0);
    expect(out.ee).toBe(0);
  });

  it('low F1, low F2 (oo-like) → oo dominates aa and ee', () => {
    const out = settle(new FormantVisemeMapper(), vowel(350, 900));
    expect(out.oo).toBeGreaterThan(out.aa);
    expect(out.oo).toBeGreaterThan(out.ee);
  });

  it('low F1, high F2 (ee-like) → ee dominates aa and oo', () => {
    const out = settle(new FormantVisemeMapper(), vowel(350, 2400));
    expect(out.ee).toBeGreaterThan(out.aa);
    expect(out.ee).toBeGreaterThan(out.oo);
  });

  it('high F1 (aa-like) → aa dominates oo and ee', () => {
    const out = settle(new FormantVisemeMapper(), vowel(800, 1300));
    expect(out.aa).toBeGreaterThan(out.oo);
    expect(out.aa).toBeGreaterThan(out.ee);
  });

  it('a single frame of full input does not fully transfer (smoothing on)', () => {
    const m = new FormantVisemeMapper();
    const out = m.update(vowel(800, 1300), 0.016);
    // After one ~16ms frame, jawOpen should still be well below 1.
    expect(out.jawOpen).toBeLessThan(0.8);
  });

  it('frame-rate-independent: 60 Hz and 120 Hz converge to same value at same wall-clock time', () => {
    const features = vowel(800, 1300);
    // Step at 16.67ms for 30 frames = ~500ms wall clock.
    const m60 = new FormantVisemeMapper();
    let v60 = m60.update(features, 0.01667);
    for (let i = 0; i < 29; i++) v60 = m60.update(features, 0.01667);

    // Step at 8.33ms for 60 frames = ~500ms wall clock.
    const m120 = new FormantVisemeMapper();
    let v120 = m120.update(features, 0.00833);
    for (let i = 0; i < 59; i++) v120 = m120.update(features, 0.00833);

    // Both should converge to nearly the same jawOpen because the time
    // constant is expressed in seconds, not in frames.
    expect(Math.abs(v60.jawOpen - v120.jawOpen)).toBeLessThan(0.05);
    expect(Math.abs(v60.aa - v120.aa)).toBeLessThan(0.05);
  });

  it('clears cached F1/F2 after sustained silence so the next vowel starts fresh', () => {
    const m = new FormantVisemeMapper();
    // Settle on /oo/ (low F1, low F2).
    settle(m, vowel(350, 900));
    const ooLocked = m.update(vowel(350, 900), 0.016);
    expect(ooLocked.oo).toBeGreaterThan(ooLocked.aa);
    expect(ooLocked.oo).toBeGreaterThan(ooLocked.ee);

    // 500 ms of contiguous silence: well past the 250 ms cache reset.
    for (let i = 0; i < 30; i++) m.update(silence(), 0.016);

    // Now resume with /ee/ formants. If smoothF1/F2 had been retained
    // at the /oo/ values, the first few frames would smooth /ee/'s F2
    // ~2400 toward 900 and the mouth would briefly look like /oo/.
    // With the cache cleared, smoothF1/F2 reinit from the new frame's
    // raw values and /ee/ leads from frame one.
    const firstEe = m.update(vowel(300, 2400), 0.016);
    expect(firstEe.ee).toBeGreaterThan(firstEe.oo);
    expect(firstEe.ee).toBeGreaterThan(firstEe.aa);
  });

  it('reset() returns to zero state', () => {
    const m = new FormantVisemeMapper();
    settle(m, vowel(800, 1300));
    m.reset();
    const out = m.update(silence(), 0.016);
    expect(out.jawOpen).toBeLessThan(0.05);
    expect(out.aa).toBe(0);
  });
});

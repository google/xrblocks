import {afterEach, expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {LipsyncMouth} from './LipsyncMouth';
import {ZERO_VISEME, type VisemeWeights} from './BlendshapeReducer';

afterEach(() => {
  vi.restoreAllMocks();
});

function audioBoundary() {
  let voiced = true;
  const analyser = {
    fftSize: 1024,
    frequencyBinCount: 512,
    smoothingTimeConstant: 0,
    disconnect: vi.fn(),
    getByteFrequencyData(out: Uint8Array) {
      out.fill(0);
      if (voiced) {
        out.fill(200, 0, 30);
        out[20] = 255;
        out[48] = 230;
      }
    },
    getFloatFrequencyData(out: Float32Array) {
      out.fill(-120);
    },
    getByteTimeDomainData(out: Uint8Array) {
      for (let i = 0; i < out.length; i++)
        out[i] =
          128 + (voiced ? Math.round(64 * Math.sin((i / 8) * Math.PI)) : 0);
    },
  };
  const source = {connect() {}, disconnect: vi.fn()};
  const context = {
    sampleRate: 48000,
    state: 'running',
    createAnalyser: () => analyser,
    createMediaStreamSource: () => source,
    close: vi.fn(),
  };
  const track = {stop: vi.fn()};
  const stream = {getTracks: () => [track]} as unknown as MediaStream;
  return {
    analyser,
    source,
    context,
    stream,
    track,
    silence() {
      voiced = false;
    },
  };
}

it('drives a mouth from audio, releases it after silence, and resets it on disposal', async () => {
  const f = audioBoundary();
  let weights: VisemeWeights = {...ZERO_VISEME};
  const mouth = new LipsyncMouth(f.stream, {
    target: {
      setVisemes(value) {
        weights = {...value};
      },
    },
    audioContext: f.context as unknown as AudioContext,
    silenceHoldMs: 80,
  });
  try {
    await mouth.init();
    for (let time = 0; time < 1000; time += 16) mouth.update(time);
    expect(weights.jawOpen).toBeGreaterThan(0.05);
    f.silence();
    for (let time = 1000; time < 2500; time += 16) mouth.update(time);
    expect(weights.jawOpen).toBeLessThan(0.02);
    mouth.dispose();
    expect(weights).toEqual(ZERO_VISEME);
  } finally {
    mouth.dispose();
  }
});

it('disconnects its graph without closing borrowed audio or stopping caller tracks', async () => {
  const f = audioBoundary();
  const disposeTarget = vi.fn();
  const target = {setVisemes() {}, dispose: disposeTarget};
  const mouth = new LipsyncMouth(f.stream, {
    target,
    audioContext: f.context as unknown as AudioContext,
  });
  await mouth.init();
  mouth.dispose();
  expect(f.source.disconnect).toHaveBeenCalled();
  expect(f.analyser.disconnect).toHaveBeenCalled();
  expect(f.context.close).not.toHaveBeenCalled();
  expect(f.track.stop).not.toHaveBeenCalled();
  expect(disposeTarget).not.toHaveBeenCalled();
});

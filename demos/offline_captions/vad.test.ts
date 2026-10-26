import {describe, expect, it} from 'vitest';

import {SpeechSegmenter, VAD_DEFAULTS} from './vad.js';

const RATE = VAD_DEFAULTS.sampleRate;

function tone(ms: number, amplitude = 0.2) {
  const samples = new Float32Array(Math.round((RATE * ms) / 1000));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
  }
  return samples;
}

function silence(ms: number, amplitude = 0.001) {
  const samples = new Float32Array(Math.round((RATE * ms) / 1000));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = i % 2 ? amplitude : -amplitude;
  }
  return samples;
}

function feed(segmenter: SpeechSegmenter, audio: Float32Array, chunk = 700) {
  const events = [];
  for (let offset = 0; offset < audio.length; offset += chunk) {
    events.push(...segmenter.push(audio.subarray(offset, offset + chunk)));
  }
  return events;
}

describe('SpeechSegmenter', () => {
  it('emits one utterance with pre-roll and trimmed trailing silence', () => {
    const segmenter = new SpeechSegmenter();
    const events = [
      ...feed(segmenter, silence(900)),
      ...feed(segmenter, tone(1200)),
      ...feed(segmenter, silence(900)),
    ];
    expect(events.map((event) => event.type)).toEqual(['start', 'end']);
    const end = events[1];
    if (end.type !== 'end') throw new Error('expected end');
    expect(end.id).toBe(1);
    expect(end.reason).toBe('silence');
    expect(end.tooShort).toBe(false);
    const ms = (end.audio.length / RATE) * 1000;
    // 1200 ms speech + 300 ms pre-roll + 150 ms trail, within frame rounding.
    expect(ms).toBeGreaterThanOrEqual(1500);
    expect(ms).toBeLessThanOrEqual(1740);
    expect(end.silenceMs).toBeGreaterThanOrEqual(600);
    expect(end.speechMs).toBeGreaterThanOrEqual(1140);
  });

  it('separates utterances divided by a pause and ignores short pauses', () => {
    const segmenter = new SpeechSegmenter();
    const events = [
      ...feed(segmenter, silence(300)),
      ...feed(segmenter, tone(500)),
      ...feed(segmenter, silence(300)),
      ...feed(segmenter, tone(500)),
      ...feed(segmenter, silence(800)),
      ...feed(segmenter, tone(600)),
      ...feed(segmenter, silence(800)),
    ];
    const ends = events.filter((event) => event.type === 'end');
    expect(ends.map((event) => event.id)).toEqual([1, 2]);
  });

  it('does not trigger on steady background noise and adapts its floor', () => {
    const segmenter = new SpeechSegmenter();
    expect(feed(segmenter, silence(3000, 0.02))).toEqual([]);
    expect(segmenter.threshold).toBeGreaterThan(VAD_DEFAULTS.minRms);
    expect(feed(segmenter, tone(600, 0.3)).map((e) => e.type)).toEqual([
      'start',
    ]);
  });

  it('marks clicks shorter than the minimum speech length', () => {
    const segmenter = new SpeechSegmenter();
    const events = [
      ...feed(segmenter, silence(300)),
      ...feed(segmenter, tone(120)),
      ...feed(segmenter, silence(800)),
    ];
    const end = events.find((event) => event.type === 'end');
    expect(end?.type === 'end' && end.tooShort).toBe(true);
  });

  it('splits long speech at the maximum length and continues', () => {
    const segmenter = new SpeechSegmenter({maxSegmentMs: 3000});
    feed(segmenter, silence(300));
    const events = feed(segmenter, tone(7000));
    const types = events.map((event) => `${event.type}:${event.id}`);
    expect(types).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3']);
    const first = events[1];
    expect(first.type === 'end' && first.reason).toBe('max');
  });

  it('exposes active audio for interim text and flushes on stop', () => {
    const segmenter = new SpeechSegmenter();
    expect(segmenter.activeAudio()).toBeNull();
    feed(segmenter, silence(300));
    feed(segmenter, tone(800));
    expect(segmenter.active).toBe(true);
    expect(segmenter.activeAudio()!.length).toBeGreaterThan(RATE * 0.8);
    const events = segmenter.flush();
    expect(events).toHaveLength(1);
    expect(events[0].type === 'end' && events[0].reason).toBe('flush');
    expect(segmenter.active).toBe(false);
    expect(segmenter.flush()).toEqual([]);
  });

  it('learns the room level before detecting onset', () => {
    const segmenter = new SpeechSegmenter();
    expect(feed(segmenter, tone(270, 0.3))).toEqual([]);
    expect(segmenter.active).toBe(false);
  });

  it('reports level and processed time', () => {
    const segmenter = new SpeechSegmenter();
    feed(segmenter, tone(90, 0.5));
    expect(segmenter.level).toBeGreaterThan(0.3);
    expect(segmenter.timeMs).toBe(90);
    segmenter.reset();
    expect(segmenter.timeMs).toBe(0);
  });
});

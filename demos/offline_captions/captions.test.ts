import {describe, expect, it, vi} from 'vitest';

import {
  CaptionLog,
  PLACEHOLDER,
  TRANSLATION_MARK,
  Throttle,
  formatMetrics,
} from './captions.js';

describe('CaptionLog', () => {
  it('renders finalized lines followed by an interim line', () => {
    const log = new CaptionLog();
    expect(log.render()).toBe(PLACEHOLDER);
    expect(log.setInterim(1, ' hello  wor')).toBe(true);
    expect(log.render()).toBe('hello wor …');
    expect(log.setInterim(1, 'hello wor')).toBe(false);
    expect(log.finalize(1, 'Hello world.')).toBe(true);
    log.setInterim(2, 'next');
    expect(log.render()).toBe('Hello world.\nnext …');
  });

  it('rejects stale interim and duplicate finals', () => {
    const log = new CaptionLog();
    log.finalize(2, 'Two.');
    expect(log.setInterim(1, 'old')).toBe(false);
    expect(log.setInterim(2, 'old')).toBe(false);
    expect(log.finalize(2, 'Again.')).toBe(false);
    expect(log.render()).toBe('Two.');
  });

  it('drops an interim line when its final is empty or skipped', () => {
    const log = new CaptionLog();
    log.setInterim(1, 'uh');
    expect(log.finalize(1, '  ')).toBe(true);
    expect(log.render()).toBe(PLACEHOLDER);
    log.setInterim(2, 'click');
    expect(log.dropInterim(3)).toBe(false);
    expect(log.dropInterim(2)).toBe(true);
    expect(log.empty).toBe(true);
  });

  it('caps retained lines and clears without accepting old ids', () => {
    const log = new CaptionLog({maxLines: 3});
    for (let id = 1; id <= 5; id++) log.finalize(id, `Line ${id}.`);
    expect(log.render()).toBe('Line 3.\nLine 4.\nLine 5.');
    log.clear();
    expect(log.render()).toBe(PLACEHOLDER);
    expect(log.finalize(5, 'late')).toBe(false);
    expect(log.finalize(6, 'Fresh.')).toBe(true);
  });
});

describe('CaptionLog translations', () => {
  it('renders each translation under its line only while shown', () => {
    const log = new CaptionLog();
    log.finalize(1, 'Good morning.');
    log.finalize(2, 'See you soon.');
    expect(log.setTranslation(1, 'Buenos días.')).toBe(false);
    expect(log.render()).toBe('Good morning.\nSee you soon.');
    expect(log.setShowTranslations(true)).toBe(true);
    expect(log.render()).toBe(
      `Good morning.\n${TRANSLATION_MARK} Buenos días.\nSee you soon.`
    );
    const revision = log.revision;
    expect(log.setTranslation(2, ' Hasta  pronto. ')).toBe(true);
    expect(log.revision).toBe(revision + 1);
    expect(log.setTranslation(2, 'Hasta pronto.')).toBe(false);
    log.setInterim(3, 'and then');
    expect(log.render()).toBe(
      'Good morning.\n→ Buenos días.\nSee you soon.\n→ Hasta pronto.\nand then …'
    );
    expect(log.setShowTranslations(false)).toBe(true);
    expect(log.render()).toBe('Good morning.\nSee you soon.\nand then …');
  });

  it('ignores translations for unknown or empty lines', () => {
    const log = new CaptionLog();
    log.setShowTranslations(true);
    log.finalize(1, 'Hello.');
    expect(log.setTranslation(9, 'Hola.')).toBe(false);
    expect(log.setTranslation(1, '  ')).toBe(false);
    expect(log.render()).toBe('Hello.');
  });

  it('clears translations on a language change and with the transcript', () => {
    const log = new CaptionLog({maxLines: 2});
    log.setShowTranslations(true);
    log.finalize(1, 'One.');
    log.setTranslation(1, 'Uno.');
    expect(log.clearTranslations()).toBe(true);
    expect(log.clearTranslations()).toBe(false);
    expect(log.render()).toBe('One.');
    log.setTranslation(1, 'Un.');
    log.finalize(2, 'Two.');
    log.finalize(3, 'Three.');
    // Line 1 scrolled out, so its translation is released too.
    expect(log.translations.has(1)).toBe(false);
    log.setTranslation(3, 'Trois.');
    log.clear();
    expect(log.translations.size).toBe(0);
    expect(log.render()).toBe(PLACEHOLDER);
  });
});

describe('Throttle', () => {
  it('delivers the latest value at most once per interval, with a flush', () => {
    let now = 0;
    const deliver = vi.fn();
    const throttle = new Throttle(deliver, {intervalMs: 100, now: () => now});
    throttle.poll();
    expect(deliver).not.toHaveBeenCalled();
    throttle.schedule('a');
    throttle.poll();
    expect(deliver).toHaveBeenLastCalledWith('a');
    throttle.schedule('b');
    throttle.schedule('c');
    now = 50;
    throttle.poll();
    expect(deliver).toHaveBeenCalledTimes(1);
    now = 100;
    throttle.poll();
    expect(deliver).toHaveBeenLastCalledWith('c');
    throttle.schedule('d');
    now = 120;
    throttle.flush();
    expect(deliver).toHaveBeenLastCalledWith('d');
    throttle.schedule('e');
    throttle.cancel();
    now = 1000;
    throttle.poll();
    expect(deliver).toHaveBeenCalledTimes(3);
  });

  it('never delivers two values less than the interval apart when polled per frame', () => {
    let now = 0;
    const times: number[] = [];
    const throttle = new Throttle(() => times.push(now), {now: () => now});
    for (let frame = 0; frame < 120; frame++) {
      now = frame * 11.1;
      throttle.schedule(frame);
      throttle.poll();
    }
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(100);
    }
    expect(times.length).toBeGreaterThan(10);
  });
});

describe('formatMetrics', () => {
  it('formats known and unknown values', () => {
    expect(formatMetrics()).toBe(
      'First caption: - · End of speech to text: - · Real-time factor: -'
    );
    expect(
      formatMetrics({
        firstCaptionMs: 812.4,
        finalLatencyMs: 1210.6,
        rtf: 0.1234,
      })
    ).toBe(
      'First caption: 812 ms · End of speech to text: 1211 ms · Real-time factor: 0.12'
    );
  });

  it('adds translation time only while translating', () => {
    expect(formatMetrics({translateMs: 640})).toBe(formatMetrics());
    expect(formatMetrics({translating: true})).toBe(
      'First caption: - · End of speech to text: - · Real-time factor: - · Translate: -'
    );
    expect(
      formatMetrics({rtf: 0.2, translating: true, translateMs: 640.4})
    ).toMatch(/Real-time factor: 0\.20 · Translate: 640 ms$/);
  });
});

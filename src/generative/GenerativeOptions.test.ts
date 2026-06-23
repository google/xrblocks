import {describe, it, expect} from 'vitest';

import {GenerativeOptions} from './GenerativeOptions';

describe('GenerativeOptions', () => {
  it('is disabled by default', () => {
    expect(new GenerativeOptions().enabled).toBe(false);
  });

  it('defaults to a 1m placement distance and 0.6m max size', () => {
    const opts = new GenerativeOptions();
    expect(opts.distance).toBe(1.0);
    expect(opts.maxSize).toBe(0.6);
  });

  it('steers the model toward a single subject on a plain background', () => {
    expect(new GenerativeOptions().systemInstruction).toContain(
      'plain, solid white background'
    );
  });

  it('enable() turns it on and returns the instance', () => {
    const opts = new GenerativeOptions();
    const returned = opts.enable();
    expect(opts.enabled).toBe(true);
    expect(returned).toBe(opts);
  });
});

import {describe, it, expect} from 'vitest';

import {makeId, hashStringToHue} from './IdUtils';

describe('IdUtils', () => {
  describe('makeId', () => {
    it('returns a 12-char string by default', () => {
      const id = makeId();
      expect(id).toHaveLength(12);
    });

    it('honours the requested length', () => {
      expect(makeId(1)).toHaveLength(1);
      expect(makeId(32)).toHaveLength(32);
      expect(makeId(0)).toHaveLength(0);
    });

    it('produces only URL-safe alphanumeric characters', () => {
      const id = makeId(64);
      expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('produces different ids on consecutive calls', () => {
      // 12 chars of 62-symbol alphabet has ~71 bits of entropy; any
      // collision in 1000 calls would mean the RNG is broken.
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) ids.add(makeId());
      expect(ids.size).toBe(1000);
    });
  });

  describe('hashStringToHue', () => {
    it('returns a number in [0, 1]', () => {
      for (const s of ['', 'a', 'peer-abc', 'a much longer peer id']) {
        const h = hashStringToHue(s);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic for the same input', () => {
      expect(hashStringToHue('peer-1')).toBe(hashStringToHue('peer-1'));
      expect(hashStringToHue('xyz')).toBe(hashStringToHue('xyz'));
    });

    it('typically produces different hues for different inputs', () => {
      const hues = new Set<number>();
      for (let i = 0; i < 100; i++) hues.add(hashStringToHue(`peer-${i}`));
      // FNV-1a over short strings shouldn't collide on 100 sequential ids.
      expect(hues.size).toBeGreaterThan(95);
    });
  });
});

import {describe, it, expect} from 'vitest';

import {makeId, hashStringToHue} from './IdUtils';

describe('IdUtils', () => {
  describe('makeId', () => {
    it('uses the default and requested lengths', () => {
      expect(makeId()).toHaveLength(12);
      expect(makeId(1)).toHaveLength(1);
      expect(makeId(32)).toHaveLength(32);
      expect(makeId(0)).toHaveLength(0);
    });

    it('produces only URL-safe alphanumeric characters', () => {
      const id = makeId(64);
      expect(id).toMatch(/^[a-zA-Z0-9]+$/);
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
  });
});

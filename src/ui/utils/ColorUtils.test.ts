import {describe, expect, it} from 'vitest';

import {normalizeAlphaHexColor, parseColorWithAlpha} from './ColorUtils';

describe('normalizeAlphaHexColor', () => {
  it('converts #RRGGBBAA to an equivalent rgba()', () => {
    expect(normalizeAlphaHexColor('#282c3466')).toBe(
      'rgba(5.4108, 6.4226, 8.7567, 0.4)'
    );
  });

  it('converts #RGBA to an equivalent rgba()', () => {
    expect(normalizeAlphaHexColor('#fff8')).toBe('rgba(255, 255, 255, 0.5333)');
  });

  it('passes through colors THREE/uikit already parse', () => {
    expect(normalizeAlphaHexColor('#aabbcc')).toBe('#aabbcc');
    expect(normalizeAlphaHexColor('#abc')).toBe('#abc');
    expect(normalizeAlphaHexColor('rgba(1, 2, 3, 0.5)')).toBe(
      'rgba(1, 2, 3, 0.5)'
    );
    expect(normalizeAlphaHexColor('white')).toBe('white');
    expect(normalizeAlphaHexColor('transparent')).toBe('transparent');
  });

  it('passes through non-string values', () => {
    expect(normalizeAlphaHexColor(undefined)).toBeUndefined();
    expect(normalizeAlphaHexColor(0x282c34)).toBe(0x282c34);
    const gradient = {gradientType: 'linear', stops: []};
    expect(normalizeAlphaHexColor(gradient)).toBe(gradient);
  });

  it('round-trips color and opacity through parseColorWithAlpha', () => {
    for (const input of ['#282c3466', '#fff8', '#0a1420ff', '#00000000']) {
      const normalized = normalizeAlphaHexColor(input) as string;
      const a = parseColorWithAlpha(input);
      const b = parseColorWithAlpha(normalized);
      expect(b.color.r).toBeCloseTo(a.color.r, 3);
      expect(b.color.g).toBeCloseTo(a.color.g, 3);
      expect(b.color.b).toBeCloseTo(a.color.b, 3);
      expect(b.opacity).toBeCloseTo(a.opacity, 4);
    }
  });
});

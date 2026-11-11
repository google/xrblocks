import type {ColorRepresentation} from '@pmndrs/uikit';
import {writeColor} from '@pmndrs/uikit/dist/panel/material/color.js';
import {describe, expect, it} from 'vitest';

import {normalizeAlphaHexColor, parseColorWithAlpha} from './ColorUtils';

describe('normalizeAlphaHexColor', () => {
  it('converts alpha hex to linear RGBA values written by UIKit', () => {
    const normalized = normalizeAlphaHexColor('#282c3466');
    const data = new Float32Array(4);

    writeColor(data, 0, normalized as ColorRepresentation, 1);

    expect(data[0]).toBeCloseTo(0.02121901037, 7);
    expect(data[1]).toBeCloseTo(0.02518685962, 7);
    expect(data[2]).toBeCloseTo(0.0343398068, 7);
    expect(data[3]).toBeCloseTo(0.4, 7);
  });

  it('preserves short alpha hex color and opacity as linear RGBA', () => {
    const normalized = normalizeAlphaHexColor('#fff8');

    expect(normalized).toEqual([1, 1, 1, 8 / 15]);
  });

  it('passes through colors UIKit already parses', () => {
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

  it('parses rgba() and hex strings into matching linear working-space colors', () => {
    const fromRgba = parseColorWithAlpha('rgba(18, 18, 22, 1.0)');
    const fromHex = parseColorWithAlpha('#121216');
    expect(fromRgba.color.r).toBeCloseTo(fromHex.color.r, 5);
    expect(fromRgba.color.g).toBeCloseTo(fromHex.color.g, 5);
    expect(fromRgba.color.b).toBeCloseTo(fromHex.color.b, 5);
    expect(fromRgba.opacity).toBe(1.0);
  });
});

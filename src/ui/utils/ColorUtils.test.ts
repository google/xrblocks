import {expect, it} from 'vitest';
import {normalizeAlphaHexColor, parseColorWithAlpha} from './ColorUtils';

it('converts alpha colors to independently expected linear channels and opacity', () => {
  const expected = [0.02121901037, 0.02518685962, 0.0343398068, 0.4];
  const normalized = normalizeAlphaHexColor('#282c3466');
  expect(normalized).toHaveLength(4);
  for (const [index, channel] of expected.entries())
    expect(normalized[index]).toBeCloseTo(channel, 7);
  const {color, opacity} = parseColorWithAlpha('rgba(40, 44, 52, 0.4)');
  const parsed = [color.r, color.g, color.b, opacity];
  for (const [index, channel] of expected.entries())
    expect(parsed[index]).toBeCloseTo(channel, 7);
  expect(normalizeAlphaHexColor('#fff8')).toEqual([1, 1, 1, 8 / 15]);
});

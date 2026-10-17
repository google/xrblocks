import {describe, expect, it} from 'vitest';
import {UIPanel} from './components/UIPanel';
import {additiveTheme, createThemeSnapshot, grayGlassTheme} from './UITheme';

const MINIMUM_TEXT_CONTRAST_RATIO = 4.5;
const MINIMUM_STATE_CONTRAST_RATIO = 1.5;
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_EXPONENT = 2.4;
const RED_LUMINANCE_WEIGHT = 0.2126;
const GREEN_LUMINANCE_WEIGHT = 0.7152;
const BLUE_LUMINANCE_WEIGHT = 0.0722;
const CONTRAST_LUMINANCE_OFFSET = 0.05;
const HEX_RADIX = 16;
const HEX_CHANNEL_MAX = 255;
const HEX_CHANNEL_LENGTH = 2;

function relativeLuminance(color: string): number {
  const hex = color.replace('#', '');
  const channels = [0, HEX_CHANNEL_LENGTH, HEX_CHANNEL_LENGTH * 2].map(
    (offset) =>
      Number.parseInt(
        hex.slice(offset, offset + HEX_CHANNEL_LENGTH),
        HEX_RADIX
      ) / HEX_CHANNEL_MAX
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= SRGB_LINEAR_THRESHOLD
      ? channel / SRGB_LINEAR_DIVISOR
      : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT
  );
  return (
    red * RED_LUMINANCE_WEIGHT +
    green * GREEN_LUMINANCE_WEIGHT +
    blue * BLUE_LUMINANCE_WEIGHT
  );
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + CONTRAST_LUMINANCE_OFFSET) /
    (Math.min(firstLuminance, secondLuminance) + CONTRAST_LUMINANCE_OFFSET)
  );
}

describe('Editable UI theme roles', () => {
  it('retains and validates focus styles with the existing style contract', () => {
    const panel = new UIPanel({style: {':focus': {borderColor: '#ffffff'}}});
    panel.style[':focus']!.borderWidth = 2;
    expect(panel.style[':focus']).toEqual({
      borderColor: '#ffffff',
      borderWidth: 2,
    });
    expect(
      () =>
        new UIPanel({
          style: {':focus': {gap: 20} as never},
        })
    ).toThrow(/Unknown|cannot change/);
  });

  it('accepts input and scroll theme roles without changing existing presets', () => {
    const theme = createThemeSnapshot({
      ...grayGlassTheme,
      styles: {
        ...grayGlassTheme.styles,
        input: {borderWidth: 1, ':focus': {borderColor: '#ffffff'}},
        scroll: {padding: 8},
      },
    });
    expect(theme.styles?.input?.[':focus']?.borderColor).toBe('#ffffff');
    expect(theme.styles?.scroll?.padding).toBe(8);
  });

  it('keeps additive slider and button states visually distinct', () => {
    expect(additiveTheme.colors.sliderTrack).not.toBe(
      additiveTheme.colors.primary
    );
    const surface = additiveTheme.colors.surface;
    const text = additiveTheme.colors.primaryText;
    const normal = additiveTheme.styles?.button?.backgroundColor as string;
    const hover = additiveTheme.styles?.button?.[':hover']
      ?.backgroundColor as string;
    const active = additiveTheme.styles?.button?.[':active']
      ?.backgroundColor as string;

    const normalContrast = contrastRatio(normal, surface);
    const hoverContrast = contrastRatio(hover, surface);
    const activeContrast = contrastRatio(active, surface);
    expect(normalContrast).toBeGreaterThanOrEqual(MINIMUM_STATE_CONTRAST_RATIO);
    expect(hoverContrast).toBeGreaterThan(normalContrast);
    expect(activeContrast).toBeGreaterThan(hoverContrast);
    expect(contrastRatio(active, text)).toBeGreaterThanOrEqual(
      MINIMUM_TEXT_CONTRAST_RATIO
    );
  });
});

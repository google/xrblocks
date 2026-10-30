import {describe, expect, it} from 'vitest';

import {colorfulTheme, glimmerOpaqueTheme, uiThemePresets} from './UITheme';
import {parseColorWithAlpha} from './utils/ColorUtils';

// WCAG 1.4.11 asks 3:1 for the parts that show a control's state.
const MINIMUM_NON_TEXT_CONTRAST_RATIO = 3;
const RED_LUMINANCE_WEIGHT = 0.2126;
const GREEN_LUMINANCE_WEIGHT = 0.7152;
const BLUE_LUMINANCE_WEIGHT = 0.0722;
const CONTRAST_LUMINANCE_OFFSET = 0.05;

// parseColorWithAlpha returns linear channels, so they weight directly.
function relativeLuminance(value: string): number {
  const {color} = parseColorWithAlpha(value);
  return (
    color.r * RED_LUMINANCE_WEIGHT +
    color.g * GREEN_LUMINANCE_WEIGHT +
    color.b * BLUE_LUMINANCE_WEIGHT
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

const presetsWithSliderTrack = Object.entries(uiThemePresets).filter(
  ([, theme]) => theme.colors.sliderTrack !== undefined
);

describe('UI theme presets', () => {
  it('give colorful and glimmerOpaque a slider track instead of the outline', () => {
    expect(colorfulTheme.colors.sliderTrack).toBeDefined();
    expect(glimmerOpaqueTheme.colors.sliderTrack).toBeDefined();
  });

  it.each(presetsWithSliderTrack)(
    '%s keeps its slider track at 3:1 against the off thumb and the card',
    (_name, {colors}) => {
      const track = colors.sliderTrack!;
      expect(contrastRatio(colors.text, track)).toBeGreaterThanOrEqual(
        MINIMUM_NON_TEXT_CONTRAST_RATIO
      );
      // Card surfaces in these presets are near-opaque, so alpha is ignored.
      expect(contrastRatio(track, colors.surface)).toBeGreaterThanOrEqual(
        MINIMUM_NON_TEXT_CONTRAST_RATIO
      );
    }
  );
});

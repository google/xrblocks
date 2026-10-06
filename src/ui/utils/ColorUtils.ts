import * as THREE from 'three';

/**
 * Parses a THREE.ColorRepresentation into a THREE.Color and an opacity value.
 * Supports:
 * - Hex strings (#RRGGBB, #RRGGBBAA, #RGB, #RGBA).
 * - rgb() and rgba() CSS strings.
 * - CSS Color Names ('white', 'red', 'aliceblue') natively via THREE.Color.
 * @param value - The color representation to parse.
 * @returns An object containing the parsed THREE.Color and opacity float (0 to 1).
 */
export function parseColorWithAlpha(
  value: THREE.ColorRepresentation | undefined
): {
  color: THREE.Color;
  opacity: number;
} {
  const result = {color: new THREE.Color(0xffffff), opacity: 1.0};
  if (value === undefined) return result;

  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'transparent') {
      result.color.set(0x000000);
      result.opacity = 0;
      return result;
    }
    // 1. Match rgb() or rgba() formats (e.g., rgba(255, 0, 0, 0.5)).
    const rgbaMatch = value.match(
      /rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+))?\s*\)/
    );
    if (rgbaMatch) {
      result.color.setRGB(
        parseFloat(rgbaMatch[1]) / 255,
        parseFloat(rgbaMatch[2]) / 255,
        parseFloat(rgbaMatch[3]) / 255
      );
      if (rgbaMatch[4] !== undefined) {
        result.opacity = parseFloat(rgbaMatch[4]);
      }
      return result;
    }

    // 2. Match Hex formats with alpha (#RRGGBBAA or #RGBA).
    if (value.startsWith('#') && (value.length === 9 || value.length === 5)) {
      const hex = value.slice(1);
      const isShort = hex.length === 4;
      const maxVal = isShort ? 15 : 255;

      const colorHex = '#' + hex.slice(0, hex.length - (isShort ? 1 : 2));
      const alphaHex = hex.slice(hex.length - (isShort ? 1 : 2));

      result.color.set(colorHex);
      result.opacity = parseInt(alphaHex, 16) / maxVal;
      return result;
    }
  }

  // 3. Fallback: Parse standard 3/6-digit Hex, CSS names, or numbers.
  result.color.set(value as THREE.ColorRepresentation);
  return result;
}

const ALPHA_HEX_REGEX = /^#(?:[\da-f]{4}|[\da-f]{8})$/iu;

/**
 * Normalizes CSS hex colors that carry an alpha nibble/byte (`#RGBA`, `#RRGGBBAA`)
 * into `rgba(r, g, b, a)` strings, because `THREE.Color` cannot parse alpha hex:
 * consumers that delegate to it (e.g. `@pmndrs/uikit`'s color writer) silently
 * fall back to white. The emitted channels are the parsed color's working-space
 * (linearized) components, matching what {@link parseColorWithAlpha}'s hex
 * branch feeds shader uniforms, so both the `GradientPanel` and uikit
 * `Container` paths render the exact CSS color. Values that are not alpha-hex
 * strings pass through unchanged.
 *
 * @param value - The color value to normalize.
 * @returns The normalized `rgba()` string, or the original value.
 */
export function normalizeAlphaHexColor<T>(value: T): T {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!ALPHA_HEX_REGEX.test(trimmed)) return value;
  const {color, opacity} = parseColorWithAlpha(trimmed);
  const channel = (component: number) =>
    Math.round(component * 255 * 10000) / 10000;
  const alpha = Math.round(opacity * 10000) / 10000;
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${alpha})` as T;
}

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
        parseFloat(rgbaMatch[3]) / 255,
        THREE.SRGBColorSpace
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
type LinearRGBA = [number, number, number, number];

/**
 * Normalizes CSS hex colors that carry an alpha nibble/byte (`#RGBA`, `#RRGGBBAA`)
 * into linear RGBA tuples for UIKit. UIKit's `writeColor` treats CSS `rgba()`
 * channels as already-linear, so passing sRGB channel values makes translucent
 * colors appear too light. Values that are not alpha-hex strings pass through
 * unchanged. Keep alpha-hex strings intact for `GradientPanel`, which parses
 * CSS colors itself and performs the sRGB-to-linear conversion.
 *
 * @param value - The color value to normalize.
 * @returns A linear RGBA tuple for alpha-hex strings, or the original value.
 */
export function normalizeAlphaHexColor<T>(
  value: T
): T | (T extends string ? LinearRGBA : never) {
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!ALPHA_HEX_REGEX.test(trimmed)) return value as T;
  const {color, opacity} = parseColorWithAlpha(trimmed);
  return [color.r, color.g, color.b, opacity] as T extends string
    ? LinearRGBA
    : never;
}

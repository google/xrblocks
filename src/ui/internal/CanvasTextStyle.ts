import * as THREE from 'three';

import {DEFAULT_TEXT_LINE_HEIGHT} from './UIContentDefaults';

/**
 * Font stack shared by every canvas-rendered UI text.
 *
 * It resolves to the host operating system's UI face, so the platform's own
 * fallback chain covers every script the device can display instead of a single
 * bundled typeface that would draw missing-glyph boxes.
 */
export const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Weight keywords accepted by the canvas text helpers. */
export type CanvasFontWeight = number | 'normal' | 'medium' | 'bold';

const NORMAL_FONT_WEIGHT = 400;
const MEDIUM_FONT_WEIGHT = 500;
const BOLD_FONT_WEIGHT = 700;

/** Largest canvas edge we allocate, which every WebGL 2 device supports. */
const MAX_CANVAS_DIMENSION = 4096;
/**
 * Samples per device pixel. Text is magnified by the headset optics, so one
 * device pixel per layout pixel leaves visible stair-stepping on glyph edges.
 */
const CANVAS_SUPERSAMPLING = 2;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

/** Maps the CSS-like weight keywords onto numeric CSS font weights. */
export function resolveFontWeight(value: CanvasFontWeight | undefined): number {
  if (typeof value === 'number') return value;
  if (value === 'bold') return BOLD_FONT_WEIGHT;
  if (value === 'medium') return MEDIUM_FONT_WEIGHT;
  return NORMAL_FONT_WEIGHT;
}

/** Builds a CSS `font` shorthand for a canvas context or a DOM mirror. */
export function fontShorthand(
  fontSize: number,
  weight?: CanvasFontWeight
): string {
  return `${resolveFontWeight(weight)} ${fontSize}px ${SYSTEM_FONT_STACK}`;
}

/** Converts a Three.js color representation into a CSS color string. */
export function cssColor(color: THREE.ColorRepresentation): string {
  if (typeof color === 'string') return color;
  return `#${new THREE.Color(color).getHexString()}`;
}

/**
 * Resolves a CSS-like line height into layout units. Bare numbers are a
 * multiple of the font size, matching CSS.
 */
export function resolveLineHeight(
  value: number | `${number}px` | `${number}%` | undefined,
  fontSize: number
): number {
  if (typeof value === 'number') return value * fontSize;
  if (typeof value === 'string' && value.endsWith('px')) {
    return Number.parseFloat(value);
  }
  if (typeof value === 'string' && value.endsWith('%')) {
    return (Number.parseFloat(value) / 100) * fontSize;
  }
  return fontSize * DEFAULT_TEXT_LINE_HEIGHT;
}

/** Splits text into user-perceived characters, never inside a grapheme. */
export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), ({segment}) => segment);
}

/** Splits text into graphemes carrying their UTF-16 start index. */
export function graphemeSegments(
  text: string
): Array<{segment: string; index: number}> {
  return Array.from(graphemeSegmenter.segment(text), ({segment, index}) => ({
    segment,
    index,
  }));
}

/**
 * Supersampling factor for a canvas covering `width` by `height` layout units,
 * capped so the backing texture stays within {@link MAX_CANVAS_DIMENSION}.
 */
export function resolveRasterScale(width: number, height: number): number {
  return Math.max(
    Number.EPSILON,
    Math.min(
      (globalThis.devicePixelRatio || 1) * CANVAS_SUPERSAMPLING,
      MAX_CANVAS_DIMENSION / width,
      MAX_CANVAS_DIMENSION / height
    )
  );
}

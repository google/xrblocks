/**
 * Minimal ambient declarations for the bundled `troika-three-text` dependency.
 *
 * `troika-three-text@0.52.5` ships `.d.ts` files under `dist/types/` but its
 * `package.json` declares neither `types` nor `exports`, so TypeScript cannot
 * resolve them and the import falls back to an implicit `any`. Only the members
 * used by `src/ui/internal/EditableText.ts` are declared here, and each one was
 * verified against the installed sources (`src/Text.js`, `src/Typesetter.js`,
 * `src/TextBuilder.js`, `src/selectionUtils.js`).
 */
declare module 'troika-three-text' {
  import {
    Mesh,
    type BufferGeometry,
    type ColorRepresentation,
    type Material,
    type Texture,
  } from 'three';

  /**
   * Layout result produced by an asynchronous `Text.sync()` call. The object is
   * frozen by the text builder, so it is safe to treat as an immutable
   * snapshot.
   */
  export interface TroikaTextRenderInfo {
    /** SDF atlas texture backing the glyphs of this snapshot. */
    readonly sdfTexture: Texture;
    /**
     * `[startX, endX, bottomY, topY]` per UTF-16 code unit of the synced
     * string. Astral characters and ligatures have their advance split evenly
     * across the code units they cover.
     */
    readonly caretPositions?: Float32Array;
    /** `[minX, minY, maxX, maxY]` of the whole text block. */
    readonly blockBounds: readonly number[];
    /** `[minX, minY, maxX, maxY]` tightly wrapped around visible glyphs. */
    readonly visibleBounds: readonly number[];
    /** Final computed line height in local units. */
    readonly lineHeight: number;
    /** Y position of the first line's baseline. */
    readonly topBaseline: number;
    /** Font ascender metric scaled to `fontSize`. */
    readonly ascender: number;
    /** Font descender metric scaled to `fontSize`. */
    readonly descender: number;
  }

  /** Caret returned by `getCaretAtPoint`. */
  export interface TroikaTextCaret {
    readonly x: number;
    readonly y: number;
    readonly height: number;
    readonly charIndex: number;
  }

  /** Rectangle returned by `getSelectionRects`. */
  export interface TroikaSelectionRect {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
  }

  /** SDF text mesh. */
  export class Text extends Mesh<BufferGeometry, Material> {
    text: string;
    font: string | null;
    fontSize: number;
    fontWeight: number | 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    lineHeight: number | 'normal';
    letterSpacing: number;
    maxWidth: number;
    overflowWrap: 'normal' | 'break-word';
    whiteSpace: 'normal' | 'nowrap';
    textAlign: 'left' | 'right' | 'center' | 'justify';
    direction: 'auto' | 'ltr' | 'rtl';
    anchorX: number | string;
    anchorY: number | string;
    color: ColorRepresentation | null;
    fillOpacity: number;
    depthOffset: number;
    /**
     * `[minX, minY, maxX, maxY]` in text-local units; pixels outside are
     * discarded.
     */
    clipRect: readonly number[] | null;
    /** Read-only snapshot of the most recently completed layout. */
    readonly textRenderInfo: TroikaTextRenderInfo | null;
    /**
     * Starts an asynchronous layout when a syncable property changed. The
     * callback only runs when a layout was actually needed.
     */
    sync(callback?: () => void): void;
    /** Disposes the glyph geometry owned by this instance. */
    dispose(): void;
  }

  /** Finds the nearest caret for a point in the text block plane. */
  export function getCaretAtPoint(
    textRenderInfo: TroikaTextRenderInfo,
    x: number,
    y: number
  ): TroikaTextCaret | null;

  /** Returns rectangles covering the characters in the range `[start, end)`. */
  export function getSelectionRects(
    textRenderInfo: TroikaTextRenderInfo,
    start: number,
    end: number
  ): TroikaSelectionRect[] | null;
}

import {Container, Content, type BoundingBox} from '@pmndrs/uikit';
import {effect, signal} from '@preact/signals-core';
import * as THREE from 'three';

import type {SemanticScrollState} from '../../interaction/SemanticControl';
import {
  cssColor,
  fontShorthand,
  resolveRasterScale,
  type CanvasFontWeight,
} from './CanvasTextStyle';
import {
  buildEditableTextLayout,
  caretGeometry,
  caretIndexAtPoint,
  DomTextMeasurer,
  measureFontMetrics,
  selectionRects,
  type EditableTextLayout,
  type EditableTextMeasurer,
  type EditableTextStyle,
  type TextAlign,
  type TextRect,
} from './EditableTextLayout';
import {
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT,
} from './UIContentDefaults';

/** Direction of a selection, matching `HTMLInputElement.selectionDirection`. */
export type EditableTextSelectionDirection = 'forward' | 'backward' | 'none';

/** Keys whose behavior depends on the rendered line geometry. */
export type EditableTextNavigationKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End';

/** Selection range expressed in UTF-16 code units of the source value. */
export interface EditableTextSelection {
  readonly start: number;
  readonly end: number;
  readonly direction: EditableTextSelectionDirection;
}

/** Failure surfaced while preparing or rendering the text. */
export interface EditableTextFailure {
  /**
   * `context-unavailable` means the document refused a 2D canvas or a
   * measurement mirror, so no text can be drawn at all. `layout-failed` means
   * a measurement or paint pass threw.
   */
  readonly kind: 'context-unavailable' | 'layout-failed';
  readonly message: string;
  readonly cause?: unknown;
}

/** Presentation state pushed by the owner on every change. */
export interface EditableTextState {
  /** Authoritative value; the native input/textarea remains the source. */
  readonly text: string;
  /** Shown when `text` is empty. */
  readonly placeholder?: string;
  /** Wraps and scrolls vertically when true, scrolls horizontally otherwise. */
  readonly multiline?: boolean;
  readonly focused?: boolean;
  /** Lets the owner blink the caret without relaying out glyphs. */
  readonly caretVisible?: boolean;
  readonly selectionStart?: number;
  readonly selectionEnd?: number;
  readonly selectionDirection?: EditableTextSelectionDirection;
  /** Font size in UIkit layout units. */
  readonly fontSize?: number;
  /** Line height as a multiple of `fontSize`. */
  readonly lineHeight?: number;
  readonly fontWeight?: CanvasFontWeight;
  readonly textAlign?: TextAlign;
  readonly direction?: 'auto' | 'ltr' | 'rtl';
  readonly color?: THREE.ColorRepresentation;
  readonly placeholderColor?: THREE.ColorRepresentation;
  readonly caretColor?: THREE.ColorRepresentation;
  readonly selectionColor?: THREE.ColorRepresentation;
  readonly selectionOpacity?: number;
  /** Caret width in UIkit layout units. */
  readonly caretWidth?: number;
  readonly opacity?: number;
  readonly depthTest?: boolean;
  /** Polygon offset applied to the text meshes to avoid z-fighting with the shell. */
  readonly depthOffset?: number;
  readonly renderOrder?: number;
}

/** Construction options for {@link EditableText}. */
export interface EditableTextOptions {
  /** Receives canvas, measurement, and paint failures instead of swallowing them. */
  readonly onError?: (failure: EditableTextFailure) => void;
  /** Runs after every layout that becomes the active one. */
  readonly onLayout?: () => void;
  /** Inner padding in UIkit layout units. */
  readonly padding?: number;
  /** Replaces the DOM measurement mirror; only tests should supply this. */
  readonly measurer?: EditableTextMeasurer;
}

interface ResolvedState {
  text: string;
  placeholder: string;
  multiline: boolean;
  focused: boolean;
  caretVisible: boolean;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: EditableTextSelectionDirection;
  fontSize: number;
  lineHeight: number;
  fontWeight: CanvasFontWeight;
  textAlign: TextAlign;
  direction: 'auto' | 'ltr' | 'rtl';
  color: THREE.ColorRepresentation;
  placeholderColor: THREE.ColorRepresentation;
  caretColor: THREE.ColorRepresentation;
  selectionColor: THREE.ColorRepresentation;
  selectionOpacity: number;
  caretWidth: number;
  opacity: number;
  depthTest: boolean;
  depthOffset: number;
  renderOrder: number;
}

interface Quad {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

const DEFAULT_CARET_WIDTH = 2;
const DEFAULT_SELECTION_OPACITY = 0.4;
const DEFAULT_TEXT_COLOR = '#ffffff';
const DEFAULT_PLACEHOLDER_COLOR = '#888888';
const DEFAULT_SELECTION_COLOR = '#3b82f6';
const VERTICES_PER_QUAD = 6;
const POSITION_COMPONENTS = 3;
const COLOR_COMPONENTS = 4;
const INITIAL_QUAD_CAPACITY = 4;
const QUAD_CAPACITY_GROWTH_FACTOR = 2;
/** Keeps the selection behind and the caret in front of the glyph plane. */
const SELECTION_Z = -0.0002;
const CARET_Z = 0.0002;
const ZERO_INSET: readonly [number, number, number, number] = [0, 0, 0, 0];
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

/**
 * Canvas presentation for one editable text field.
 *
 * The class owns a private UIkit `Content` mounted inside a caller-provided
 * viewport `Container`, one textured plane carrying the glyphs, and two dynamic
 * meshes for the selection and the caret. It never mutates the value: the
 * native DOM input remains authoritative and pushes immutable state through
 * {@link update}.
 *
 * Glyphs are drawn with the platform's own text stack, so every script, emoji,
 * and font fallback the device supports renders without downloading a typeface
 * or running a worker. Line breaking, shaping, and bidi reordering come from a
 * hidden measurement mirror, and the paint walks exactly the pieces that mirror
 * reported, so the caret, the selection, and the glyphs always agree.
 *
 * Coordinates: the `Content` bounding box is published in UIkit layout units,
 * so every child of it is authored in layout units and scaled to meters by the
 * inherited `pixelSize` (0.001 for a default `UICard`, not 0.01). World points
 * are mapped through the component matrices, so moved, scaled, and rotated
 * cards work without any extra bookkeeping.
 */
export class EditableText {
  /** Private UIkit component hosting the Three.js text content. */
  readonly content: Content;
  /** Vertical scroll state shaped for `SemanticScrollState`. */
  readonly scroll: SemanticScrollState;

  private readonly group = new THREE.Group();
  private readonly canvas?: HTMLCanvasElement;
  private readonly context?: CanvasRenderingContext2D;
  private readonly texture?: THREE.CanvasTexture;
  private readonly glyphs: THREE.Mesh;
  private readonly selection = createQuadMesh('EditableTextSelection');
  private readonly caret = createQuadMesh('EditableTextCaret');
  private readonly measurer?: EditableTextMeasurer;
  private readonly boundingBox = signal<BoundingBox | undefined>({
    size: new THREE.Vector3(1, 1, 1),
    center: new THREE.Vector3(),
  });
  private readonly stopLayoutEffect: () => void;

  private state?: ResolvedState;
  /** Layout of the value, used for carets, hit testing, and navigation. */
  private layout?: EditableTextLayout;
  /** Layout that is painted, which is the placeholder while the value is empty. */
  private painted?: EditableTextLayout;
  private failure?: EditableTextFailure;
  private disposed = false;

  private width = 0;
  private height = 0;
  private insets: readonly [number, number, number, number] = ZERO_INSET;
  private innerWidth = 0;
  private innerHeight = 0;
  private scrollX = 0;
  private scrollY = 0;
  private goalX?: number;
  private navigated?: EditableTextSelection;
  private layoutKey = '';
  private paintKey = '';
  private revealKey = '';
  private appearanceKey = '';

  constructor(
    viewport: Container,
    private readonly options: EditableTextOptions = {}
  ) {
    this.content = new Content(
      {
        width: '100%',
        height: '100%',
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
        minHeight: 0,
        padding: options.padding ?? 0,
        keepAspectRatio: false,
        depthAlign: 'center',
        // Forces the per-mesh tint applied by Content to white so the caret,
        // selection, and glyph colors survive untinted.
        color: '#ffffff',
        depthWrite: false,
      },
      undefined,
      {boundingBox: this.boundingBox}
    );
    const surface = createGlyphSurface();
    this.glyphs = surface.mesh;
    this.canvas = surface.canvas;
    this.context = surface.context;
    this.texture = surface.texture;
    this.group.add(this.selection.mesh, this.glyphs, this.caret.mesh);
    this.content.add(this.group);
    // Applies the Content child matrices and its own material pass without
    // waiting for the debounced `childadded` notification.
    this.content.notifyAncestorsChanged();
    // Content only recognizes meshes created against its own Three.js module,
    // so the viewport clip is bound here as well. The planes array is owned by
    // Content and stays valid for its lifetime.
    for (const material of this.materials()) {
      material.clippingPlanes = this.content.clippingPlanes;
      material.transparent = true;
      material.needsUpdate = true;
    }
    viewport.add(this.content);
    this.stopLayoutEffect = effect(() => {
      const size = this.content.size.value;
      const padding = this.content.paddingInset.value;
      const border = this.content.borderInset.value;
      this.applySize(size?.[0] ?? 0, size?.[1] ?? 0, padding, border);
    });
    this.scroll = {
      getOffset: () => this.scrollY,
      getViewportHeight: () => this.innerHeight,
      projectPoint: (point) => this.projectPoint(point),
      scrollBy: (delta) => this.scrollBy(delta),
    };
    if (surface.context == null) {
      this.fail({
        kind: 'context-unavailable',
        message:
          'A 2D canvas is required to draw editable text; this document refused one.',
      });
      return;
    }
    try {
      this.measurer = options.measurer ?? new DomTextMeasurer();
    } catch (cause) {
      this.fail({
        kind: 'context-unavailable',
        message: 'Editable text could not create its measurement element.',
        cause,
      });
    }
  }

  /**
   * True when an active layout describes the current value, so indices from
   * pointer hits and keyboard navigation are safe to use.
   */
  get isReady(): boolean {
    return (
      !this.disposed &&
      this.layout != null &&
      this.state != null &&
      this.layout.text === this.state.text
    );
  }

  /** Alias of {@link isReady} for call sites that read like a signal. */
  get ready(): boolean {
    return this.isReady;
  }

  /** Last unresolved failure, or `undefined` once a layout succeeds again. */
  get error(): EditableTextFailure | undefined {
    return this.failure;
  }

  /** Horizontal scroll offset in layout units. */
  get offsetX(): number {
    return this.scrollX;
  }

  /** Vertical scroll offset in layout units. */
  get offsetY(): number {
    return this.scrollY;
  }

  /** Height of the laid out text in layout units. */
  get scrollHeight(): number {
    return this.painted?.height ?? 0;
  }

  /** Largest vertical offset {@link scrollBy} can reach. */
  get maxScrollTop(): number {
    return this.maxScrollY();
  }

  /**
   * Pushes the authoritative state. Object identity is preserved across calls,
   * and updates that only change selection, focus, or colors never repeat the
   * text measurement.
   */
  update(state: EditableTextState): void {
    if (this.disposed) return;
    const resolved = resolveState(state);
    const previous = this.state;
    this.state = resolved;
    if (
      previous == null ||
      previous.selectionStart !== resolved.selectionStart ||
      previous.selectionEnd !== resolved.selectionEnd
    ) {
      if (!matchesSelection(this.navigated, resolved)) this.goalX = undefined;
    }
    this.navigated = undefined;
    this.applyAppearance(resolved);
    this.relayout();
    this.refresh();
  }

  /**
   * Recomputes the presentation against the latest UIkit layout. Safe to call
   * every frame; measurement and painting are keyed, so an unchanged field does
   * no work beyond comparing those keys.
   */
  afterLayout(): void {
    if (this.disposed) return;
    const size = this.content.size.peek();
    this.applySize(
      size?.[0] ?? 0,
      size?.[1] ?? 0,
      this.content.paddingInset.peek(),
      this.content.borderInset.peek()
    );
  }

  /**
   * Maps a world point to the nearest caret index, honoring wrapped lines and
   * grapheme boundaries. Returns `undefined` when no current layout describes
   * the value, so stale geometry can never produce an index for it.
   */
  caretAtPoint(worldPoint: THREE.Vector3): number | undefined {
    const layout = this.activeLayout();
    if (layout == null) return undefined;
    if (layout.text.length === 0) return 0;
    const local = this.toTextCoords(worldPoint);
    if (local == null) return undefined;
    return caretIndexAtPoint(layout, local.x, local.y);
  }

  /**
   * Resolves a geometry-driven caret move. Wrapped lines are walked through the
   * rendered rows rather than by counting newlines, so soft wraps behave like a
   * native textarea. Returns `undefined` when no layout is current, which lets
   * the owner fall back to the browser's own handling.
   *
   * The result is advisory: apply it to the native element and push the new
   * state back through {@link update}. Doing that also preserves the goal
   * column for a following vertical move.
   */
  navigate(
    key: EditableTextNavigationKey,
    options: {extend?: boolean} = {}
  ): EditableTextSelection | undefined {
    const layout = this.activeLayout();
    const state = this.state;
    if (layout == null || state == null) return undefined;
    if (layout.text.length === 0) {
      const collapsed = {start: 0, end: 0, direction: 'none'} as const;
      this.navigated = collapsed;
      return collapsed;
    }
    const extend = options.extend === true;
    const focus = focusIndex(state, key, extend);
    const anchor =
      focus === state.selectionStart
        ? state.selectionEnd
        : state.selectionStart;
    const geometry = caretGeometry(layout, clampIndex(layout.text, focus));
    if (geometry == null) return undefined;

    let target: number;
    if (key === 'Home' || key === 'End') {
      this.goalX = undefined;
      const line = layout.lines[geometry.line];
      target = key === 'Home' ? line.start : line.end;
    } else {
      const goalX = this.goalX ?? geometry.x;
      this.goalX = goalX;
      const next = geometry.line + (key === 'ArrowUp' ? -1 : 1);
      if (next < 0) {
        target = 0;
      } else if (next >= layout.lines.length) {
        target = layout.text.length;
      } else {
        const carets = layout.lines[next].carets;
        let closest = carets[0];
        for (const caret of carets) {
          if (Math.abs(goalX - caret.x) < Math.abs(goalX - closest.x)) {
            closest = caret;
          }
        }
        target = closest.index;
      }
    }
    target = clampIndex(layout.text, target);
    const result: EditableTextSelection = extend
      ? {
          start: Math.min(anchor, target),
          end: Math.max(anchor, target),
          direction: target < anchor ? 'backward' : 'forward',
        }
      : {start: target, end: target, direction: 'none'};
    this.navigated = result;
    return result;
  }

  /** Maps a world point to viewport pixels, as `SemanticScrollState` expects. */
  projectPoint(point: THREE.Vector3): THREE.Vector2 | undefined {
    const local = this.toInnerPoint(point);
    if (local == null) return undefined;
    return new THREE.Vector2(local.x, local.y);
  }

  /** Scrolls vertically by `delta` layout units; returns true when it moved. */
  scrollBy(delta: number): boolean {
    const next = clamp(this.scrollY + delta, 0, this.maxScrollY());
    if (next === this.scrollY) return false;
    this.scrollY = next;
    this.refresh();
    return true;
  }

  /** Scrolls horizontally by `delta` layout units; returns true when it moved. */
  scrollHorizontallyBy(delta: number): boolean {
    const next = clamp(this.scrollX + delta, 0, this.maxScrollX());
    if (next === this.scrollX) return false;
    this.scrollX = next;
    this.refresh();
    return true;
  }

  /** Releases everything this instance owns, including the hidden mirror. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLayoutEffect();
    this.measurer?.dispose();
    this.group.clear();
    this.group.removeFromParent();
    this.glyphs.removeFromParent();
    this.glyphs.geometry.dispose();
    (this.glyphs.material as THREE.Material).dispose();
    this.texture?.dispose();
    this.selection.dispose();
    this.caret.dispose();
    this.content.removeFromParent();
    this.content.dispose();
  }

  private activeLayout(): EditableTextLayout | undefined {
    return this.isReady ? this.layout : undefined;
  }

  private applySize(
    width: number,
    height: number,
    padding: readonly number[] | undefined,
    border: readonly number[] | undefined
  ): void {
    const insets: [number, number, number, number] = [
      (padding?.[0] ?? 0) + (border?.[0] ?? 0),
      (padding?.[1] ?? 0) + (border?.[1] ?? 0),
      (padding?.[2] ?? 0) + (border?.[2] ?? 0),
      (padding?.[3] ?? 0) + (border?.[3] ?? 0),
    ];
    const innerWidth = Math.max(0, width - insets[1] - insets[3]);
    const innerHeight = Math.max(0, height - insets[0] - insets[2]);
    if (
      this.width === width &&
      this.height === height &&
      this.innerWidth === innerWidth &&
      this.innerHeight === innerHeight &&
      this.insets.every((inset, index) => inset === insets[index])
    ) {
      return;
    }
    this.width = width;
    this.height = height;
    this.insets = insets;
    this.innerWidth = innerWidth;
    this.innerHeight = innerHeight;
    this.boundingBox.value = {
      size: new THREE.Vector3(
        Math.max(innerWidth, Number.EPSILON),
        Math.max(innerHeight, Number.EPSILON),
        1
      ),
      center: new THREE.Vector3(),
    };
    if (this.state == null) return;
    this.revealKey = '';
    this.relayout();
    this.refresh();
  }

  /** Re-measures the text when anything that moves a character has changed. */
  private relayout(): void {
    const state = this.state;
    const measurer = this.measurer;
    const context = this.context;
    if (state == null || measurer == null || context == null) return;
    if (!(this.innerWidth > 0) || !(this.innerHeight > 0)) return;
    const style = layoutStyle(state, this.innerWidth);
    const placeholder = placeholderVisible(state);
    const key = [
      state.text,
      placeholder ? state.placeholder : '',
      style.fontSize,
      style.fontWeight,
      style.lineHeight,
      style.textAlign,
      style.direction,
      style.multiline,
      style.width,
    ].join('\u0000');
    if (key === this.layoutKey) return;
    let layout: EditableTextLayout;
    let painted: EditableTextLayout;
    try {
      context.font = fontShorthand(style.fontSize, style.fontWeight);
      context.fontKerning = 'normal';
      const metrics = measureFontMetrics(context, style.fontSize);
      layout = buildEditableTextLayout(
        state.text,
        style,
        measurer.measure(state.text, style),
        metrics
      );
      painted = placeholder
        ? buildEditableTextLayout(
            state.placeholder,
            style,
            measurer.measure(state.placeholder, style),
            metrics
          )
        : layout;
    } catch (cause) {
      // A partial layout would let stale geometry answer for the new value, so
      // everything is dropped and the field reports itself as not ready.
      this.fail({
        kind: 'layout-failed',
        message: 'Editable text could not measure its value.',
        cause,
      });
      return;
    }
    this.layout = layout;
    this.painted = painted;
    this.layoutKey = key;
    this.paintKey = '';
    this.revealKey = '';
    this.failure = undefined;
    this.options.onLayout?.();
  }

  private applyAppearance(state: ResolvedState): void {
    for (const material of this.materials()) {
      material.opacity = state.opacity;
      material.depthTest = state.depthTest;
      material.depthWrite = false;
      // Applied to all three meshes together, so the selection stays behind the
      // glyphs and the caret stays in front of them.
      material.polygonOffset = state.depthOffset !== 0;
      material.polygonOffsetFactor = state.depthOffset;
      material.polygonOffsetUnits = state.depthOffset;
    }
    for (const mesh of [this.selection.mesh, this.glyphs, this.caret.mesh]) {
      mesh.renderOrder = state.renderOrder;
    }
    const key = `${state.opacity}|${state.depthTest}|${state.renderOrder}`;
    if (key === this.appearanceKey) return;
    this.appearanceKey = key;
    this.content.setProperties({
      opacity: state.opacity,
      depthTest: state.depthTest,
      renderOrder: state.renderOrder,
    });
  }

  /** Materials owned by this presentation. */
  private materials(): THREE.Material[] {
    return [
      this.glyphs.material as THREE.Material,
      this.selection.mesh.material as THREE.Material,
      this.caret.mesh.material as THREE.Material,
    ];
  }

  /**
   * Repositions the scrolled geometry and rebuilds the caret and selection
   * quads from the active layout.
   */
  private refresh(): void {
    const state = this.state;
    if (state == null) return;
    const currentLayout = this.activeLayout();
    this.scrollX = clamp(this.scrollX, 0, this.maxScrollX());
    this.scrollY = clamp(this.scrollY, 0, this.maxScrollY());
    if (currentLayout != null) this.reveal(state, currentLayout);
    this.group.position.set(
      -this.innerWidth / 2 - this.scrollX,
      this.innerHeight / 2 + this.scrollY,
      0
    );
    this.group.updateMatrix();
    // The glyph plane covers the viewport itself, so it cancels the scroll the
    // group applies and the canvas carries the offset instead.
    this.glyphs.position.set(
      this.scrollX + this.innerWidth / 2,
      -this.scrollY - this.innerHeight / 2,
      0
    );
    this.glyphs.scale.set(
      Math.max(this.innerWidth, Number.EPSILON),
      Math.max(this.innerHeight, Number.EPSILON),
      1
    );
    this.glyphs.updateMatrix();
    this.paint();
    const clip = this.clipRect();
    const layout = this.activeLayout();
    if (layout == null) {
      this.content.root.peek().requestRender?.();
      return;
    }

    const quads: Quad[] = [];
    if (layout.text.length > 0 && state.selectionEnd > state.selectionStart) {
      for (const rect of selectionRects(
        layout,
        state.selectionStart,
        state.selectionEnd
      )) {
        const quad = clipQuad(rect, clip);
        if (quad != null) quads.push(quad);
      }
    }
    this.selection.write(
      quads,
      new THREE.Color(state.selectionColor),
      state.selectionOpacity,
      SELECTION_Z
    );

    const caretQuads: Quad[] = [];
    if (state.focused && state.caretVisible) {
      const caret = this.caretQuad(state, layout, clip);
      if (caret != null) caretQuads.push(caret);
    }
    this.caret.write(caretQuads, new THREE.Color(state.caretColor), 1, CARET_Z);
    this.content.root.peek().requestRender?.();
  }

  /**
   * Draws the visible rows onto the viewport-sized canvas. Only the pieces the
   * measurement reported are painted, each at its measured position, so tabs
   * keep their advance without a glyph and every bidi run keeps its own
   * direction.
   */
  private paint(): void {
    const state = this.state;
    const layout = this.painted;
    const context = this.context;
    const canvas = this.canvas;
    const texture = this.texture;
    if (
      state == null ||
      layout == null ||
      context == null ||
      canvas == null ||
      texture == null
    ) {
      return;
    }
    const width = this.innerWidth;
    const height = this.innerHeight;
    if (!(width > 0) || !(height > 0)) return;
    const scale = resolveRasterScale(width, height);
    const color = cssColor(
      placeholderVisible(state) ? state.placeholderColor : state.color
    );
    const key = [
      this.layoutKey,
      this.scrollX,
      this.scrollY,
      width,
      height,
      scale,
      color,
    ].join('\u0000');
    if (key === this.paintKey) return;
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      // Forces Three.js to allocate matching GPU storage before the next upload.
      texture.dispose();
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.translate(-this.scrollX, -this.scrollY);
      context.font = fontShorthand(state.fontSize, state.fontWeight);
      context.fontKerning = 'normal';
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.fillStyle = color;
      for (const line of layout.lines) {
        // Text coordinates grow upwards; the canvas grows downwards.
        if (
          -line.bottom <= this.scrollY ||
          -line.top >= this.scrollY + height
        ) {
          continue;
        }
        for (const segment of line.segments) {
          context.direction = segment.rtl ? 'rtl' : 'ltr';
          context.fillText(
            layout.text.slice(segment.start, segment.end),
            segment.left,
            -line.baseline
          );
        }
      }
    } catch (cause) {
      this.fail({
        kind: 'layout-failed',
        message: 'Editable text could not draw its glyphs.',
        cause,
      });
      return;
    }
    texture.needsUpdate = true;
    this.paintKey = key;
    this.glyphs.visible = true;
  }

  private caretQuad(
    state: ResolvedState,
    layout: EditableTextLayout,
    clip: Quad
  ): Quad | undefined {
    const index =
      state.selectionDirection === 'backward'
        ? state.selectionStart
        : state.selectionEnd;
    const geometry = caretGeometry(layout, clampIndex(layout.text, index));
    if (geometry == null) return undefined;
    const line = layout.lines[geometry.line];
    let left = geometry.x - state.caretWidth / 2;
    let right = left + state.caretWidth;
    if (left < clip.left) {
      left = clip.left;
      right = left + state.caretWidth;
    } else if (right > clip.right) {
      right = clip.right;
      left = right - state.caretWidth;
    }
    return clipQuad({left, right, bottom: line.bottom, top: line.top}, clip);
  }

  private reveal(state: ResolvedState, layout: EditableTextLayout): void {
    if (!state.focused || this.innerWidth <= 0 || this.innerHeight <= 0) return;
    const index =
      state.selectionDirection === 'backward'
        ? state.selectionStart
        : state.selectionEnd;
    const key = `${this.layoutKey}\u0000${index}\u0000${this.innerWidth}x${this.innerHeight}`;
    if (key === this.revealKey) return;
    this.revealKey = key;
    const geometry = caretGeometry(layout, clampIndex(layout.text, index));
    if (geometry == null) return;
    const line = layout.lines[geometry.line];
    const pad = state.caretWidth;
    if (geometry.x - pad < this.scrollX) {
      this.scrollX = geometry.x - pad;
    } else if (geometry.x + pad > this.scrollX + this.innerWidth) {
      this.scrollX = geometry.x + pad - this.innerWidth;
    }
    this.scrollX = clamp(this.scrollX, 0, this.maxScrollX());
    if (line.top > -this.scrollY) {
      this.scrollY = -line.top;
    } else if (line.bottom < -this.innerHeight - this.scrollY) {
      this.scrollY = -this.innerHeight - line.bottom;
    }
    this.scrollY = clamp(this.scrollY, 0, this.maxScrollY());
  }

  private clipRect(): Quad {
    return {
      left: this.scrollX,
      right: this.scrollX + this.innerWidth,
      bottom: -this.innerHeight - this.scrollY,
      top: -this.scrollY,
    };
  }

  private maxScrollX(): number {
    if (this.state?.multiline !== false) return 0;
    const caretWidth = this.state?.caretWidth ?? DEFAULT_CARET_WIDTH;
    const width = this.painted?.width ?? 0;
    return Math.max(0, width + caretWidth - this.innerWidth);
  }

  private maxScrollY(): number {
    if (this.state?.multiline !== true) return 0;
    return Math.max(0, this.scrollHeight - this.innerHeight);
  }

  /** Maps a world point to pixels measured from the inner box's top-left. */
  private toInnerPoint(point: THREE.Vector3): THREE.Vector2 | undefined {
    if (this.width <= 0 || this.height <= 0) return undefined;
    this.content.updateWorldMatrix(true, false);
    const local = this.content.worldToLocal(point.clone());
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
      return undefined;
    }
    return new THREE.Vector2(
      (local.x + 0.5) * this.width - this.insets[3],
      (0.5 - local.y) * this.height - this.insets[0]
    );
  }

  /** Maps a world point to text coordinates, where y grows upwards from zero. */
  private toTextCoords(point: THREE.Vector3): THREE.Vector2 | undefined {
    const inner = this.toInnerPoint(point);
    if (inner == null) return undefined;
    return new THREE.Vector2(inner.x + this.scrollX, -inner.y - this.scrollY);
  }

  private fail(failure: EditableTextFailure): void {
    if (this.disposed) return;
    this.failure = failure;
    this.layout = undefined;
    this.painted = undefined;
    this.layoutKey = '';
    this.paintKey = '';
    this.revealKey = '';
    this.glyphs.visible = false;
    this.selection.mesh.visible = false;
    this.caret.mesh.visible = false;
    this.options.onError?.(failure);
  }
}

interface GlyphSurface {
  readonly mesh: THREE.Mesh;
  readonly canvas?: HTMLCanvasElement;
  readonly context?: CanvasRenderingContext2D;
  readonly texture?: THREE.CanvasTexture;
}

/**
 * Builds the textured plane the glyphs are painted onto. A document that cannot
 * provide a 2D context still yields a mesh, so the caller can report the
 * failure instead of leaving a half-constructed object behind.
 */
function createGlyphSurface(): GlyphSurface {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d') ?? undefined;
  const texture = context == null ? undefined : new THREE.CanvasTexture(canvas);
  if (texture != null) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'EditableTextGlyphs';
  mesh.frustumCulled = false;
  mesh.userData.color = new THREE.Color(0xffffff);
  return {mesh, canvas, context, texture};
}

interface QuadMesh {
  readonly mesh: THREE.Mesh;
  write(
    quads: readonly Quad[],
    color: THREE.Color,
    alpha: number,
    z: number
  ): void;
  dispose(): void;
}

function createQuadMesh(name: string): QuadMesh {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  // Content re-applies its own tint to every mesh it owns; white keeps the
  // per-quad vertex colors intact if that restore path ever runs.
  mesh.userData.color = new THREE.Color(0xffffff);
  let capacity = 0;
  let positions = new THREE.BufferAttribute(
    new Float32Array(0),
    POSITION_COMPONENTS
  );
  let colors = new THREE.BufferAttribute(new Float32Array(0), COLOR_COMPONENTS);

  const allocate = (quads: number) => {
    capacity = Math.max(
      INITIAL_QUAD_CAPACITY,
      quads * QUAD_CAPACITY_GROWTH_FACTOR
    );
    positions = new THREE.BufferAttribute(
      new Float32Array(capacity * VERTICES_PER_QUAD * POSITION_COMPONENTS),
      POSITION_COMPONENTS
    );
    colors = new THREE.BufferAttribute(
      new Float32Array(capacity * VERTICES_PER_QUAD * COLOR_COMPONENTS),
      COLOR_COMPONENTS
    );
    positions.setUsage(THREE.DynamicDrawUsage);
    colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('color', colors);
  };

  return {
    mesh,
    write(quads, color, alpha, z) {
      if (quads.length > capacity) allocate(quads.length);
      if (capacity === 0) {
        geometry.setDrawRange(0, 0);
        return;
      }
      let vertex = 0;
      for (const quad of quads) {
        for (const [cx, cy] of CORNERS) {
          const x = cx === 0 ? quad.left : quad.right;
          const y = cy === 0 ? quad.bottom : quad.top;
          positions.setXYZ(vertex, x, y, z);
          colors.setXYZW(vertex, color.r, color.g, color.b, alpha);
          vertex++;
        }
      }
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      geometry.setDrawRange(0, quads.length * VERTICES_PER_QUAD);
      mesh.visible = quads.length > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function resolveState(state: EditableTextState): ResolvedState {
  // Browsers already normalize `\r\n` in input values; repeating it keeps our
  // indices aligned even when a caller assembles the value itself.
  const text = state.text.replace(/\r\n?/g, '\n');
  const rawStart = clampIndex(text, state.selectionStart ?? 0);
  const rawEnd = clampIndex(text, state.selectionEnd ?? rawStart);
  return {
    text,
    placeholder: state.placeholder ?? '',
    multiline: state.multiline ?? false,
    focused: state.focused ?? false,
    caretVisible: state.caretVisible ?? true,
    selectionStart: Math.min(rawStart, rawEnd),
    selectionEnd: Math.max(rawStart, rawEnd),
    selectionDirection: state.selectionDirection ?? 'none',
    fontSize: state.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    lineHeight: state.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT,
    fontWeight: state.fontWeight ?? 'normal',
    textAlign: state.textAlign ?? 'left',
    direction: state.direction ?? 'auto',
    color: state.color ?? DEFAULT_TEXT_COLOR,
    placeholderColor: state.placeholderColor ?? DEFAULT_PLACEHOLDER_COLOR,
    caretColor: state.caretColor ?? state.color ?? DEFAULT_TEXT_COLOR,
    selectionColor: state.selectionColor ?? DEFAULT_SELECTION_COLOR,
    selectionOpacity: state.selectionOpacity ?? DEFAULT_SELECTION_OPACITY,
    caretWidth: state.caretWidth ?? DEFAULT_CARET_WIDTH,
    opacity: state.opacity ?? 1,
    depthTest: state.depthTest ?? true,
    depthOffset: state.depthOffset ?? 0,
    renderOrder: state.renderOrder ?? 0,
  };
}

function layoutStyle(state: ResolvedState, width: number): EditableTextStyle {
  return {
    fontSize: state.fontSize,
    fontWeight: state.fontWeight,
    lineHeight:
      state.lineHeight > 0
        ? state.fontSize * state.lineHeight
        : state.fontSize * DEFAULT_TEXT_LINE_HEIGHT,
    textAlign: state.textAlign,
    direction: state.direction,
    multiline: state.multiline,
    width,
  };
}

function placeholderVisible(state: ResolvedState): boolean {
  return state.text.length === 0 && state.placeholder.length > 0;
}

function focusIndex(
  state: ResolvedState,
  key: EditableTextNavigationKey,
  extend: boolean
): number {
  if (extend) {
    return state.selectionDirection === 'backward'
      ? state.selectionStart
      : state.selectionEnd;
  }
  if (state.selectionStart === state.selectionEnd) return state.selectionEnd;
  return key === 'ArrowUp' || key === 'Home'
    ? state.selectionStart
    : state.selectionEnd;
}

function matchesSelection(
  selection: EditableTextSelection | undefined,
  state: ResolvedState
): boolean {
  return (
    selection != null &&
    selection.start === state.selectionStart &&
    selection.end === state.selectionEnd
  );
}

function clipQuad(quad: TextRect, clip: Quad): Quad | undefined {
  const left = Math.max(quad.left, clip.left);
  const right = Math.min(quad.right, clip.right);
  const bottom = Math.max(quad.bottom, clip.bottom);
  const top = Math.min(quad.top, clip.top);
  if (!(right > left) || !(top > bottom)) return undefined;
  return {left, right, bottom, top};
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampIndex(value: string, index: number): number {
  if (!Number.isFinite(index)) return 0;
  return clamp(Math.round(index), 0, value.length);
}

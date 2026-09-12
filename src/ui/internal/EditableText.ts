import {Container, Content, type BoundingBox} from '@pmndrs/uikit';
import {effect, signal} from '@preact/signals-core';
import * as THREE from 'three';
import {
  getSelectionRects,
  Text,
  type TroikaTextRenderInfo,
} from 'troika-three-text';

import type {SemanticScrollState} from '../../interaction/SemanticControl';
import {DEFAULT_TEXT_LINE_HEIGHT} from './UIContentDefaults';

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

/** Failure surfaced while the asynchronous Troika layout was running. */
export interface EditableTextFailure {
  /**
   * `layout-timeout` means no layout completed within the configured budget,
   * which is how a missing typeface, a blocked font download, or a worker
   * failure reaches us: `troika-three-text` logs those to the console and never
   * invokes its callback. `layout-failed` means `sync()` threw synchronously.
   */
  readonly kind: 'layout-timeout' | 'layout-failed';
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
  /** Lets the owner blink the caret without rebuilding glyphs. */
  readonly caretVisible?: boolean;
  readonly selectionStart?: number;
  readonly selectionEnd?: number;
  readonly selectionDirection?: EditableTextSelectionDirection;
  /** Font size in UIkit layout units. */
  readonly fontSize?: number;
  /** Line height as a multiple of `fontSize`. */
  readonly lineHeight?: number;
  readonly fontWeight?: number | 'normal' | 'bold';
  readonly textAlign?: 'left' | 'center' | 'right';
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
  /** Polygon offset applied to the glyphs to avoid z-fighting with the shell. */
  readonly depthOffset?: number;
  readonly renderOrder?: number;
  /** URL of a `.ttf`, `.otf`, or `.woff` face; defaults to Troika's Noto Sans. */
  readonly font?: string;
}

/** Construction options for {@link EditableText}. */
export interface EditableTextOptions {
  /** Receives typeface, worker, and layout failures instead of swallowing them. */
  readonly onError?: (failure: EditableTextFailure) => void;
  /** Runs after every layout that becomes the active snapshot. */
  readonly onLayout?: () => void;
  /** Budget before a stalled layout is reported as a failure. Defaults to 10s. */
  readonly syncTimeoutMs?: number;
  /** Inner padding in UIkit layout units. */
  readonly padding?: number;
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
  fontWeight: number | 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
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
  font?: string;
}

interface CaretEntry {
  /** Index in the source value, before the character it points at. */
  readonly index: number;
  readonly x: number;
  readonly bottom: number;
  readonly top: number;
}

interface CaretRow {
  top: number;
  bottom: number;
  readonly carets: CaretEntry[];
}

interface LayoutSnapshot {
  readonly revision: number;
  /** Source value this layout describes. */
  readonly value: string;
  /** String handed to Troika, which is the placeholder when the value is empty. */
  readonly rendered: string;
  readonly placeholderVisible: boolean;
  readonly info: TroikaTextRenderInfo;
  readonly carets: Float32Array;
  readonly blockBounds: readonly number[];
  readonly lineHeight: number;
  readonly rows: CaretRow[];
  readonly caretByIndex: Map<number, CaretEntry>;
}

interface Quad {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Troika properties that restart the asynchronous layout when assigned. */
type SyncableKey =
  | 'text'
  | 'font'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'maxWidth'
  | 'overflowWrap'
  | 'whiteSpace'
  | 'textAlign'
  | 'direction';

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_CARET_WIDTH = 2;
const DEFAULT_SYNC_TIMEOUT_MS = 10000;
const DEFAULT_SELECTION_OPACITY = 0.4;
const VERTICES_PER_QUAD = 6;
const POSITION_COMPONENTS = 3;
const COLOR_COMPONENTS = 4;
const INITIAL_QUAD_CAPACITY = 4;
const QUAD_CAPACITY_GROWTH_FACTOR = 2;
/** Troika stores [startX, endX, bottomY, topY] per UTF-16 code unit. */
const CARET_POSITION_STRIDE = 4;
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
 * Retained Troika presentation for one editable text field.
 *
 * The class owns a private UIkit `Content` mounted inside a caller-provided
 * viewport `Container`, plus one `troika-three-text` mesh and two dynamic
 * meshes for the selection and the caret. It never mutates the value: the
 * native DOM input remains authoritative and pushes immutable state through
 * {@link update}.
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
  private readonly text = new Text();
  private readonly baseMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
  });
  private readonly selection = createQuadMesh('EditableTextSelection');
  private readonly caret = createQuadMesh('EditableTextCaret');
  private readonly boundingBox = signal<BoundingBox | undefined>({
    size: new THREE.Vector3(1, 1, 1),
    center: new THREE.Vector3(),
  });
  private readonly stopLayoutEffect: () => void;
  private readonly syncTimeoutMs: number;

  private state?: ResolvedState;
  private snapshot?: LayoutSnapshot;
  private revision = 0;
  private failure?: EditableTextFailure;
  private watchdog?: ReturnType<typeof setTimeout>;
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
  private revealKey = '';
  private appearanceKey = '';

  constructor(
    viewport: Container,
    private readonly options: EditableTextOptions = {}
  ) {
    this.syncTimeoutMs = options.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
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
        // Forces the per-mesh tint applied by Content to white so the caret and
        // selection colors survive in their vertex colors.
        color: '#ffffff',
        depthWrite: false,
      },
      undefined,
      {boundingBox: this.boundingBox}
    );
    this.text.name = 'EditableTextGlyphs';
    this.text.anchorX = 'left';
    this.text.anchorY = 'top';
    this.text.material = this.baseMaterial;
    this.text.frustumCulled = false;
    this.group.add(this.selection.mesh, this.text, this.caret.mesh);
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
  }

  /**
   * True when the active layout describes the current value, so indices from
   * pointer hits and keyboard navigation are safe to use.
   */
  get isReady(): boolean {
    return !this.disposed && this.snapshot?.revision === this.revision;
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
    return this.contentHeight();
  }

  /** Largest vertical offset {@link scrollBy} can reach. */
  get maxScrollTop(): number {
    return this.maxScrollY();
  }

  /**
   * Pushes the authoritative state. Object identity is preserved across calls,
   * and updates that only change selection, focus, or colors never restart the
   * glyph layout.
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
    this.applyTextProperties(resolved);
    this.applyAppearance(resolved);
    this.refresh();
  }

  /**
   * Recomputes the presentation against the latest UIkit layout. Safe to call
   * every frame; the signal subscription already covers the common case.
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
   * UTF-16 code point boundaries. Returns `undefined` while a newer value is
   * still being laid out, so stale geometry can never produce an index for it.
   */
  caretAtPoint(worldPoint: THREE.Vector3): number | undefined {
    const snapshot = this.activeSnapshot();
    if (snapshot == null) return undefined;
    if (snapshot.value.length === 0) return 0;
    const local = this.toTextCoords(worldPoint);
    if (local == null) return undefined;
    const row = nearestRow(snapshot.rows, local.y);
    if (row == null) return undefined;
    let closest: CaretEntry | undefined;
    for (const caret of row.carets) {
      if (
        closest == null ||
        Math.abs(local.x - caret.x) < Math.abs(local.x - closest.x)
      ) {
        closest = caret;
      }
    }
    if (closest == null) return undefined;
    return this.snapIndex(snapshot, closest.index, local.x);
  }

  /**
   * Resolves a geometry-driven caret move. Wrapped lines are walked through the
   * rendered rows rather than by counting newlines, so soft wraps behave like a
   * native textarea. Returns `undefined` when the layout is not current, which
   * lets the owner fall back to the browser's own handling.
   *
   * The result is advisory: apply it to the native element and push the new
   * state back through {@link update}. Doing that also preserves the goal
   * column for a following vertical move.
   */
  navigate(
    key: EditableTextNavigationKey,
    options: {extend?: boolean} = {}
  ): EditableTextSelection | undefined {
    const snapshot = this.activeSnapshot();
    const state = this.state;
    if (snapshot == null || state == null) return undefined;
    if (snapshot.value.length === 0) {
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
    const entry = snapshot.caretByIndex.get(focus);
    const rowIndex = entry == null ? -1 : rowIndexOf(snapshot.rows, focus);
    if (entry == null || rowIndex < 0) return undefined;

    let target: number;
    if (key === 'Home' || key === 'End') {
      this.goalX = undefined;
      const row = snapshot.rows[rowIndex];
      const caret =
        key === 'Home' ? row.carets[0] : row.carets[row.carets.length - 1];
      target = caret.index;
    } else {
      const goalX = this.goalX ?? entry.x;
      this.goalX = goalX;
      const nextIndex = rowIndex + (key === 'ArrowUp' ? -1 : 1);
      if (nextIndex < 0) {
        target = 0;
      } else if (nextIndex >= snapshot.rows.length) {
        target = snapshot.value.length;
      } else {
        const row = snapshot.rows[nextIndex];
        let closest = row.carets[0];
        for (const caret of row.carets) {
          if (Math.abs(goalX - caret.x) < Math.abs(goalX - closest.x)) {
            closest = caret;
          }
        }
        target = this.snapIndex(snapshot, closest.index, goalX);
      }
    }
    target = clampIndex(snapshot.value, target);
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

  /** Releases everything this instance owns; shared font resources are kept. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWatchdog();
    this.stopLayoutEffect();
    this.group.clear();
    this.group.removeFromParent();
    this.text.dispose();
    // Troika disposes the material it derived from ours when ours is disposed.
    this.baseMaterial.dispose();
    this.selection.dispose();
    this.caret.dispose();
    this.content.removeFromParent();
    this.content.dispose();
  }

  private activeSnapshot(): LayoutSnapshot | undefined {
    return this.isReady ? this.snapshot : undefined;
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
    this.applyWrapping(this.state);
    this.revealKey = '';
    this.refresh();
  }

  private applyTextProperties(state: ResolvedState): void {
    const rendered = renderedText(state);
    let changed = false;
    changed = this.setText('text', rendered) || changed;
    changed = this.setText('fontSize', state.fontSize) || changed;
    changed = this.setText('fontWeight', state.fontWeight) || changed;
    changed =
      this.setText(
        'lineHeight',
        state.lineHeight > 0 ? state.lineHeight : 'normal'
      ) || changed;
    changed = this.setText('textAlign', state.textAlign) || changed;
    changed = this.setText('direction', state.direction) || changed;
    changed = this.setText('font', state.font ?? null) || changed;
    changed = this.applyWrapping(state, true) || changed;
    if (changed) this.scheduleSync();
  }

  private applyWrapping(state: ResolvedState, defer = false): boolean {
    let changed = this.setText(
      'whiteSpace',
      state.multiline ? 'normal' : 'nowrap'
    );
    changed =
      this.setText('overflowWrap', state.multiline ? 'break-word' : 'normal') ||
      changed;
    changed =
      this.setText(
        'maxWidth',
        state.multiline && this.innerWidth > 0
          ? this.innerWidth
          : Number.POSITIVE_INFINITY
      ) || changed;
    if (changed && !defer) this.scheduleSync();
    return changed;
  }

  /**
   * Assigns a syncable Troika property only when it actually changes, which
   * mirrors Troika's own dirty tracking. A `sync()` callback never runs when
   * nothing changed, so the caller must not schedule one in that case.
   */
  private setText<K extends SyncableKey>(key: K, value: Text[K]): boolean {
    if (this.text[key] === value) return false;
    this.text[key] = value;
    return true;
  }

  private applyAppearance(state: ResolvedState): void {
    const placeholderVisible =
      state.text.length === 0 && state.placeholder !== '';
    this.text.color = placeholderVisible ? state.placeholderColor : state.color;
    this.text.depthOffset = state.depthOffset;
    for (const material of this.materials()) {
      material.opacity = state.opacity;
      material.depthTest = state.depthTest;
      material.depthWrite = false;
    }
    for (const mesh of [this.selection.mesh, this.text, this.caret.mesh]) {
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

  /** Materials owned by this presentation, including Troika's derived one. */
  private materials(): THREE.Material[] {
    const glyphs = this.text.material;
    return [
      ...(Array.isArray(glyphs) ? glyphs : [glyphs]),
      this.selection.mesh.material as THREE.Material,
      this.caret.mesh.material as THREE.Material,
    ];
  }

  private scheduleSync(): void {
    const revision = ++this.revision;
    this.clearWatchdog();
    try {
      this.text.sync(() => this.completeSync(revision));
    } catch (cause) {
      this.fail({
        kind: 'layout-failed',
        message: 'Troika text layout could not be started.',
        cause,
      });
      return;
    }
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      this.fail({
        kind: 'layout-timeout',
        message:
          `Troika text layout did not complete within ${this.syncTimeoutMs}ms; ` +
          'the typeface, font worker, or SDF generator most likely failed.',
      });
    }, this.syncTimeoutMs);
    // A layout that already resolved inside `sync()` needs no watchdog.
    if (this.snapshot?.revision === revision) this.clearWatchdog();
  }

  private completeSync(revision: number): void {
    // A disposed presentation must never reattach resources, and a callback for
    // a superseded value must never become the active snapshot: Troika resolves
    // queued callbacks with whichever layout finished, not with the one they
    // were registered for.
    if (this.disposed || revision !== this.revision) return;
    const info = this.text.textRenderInfo;
    const state = this.state;
    if (info == null || state == null) return;
    this.clearWatchdog();
    this.failure = undefined;
    this.snapshot = buildSnapshot(revision, state, info);
    this.revealKey = '';
    this.refresh();
    this.options.onLayout?.();
  }

  private fail(failure: EditableTextFailure): void {
    if (this.disposed) return;
    this.clearWatchdog();
    this.failure = failure;
    this.options.onError?.(failure);
  }

  private clearWatchdog(): void {
    if (this.watchdog == null) return;
    clearTimeout(this.watchdog);
    this.watchdog = undefined;
  }

  /**
   * Repositions the text and rebuilds the caret and selection quads from the
   * active snapshot. While a newer layout is pending, the previously rendered
   * glyphs, caret, and selection are kept untouched so they always come from
   * one consistent layout.
   */
  private refresh(): void {
    const state = this.state;
    if (state == null) return;
    const snapshot = this.activeSnapshot();
    this.scrollX = clamp(this.scrollX, 0, this.maxScrollX());
    this.scrollY = clamp(this.scrollY, 0, this.maxScrollY());
    if (snapshot != null) this.reveal(state, snapshot);
    const originX = -this.innerWidth / 2 - this.scrollX;
    const originY = this.innerHeight / 2 + this.scrollY;
    this.group.position.set(originX, originY, 0);
    this.group.updateMatrix();
    const clip = this.clipRect();
    this.text.clipRect = [clip.left, clip.bottom, clip.right, clip.top];
    if (snapshot == null) {
      // A newer value is still being laid out: the caret and the selection stay
      // frozen on the geometry Troika is still showing.
      this.content.root.peek().requestRender?.();
      return;
    }

    const selectionQuads: Quad[] = [];
    if (
      snapshot.value.length > 0 &&
      state.selectionEnd > state.selectionStart
    ) {
      const rects =
        getSelectionRects(
          snapshot.info,
          state.selectionStart,
          state.selectionEnd
        ) ?? [];
      for (const rect of rects) {
        const quad = clipQuad(
          {
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            top: rect.top,
          },
          clip
        );
        if (quad != null) selectionQuads.push(quad);
      }
    }
    this.selection.write(
      selectionQuads,
      new THREE.Color(state.selectionColor),
      state.selectionOpacity,
      SELECTION_Z
    );

    const caretQuads: Quad[] = [];
    if (state.focused && state.caretVisible) {
      const caret = this.caretQuad(state, snapshot, clip);
      if (caret != null) caretQuads.push(caret);
    }
    this.caret.write(caretQuads, new THREE.Color(state.caretColor), 1, CARET_Z);
    this.content.root.peek().requestRender?.();
  }

  private caretQuad(
    state: ResolvedState,
    snapshot: LayoutSnapshot,
    clip: Quad
  ): Quad | undefined {
    const index =
      state.selectionDirection === 'backward'
        ? state.selectionStart
        : state.selectionEnd;
    const entry = snapshot.caretByIndex.get(
      snapshot.value.length === 0 ? 0 : clampIndex(snapshot.value, index)
    );
    if (entry == null) return undefined;
    let left = entry.x - state.caretWidth / 2;
    let right = left + state.caretWidth;
    if (left < clip.left) {
      left = clip.left;
      right = left + state.caretWidth;
    } else if (right > clip.right) {
      right = clip.right;
      left = right - state.caretWidth;
    }
    return clipQuad({left, right, bottom: entry.bottom, top: entry.top}, clip);
  }

  private reveal(state: ResolvedState, snapshot: LayoutSnapshot): void {
    if (!state.focused || this.innerWidth <= 0 || this.innerHeight <= 0) return;
    const index =
      state.selectionDirection === 'backward'
        ? state.selectionStart
        : state.selectionEnd;
    const key = `${snapshot.revision}:${index}:${this.innerWidth}x${this.innerHeight}`;
    if (key === this.revealKey) return;
    this.revealKey = key;
    const entry = snapshot.caretByIndex.get(
      snapshot.value.length === 0 ? 0 : clampIndex(snapshot.value, index)
    );
    if (entry == null) return;
    const pad = state.caretWidth;
    if (entry.x - pad < this.scrollX) {
      this.scrollX = entry.x - pad;
    } else if (entry.x + pad > this.scrollX + this.innerWidth) {
      this.scrollX = entry.x + pad - this.innerWidth;
    }
    this.scrollX = clamp(this.scrollX, 0, this.maxScrollX());
    if (entry.top > -this.scrollY) {
      this.scrollY = -entry.top;
    } else if (entry.bottom < -this.innerHeight - this.scrollY) {
      this.scrollY = -this.innerHeight - entry.bottom;
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

  private contentWidth(): number {
    const snapshot = this.snapshot;
    if (snapshot == null) return 0;
    return Math.max(0, snapshot.blockBounds[2] - snapshot.blockBounds[0]);
  }

  private contentHeight(): number {
    const snapshot = this.snapshot;
    if (snapshot == null) return 0;
    const block = Math.max(
      0,
      snapshot.blockBounds[3] - snapshot.blockBounds[1]
    );
    // Troika's block stops at the last glyph, so a trailing newline needs the
    // empty line it creates to be scrollable too.
    return snapshot.value.endsWith('\n') ? block + snapshot.lineHeight : block;
  }

  private maxScrollX(): number {
    if (this.state?.multiline !== false) return 0;
    const caretWidth = this.state?.caretWidth ?? DEFAULT_CARET_WIDTH;
    return Math.max(0, this.contentWidth() + caretWidth - this.innerWidth);
  }

  private maxScrollY(): number {
    if (this.state?.multiline !== true) return 0;
    return Math.max(0, this.contentHeight() - this.innerHeight);
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

  /** Maps a world point to Troika's text-local coordinates. */
  private toTextCoords(point: THREE.Vector3): THREE.Vector2 | undefined {
    const inner = this.toInnerPoint(point);
    if (inner == null) return undefined;
    return new THREE.Vector2(inner.x + this.scrollX, -inner.y - this.scrollY);
  }

  /**
   * Keeps indices on UTF-16 code point boundaries. Troika splits the advance of
   * an astral character across both of its code units, so a hit inside an emoji
   * resolves to whichever of its edges is nearer, exactly like a native input.
   */
  private snapIndex(
    snapshot: LayoutSnapshot,
    index: number,
    x: number
  ): number {
    const value = snapshot.value;
    if (index <= 0 || index >= value.length) return clampIndex(value, index);
    if (!isInsideSurrogatePair(value, index)) return index;
    const before = snapshot.caretByIndex.get(index - 1);
    const after = snapshot.caretByIndex.get(index + 1);
    if (before == null) return index + 1;
    if (after == null) return index - 1;
    return Math.abs(x - before.x) <= Math.abs(x - after.x)
      ? index - 1
      : index + 1;
  }
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
  // Browsers normalize `\r\n` in input values, and Troika normalizes it again
  // during typesetting; doing it here keeps our indices aligned with both.
  const text = state.text.replace(/\r\n?/g, '\n');
  const rawStart = clampIndex(text, state.selectionStart ?? 0);
  const rawEnd = clampIndex(text, state.selectionEnd ?? rawStart);
  const start = alignIndex(text, Math.min(rawStart, rawEnd));
  const end = alignIndex(text, Math.max(rawStart, rawEnd));
  return {
    text,
    placeholder: state.placeholder ?? '',
    multiline: state.multiline ?? false,
    focused: state.focused ?? false,
    caretVisible: state.caretVisible ?? true,
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: state.selectionDirection ?? 'none',
    fontSize: state.fontSize ?? DEFAULT_FONT_SIZE,
    lineHeight: state.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT,
    fontWeight: state.fontWeight ?? 'normal',
    textAlign: state.textAlign ?? 'left',
    direction: state.direction ?? 'auto',
    color: state.color ?? '#ffffff',
    placeholderColor: state.placeholderColor ?? '#888888',
    caretColor: state.caretColor ?? state.color ?? '#ffffff',
    selectionColor: state.selectionColor ?? '#3b82f6',
    selectionOpacity: state.selectionOpacity ?? DEFAULT_SELECTION_OPACITY,
    caretWidth: state.caretWidth ?? DEFAULT_CARET_WIDTH,
    opacity: state.opacity ?? 1,
    depthTest: state.depthTest ?? true,
    depthOffset: state.depthOffset ?? 0,
    renderOrder: state.renderOrder ?? 0,
    font: state.font,
  };
}

/**
 * Troika needs at least one character to produce font metrics, so an empty
 * value renders the placeholder, or a space when there is none.
 */
function renderedText(state: ResolvedState): string {
  if (state.text.length > 0) return state.text;
  return state.placeholder.length > 0 ? state.placeholder : ' ';
}

function buildSnapshot(
  revision: number,
  state: ResolvedState,
  info: TroikaTextRenderInfo
): LayoutSnapshot {
  const rendered = renderedText(state);
  const carets = info.caretPositions ?? new Float32Array(0);
  const blockBounds = info.blockBounds ?? [0, 0, 0, 0];
  const lineHeight = info.lineHeight || state.fontSize * state.lineHeight;
  const rows =
    state.text.length === 0
      ? placeholderRows(carets)
      : buildRows(state.text, carets, lineHeight, blockBounds, state.textAlign);
  const caretByIndex = new Map<number, CaretEntry>();
  for (const row of rows) {
    for (const caret of row.carets) {
      if (!caretByIndex.has(caret.index)) caretByIndex.set(caret.index, caret);
    }
  }
  return {
    revision,
    value: state.text,
    rendered,
    placeholderVisible: state.text.length === 0 && state.placeholder.length > 0,
    info,
    carets,
    blockBounds,
    lineHeight,
    rows,
    caretByIndex,
  };
}

/** Single caret at the start of the rendered placeholder or space. */
function placeholderRows(carets: Float32Array): CaretRow[] {
  if (carets.length < CARET_POSITION_STRIDE) return [];
  const entry: CaretEntry = {
    index: 0,
    x: carets[0],
    bottom: carets[2],
    top: carets[3],
  };
  return [{top: entry.top, bottom: entry.bottom, carets: [entry]}];
}

/**
 * Groups caret positions into rendered rows using Troika's own "overlapping by
 * at least half" rule, then completes each row with the caret that sits after
 * its last character. Soft-wrapped rows therefore expose the index that a
 * native `End` key would produce without any newline counting.
 */
function buildRows(
  value: string,
  carets: Float32Array,
  lineHeight: number,
  blockBounds: readonly number[],
  textAlign: 'left' | 'center' | 'right'
): CaretRow[] {
  const rows: CaretRow[] = [];
  let row: CaretRow | undefined;
  const count = Math.min(
    value.length,
    Math.floor(carets.length / CARET_POSITION_STRIDE)
  );
  for (let index = 0; index < count; index++) {
    const offset = index * CARET_POSITION_STRIDE;
    const x = carets[offset];
    const bottom = carets[offset + 2];
    const top = carets[offset + 3];
    if (row == null || top < (row.top + row.bottom) / 2) {
      row = {top, bottom, carets: []};
      rows.push(row);
    }
    if (top > row.top) row.top = top;
    if (bottom < row.bottom) row.bottom = bottom;
    row.carets.push({index, x, bottom, top});
  }
  if (rows.length === 0) return rows;
  for (const current of rows) {
    const last = current.carets[current.carets.length - 1];
    if (value[last.index] === '\n') continue;
    current.carets.push({
      index: last.index + 1,
      x: carets[last.index * CARET_POSITION_STRIDE + 1],
      bottom: last.bottom,
      top: last.top,
    });
  }
  if (value.endsWith('\n')) {
    const last = rows[rows.length - 1];
    rows.push({
      top: last.top - lineHeight,
      bottom: last.bottom - lineHeight,
      carets: [
        {
          index: value.length,
          x: lineStartX(blockBounds, textAlign),
          bottom: last.bottom - lineHeight,
          top: last.top - lineHeight,
        },
      ],
    });
  }
  return rows;
}

function lineStartX(
  blockBounds: readonly number[],
  textAlign: 'left' | 'center' | 'right'
): number {
  if (textAlign === 'center') return (blockBounds[0] + blockBounds[2]) / 2;
  if (textAlign === 'right') return blockBounds[2];
  return blockBounds[0];
}

function nearestRow(
  rows: readonly CaretRow[],
  y: number
): CaretRow | undefined {
  let closest: CaretRow | undefined;
  for (const row of rows) {
    if (
      closest == null ||
      Math.abs(y - (row.top + row.bottom) / 2) <
        Math.abs(y - (closest.top + closest.bottom) / 2)
    ) {
      closest = row;
    }
  }
  return closest;
}

/**
 * Finds the row an index belongs to, preferring the row where it is a real
 * caret over the row where it only closes a soft wrap.
 */
function rowIndexOf(rows: readonly CaretRow[], index: number): number {
  let fallback = -1;
  for (let row = 0; row < rows.length; row++) {
    const carets = rows[row].carets;
    for (let i = 0; i < carets.length; i++) {
      if (carets[i].index !== index) continue;
      if (i < carets.length - 1 || row === rows.length - 1) return row;
      if (fallback < 0) fallback = row;
    }
  }
  return fallback;
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

function clipQuad(quad: Quad, clip: Quad): Quad | undefined {
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

function isInsideSurrogatePair(value: string, index: number): boolean {
  const previous = value.charCodeAt(index - 1);
  const current = value.charCodeAt(index);
  return (
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    current >= 0xdc00 &&
    current <= 0xdfff
  );
}

function alignIndex(value: string, index: number): number {
  const clamped = clampIndex(value, index);
  if (clamped <= 0 || clamped >= value.length) return clamped;
  return isInsideSurrogatePair(value, clamped) ? clamped - 1 : clamped;
}

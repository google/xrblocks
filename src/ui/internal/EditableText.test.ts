import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {graphemeSegments} from './CanvasTextStyle';
import {EditableText, type EditableTextState} from './EditableText';
import type {
  EditableTextMeasurer,
  EditableTextStyle,
  MeasuredGrapheme,
  TextMeasurement,
} from './EditableTextLayout';

const FONT_SIZE = 16;
const LINE_HEIGHT_RATIO = 1.25;
/** Advance of an ordinary character in the deterministic test face. */
const CELL = FONT_SIZE / 2;
const LINE = FONT_SIZE * LINE_HEIGHT_RATIO;
const CARET_WIDTH = 2;
/** Ascent and descent the stubbed canvas reports for the test face. */
const ASCENT = 12;
const DESCENT = 3;
const VERTICES_PER_QUAD = 6;

interface PaintCall {
  text: string;
  x: number;
  y: number;
  direction: string;
  fillStyle: string;
}

const painted: PaintCall[] = [];
let contextAvailable = true;
let paintFails = false;

/**
 * Minimal 2D context. jsdom ships no canvas implementation, so the drawing
 * calls are recorded instead of rasterized; only a browser can prove what the
 * pixels look like.
 */
function createStubContext(canvas: HTMLCanvasElement) {
  const context = {
    canvas,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'inherit',
    fillStyle: '#000000',
    clears: 0,
    setTransform() {},
    translate() {},
    clearRect() {
      context.clears++;
    },
    measureText() {
      return {
        width: 0,
        fontBoundingBoxAscent: ASCENT,
        fontBoundingBoxDescent: DESCENT,
      };
    },
    fillText(text: string, x: number, y: number) {
      if (paintFails) throw new Error('Canvas paint failed.');
      painted.push({
        text,
        x,
        y,
        direction: context.direction,
        fillStyle: context.fillStyle,
      });
    },
  };
  return context;
}

function advance(grapheme: string): number {
  if (grapheme === '\t') return CELL * 4;
  const wide = [...grapheme].some(
    (character) => (character.codePointAt(0) ?? 0) > 0xffff
  );
  return wide ? FONT_SIZE : CELL;
}

/**
 * Left-to-right monospace stand-in for the platform text engine: spaces are
 * never collapsed, trailing spaces hang past a wrap, and a word wider than the
 * line breaks between graphemes.
 */
function monospaceMeasurer(): EditableTextMeasurer & {calls: number} {
  return {
    calls: 0,
    measure(text: string, style: EditableTextStyle): TextMeasurement {
      this.calls++;
      const graphemes: MeasuredGrapheme[] = [];
      let row = 0;
      let offset = 0;
      for (const paragraph of text.split('\n')) {
        let x = 0;
        let empty = true;
        let pendingSpace = false;
        for (const {segment, index} of graphemeSegments(paragraph)) {
          const width = advance(segment);
          const space = segment === ' ' || segment === '\t';
          if (
            style.multiline &&
            !space &&
            !empty &&
            x + width > style.width &&
            (pendingSpace || x + width > style.width)
          ) {
            row++;
            x = 0;
            empty = true;
          }
          graphemes.push({
            start: offset + index,
            end: offset + index + segment.length,
            left: x,
            right: x + width,
            top: row * style.lineHeight,
            bottom: (row + 1) * style.lineHeight,
          });
          x += width;
          empty = false;
          pendingSpace = space;
        }
        offset += paragraph.length + 1;
        row++;
      }
      return {graphemes, direction: style.direction === 'rtl' ? 'rtl' : 'ltr'};
    },
    dispose: vi.fn(),
  };
}

interface Harness {
  readonly scene: THREE.Scene;
  readonly carrier: THREE.Group;
  readonly root: Container;
  readonly editable: EditableText;
  readonly measurer: EditableTextMeasurer & {calls: number};
  readonly errors: Array<{kind: string; message: string}>;
  layouts: number;
  layout(): Promise<void>;
  dispose(): void;
}

async function harness(
  size: {width: number; height: number} = {width: 200, height: 60},
  pixelSize = 0.001
): Promise<Harness> {
  const scene = new THREE.Scene();
  const carrier = new THREE.Group();
  scene.add(carrier);
  const root = new Container({
    width: size.width,
    height: size.height,
    pixelSize,
    padding: 0,
    overflow: 'hidden',
    flexDirection: 'row',
  });
  carrier.add(root);
  const errors: Array<{kind: string; message: string}> = [];
  const counters = {layouts: 0};
  const measurer = monospaceMeasurer();
  const editable = new EditableText(root, {
    measurer,
    onError: (failure) => errors.push(failure),
    onLayout: () => counters.layouts++,
  });
  return {
    scene,
    carrier,
    root,
    editable,
    measurer,
    errors,
    get layouts() {
      return counters.layouts;
    },
    set layouts(value: number) {
      counters.layouts = value;
    },
    layout: async () => {
      await vi.waitFor(() => {
        root.update(16);
        expect(editable.content.size.peek()?.[0]).toBeGreaterThan(0);
      });
      scene.updateMatrixWorld(true);
      editable.afterLayout();
    },
    dispose: () => {
      editable.dispose();
      root.dispose();
    },
  };
}

function state(overrides: Partial<EditableTextState> = {}): EditableTextState {
  return {
    text: '',
    focused: true,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT_RATIO,
    caretWidth: CARET_WIDTH,
    ...overrides,
  };
}

/** Builds the world point for a text-local position of the mounted field. */
function worldPoint(h: Harness, textX: number, textY: number): THREE.Vector3 {
  const size = h.editable.content.size.peek()!;
  const innerX = textX - h.editable.offsetX;
  const innerY = -textY - h.editable.offsetY;
  const local = new THREE.Vector3(
    innerX / size[0] - 0.5,
    0.5 - innerY / size[1],
    0
  );
  h.editable.content.updateWorldMatrix(true, false);
  return h.editable.content.localToWorld(local);
}

function drawnQuads(mesh: THREE.Object3D | undefined): number {
  const target = mesh as THREE.Mesh | undefined;
  const count = target?.geometry.drawRange.count;
  if (count == null || !Number.isFinite(count)) return 0;
  return count / VERTICES_PER_QUAD;
}

function meshNamed(editable: EditableText, name: string): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  editable.content.traverse((child) => {
    if (child.name === name) found = child as THREE.Mesh;
  });
  if (found == null) throw new Error(`missing mesh ${name}`);
  return found;
}

beforeEach(() => {
  painted.length = 0;
  contextAvailable = true;
  paintFails = false;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement, kind: string) {
      if (kind !== '2d' || !contextAvailable) return null;
      return createStubContext(this) as unknown as CanvasRenderingContext2D;
    } as HTMLCanvasElement['getContext']
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditableText presentation', () => {
  let current: Harness | undefined;

  afterEach(() => {
    current?.dispose();
    current = undefined;
  });

  it('mounts one retained Content and reuses its meshes', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'hello'}));
    await h.layout();

    expect(h.editable.content.parent).toBe(h.root);
    expect(h.editable.isReady).toBe(true);
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs');
    const caret = meshNamed(h.editable, 'EditableTextCaret');

    h.editable.update(
      state({text: 'hello', selectionStart: 2, selectionEnd: 2})
    );
    expect(meshNamed(h.editable, 'EditableTextGlyphs')).toBe(glyphs);
    expect(meshNamed(h.editable, 'EditableTextCaret')).toBe(caret);
    expect(h.errors).toEqual([]);
  });

  it('measures once per change and never for selection or color alone', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'hello world'}));
    await h.layout();
    const measurements = h.measurer.calls;
    const paints = painted.length;
    expect(measurements).toBeGreaterThan(0);

    h.editable.update(
      state({text: 'hello world', selectionStart: 2, selectionEnd: 6})
    );
    expect(h.measurer.calls).toBe(measurements);
    expect(painted).toHaveLength(paints);
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextSelection'))).toBe(1);

    // Repeating the identical state repaints nothing either.
    h.editable.update(
      state({text: 'hello world', selectionStart: 2, selectionEnd: 6})
    );
    expect(painted).toHaveLength(paints);

    h.editable.update(state({text: 'hello world!', selectionStart: 12}));
    expect(h.measurer.calls).toBe(measurements + 1);
    expect(painted.length).toBeGreaterThan(paints);
  });

  it('paints every piece of the rows that the viewport shows', async () => {
    const h = (current = await harness({width: 200, height: 2 * LINE}));
    h.editable.update(state({text: 'ab\tcd\nefg\nhij\nklm', multiline: true}));
    await h.layout();

    // Tabs advance without being drawn, and the tail rows stay off the canvas.
    expect(painted.map((call) => call.text)).toEqual(['ab', 'cd', 'efg']);
    expect(painted[1].x).toBeCloseTo(CELL * 2 + CELL * 4, 5);
    const halfLeading = (LINE - (ASCENT + DESCENT)) / 2;
    expect(painted[0].y).toBeCloseTo(halfLeading + ASCENT, 5);
    expect(painted[2].y).toBeCloseTo(LINE + halfLeading + ASCENT, 5);
    for (const call of painted) expect(call.direction).toBe('ltr');

    painted.length = 0;
    expect(h.editable.scrollBy(2 * LINE)).toBe(true);
    expect(painted.map((call) => call.text)).toEqual(['hij', 'klm']);
  });

  it('maps world points through moved, scaled, and rotated cards', async () => {
    const h = (current = await harness());
    h.carrier.position.set(1.5, -0.25, 0.75);
    h.carrier.rotation.set(0.3, 0.7, -0.2);
    h.carrier.scale.setScalar(2.5);
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();

    expect(h.editable.caretAtPoint(worldPoint(h, 0, -LINE / 2))).toBe(0);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 3, -LINE / 2))).toBe(3);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 6, -LINE / 2))).toBe(6);
  });

  it('keeps UTF-16 indices on grapheme boundaries', async () => {
    const h = (current = await harness());
    const text = 'a😀b';
    h.editable.update(state({text}));
    await h.layout();

    // The emoji occupies one double-width cell starting at CELL.
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 1.2, -LINE / 2))).toBe(
      1
    );
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 2.8, -LINE / 2))).toBe(
      3
    );
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 4, -LINE / 2))).toBe(4);

    // A selection the native element reports inside the pair still shows one
    // caret, snapped to the boundary before it.
    h.editable.update(state({text, selectionStart: 2, selectionEnd: 2}));
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    expect(drawnQuads(caret)).toBe(1);
    expect(caret.geometry.getAttribute('position').getX(0)).toBeCloseTo(
      CELL - CARET_WIDTH / 2,
      5
    );
    expect(h.editable.navigate('End')).toEqual({
      start: 4,
      end: 4,
      direction: 'none',
    });
  });

  it('refuses indices while the value has no matching layout', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();
    expect(
      h.editable.caretAtPoint(worldPoint(h, CELL * 2 + 1, -LINE / 2))
    ).toBe(2);

    const failing = vi.spyOn(h.measurer, 'measure').mockImplementation(() => {
      throw new Error('mirror detached');
    });
    h.editable.update(state({text: 'abcdefghij'}));
    expect(h.editable.isReady).toBe(false);
    expect(h.editable.error?.kind).toBe('layout-failed');
    expect(h.errors[0].kind).toBe('layout-failed');
    expect(
      h.editable.caretAtPoint(worldPoint(h, CELL * 8, -LINE / 2))
    ).toBeUndefined();
    expect(h.editable.navigate('End')).toBeUndefined();

    failing.mockRestore();
    h.editable.update(state({text: 'abcdefghij'}));
    expect(h.editable.isReady).toBe(true);
    expect(h.editable.error).toBeUndefined();
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 8, -LINE / 2))).toBe(8);
  });

  it('renders one selection rectangle per rendered row', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'alpha beta gamma delta epsilon zeta';
    h.editable.update(
      state({text, multiline: true, selectionStart: 0, selectionEnd: 34})
    );
    await h.layout();
    const selection = meshNamed(h.editable, 'EditableTextSelection');
    expect(drawnQuads(selection)).toBeGreaterThan(1);

    h.editable.update(
      state({text, multiline: true, selectionStart: 1, selectionEnd: 4})
    );
    expect(drawnQuads(selection)).toBe(1);
    const position = selection.geometry.getAttribute('position');
    expect(position.getX(0)).toBeCloseTo(CELL, 5);
    expect(position.getX(1)).toBeCloseTo(CELL * 4, 5);
  });

  it('navigates wrapped rows by geometry instead of newlines', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'aaaa bbbb cccc dddd eeee ffff';
    h.editable.update(
      state({text, multiline: true, selectionStart: 2, selectionEnd: 2})
    );
    await h.layout();
    expect(text.includes('\n')).toBe(false);

    const down = h.editable.navigate('ArrowDown');
    expect(down).toBeDefined();
    expect(down!.start).toBeGreaterThan(2);
    h.editable.update(
      state({
        text,
        multiline: true,
        selectionStart: down!.start,
        selectionEnd: down!.end,
      })
    );
    expect(h.editable.navigate('ArrowUp')).toEqual({
      start: 2,
      end: 2,
      direction: 'none',
    });
  });

  it('extends a selection and keeps the goal column across a short row', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    // The middle row is shorter than the goal column, which a caret walk must
    // remember instead of collapsing to the short row's end.
    const text = 'aaaaaaaa\nbb\ncccccccc';
    h.editable.update(
      state({text, multiline: true, selectionStart: 6, selectionEnd: 6})
    );
    await h.layout();

    const first = h.editable.navigate('ArrowDown', {extend: true})!;
    expect(first).toEqual({start: 6, end: 11, direction: 'forward'});
    h.editable.update(
      state({
        text,
        multiline: true,
        selectionStart: first.start,
        selectionEnd: first.end,
        selectionDirection: first.direction,
      })
    );
    expect(h.editable.navigate('ArrowDown', {extend: true})).toEqual({
      start: 6,
      end: 18,
      direction: 'forward',
    });

    h.editable.update(
      state({text, multiline: true, selectionStart: 18, selectionEnd: 18})
    );
    expect(h.editable.navigate('Home', {extend: true})).toEqual({
      start: 12,
      end: 18,
      direction: 'backward',
    });
  });

  it('places Home and End on the rendered row', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'one two\nthree';
    h.editable.update(
      state({text, multiline: true, selectionStart: 9, selectionEnd: 9})
    );
    await h.layout();

    expect(h.editable.navigate('Home')).toEqual({
      start: 8,
      end: 8,
      direction: 'none',
    });
    expect(h.editable.navigate('End')).toEqual({
      start: 13,
      end: 13,
      direction: 'none',
    });
    h.editable.update(
      state({text, multiline: true, selectionStart: 3, selectionEnd: 3})
    );
    // Stops before the newline, exactly like a native textarea.
    expect(h.editable.navigate('End')).toEqual({
      start: 7,
      end: 7,
      direction: 'none',
    });
  });

  it('reaches the empty row created by a trailing newline', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'one\n';
    h.editable.update(
      state({text, multiline: true, selectionStart: 1, selectionEnd: 1})
    );
    await h.layout();

    expect(h.editable.navigate('ArrowDown')).toEqual({
      start: 4,
      end: 4,
      direction: 'none',
    });
    h.editable.update(
      state({text, multiline: true, selectionStart: 4, selectionEnd: 4})
    );
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    expect(drawnQuads(caret)).toBe(1);
    expect(caret.geometry.getAttribute('position').getY(0)).toBeLessThan(-LINE);
    expect(h.editable.scrollHeight).toBeCloseTo(2 * LINE, 5);
  });

  it('clamps vertical scrolling and reveals the caret', async () => {
    const h = (current = await harness({width: 100, height: 2 * LINE}));
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    h.editable.update(
      state({text, multiline: true, selectionStart: 0, selectionEnd: 0})
    );
    await h.layout();

    expect(h.editable.scroll.getViewportHeight()).toBeCloseTo(2 * LINE, 5);
    expect(h.editable.scroll.getOffset()).toBe(0);
    expect(h.editable.scrollHeight).toBeGreaterThan(2 * LINE);
    expect(h.editable.maxScrollTop).toBeCloseTo(
      h.editable.scrollHeight - 2 * LINE,
      5
    );
    expect(h.editable.scroll.scrollBy(-10)).toBe(false);
    expect(h.editable.scroll.scrollBy(LINE)).toBe(true);
    expect(h.editable.scroll.getOffset()).toBeCloseTo(LINE, 5);
    expect(h.editable.scroll.scrollBy(10000)).toBe(true);
    const maximum = h.editable.scroll.getOffset();
    expect(h.editable.scroll.scrollBy(10000)).toBe(false);
    expect(maximum).toBeGreaterThan(0);

    // A re-render that does not move the caret must not fight the user.
    h.editable.update(
      state({
        text,
        multiline: true,
        selectionStart: 0,
        selectionEnd: 0,
        color: '#ff0000',
      })
    );
    expect(h.editable.scroll.getOffset()).toBeCloseTo(maximum, 5);

    h.editable.update(
      state({
        text,
        multiline: true,
        selectionStart: text.length,
        selectionEnd: text.length,
      })
    );
    expect(h.editable.scroll.getOffset()).toBeCloseTo(maximum, 5);

    h.editable.update(
      state({text, multiline: true, selectionStart: 0, selectionEnd: 0})
    );
    expect(h.editable.scroll.getOffset()).toBe(0);
  });

  it('reveals the caret horizontally for single line fields', async () => {
    const h = (current = await harness({width: 80, height: 30}));
    const text = 'abcdefghijklmnopqrstuvwxyz';
    h.editable.update(state({text, selectionStart: 0, selectionEnd: 0}));
    await h.layout();
    expect(h.editable.offsetX).toBe(0);
    expect(h.editable.scroll.getOffset()).toBe(0);

    h.editable.update(
      state({text, selectionStart: text.length, selectionEnd: text.length})
    );
    expect(h.editable.offsetX).toBeGreaterThan(0);
    expect(h.editable.offsetX).toBeCloseTo(
      text.length * CELL + CARET_WIDTH - 80,
      5
    );
    expect(h.editable.scroll.getOffset()).toBe(0);

    // The caret stays inside the clipped viewport after scrolling.
    const position = meshNamed(
      h.editable,
      'EditableTextCaret'
    ).geometry.getAttribute('position');
    expect(position.getX(0)).toBeGreaterThanOrEqual(h.editable.offsetX - 0.001);
    expect(position.getX(1)).toBeLessThanOrEqual(h.editable.offsetX + 80.001);
  });

  it('projects world points into viewport pixels', async () => {
    const h = (current = await harness({width: 200, height: 60}));
    h.editable.update(state({text: 'abc'}));
    await h.layout();
    const projected = h.editable.scroll.projectPoint(
      worldPoint(h, CELL * 2, -LINE / 2)
    );
    expect(projected?.x).toBeCloseTo(CELL * 2, 4);
    expect(projected?.y).toBeCloseTo(LINE / 2, 4);
  });

  it('draws the placeholder and keeps the caret at index zero', async () => {
    const h = (current = await harness());
    h.editable.update(
      state({text: '', placeholder: 'Search', placeholderColor: '#999999'})
    );
    await h.layout();

    expect(h.editable.isReady).toBe(true);
    expect(painted.map((call) => call.text)).toEqual(['Search']);
    expect(painted[0].fillStyle).toBe('#999999');
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextCaret'))).toBe(1);
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextSelection'))).toBe(0);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 4, -LINE / 2))).toBe(0);
    expect(h.editable.navigate('End')).toEqual({
      start: 0,
      end: 0,
      direction: 'none',
    });

    // The value takes over as soon as there is one.
    painted.length = 0;
    h.editable.update(state({text: 'ab', placeholder: 'Search'}));
    expect(painted.map((call) => call.text)).toEqual(['ab']);
  });

  it('invalidates failed paint and retries the same value without stale geometry', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'before'}));
    await h.layout();
    paintFails = true;
    h.editable.update(state({text: 'after'}));
    expect(h.editable.isReady).toBe(false);
    expect(h.editable.error?.kind).toBe('layout-failed');
    expect(h.editable.caretAtPoint(new THREE.Vector3())).toBeUndefined();
    expect(meshNamed(h.editable, 'EditableTextGlyphs').visible).toBe(false);
    expect(meshNamed(h.editable, 'EditableTextCaret').visible).toBe(false);
    paintFails = false;
    h.editable.update(state({text: 'after'}));
    expect(h.editable.isReady).toBe(true);
    expect(h.editable.error).toBeUndefined();
    expect(meshNamed(h.editable, 'EditableTextGlyphs').visible).toBe(true);
    expect(painted.at(-1)?.text).toBe('after');
  });

  it('reports a document that refuses a 2D canvas', async () => {
    contextAvailable = false;
    const h = (current = await harness());
    expect(h.errors[0]?.kind).toBe('context-unavailable');
    expect(h.editable.error?.kind).toBe('context-unavailable');
    h.editable.update(state({text: 'invisible'}));
    await h.layout();
    expect(h.editable.isReady).toBe(false);
    expect(painted).toEqual([]);
  });

  it('releases everything it owns and stays inert afterwards', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'disposable'}));
    await h.layout();
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs');
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    const selection = meshNamed(h.editable, 'EditableTextSelection');
    const disposals = [glyphs, caret, selection].map((mesh) =>
      vi.spyOn(mesh.geometry, 'dispose')
    );
    const material = vi.spyOn(caret.material as THREE.Material, 'dispose');
    const texture = vi.spyOn(
      (glyphs.material as THREE.MeshBasicMaterial).map!,
      'dispose'
    );
    const content = h.editable.content;

    h.editable.dispose();
    expect(content.parent).toBeNull();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
    expect(texture).toHaveBeenCalled();
    expect(h.measurer.dispose).toHaveBeenCalledTimes(1);

    const layouts = h.layouts;
    const paints = painted.length;
    h.editable.update(state({text: 'ignored'}));
    expect(h.layouts).toBe(layouts);
    expect(painted).toHaveLength(paints);
    expect(h.editable.isReady).toBe(false);
    expect(h.editable.caretAtPoint(new THREE.Vector3())).toBeUndefined();
    // Disposing twice must stay a no-op.
    h.editable.dispose();
    expect(h.measurer.dispose).toHaveBeenCalledTimes(1);
    current = undefined;
    h.root.dispose();
  });

  it('binds the viewport clip and appearance to every owned material', async () => {
    const h = (current = await harness());
    h.editable.update(
      state({
        text: 'clipped',
        selectionStart: 1,
        selectionEnd: 4,
        opacity: 0.5,
        renderOrder: 7,
        depthTest: false,
        depthOffset: -1,
      })
    );
    await h.layout();

    const names = [
      'EditableTextGlyphs',
      'EditableTextSelection',
      'EditableTextCaret',
    ];
    for (const name of names) {
      const mesh = meshNamed(h.editable, name);
      const material = mesh.material as THREE.Material;
      expect(material.clippingPlanes).toBe(h.editable.content.clippingPlanes);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.5);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(material.polygonOffset).toBe(true);
      expect(material.polygonOffsetFactor).toBe(-1);
      expect(mesh.renderOrder).toBe(7);
    }
    // The glyph plane covers exactly the scrolled viewport, so the canvas
    // itself clips whatever falls outside it.
    const size = h.editable.content.size.peek()!;
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs');
    expect(glyphs.scale.x).toBeCloseTo(size[0], 6);
    expect(glyphs.scale.y).toBeCloseTo(size[1], 6);
    // The quad colors carry the selection tint, since Content forces white.
    const colors = meshNamed(
      h.editable,
      'EditableTextSelection'
    ).geometry.getAttribute('color');
    const expected = new THREE.Color('#3b82f6');
    expect(colors.getX(0)).toBeCloseTo(expected.r, 5);
    expect(colors.getW(0)).toBeCloseTo(0.4, 5);
  });

  it('honors a non default pixel size without changing layout units', async () => {
    const h = (current = await harness({width: 200, height: 60}, 0.01));
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 4, -LINE / 2))).toBe(4);
    const content = h.editable.content;
    const size = content.size.peek()!;
    const corner = content.localToWorld(new THREE.Vector3(0.5, 0.5, 0));
    const opposite = content.localToWorld(new THREE.Vector3(-0.5, 0.5, 0));
    expect(corner.distanceTo(opposite)).toBeCloseTo(size[0] * 0.01, 6);
  });
});

describe('EditableText layout bookkeeping', () => {
  let current: Harness | undefined;

  afterEach(() => {
    current?.dispose();
    current = undefined;
  });

  it('rewraps when the viewport width changes', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'aaaa bbbb cccc dddd eeee ffff';
    h.editable.update(state({text, multiline: true}));
    await h.layout();
    const before = h.editable.navigate('End')!.end;
    const measurements = h.measurer.calls;

    h.root.setProperties({width: 90});
    await vi.waitFor(() => {
      h.root.update(16);
      expect(h.editable.content.size.peek()?.[0]).toBeCloseTo(90, 3);
    });
    h.editable.afterLayout();
    expect(h.measurer.calls).toBe(measurements + 1);
    expect(h.editable.isReady).toBe(true);
    expect(h.editable.navigate('End')!.end).toBeLessThan(before);
  });
});

import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {Text} from 'troika-three-text';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EditableText, type EditableTextState} from './EditableText';

/**
 * Replaces only the asynchronous Troika boundary. `getCaretAtPoint` and
 * `getSelectionRects` stay real, so the selection math under test is the
 * shipping implementation running on a deterministic monospace layout instead
 * of a WebGL/SDF font worker, which jsdom cannot provide. Anything visual still
 * needs the browser sample the parent owns.
 */
vi.mock('troika-three-text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('troika-three-text')>();
  const pending: Array<() => void> = [];

  interface Glyph {
    index: number;
    units: number;
    char: string;
    width: number;
    x: number;
  }

  interface TroikaInternals {
    _needsSync?: boolean;
  }

  /**
   * Real Troika `Text`, so the property dirty tracking, the geometry, and the
   * material derivation stay authentic; only the asynchronous typesetting step
   * is replaced with a deterministic monospace layout that jsdom can run.
   */
  class FakeText extends actual.Text {
    syncs = 0;
    private syncing = false;
    private queued: Array<(() => void) | undefined> = [];
    private info: ReturnType<typeof typeset> | null = null;

    override get textRenderInfo() {
      return this.info as unknown as null;
    }

    override sync(callback?: () => void): void {
      const internals = this as unknown as TroikaInternals;
      if (internals._needsSync !== true) return;
      internals._needsSync = false;
      if (this.syncing) {
        this.queued.push(callback);
        return;
      }
      this.syncing = true;
      this.syncs++;
      pending.push(() => {
        this.syncing = false;
        this.info = typeset(this as unknown as Record<string, unknown>);
        if (this.queued.length > 0) {
          const queued = this.queued;
          this.queued = [];
          internals._needsSync = true;
          this.sync(() => queued.forEach((fn) => fn?.()));
        }
        callback?.();
      });
    }

    static flush(): void {
      const queue = pending.splice(0, pending.length);
      for (const resolve of queue) resolve();
    }

    static pending(): number {
      return pending.length;
    }
  }

  /** Monospace typesetter mirroring Troika's caret conventions. */
  function typeset(text: Record<string, unknown>) {
    const source = String(text.text ?? '');
    const fontSize = Number(text.fontSize ?? 16);
    const lineHeight =
      typeof text.lineHeight === 'number'
        ? text.lineHeight * fontSize
        : 1.2 * fontSize;
    const maxWidth = Number(text.maxWidth ?? Number.POSITIVE_INFINITY);
    const wraps = text.whiteSpace !== 'nowrap' && Number.isFinite(maxWidth);

    const glyphs: Glyph[] = [];
    let index = 0;
    for (const char of source) {
      const units = char.length;
      glyphs.push({
        index,
        units,
        char,
        // Astral characters are twice as wide, like a typical emoji cell.
        width: char === '\n' ? 0 : units === 2 ? fontSize : fontSize / 2,
        x: 0,
      });
      index += units;
    }

    const lines: Glyph[][] = [[]];
    let pen = 0;
    for (const glyph of glyphs) {
      const line = lines[lines.length - 1];
      if (wraps && line.length > 0 && pen + glyph.width > maxWidth) {
        let breakAt = -1;
        for (let i = line.length - 1; i >= 0; i--) {
          if (/\s/.test(line[i].char)) {
            breakAt = i;
            break;
          }
        }
        const moved = breakAt >= 0 ? line.splice(breakAt + 1) : [];
        const next: Glyph[] = moved;
        lines.push(next);
        pen = 0;
        for (const carried of next) {
          carried.x = pen;
          pen += carried.width;
        }
      }
      const current = lines[lines.length - 1];
      glyph.x = pen;
      current.push(glyph);
      pen += glyph.width;
      if (glyph.char === '\n') {
        lines.push([]);
        pen = 0;
      }
    }

    const caretPositions = new Float32Array(source.length * 4);
    let maxLineWidth = 0;
    lines.forEach((line, lineIndex) => {
      const top = -lineIndex * lineHeight;
      const bottom = top - lineHeight;
      for (const glyph of line) {
        const slot = glyph.index * 4;
        if (glyph.units === 2) {
          const middle = glyph.x + glyph.width / 2;
          caretPositions[slot] = glyph.x;
          caretPositions[slot + 1] = middle;
          caretPositions[slot + 2] = bottom;
          caretPositions[slot + 3] = top;
          caretPositions[slot + 4] = middle;
          caretPositions[slot + 5] = glyph.x + glyph.width;
          caretPositions[slot + 6] = bottom;
          caretPositions[slot + 7] = top;
        } else {
          caretPositions[slot] = glyph.x;
          caretPositions[slot + 1] = glyph.x + glyph.width;
          caretPositions[slot + 2] = bottom;
          caretPositions[slot + 3] = top;
        }
        maxLineWidth = Math.max(maxLineWidth, glyph.x + glyph.width);
      }
    });

    const height = lines.length * lineHeight;
    return Object.freeze({
      sdfTexture: {},
      caretPositions,
      blockBounds: [0, -height, maxLineWidth, 0],
      visibleBounds: [0, -height, maxLineWidth, 0],
      lineHeight,
      topBaseline: -lineHeight * 0.8,
      ascender: fontSize * 0.8,
      descender: -fontSize * 0.2,
    });
  }

  return {...actual, Text: FakeText};
});

const troika = Text as unknown as {
  flush(): void;
  pending(): number;
};

const FONT_SIZE = 16;
const CELL = FONT_SIZE / 2;
const LINE = FONT_SIZE * 1.25;

interface Harness {
  readonly scene: THREE.Scene;
  readonly carrier: THREE.Group;
  readonly root: Container;
  readonly viewport: Container;
  readonly editable: EditableText;
  readonly errors: Array<{kind: string; message: string}>;
  layouts: number;
  flush(): void;
  step(): void;
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
  const state = {layouts: 0};
  const editable = new EditableText(root, {
    onError: (failure) => errors.push(failure),
    onLayout: () => state.layouts++,
  });
  const instance: Harness = {
    scene,
    carrier,
    root,
    viewport: root,
    editable,
    errors,
    get layouts() {
      return state.layouts;
    },
    set layouts(value: number) {
      state.layouts = value;
    },
    flush: () => {
      // Drains the queue until it settles: a value change while a layout is in
      // flight makes Troika re-sync once the first one resolves.
      for (let round = 0; round < 10 && troika.pending() > 0; round++) {
        troika.flush();
      }
    },
    step: () => troika.flush(),
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
  return instance;
}

function state(overrides: Partial<EditableTextState> = {}): EditableTextState {
  return {
    text: '',
    focused: true,
    fontSize: FONT_SIZE,
    lineHeight: 1.25,
    caretWidth: 2,
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
  return count / 6;
}

function meshNamed(editable: EditableText, name: string): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  editable.content.traverse((child) => {
    if (child.name === name) found = child as THREE.Mesh;
  });
  if (found == null) throw new Error(`missing mesh ${name}`);
  return found;
}

describe('EditableText presentation', () => {
  let current: Harness | undefined;

  afterEach(() => {
    current?.dispose();
    current = undefined;
    vi.useRealTimers();
  });

  it('mounts one retained Content and reuses it across updates', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'hello'}));
    await h.layout();
    h.flush();

    expect(h.editable.content.parent).toBe(h.root);
    expect(h.editable.isReady).toBe(true);
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs');
    const caret = meshNamed(h.editable, 'EditableTextCaret');

    h.editable.update(
      state({text: 'hello', selectionStart: 2, selectionEnd: 2})
    );
    expect(meshNamed(h.editable, 'EditableTextGlyphs')).toBe(glyphs);
    expect(meshNamed(h.editable, 'EditableTextCaret')).toBe(caret);
  });

  it('does not restart the glyph layout for selection-only changes', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'hello world'}));
    await h.layout();
    h.flush();
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs') as unknown as {
      syncs: number;
    };
    const syncs = glyphs.syncs;

    h.editable.update(
      state({text: 'hello world', selectionStart: 2, selectionEnd: 6})
    );
    expect(glyphs.syncs).toBe(syncs);
    expect(troika.pending()).toBe(0);
    expect(h.editable.isReady).toBe(true);
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextSelection'))).toBe(1);

    h.editable.update(state({text: 'hello world!', selectionStart: 12}));
    expect(glyphs.syncs).toBe(syncs + 1);
  });

  it('refuses pointer indices until the pending layout matches the value', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();
    h.flush();
    expect(
      h.editable.caretAtPoint(worldPoint(h, CELL * 2 + 1, -LINE / 2))
    ).toBe(2);

    h.editable.update(state({text: 'abcdefghij'}));
    expect(h.editable.isReady).toBe(false);
    expect(
      h.editable.caretAtPoint(worldPoint(h, CELL * 8, -LINE / 2))
    ).toBeUndefined();
    expect(h.editable.navigate('End')).toBeUndefined();

    h.flush();
    expect(h.editable.isReady).toBe(true);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 8, -LINE / 2))).toBe(8);
  });

  it('discards a superseded layout callback and keeps the newest one', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'first'}));
    await h.layout();
    h.editable.update(state({text: 'second value'}));
    // Resolves the in-flight layout for "first"; Troika then re-syncs and only
    // the newer result may become the active snapshot.
    h.step();
    expect(h.editable.isReady).toBe(false);
    h.step();
    expect(h.editable.isReady).toBe(true);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 12, -LINE / 2))).toBe(
      12
    );
  });

  it('maps world points through moved, scaled, and rotated cards', async () => {
    const h = (current = await harness());
    h.carrier.position.set(1.5, -0.25, 0.75);
    h.carrier.rotation.set(0.3, 0.7, -0.2);
    h.carrier.scale.setScalar(2.5);
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();
    h.flush();

    expect(h.editable.caretAtPoint(worldPoint(h, 0, -LINE / 2))).toBe(0);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 3, -LINE / 2))).toBe(3);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 6, -LINE / 2))).toBe(6);
  });

  it('keeps UTF-16 indices on code point boundaries', async () => {
    const h = (current = await harness());
    const text = 'a😀b';
    h.editable.update(state({text}));
    await h.layout();
    h.flush();

    // The emoji occupies one double-width cell starting at CELL.
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 1.2, -LINE / 2))).toBe(
      1
    );
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 2.8, -LINE / 2))).toBe(
      3
    );
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 4, -LINE / 2))).toBe(4);

    h.editable.update(state({text, selectionStart: 2, selectionEnd: 2}));
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextCaret'))).toBe(1);
    const collapsed = h.editable.navigate('End');
    expect(collapsed).toEqual({start: 4, end: 4, direction: 'none'});
  });

  it('renders selection rectangles per rendered row', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    h.editable.update(
      state({
        text: 'alpha beta gamma delta epsilon zeta',
        multiline: true,
        selectionStart: 0,
        selectionEnd: 34,
      })
    );
    await h.layout();
    h.flush();
    const selection = meshNamed(h.editable, 'EditableTextSelection');
    expect(drawnQuads(selection)).toBeGreaterThan(1);

    h.editable.update(
      state({
        text: 'alpha beta gamma delta epsilon zeta',
        multiline: true,
        selectionStart: 1,
        selectionEnd: 4,
      })
    );
    expect(drawnQuads(selection)).toBe(1);
    const position = selection.geometry.getAttribute('position');
    expect(position.getX(0)).toBeCloseTo(CELL, 5);
    expect(position.getX(1)).toBeCloseTo(CELL * 4, 5);
  });

  it('navigates wrapped lines by geometry instead of newlines', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    // One logical line long enough to soft wrap several times.
    const text = 'aaaa bbbb cccc dddd eeee ffff';
    h.editable.update(
      state({text, multiline: true, selectionStart: 2, selectionEnd: 2})
    );
    await h.layout();
    h.flush();
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
    const back = h.editable.navigate('ArrowUp');
    expect(back).toEqual({start: 2, end: 2, direction: 'none'});
  });

  it('extends a selection and keeps the goal column across a short line', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    // The middle line is shorter than the goal column, which a caret walk must
    // remember instead of collapsing to the short line's end.
    const text = 'aaaaaaaa\nbb\ncccccccc';
    h.editable.update(
      state({text, multiline: true, selectionStart: 6, selectionEnd: 6})
    );
    await h.layout();
    h.flush();

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
    const second = h.editable.navigate('ArrowDown', {extend: true})!;
    expect(second).toEqual({start: 6, end: 18, direction: 'forward'});

    h.editable.update(
      state({text, multiline: true, selectionStart: 18, selectionEnd: 18})
    );
    const home = h.editable.navigate('Home', {extend: true})!;
    expect(home).toEqual({start: 12, end: 18, direction: 'backward'});
  });

  it('places Home and End on the rendered row', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'one two\nthree';
    h.editable.update(
      state({text, multiline: true, selectionStart: 9, selectionEnd: 9})
    );
    await h.layout();
    h.flush();

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

  it('reaches the empty line created by a trailing newline', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'one\n';
    h.editable.update(
      state({text, multiline: true, selectionStart: 1, selectionEnd: 1})
    );
    await h.layout();
    h.flush();

    const down = h.editable.navigate('ArrowDown');
    expect(down).toEqual({start: 4, end: 4, direction: 'none'});
    h.editable.update(
      state({text, multiline: true, selectionStart: 4, selectionEnd: 4})
    );
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    expect(drawnQuads(caret)).toBe(1);
    const position = caret.geometry.getAttribute('position');
    expect(position.getY(0)).toBeLessThan(-LINE);
  });

  it('clamps vertical scrolling and reveals the caret', async () => {
    const h = (current = await harness({width: 100, height: 2 * LINE}));
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    h.editable.update(
      state({text, multiline: true, selectionStart: 0, selectionEnd: 0})
    );
    await h.layout();
    h.flush();

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
    h.flush();
    expect(h.editable.offsetX).toBe(0);
    expect(h.editable.scroll.getOffset()).toBe(0);

    h.editable.update(
      state({text, selectionStart: text.length, selectionEnd: text.length})
    );
    expect(h.editable.offsetX).toBeGreaterThan(0);
    expect(h.editable.offsetX).toBeCloseTo(text.length * CELL + 2 - 80, 5);
    expect(h.editable.scroll.getOffset()).toBe(0);

    // The caret stays inside the clipped viewport after scrolling.
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    const position = caret.geometry.getAttribute('position');
    expect(position.getX(0)).toBeGreaterThanOrEqual(h.editable.offsetX - 0.001);
    expect(position.getX(1)).toBeLessThanOrEqual(h.editable.offsetX + 80.001);
  });

  it('projects world points into viewport pixels', async () => {
    const h = (current = await harness({width: 200, height: 60}));
    h.editable.update(state({text: 'abc'}));
    await h.layout();
    h.flush();
    const projected = h.editable.scroll.projectPoint(
      worldPoint(h, CELL * 2, -LINE / 2)
    );
    expect(projected?.x).toBeCloseTo(CELL * 2, 4);
    expect(projected?.y).toBeCloseTo(LINE / 2, 4);
  });

  it('shows the placeholder and keeps the caret at index zero', async () => {
    const h = (current = await harness());
    h.editable.update(
      state({text: '', placeholder: 'Search', placeholderColor: '#999999'})
    );
    await h.layout();
    h.flush();
    expect(h.editable.isReady).toBe(true);
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextCaret'))).toBe(1);
    expect(drawnQuads(meshNamed(h.editable, 'EditableTextSelection'))).toBe(0);
    expect(h.editable.caretAtPoint(worldPoint(h, CELL * 4, -LINE / 2))).toBe(0);
    expect(h.editable.navigate('End')).toEqual({
      start: 0,
      end: 0,
      direction: 'none',
    });
  });

  it('reports a stalled layout instead of swallowing it', async () => {
    vi.useFakeTimers();
    const h = (current = await harness());
    h.editable.update(state({text: 'never resolves'}));
    expect(h.editable.isReady).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].kind).toBe('layout-timeout');
    expect(h.editable.error?.kind).toBe('layout-timeout');
    expect(h.editable.isReady).toBe(false);

    // A late completion for the current value recovers the readiness state.
    h.flush();
    expect(h.editable.error).toBeUndefined();
    expect(h.editable.isReady).toBe(true);
  });

  it('surfaces a synchronous layout failure', async () => {
    const h = (current = await harness());
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs') as unknown as {
      sync: (callback?: () => void) => void;
    };
    const original = glyphs.sync.bind(glyphs);
    glyphs.sync = () => {
      throw new Error('font worker unavailable');
    };
    h.editable.update(state({text: 'boom'}));
    expect(h.errors[0]?.kind).toBe('layout-failed');
    expect(h.editable.isReady).toBe(false);
    glyphs.sync = original;
  });

  it('releases what it owns and ignores late completions', async () => {
    const h = (current = await harness());
    h.editable.update(state({text: 'disposable'}));
    await h.layout();
    h.flush();
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs');
    const caret = meshNamed(h.editable, 'EditableTextCaret');
    const selection = meshNamed(h.editable, 'EditableTextSelection');
    const disposals = [glyphs, caret, selection].map((mesh) =>
      vi.spyOn(mesh.geometry, 'dispose')
    );
    const material = vi.spyOn(caret.material as THREE.Material, 'dispose');
    const content = h.editable.content;

    h.editable.update(state({text: 'disposable text'}));
    h.editable.dispose();
    expect(content.parent).toBeNull();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();

    const layouts = h.layouts;
    h.flush();
    expect(h.layouts).toBe(layouts);
    expect(h.editable.isReady).toBe(false);
    expect(h.editable.caretAtPoint(new THREE.Vector3())).toBeUndefined();
    // Disposing twice must stay a no-op.
    h.editable.dispose();
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
      })
    );
    await h.layout();
    h.flush();

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
      expect(mesh.renderOrder).toBe(7);
    }
    // Troika clips its own glyphs to the scrolled viewport rectangle too.
    const glyphs = meshNamed(h.editable, 'EditableTextGlyphs') as unknown as {
      clipRect: number[];
    };
    const size = h.editable.content.size.peek()!;
    expect(glyphs.clipRect[0]).toBeCloseTo(0, 6);
    expect(glyphs.clipRect[1]).toBeCloseTo(-size[1], 6);
    expect(glyphs.clipRect[2]).toBeCloseTo(size[0], 6);
    expect(glyphs.clipRect[3]).toBeCloseTo(0, 6);
    // The quad colors carry the selection tint, since Content forces white.
    const selection = meshNamed(h.editable, 'EditableTextSelection');
    const colors = selection.geometry.getAttribute('color');
    const expected = new THREE.Color('#3b82f6');
    expect(colors.getX(0)).toBeCloseTo(expected.r, 5);
    expect(colors.getW(0)).toBeCloseTo(0.4, 5);
    expect(
      (selection.material as THREE.MeshBasicMaterial).color.getHexString()
    ).toBe('ffffff');
  });

  it('honors a non default pixel size without changing layout units', async () => {
    const h = (current = await harness({width: 200, height: 60}, 0.01));
    h.editable.update(state({text: 'abcdef'}));
    await h.layout();
    h.flush();
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    current?.dispose();
    current = undefined;
  });

  it('rewraps when the viewport width changes', async () => {
    const h = (current = await harness({width: 200, height: 120}));
    const text = 'aaaa bbbb cccc dddd eeee ffff';
    h.editable.update(state({text, multiline: true}));
    await h.layout();
    h.flush();
    const before = h.editable.navigate('End')!.end;

    h.root.setProperties({width: 90});
    await vi.waitFor(() => {
      h.root.update(16);
      expect(h.editable.content.size.peek()?.[0]).toBeCloseTo(90, 3);
    });
    h.editable.afterLayout();
    expect(h.editable.isReady).toBe(false);
    h.flush();
    expect(h.editable.isReady).toBe(true);
    const after = h.editable.navigate('End')!.end;
    expect(after).toBeLessThan(before);
  });
});

import {afterEach, describe, expect, it} from 'vitest';

import {graphemeSegments} from './CanvasTextStyle';
import {
  buildEditableTextLayout,
  caretGeometry,
  caretIndexAtPoint,
  DomTextMeasurer,
  fallbackFontMetrics,
  selectionRects,
  type EditableTextStyle,
  type MeasuredGrapheme,
  type TextMeasurement,
} from './EditableTextLayout';

const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
/** Advance of an ordinary character in the deterministic test face. */
const CELL = FONT_SIZE / 2;
/** Wide characters, such as emoji, occupy two cells. */
const WIDE_CELL = FONT_SIZE;
/** `tab-size: 4` in the test face, expressed in cells. */
const TAB_CELLS = 4;
const METRICS = fallbackFontMetrics(FONT_SIZE);

function style(overrides: Partial<EditableTextStyle> = {}): EditableTextStyle {
  return {
    fontSize: FONT_SIZE,
    fontWeight: 'normal',
    lineHeight: LINE_HEIGHT,
    textAlign: 'left',
    direction: 'ltr',
    multiline: true,
    width: 200,
    ...overrides,
  };
}

function advance(grapheme: string): number {
  if (grapheme === '\t') return CELL * TAB_CELLS;
  const wide = [...grapheme].some(
    (character) => (character.codePointAt(0) ?? 0) > 0xffff
  );
  return wide ? WIDE_CELL : CELL;
}

interface Token {
  start: number;
  end: number;
  space: boolean;
  width: number;
  parts: Array<{start: number; end: number; width: number}>;
}

/**
 * Left-to-right monospace stand-in for a browser text engine.
 *
 * It reproduces the parts of `white-space: pre-wrap` that the layout depends
 * on: spaces are never collapsed, trailing spaces hang past the wrap, and a
 * word wider than the line breaks between graphemes.
 */
function monospace(text: string, given: EditableTextStyle): TextMeasurement {
  const graphemes: MeasuredGrapheme[] = [];
  let row = 0;
  let offset = 0;
  for (const paragraph of text.split('\n')) {
    for (const line of wrap(paragraph, offset, given)) {
      let pen = 0;
      const total = line.reduce((sum, part) => sum + part.width, 0);
      let x = alignmentOffset(given, total);
      for (const part of line) {
        graphemes.push({
          start: part.start,
          end: part.end,
          left: x,
          right: x + part.width,
          top: row * given.lineHeight,
          bottom: (row + 1) * given.lineHeight,
        });
        x += part.width;
        pen += part.width;
      }
      expect(pen).toBe(total);
      row++;
    }
    offset += paragraph.length + 1;
  }
  return {
    graphemes,
    direction: given.direction === 'rtl' ? 'rtl' : 'ltr',
  };
}

function alignmentOffset(given: EditableTextStyle, total: number): number {
  if (given.textAlign === 'center') return (given.width - total) / 2;
  if (given.textAlign === 'right') return given.width - total;
  return 0;
}

function tokenize(paragraph: string, offset: number): Token[] {
  const tokens: Token[] = [];
  for (const {segment, index} of graphemeSegments(paragraph)) {
    const space = segment === ' ' || segment === '\t';
    const part = {
      start: offset + index,
      end: offset + index + segment.length,
      width: advance(segment),
    };
    const last = tokens[tokens.length - 1];
    if (last != null && last.space === space) {
      last.end = part.end;
      last.width += part.width;
      last.parts.push(part);
      continue;
    }
    tokens.push({
      start: part.start,
      end: part.end,
      space,
      width: part.width,
      parts: [part],
    });
  }
  return tokens;
}

function wrap(
  paragraph: string,
  offset: number,
  given: EditableTextStyle
): Array<Array<{start: number; end: number; width: number}>> {
  const lines: Array<Array<{start: number; end: number; width: number}>> = [];
  let current: Array<{start: number; end: number; width: number}> = [];
  let used = 0;
  for (const token of tokenize(paragraph, offset)) {
    if (token.space || !given.multiline) {
      current.push(...token.parts);
      used += token.width;
      continue;
    }
    if (current.length > 0 && used + token.width > given.width) {
      lines.push(current);
      current = [];
      used = 0;
    }
    if (token.width <= given.width) {
      current.push(...token.parts);
      used += token.width;
      continue;
    }
    for (const part of token.parts) {
      if (current.length > 0 && used + part.width > given.width) {
        lines.push(current);
        current = [];
        used = 0;
      }
      current.push(part);
      used += part.width;
    }
  }
  lines.push(current);
  return lines;
}

function layoutOf(text: string, overrides: Partial<EditableTextStyle> = {}) {
  const resolved = style(overrides);
  return buildEditableTextLayout(
    text,
    resolved,
    monospace(text, resolved),
    METRICS
  );
}

/**
 * Hand-written boxes matching what Chrome reports for bidirectional text, so
 * the run and caret rules can be proved without a browser.
 */
function fixture(
  text: string,
  boxes: Array<[start: number, end: number, left: number, right: number]>,
  direction: 'ltr' | 'rtl' = 'ltr'
): TextMeasurement {
  expect(text.length).toBeGreaterThan(0);
  return {
    direction,
    graphemes: boxes.map(([start, end, left, right]) => ({
      start,
      end,
      left,
      right,
      top: 0,
      bottom: LINE_HEIGHT,
    })),
  };
}

describe('editable text rows', () => {
  it('keeps rounded soft-wrap rows separate over a long paragraph', () => {
    const text = 'x'.repeat(160);
    const layout = buildEditableTextLayout(
      text,
      style({width: 10, lineHeight: 31.2}),
      {
        direction: 'ltr',
        graphemes: Array.from(text, (_, index) => ({
          start: index,
          end: index + 1,
          left: 0,
          right: 10,
          top: index * 31,
          bottom: index * 31 + 30,
        })),
      },
      METRICS
    );
    expect(layout.lines).toHaveLength(text.length);
    expect(layout.lines.map((line) => line.start)).toEqual(
      Array.from(text, (_, index) => index)
    );
  });

  it('keeps cursive runs joined when native boxes overlap by a rounded pixel', () => {
    const text = 'مرحبا';
    const layout = buildEditableTextLayout(
      text,
      style(),
      fixture(text, [
        [0, 1, 41, 55],
        [1, 2, 32, 42],
        [2, 3, 15, 33],
        [3, 4, 7, 16],
        [4, 5, 0, 8],
      ]),
      METRICS
    );
    expect(layout.lines[0].segments).toEqual([
      {start: 0, end: text.length, left: 0, rtl: true},
    ]);
  });

  it('keeps leading, repeated, and trailing spaces addressable', () => {
    const text = '  a  b ';
    const layout = layoutOf(text);
    expect(layout.lines).toHaveLength(1);
    const line = layout.lines[0];
    expect(line.start).toBe(0);
    expect(line.end).toBe(text.length);
    expect(line.carets.map((caret) => caret.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(line.carets.map((caret) => caret.x)).toEqual([
      0,
      CELL,
      CELL * 2,
      CELL * 3,
      CELL * 4,
      CELL * 5,
      CELL * 6,
      CELL * 7,
    ]);
  });

  it('wraps at spaces and breaks a word that cannot fit', () => {
    const width = CELL * 6;
    const wrapped = layoutOf('ab cd', {width});
    expect(wrapped.lines.map((line) => line.start)).toEqual([0]);

    const broken = layoutOf('abcdefghij', {width});
    expect(broken.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 6],
      [6, 10],
    ]);
    expect(broken.lines.every((line) => !line.hardBreak)).toBe(true);
    expect(broken.height).toBe(2 * LINE_HEIGHT);
  });

  it('lets a trailing space hang instead of starting a row', () => {
    const layout = layoutOf('abc def', {width: CELL * 4});
    expect(layout.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 4],
      [4, 7],
    ]);
  });

  it('builds an empty row for every explicit newline, including the last', () => {
    const layout = layoutOf('a\n\nb\n');
    expect(layout.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 1],
      [2, 2],
      [3, 4],
      [5, 5],
    ]);
    expect(layout.lines.map((line) => line.hardBreak)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(layout.lines[1].carets).toEqual([{index: 2, x: 0}]);
    expect(layout.lines[3].carets).toEqual([{index: 5, x: 0}]);
    expect(layout.height).toBe(4 * LINE_HEIGHT);
  });

  it('gives an empty value one row whose caret follows the alignment', () => {
    expect(layoutOf('').lines[0].carets).toEqual([{index: 0, x: 0}]);
    expect(layoutOf('', {textAlign: 'center'}).lines[0].carets).toEqual([
      {index: 0, x: 100},
    ]);
    expect(layoutOf('', {textAlign: 'right'}).lines[0].carets).toEqual([
      {index: 0, x: 200},
    ]);
  });

  it('places the baseline inside the row using the font metrics', () => {
    const layout = layoutOf('a\nb');
    const halfLeading = (LINE_HEIGHT - (METRICS.ascent + METRICS.descent)) / 2;
    expect(layout.lines[0].top).toBe(0);
    expect(layout.lines[0].bottom).toBe(-LINE_HEIGHT);
    expect(layout.lines[0].baseline).toBeCloseTo(
      -halfLeading - METRICS.ascent,
      6
    );
    expect(layout.lines[1].baseline).toBeCloseTo(
      -LINE_HEIGHT - halfLeading - METRICS.ascent,
      6
    );
    expect(layout.lines[0].baseline).toBeLessThan(layout.lines[0].top);
    expect(layout.lines[0].baseline).toBeGreaterThan(layout.lines[0].bottom);
  });
});

describe('editable text paint segments', () => {
  it('drops a tab from the painted pieces but keeps its advance', () => {
    const text = 'a\tb';
    const layout = layoutOf(text);
    const line = layout.lines[0];
    expect(
      line.segments.map((segment) => text.slice(segment.start, segment.end))
    ).toEqual(['a', 'b']);
    expect(line.segments[1].left).toBe(CELL + CELL * TAB_CELLS);
    expect(line.carets.map((caret) => caret.x)).toEqual([
      0,
      CELL,
      CELL + CELL * TAB_CELLS,
      CELL * 2 + CELL * TAB_CELLS,
    ]);
  });

  it('keeps a run of ordinary text in one piece', () => {
    const layout = layoutOf('hello world');
    expect(layout.lines[0].segments).toHaveLength(1);
    expect(layout.lines[0].segments[0]).toMatchObject({
      start: 0,
      end: 11,
      left: 0,
      rtl: false,
    });
  });

  it('splits a mixed-direction row into one piece per direction', () => {
    // "ab" then Hebrew "גב", which Chrome lays out as a b ג ב.
    const text = 'abבג';
    const layout = buildEditableTextLayout(
      text,
      style(),
      fixture(text, [
        [0, 1, 0, CELL],
        [1, 2, CELL, CELL * 2],
        [2, 3, CELL * 3, CELL * 4],
        [3, 4, CELL * 2, CELL * 3],
      ]),
      METRICS
    );
    const segments = layout.lines[0].segments;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({start: 0, end: 2, left: 0, rtl: false});
    expect(segments[1]).toMatchObject({
      start: 2,
      end: 4,
      left: CELL * 2,
      rtl: true,
    });
  });
});

describe('editable text carets', () => {
  it('uses the logical edge of every grapheme in a right-to-left row', () => {
    // "בג" alone, laid out right to left inside a 4-cell box.
    const text = 'בג';
    const layout = buildEditableTextLayout(
      text,
      style({direction: 'rtl'}),
      fixture(
        text,
        [
          [0, 1, CELL, CELL * 2],
          [1, 2, 0, CELL],
        ],
        'rtl'
      ),
      METRICS
    );
    expect(layout.lines[0].carets).toEqual([
      {index: 0, x: CELL * 2},
      {index: 1, x: CELL},
      {index: 2, x: 0},
    ]);
    // Advancing through the value moves the caret leftwards, never rightwards.
    expect(caretIndexAtPoint(layout, CELL * 1.9, -1)).toBe(0);
    expect(caretIndexAtPoint(layout, CELL * 0.1, -1)).toBe(2);
  });

  it('never lands inside a surrogate pair or a joined emoji', () => {
    const text = 'a😀b👩‍👩‍👧c';
    const layout = layoutOf(text);
    const indices = layout.lines[0].carets.map((caret) => caret.index);
    expect(indices).toEqual([0, 1, 3, 4, 12, 13]);
    for (const x of [0, CELL, CELL * 2, CELL * 3, CELL * 6, CELL * 9]) {
      expect(indices).toContain(caretIndexAtPoint(layout, x, -1));
    }
  });

  it('snaps an index that falls inside a grapheme down to its start', () => {
    const layout = layoutOf('a😀b');
    expect(caretGeometry(layout, 2)).toMatchObject({index: 1, line: 0});
    expect(caretGeometry(layout, 3)).toMatchObject({index: 3, line: 0});
  });

  it('shows a soft-wrap index on the row where it leads a character', () => {
    const layout = layoutOf('abcdefghij', {width: CELL * 6});
    expect(layout.lines[0].end).toBe(6);
    expect(layout.lines[1].start).toBe(6);
    expect(caretGeometry(layout, 6)).toMatchObject({line: 1, x: 0});
    // The row that a hard break closes keeps its own final caret.
    const hard = layoutOf('abc\ndef');
    expect(caretGeometry(hard, 3)).toMatchObject({line: 0, x: CELL * 3});
  });

  it('maps a point past the end of a row to that row end', () => {
    const layout = layoutOf('ab\ncdef');
    expect(caretIndexAtPoint(layout, 1000, -1)).toBe(2);
    expect(caretIndexAtPoint(layout, 1000, -LINE_HEIGHT - 1)).toBe(7);
    expect(caretIndexAtPoint(layout, -1000, -LINE_HEIGHT - 1)).toBe(3);
    // Above the first row and below the last row clamp to the nearest one.
    expect(caretIndexAtPoint(layout, 0, 1000)).toBe(0);
    expect(caretIndexAtPoint(layout, 0, -1000)).toBe(3);
  });
});

describe('editable text selection rectangles', () => {
  it('returns one rectangle per row of a wrapped selection', () => {
    const layout = layoutOf('abcdefghij', {width: CELL * 6});
    const rects = selectionRects(layout, 2, 8);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({
      left: CELL * 2,
      right: CELL * 6,
      top: 0,
      bottom: -LINE_HEIGHT,
    });
    expect(rects[1]).toEqual({
      left: 0,
      right: CELL * 2,
      top: -LINE_HEIGHT,
      bottom: -2 * LINE_HEIGHT,
    });
  });

  it('returns a rectangle per visual run when a selection crosses directions', () => {
    const text = 'abבג';
    const layout = buildEditableTextLayout(
      text,
      style(),
      fixture(text, [
        [0, 1, 0, CELL],
        [1, 2, CELL, CELL * 2],
        [2, 3, CELL * 3, CELL * 4],
        [3, 4, CELL * 2, CELL * 3],
      ]),
      METRICS
    );
    expect(selectionRects(layout, 1, 3)).toEqual([
      {left: CELL, right: CELL * 2, top: 0, bottom: -LINE_HEIGHT},
      {left: CELL * 3, right: CELL * 4, top: 0, bottom: -LINE_HEIGHT},
    ]);
  });

  it('covers a partially selected grapheme and ignores an empty range', () => {
    const layout = layoutOf('a😀b');
    expect(selectionRects(layout, 2, 3)).toEqual([
      {left: CELL, right: CELL + WIDE_CELL, top: 0, bottom: -LINE_HEIGHT},
    ]);
    expect(selectionRects(layout, 2, 2)).toEqual([]);
  });
});

/**
 * jsdom implements no box geometry at all, so `Range` gets a monospace stand-in
 * for the duration of one test. Anything about real glyph advances, shaping, or
 * line breaking can only be proved in a browser.
 */
function stubRangeGeometry(includeBoundaryCaret = false): () => void {
  const prototype = Range.prototype as unknown as Record<string, unknown>;
  const original = {
    getClientRects: prototype.getClientRects,
    getBoundingClientRect: prototype.getBoundingClientRect,
  };
  function rect(this: Range): DOMRect {
    const left = this.startOffset * CELL;
    const right = this.endOffset * CELL;
    return new DOMRect(left, 0, right - left, LINE_HEIGHT);
  }
  prototype.getClientRects = function (this: Range) {
    const glyph = rect.call(this);
    return includeBoundaryCaret &&
      this.startContainer.textContent?.[this.startOffset - 1] === '\n'
      ? [new DOMRect(99, -LINE_HEIGHT, 0, LINE_HEIGHT), glyph]
      : [glyph];
  };
  prototype.getBoundingClientRect = rect;
  return () => {
    prototype.getClientRects = original.getClientRects;
    prototype.getBoundingClientRect = original.getBoundingClientRect;
  };
}

describe('DOM measurement mirror', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('ignores a previous-line zero-width rectangle before the actual glyph box', () => {
    cleanups.push(stubRangeGeometry(true));
    const measurer = new DomTextMeasurer();
    cleanups.push(() => measurer.dispose());
    const result = measurer.measure('a\nb', style());
    expect(result.graphemes[1]).toMatchObject({
      start: 2,
      end: 3,
      left: CELL * 2,
      right: CELL * 3,
      top: 0,
      bottom: LINE_HEIGHT,
    });
  });

  it('measures inside a hidden element and leaves nothing behind', () => {
    cleanups.push(stubRangeGeometry());
    const measurer = new DomTextMeasurer();
    const mirror = document.body.lastElementChild as HTMLElement;
    expect(mirror.getAttribute('aria-hidden')).toBe('true');
    expect(mirror.style.position).toBe('fixed');
    expect(mirror.style.visibility).toBe('hidden');

    const text = '<b>x</b>\ty\nz';
    const measurement = measurer.measure(text, style());
    // Text reaches the mirror as text, never as markup.
    expect(mirror.querySelector('b')).toBeNull();
    expect(mirror.style.whiteSpace).toBe('pre-wrap');
    expect(mirror.style.width).toBe('200px');
    expect(mirror.style.lineHeight).toBe('20px');
    expect(measurement.direction).toBe('ltr');
    // Line feeds carry no box; every other grapheme does.
    expect(measurement.graphemes).toHaveLength(text.length - 1);
    expect(measurement.graphemes[0]).toEqual({
      start: 0,
      end: 1,
      left: 0,
      right: CELL,
      top: 0,
      bottom: LINE_HEIGHT,
    });
    expect(measurement.graphemes.map((item) => item.start)).not.toContain(
      text.indexOf('\n')
    );
    // The measured text is dropped again, so nothing is retained in the page.
    expect(mirror.textContent).toBe('');

    measurer.measure('shalom', style({multiline: false, direction: 'rtl'}));
    expect(mirror.style.whiteSpace).toBe('pre');
    expect(mirror.style.direction).toBe('rtl');

    measurer.dispose();
    expect(mirror.isConnected).toBe(false);
  });
});

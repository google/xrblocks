import {describe, expect, it} from 'vitest';
import {
  buildEditableTextLayout,
  caretGeometry,
  caretIndexAtPoint,
  DomTextMeasurer,
  selectionRects,
  type EditableTextStyle,
  type TextMeasurement,
} from './EditableTextLayout';

const STYLE: EditableTextStyle = {
  fontSize: 16,
  fontWeight: 'normal',
  lineHeight: 20,
  textAlign: 'left',
  direction: 'ltr',
  multiline: true,
  width: 100,
};
type Box = [
  start: number,
  end: number,
  left: number,
  right: number,
  top?: number,
];

// Fixed platform measurements are inputs, not a replacement wrapping engine.
function layout(text: string, boxes: Box[], direction: 'ltr' | 'rtl' = 'ltr') {
  const measurement: TextMeasurement = {
    direction,
    graphemes: boxes.map(([start, end, left, right, top = 0]) => ({
      start,
      end,
      left,
      right,
      top,
      bottom: top + 20,
    })),
  };
  return buildEditableTextLayout(text, {...STYLE, direction}, measurement, {
    ascent: 12,
    descent: 3,
  });
}

describe('measured text geometry', () => {
  it('keeps rounded native rows separate over a long paragraph', () => {
    const text = 'x'.repeat(160);
    const result = buildEditableTextLayout(
      text,
      {...STYLE, lineHeight: 31.2},
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
      {ascent: 12, descent: 3}
    );
    expect(result.lines.map((line) => line.start)).toEqual(
      Array.from(text, (_, index) => index)
    );
  });

  it('preserves empty rows and a final caret after explicit newlines', () => {
    const result = layout('a\n\nb\n', [
      [0, 1, 0, 8],
      [3, 4, 0, 8, 40],
    ]);
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 1],
      [2, 2],
      [3, 4],
      [5, 5],
    ]);
    expect(caretGeometry(result, 5)).toMatchObject({line: 3, x: 0});
  });

  it('maps RTL caret positions to logical character edges', () => {
    const result = layout(
      'בג',
      [
        [0, 1, 8, 16],
        [1, 2, 0, 8],
      ],
      'rtl'
    );
    expect(caretIndexAtPoint(result, 15, -1)).toBe(0);
    expect(caretIndexAtPoint(result, 1, -1)).toBe(2);
    expect(selectionRects(result, 0, 1)).toEqual([
      {left: 8, right: 16, top: 0, bottom: -20},
    ]);
  });

  it('selects separate visual runs across mixed writing directions', () => {
    const result = layout('abבג', [
      [0, 1, 0, 8],
      [1, 2, 8, 16],
      [2, 3, 24, 32],
      [3, 4, 16, 24],
    ]);
    expect(selectionRects(result, 1, 3)).toEqual([
      {left: 8, right: 16, top: 0, bottom: -20},
      {left: 24, right: 32, top: 0, bottom: -20},
    ]);
  });

  it('keeps carets and partial selections on complete graphemes', () => {
    const result = layout('a😀b👩‍👩‍👧c', [
      [0, 1, 0, 8],
      [1, 3, 8, 24],
      [3, 4, 24, 32],
      [4, 12, 32, 48],
      [12, 13, 48, 56],
    ]);
    const indices = [0, 1, 3, 4, 12, 13];
    for (const x of [0, 8, 16, 24, 32, 40, 48, 56])
      expect(indices).toContain(caretIndexAtPoint(result, x, -1));
    expect(caretGeometry(result, 2)).toMatchObject({index: 1, x: 8});
    expect(selectionRects(result, 2, 3)).toEqual([
      {left: 8, right: 24, top: 0, bottom: -20},
    ]);
    expect(selectionRects(result, 2, 2)).toEqual([]);
  });

  it('uses measured wraps for caret placement and selection, including out-of-row points', () => {
    const result = layout('abcdef', [
      [0, 1, 0, 8],
      [1, 2, 8, 16],
      [2, 3, 16, 24],
      [3, 4, 0, 8, 20],
      [4, 5, 8, 16, 20],
      [5, 6, 16, 24, 20],
    ]);
    expect(caretGeometry(result, 3)).toMatchObject({line: 1, x: 0});
    expect(caretIndexAtPoint(result, 100, -1)).toBe(3);
    expect(caretIndexAtPoint(result, -100, -21)).toBe(3);
    expect(selectionRects(result, 1, 5)).toEqual([
      {left: 8, right: 24, top: 0, bottom: -20},
      {left: 0, right: 16, top: -20, bottom: -40},
    ]);
  });
});

it('ignores stale zero-width native boxes and removes its measurement mirror', () => {
  const original = Object.getOwnPropertyDescriptor(
    Range.prototype,
    'getClientRects'
  );
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: function (this: Range) {
      const glyph = new DOMRect(
        this.startOffset * 8,
        0,
        (this.endOffset - this.startOffset) * 8,
        20
      );
      return this.startContainer.textContent?.[this.startOffset - 1] === '\n'
        ? [new DOMRect(99, -20, 0, 20), glyph]
        : [glyph];
    },
  });
  const before = document.body.childElementCount;
  const measurer = new DomTextMeasurer();
  try {
    expect(measurer.measure('a\nb', STYLE).graphemes[1]).toMatchObject({
      start: 2,
      end: 3,
      left: 16,
      right: 24,
      top: 0,
      bottom: 20,
    });
  } finally {
    measurer.dispose();
    if (original)
      Object.defineProperty(Range.prototype, 'getClientRects', original);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  }
  expect(document.body.childElementCount).toBe(before);
});

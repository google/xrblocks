import {
  fontShorthand,
  graphemeSegments,
  type CanvasFontWeight,
} from './CanvasTextStyle';
import {DEFAULT_TEXT_TAB_SIZE} from './UIContentDefaults';

/** Resolved writing direction of a paragraph. */
export type TextDirection = 'ltr' | 'rtl';

/** Physical horizontal alignment, matching the UIkit property of the name. */
export type TextAlign = 'left' | 'center' | 'right';

/** Everything that changes where a character lands. */
export interface EditableTextStyle {
  readonly fontSize: number;
  readonly fontWeight: CanvasFontWeight;
  /** Distance between consecutive baselines, in layout units. */
  readonly lineHeight: number;
  readonly textAlign: TextAlign;
  readonly direction: 'auto' | TextDirection;
  /** Wraps at {@link width} when true, lays out one unbroken line otherwise. */
  readonly multiline: boolean;
  /** Width of the inner box, in layout units. */
  readonly width: number;
}

/** Vertical font metrics of the resolved face, in layout units. */
export interface FontMetrics {
  readonly ascent: number;
  readonly descent: number;
}

/** One user-perceived character placed by the platform's own text engine. */
export interface MeasuredGrapheme {
  /** UTF-16 index of the first code unit. */
  readonly start: number;
  /** UTF-16 index just past the last code unit. */
  readonly end: number;
  /** Visual edges relative to the content box origin, x growing rightwards. */
  readonly left: number;
  readonly right: number;
  /** Vertical edges relative to the content box origin, y growing downwards. */
  readonly top: number;
  readonly bottom: number;
}

/** Result of one measurement pass. */
export interface TextMeasurement {
  /** Every grapheme except line feeds, in logical order. */
  readonly graphemes: readonly MeasuredGrapheme[];
  /** Paragraph direction after `auto` has been resolved by the platform. */
  readonly direction: TextDirection;
}

/** Source of platform text metrics, so layout can be tested without a browser. */
export interface EditableTextMeasurer {
  measure(text: string, style: EditableTextStyle): TextMeasurement;
  dispose(): void;
}

/** A single-direction, tab-free piece of one line, ready to be painted. */
export interface EditableTextSegment {
  readonly start: number;
  readonly end: number;
  /** Visual left edge, where `fillText` places the piece. */
  readonly left: number;
  readonly rtl: boolean;
}

/** A caret position, always on a grapheme boundary. */
export interface EditableTextCaret {
  readonly index: number;
  readonly x: number;
}

/** An axis-aligned rectangle in text coordinates. */
export interface TextRect {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

interface PlacedGrapheme extends MeasuredGrapheme {
  readonly rtl: boolean;
}

/** One rendered row, which may be a soft wrap of a longer logical line. */
export interface EditableTextLine {
  /** UTF-16 index of the first character on the row. */
  readonly start: number;
  /** UTF-16 index just past the last character, excluding a closing newline. */
  readonly end: number;
  /** True when the row is closed by an explicit newline rather than a wrap. */
  readonly hardBreak: boolean;
  /** Row box, in text coordinates where y grows upwards from the text top. */
  readonly top: number;
  readonly bottom: number;
  /** Alphabetic baseline of the row, in the same coordinates. */
  readonly baseline: number;
  readonly segments: readonly EditableTextSegment[];
  readonly carets: readonly EditableTextCaret[];
  readonly graphemes: readonly PlacedGrapheme[];
}

/** A complete, immutable description of one laid out value. */
export interface EditableTextLayout {
  readonly text: string;
  readonly lines: readonly EditableTextLine[];
  readonly lineHeight: number;
  /** Widest row, in layout units. */
  readonly width: number;
  /** Total height of every row, in layout units. */
  readonly height: number;
  readonly direction: TextDirection;
  /** Every caret index, ascending, with the row chosen to display it. */
  readonly carets: readonly EditableTextCaret[];
  /** Row each entry of {@link carets} belongs to. */
  readonly caretLines: readonly number[];
}

/**
 * Slack for native ranges that round their left/right edges out to CSS pixels.
 * Adjacent characters can overlap by one pixel without being separate runs.
 */
const RUN_ADJACENCY_TOLERANCE = 1;

/**
 * Ratios used only when a platform reports no font bounding box, which keeps
 * the baseline inside the row instead of collapsing it onto the row top.
 */
const FALLBACK_ASCENT_RATIO = 0.8;
const FALLBACK_DESCENT_RATIO = 0.2;

/** Font metrics for a size when the canvas reports no font bounding box. */
export function fallbackFontMetrics(fontSize: number): FontMetrics {
  return {
    ascent: fontSize * FALLBACK_ASCENT_RATIO,
    descent: fontSize * FALLBACK_DESCENT_RATIO,
  };
}

/**
 * Turns platform measurements into rows, paint segments, and caret positions.
 *
 * Rows come from the measured geometry, so soft wraps, long unbreakable words,
 * and script-specific line breaking all follow the platform. Caret positions
 * come from the logical edges of each grapheme box rather than from summed
 * prefix widths, which is what makes right-to-left and mixed-direction text
 * land on the same positions a native input would use.
 */
export function buildEditableTextLayout(
  text: string,
  style: EditableTextStyle,
  measurement: TextMeasurement,
  metrics: FontMetrics
): EditableTextLayout {
  const lineHeight = style.lineHeight;
  const placed = placeGraphemes(measurement, style.direction);
  const rows = splitRows(text, placed, lineHeight);
  const emptyRowX = emptyRowStart(style);
  const lines: EditableTextLine[] = [];
  const halfLeading = (lineHeight - (metrics.ascent + metrics.descent)) / 2;
  let width = 0;

  rows.forEach((row, index) => {
    // Written as a subtraction so the first row's top is +0 rather than -0.
    const top = 0 - index * lineHeight;
    const line: EditableTextLine = {
      start: row.start,
      end: row.end,
      hardBreak: row.hardBreak,
      top,
      bottom: top - lineHeight,
      baseline: top - halfLeading - metrics.ascent,
      segments: buildSegments(text, row.graphemes),
      carets: buildCarets(row, emptyRowX),
      graphemes: row.graphemes,
    };
    lines.push(line);
    for (const grapheme of row.graphemes) {
      width = Math.max(width, grapheme.right);
    }
  });
  const {carets, caretLines} = indexCarets(lines);

  return {
    text,
    lines,
    lineHeight,
    width,
    height: lines.length * lineHeight,
    direction: measurement.direction,
    carets,
    caretLines,
  };
}

/**
 * Chooses one row per caret index. An index at a soft wrap belongs to two rows;
 * the row where it precedes a character wins, so the caret and the `Home`,
 * `End`, and vertical moves taken from it all describe the row the user sees
 * the caret on.
 */
function indexCarets(lines: readonly EditableTextLine[]): {
  carets: EditableTextCaret[];
  caretLines: number[];
} {
  const chosen = new Map<number, {caret: EditableTextCaret; line: number}>();
  const strong = new Set<number>();
  lines.forEach((line, index) => {
    line.carets.forEach((caret, position) => {
      const leading =
        position < line.carets.length - 1 || index === lines.length - 1;
      const existing = chosen.get(caret.index);
      if (existing != null && (!leading || strong.has(caret.index))) return;
      chosen.set(caret.index, {caret, line: index});
      if (leading) strong.add(caret.index);
    });
  });
  const ordered = [...chosen.values()].sort(
    (a, b) => a.caret.index - b.caret.index
  );
  return {
    carets: ordered.map((entry) => entry.caret),
    caretLines: ordered.map((entry) => entry.line),
  };
}

/** Caret index nearest to a point given in text coordinates. */
export function caretIndexAtPoint(
  layout: EditableTextLayout,
  x: number,
  y: number
): number | undefined {
  const line = nearestLine(layout, y);
  if (line == null) return undefined;
  let closest: EditableTextCaret | undefined;
  for (const caret of line.carets) {
    if (closest == null || Math.abs(x - caret.x) < Math.abs(x - closest.x)) {
      closest = caret;
    }
  }
  return closest?.index ?? line.start;
}

/** Row nearest to a y in text coordinates, preferring the row containing it. */
export function nearestLine(
  layout: EditableTextLayout,
  y: number
): EditableTextLine | undefined {
  let closest: EditableTextLine | undefined;
  for (const line of layout.lines) {
    if (y <= line.top && y >= line.bottom) return line;
    if (
      closest == null ||
      Math.abs(y - lineCenter(line)) < Math.abs(y - lineCenter(closest))
    ) {
      closest = line;
    }
  }
  return closest;
}

/**
 * Resolves a caret index to geometry. Indices that fall inside a grapheme are
 * snapped down to its start, so a selection the native element reports mid
 * emoji still renders a caret the user can see.
 */
export function caretGeometry(
  layout: EditableTextLayout,
  index: number
): {index: number; x: number; line: number} | undefined {
  const carets = layout.carets;
  if (carets.length === 0) return undefined;
  let low = 0;
  let high = carets.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (carets[middle].index <= index) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return {
    index: carets[found].index,
    x: carets[found].x,
    line: layout.caretLines[found],
  };
}

/**
 * Rectangles covering a selection range. A range crossing a direction boundary
 * yields several rectangles on one row, exactly as a browser renders it.
 */
export function selectionRects(
  layout: EditableTextLayout,
  start: number,
  end: number
): TextRect[] {
  const rects: TextRect[] = [];
  if (!(end > start)) return rects;
  for (const line of layout.lines) {
    const spans: Array<{left: number; right: number}> = [];
    for (const grapheme of line.graphemes) {
      if (grapheme.start >= end || grapheme.end <= start) continue;
      spans.push({left: grapheme.left, right: grapheme.right});
    }
    if (spans.length === 0) continue;
    spans.sort((a, b) => a.left - b.left);
    let current = spans[0];
    for (let index = 1; index < spans.length; index++) {
      const span = spans[index];
      if (span.left <= current.right + RUN_ADJACENCY_TOLERANCE) {
        current = {
          left: current.left,
          right: Math.max(current.right, span.right),
        };
        continue;
      }
      rects.push({...current, bottom: line.bottom, top: line.top});
      current = span;
    }
    rects.push({...current, bottom: line.bottom, top: line.top});
  }
  return rects;
}

interface Row {
  start: number;
  end: number;
  hardBreak: boolean;
  graphemes: PlacedGrapheme[];
}

/**
 * Assigns a direction to every grapheme by following the measured boxes.
 *
 * Inside one bidi run the boxes are laid end to end, so a break in that chain
 * marks a run boundary. A run whose direction never had to be decided, such as
 * a lone neutral character, falls back to the paragraph direction.
 */
function placeGraphemes(
  measurement: TextMeasurement,
  requested: EditableTextStyle['direction']
): PlacedGrapheme[] {
  const fallbackRtl =
    requested === 'rtl' ||
    (requested === 'auto' && measurement.direction === 'rtl');
  const placed: PlacedGrapheme[] = [];
  let run: MeasuredGrapheme[] = [];
  let runRtl: boolean | undefined;
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  const flush = () => {
    const rtl = runRtl ?? fallbackRtl;
    for (const grapheme of run) placed.push({...grapheme, rtl});
    run = [];
    runRtl = undefined;
  };

  for (const grapheme of measurement.graphemes) {
    if (run.length === 0) {
      run.push(grapheme);
      left = grapheme.left;
      right = grapheme.right;
      top = grapheme.top;
      bottom = grapheme.bottom;
      continue;
    }
    // A run never crosses a row, so boxes on different rows end it even when
    // their horizontal edges happen to line up.
    const sameRow = grapheme.top < bottom && grapheme.bottom > top;
    const continuesLtr =
      sameRow &&
      runRtl !== true &&
      Math.abs(grapheme.left - right) <= RUN_ADJACENCY_TOLERANCE;
    const continuesRtl =
      sameRow &&
      runRtl !== false &&
      Math.abs(grapheme.right - left) <= RUN_ADJACENCY_TOLERANCE;
    if (continuesLtr) {
      runRtl = false;
      right = grapheme.right;
      top = Math.min(top, grapheme.top);
      bottom = Math.max(bottom, grapheme.bottom);
    } else if (continuesRtl) {
      runRtl = true;
      left = grapheme.left;
      top = Math.min(top, grapheme.top);
      bottom = Math.max(bottom, grapheme.bottom);
    } else {
      flush();
      left = grapheme.left;
      right = grapheme.right;
      top = grapheme.top;
      bottom = grapheme.bottom;
    }
    run.push(grapheme);
  }
  flush();
  return placed;
}

/**
 * Splits the placed graphemes into rendered rows. Explicit newlines close a row
 * outright; a soft wrap is detected from the vertical step between two
 * graphemes of the same row, which the platform reports in whole line heights.
 */
function splitRows(
  text: string,
  placed: readonly PlacedGrapheme[],
  lineHeight: number
): Row[] {
  const rows: Row[] = [];
  let row: Row = {start: 0, end: 0, hardBreak: false, graphemes: []};
  let rowCenter: number | undefined;
  let cursor = 0;

  const close = (end: number, hardBreak: boolean, nextStart: number) => {
    row.end = end;
    row.hardBreak = hardBreak;
    rows.push(row);
    row = {start: nextStart, end: nextStart, hardBreak: false, graphemes: []};
    rowCenter = undefined;
  };

  for (const grapheme of placed) {
    while (cursor < grapheme.start) {
      const newline = text.indexOf('\n', cursor);
      if (newline < 0 || newline >= grapheme.start) break;
      close(newline, true, newline + 1);
      cursor = newline + 1;
    }
    cursor = grapheme.end;
    const center = (grapheme.top + grapheme.bottom) / 2;
    if (rowCenter != null && center > rowCenter + lineHeight / 2) {
      close(grapheme.start, false, grapheme.start);
    }
    rowCenter ??= center;
    row.graphemes.push(grapheme);
  }
  for (
    let newline = text.indexOf('\n', cursor);
    newline >= 0;
    newline = text.indexOf('\n', cursor)
  ) {
    close(newline, true, newline + 1);
    cursor = newline + 1;
  }
  close(text.length, false, text.length);
  return rows;
}

/** Groups a row's graphemes into contiguous pieces that can be painted as one. */
function buildSegments(
  text: string,
  graphemes: readonly PlacedGrapheme[]
): EditableTextSegment[] {
  const segments: EditableTextSegment[] = [];
  let start = -1;
  let end = -1;
  let rtl = false;
  let left = 0;
  let right = 0;

  const flush = () => {
    if (start < 0) return;
    segments.push({start, end, left, rtl});
    start = -1;
  };

  for (const grapheme of graphemes) {
    // A tab has an advance but no glyph, and `fillText` would draw it as a
    // space, so it ends the piece and only its measured advance survives.
    const paintable = text.slice(grapheme.start, grapheme.end) !== '\t';
    const joins =
      start >= 0 &&
      paintable &&
      grapheme.rtl === rtl &&
      grapheme.start === end &&
      (rtl
        ? Math.abs(grapheme.right - left) <= RUN_ADJACENCY_TOLERANCE
        : Math.abs(grapheme.left - right) <= RUN_ADJACENCY_TOLERANCE);
    if (!joins) {
      flush();
      if (!paintable) continue;
      start = grapheme.start;
      rtl = grapheme.rtl;
      left = grapheme.left;
      right = grapheme.right;
      end = grapheme.end;
      continue;
    }
    left = Math.min(left, grapheme.left);
    right = Math.max(right, grapheme.right);
    end = grapheme.end;
  }
  flush();
  return segments;
}

/**
 * Caret positions for a row, taken from the logical leading edge of every
 * grapheme plus the trailing edge of the last one.
 */
function buildCarets(row: Row, emptyRowX: number): EditableTextCaret[] {
  if (row.graphemes.length === 0) {
    return [{index: row.start, x: emptyRowX}];
  }
  const carets: EditableTextCaret[] = [];
  for (const grapheme of row.graphemes) {
    carets.push({
      index: grapheme.start,
      x: grapheme.rtl ? grapheme.right : grapheme.left,
    });
  }
  const last = row.graphemes[row.graphemes.length - 1];
  carets.push({index: row.end, x: last.rtl ? last.left : last.right});
  return carets;
}

/**
 * Where a row with no characters starts. An empty row has a zero-width line
 * box, so only the physical alignment decides where its caret sits.
 */
function emptyRowStart(style: EditableTextStyle): number {
  const width = Math.max(0, style.width);
  if (style.textAlign === 'center') return width / 2;
  if (style.textAlign === 'right') return width;
  return 0;
}

function lineCenter(line: EditableTextLine): number {
  return (line.top + line.bottom) / 2;
}

/**
 * Measures text with the platform's own layout engine through a hidden, inert
 * mirror element.
 *
 * The mirror resets every inherited property before applying the field's own
 * style, so a host page stylesheet cannot silently change where glyphs land.
 * Text reaches it through `textContent`, never as markup.
 */
export class DomTextMeasurer implements EditableTextMeasurer {
  private readonly mirror: HTMLElement;
  private readonly document: Document;

  constructor(host: Document = document) {
    this.document = host;
    const body = host.body;
    if (body == null) {
      throw new Error('A document body is required to measure editable text.');
    }
    const mirror = host.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = [
      // Drops every inherited value the host page could impose; the
      // declarations after it are the ones that survive.
      'all: initial',
      'position: fixed',
      'top: 0',
      'left: 0',
      'visibility: hidden',
      'pointer-events: none',
      'display: block',
      'box-sizing: content-box',
      'margin: 0',
      'padding: 0',
      'border: 0',
      'overflow: visible',
      `tab-size: ${DEFAULT_TEXT_TAB_SIZE}`,
      'text-indent: 0',
      'text-transform: none',
      'letter-spacing: normal',
      'word-spacing: normal',
      'font-kerning: normal',
      'font-variant-ligatures: normal',
      'hyphens: none',
      'writing-mode: horizontal-tb',
    ].join(';');
    body.appendChild(mirror);
    this.mirror = mirror;
  }

  measure(text: string, style: EditableTextStyle): TextMeasurement {
    const mirror = this.mirror;
    mirror.style.font = fontShorthand(style.fontSize, style.fontWeight);
    mirror.style.lineHeight = `${style.lineHeight}px`;
    mirror.style.textAlign = style.textAlign;
    mirror.style.whiteSpace = style.multiline ? 'pre-wrap' : 'pre';
    mirror.style.overflowWrap = style.multiline ? 'break-word' : 'normal';
    mirror.style.width = `${Math.max(0, style.width)}px`;
    if (style.direction === 'auto') {
      mirror.setAttribute('dir', 'auto');
      mirror.style.direction = '';
    } else {
      mirror.removeAttribute('dir');
      mirror.style.direction = style.direction;
    }
    mirror.textContent = text;
    const direction = this.resolveDirection(style.direction);
    const node = mirror.firstChild;
    const graphemes: MeasuredGrapheme[] = [];
    if (node != null && text.length > 0) {
      const origin = mirror.getBoundingClientRect();
      const range = this.document.createRange();
      for (const {segment, index} of graphemeSegments(text)) {
        if (segment === '\n') continue;
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);
        const rect = glyphRect(range);
        graphemes.push({
          start: index,
          end: index + segment.length,
          left: rect.left - origin.left,
          right: rect.right - origin.left,
          top: rect.top - origin.top,
          bottom: rect.bottom - origin.top,
        });
      }
    }
    mirror.textContent = '';
    return {graphemes, direction};
  }

  dispose(): void {
    this.mirror.remove();
  }

  private resolveDirection(
    requested: EditableTextStyle['direction']
  ): TextDirection {
    if (requested !== 'auto') return requested;
    const view = this.document.defaultView;
    const computed = view?.getComputedStyle(this.mirror).direction;
    return computed === 'rtl' ? 'rtl' : 'ltr';
  }
}

/**
 * A range after a newline can include an empty caret box on the previous row.
 * Prefer the actual glyph, retaining a caret box for truly zero-width text.
 */
function glyphRect(range: Range): DOMRect {
  const rects = range.getClientRects();
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return rects[rects.length - 1] ?? range.getBoundingClientRect();
}

/** Reads the vertical font metrics of a canvas context, in layout units. */
export function measureFontMetrics(
  context: CanvasRenderingContext2D,
  fontSize: number
): FontMetrics {
  const metrics = context.measureText('Mg');
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
    return fallbackFontMetrics(fontSize);
  }
  if (!(ascent > 0) && !(descent > 0)) return fallbackFontMetrics(fontSize);
  return {ascent, descent};
}

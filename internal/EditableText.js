/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @file xrblocks.js
 * @version v0.21.1
 * @commitid fbe109a
 * @builddate 2026-09-16T18:22:08.202Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
    "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
    "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
    "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
    "@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
    "yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
    "lit": "https://esm.sh/lit@3.3.1",
    "lit/": "https://esm.sh/lit@3.3.1/",
    "three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */
import { Content } from '@pmndrs/uikit';
import { signal, effect } from '@preact/signals-core';
import * as THREE from 'three';
import { D as DEFAULT_TEXT_TAB_SIZE, f as fontShorthand, g as graphemeSegments, c as cssColor, r as resolveRasterScale, a as DEFAULT_TEXT_LINE_HEIGHT, b as DEFAULT_TEXT_FONT_SIZE } from './UIKitBackend.js';
import './entry.js';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/FontLoader.js';
import 'three/addons/geometries/TextGeometry.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';

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
function fallbackFontMetrics(fontSize) {
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
function buildEditableTextLayout(text, style, measurement, metrics) {
    const lineHeight = style.lineHeight;
    const placed = placeGraphemes(measurement, style.direction);
    const rows = splitRows(text, placed, lineHeight);
    const emptyRowX = emptyRowStart(style);
    const lines = [];
    const halfLeading = (lineHeight - (metrics.ascent + metrics.descent)) / 2;
    let left = 0;
    let right = 0;
    rows.forEach((row, index) => {
        // Written as a subtraction so the first row's top is +0 rather than -0.
        const top = 0 - index * lineHeight;
        const line = {
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
            left = Math.min(left, grapheme.left);
            right = Math.max(right, grapheme.right);
        }
    });
    const { carets, caretLines } = indexCarets(lines);
    return {
        text,
        lines,
        lineHeight,
        left,
        right,
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
function indexCarets(lines) {
    const chosen = new Map();
    const strong = new Set();
    lines.forEach((line, index) => {
        line.carets.forEach((caret, position) => {
            const leading = position < line.carets.length - 1 || index === lines.length - 1;
            const existing = chosen.get(caret.index);
            if (existing != null && (!leading || strong.has(caret.index)))
                return;
            chosen.set(caret.index, { caret, line: index });
            if (leading)
                strong.add(caret.index);
        });
    });
    const ordered = [...chosen.values()].sort((a, b) => a.caret.index - b.caret.index);
    return {
        carets: ordered.map((entry) => entry.caret),
        caretLines: ordered.map((entry) => entry.line),
    };
}
/** Caret index nearest to a point given in text coordinates. */
function caretIndexAtPoint(layout, x, y) {
    const line = nearestLine(layout, y);
    if (line == null)
        return undefined;
    let closest;
    for (const caret of line.carets) {
        if (closest == null || Math.abs(x - caret.x) < Math.abs(x - closest.x)) {
            closest = caret;
        }
    }
    return closest?.index ?? line.start;
}
/** Row nearest to a y in text coordinates, preferring the row containing it. */
function nearestLine(layout, y) {
    let closest;
    for (const line of layout.lines) {
        if (y <= line.top && y >= line.bottom)
            return line;
        if (closest == null ||
            Math.abs(y - lineCenter(line)) < Math.abs(y - lineCenter(closest))) {
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
function caretGeometry(layout, index) {
    const carets = layout.carets;
    if (carets.length === 0)
        return undefined;
    let low = 0;
    let high = carets.length - 1;
    let found = 0;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (carets[middle].index <= index) {
            found = middle;
            low = middle + 1;
        }
        else {
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
function selectionRects(layout, start, end) {
    const rects = [];
    if (!(end > start))
        return rects;
    for (const line of layout.lines) {
        const spans = [];
        for (const grapheme of line.graphemes) {
            if (grapheme.start >= end || grapheme.end <= start)
                continue;
            spans.push({ left: grapheme.left, right: grapheme.right });
        }
        if (spans.length === 0)
            continue;
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
            rects.push({ ...current, bottom: line.bottom, top: line.top });
            current = span;
        }
        rects.push({ ...current, bottom: line.bottom, top: line.top });
    }
    return rects;
}
/**
 * Assigns a direction to every grapheme by following the measured boxes.
 *
 * Inside one bidi run the boxes are laid end to end, so a break in that chain
 * marks a run boundary. A run whose direction never had to be decided, such as
 * a lone neutral character, falls back to the paragraph direction.
 */
function placeGraphemes(measurement, requested) {
    const fallbackRtl = requested === 'rtl' ||
        (requested === 'auto' && measurement.direction === 'rtl');
    const placed = [];
    let run = [];
    let runRtl;
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    const flush = () => {
        const rtl = runRtl ?? fallbackRtl;
        for (const grapheme of run)
            placed.push({ ...grapheme, rtl });
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
        const continuesLtr = sameRow &&
            runRtl !== true &&
            Math.abs(grapheme.left - right) <= RUN_ADJACENCY_TOLERANCE;
        const continuesRtl = sameRow &&
            runRtl !== false &&
            Math.abs(grapheme.right - left) <= RUN_ADJACENCY_TOLERANCE;
        if (continuesLtr) {
            runRtl = false;
            right = grapheme.right;
            top = Math.min(top, grapheme.top);
            bottom = Math.max(bottom, grapheme.bottom);
        }
        else if (continuesRtl) {
            runRtl = true;
            left = grapheme.left;
            top = Math.min(top, grapheme.top);
            bottom = Math.max(bottom, grapheme.bottom);
        }
        else {
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
function splitRows(text, placed, lineHeight) {
    const rows = [];
    let row = { start: 0, end: 0, hardBreak: false, graphemes: [] };
    let rowCenter;
    let cursor = 0;
    const close = (end, hardBreak, nextStart) => {
        row.end = end;
        row.hardBreak = hardBreak;
        rows.push(row);
        row = { start: nextStart, end: nextStart, hardBreak: false, graphemes: [] };
        rowCenter = undefined;
    };
    for (const grapheme of placed) {
        while (cursor < grapheme.start) {
            const newline = text.indexOf('\n', cursor);
            if (newline < 0 || newline >= grapheme.start)
                break;
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
    for (let newline = text.indexOf('\n', cursor); newline >= 0; newline = text.indexOf('\n', cursor)) {
        close(newline, true, newline + 1);
        cursor = newline + 1;
    }
    close(text.length, false, text.length);
    return rows;
}
/** Groups a row's graphemes into contiguous pieces that can be painted as one. */
function buildSegments(text, graphemes) {
    const segments = [];
    let start = -1;
    let end = -1;
    let rtl = false;
    let left = 0;
    let right = 0;
    const flush = () => {
        if (start < 0)
            return;
        segments.push({ start, end, left, rtl });
        start = -1;
    };
    for (const grapheme of graphemes) {
        // A tab has an advance but no glyph, and `fillText` would draw it as a
        // space, so it ends the piece and only its measured advance survives.
        const paintable = text.slice(grapheme.start, grapheme.end) !== '\t';
        const joins = start >= 0 &&
            paintable &&
            grapheme.rtl === rtl &&
            grapheme.start === end &&
            (rtl
                ? Math.abs(grapheme.right - left) <= RUN_ADJACENCY_TOLERANCE
                : Math.abs(grapheme.left - right) <= RUN_ADJACENCY_TOLERANCE);
        if (!joins) {
            flush();
            if (!paintable)
                continue;
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
function buildCarets(row, emptyRowX) {
    if (row.graphemes.length === 0) {
        return [{ index: row.start, x: emptyRowX }];
    }
    const carets = [];
    for (const grapheme of row.graphemes) {
        carets.push({
            index: grapheme.start,
            x: grapheme.rtl ? grapheme.right : grapheme.left,
        });
    }
    const last = row.graphemes[row.graphemes.length - 1];
    carets.push({ index: row.end, x: last.rtl ? last.left : last.right });
    return carets;
}
/**
 * Where a row with no characters starts. An empty row has a zero-width line
 * box, so only the physical alignment decides where its caret sits.
 */
function emptyRowStart(style) {
    const width = Math.max(0, style.width);
    if (style.textAlign === 'center')
        return width / 2;
    if (style.textAlign === 'right')
        return width;
    return 0;
}
function lineCenter(line) {
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
class DomTextMeasurer {
    constructor(host = document) {
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
    measure(text, style) {
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
        }
        else {
            mirror.removeAttribute('dir');
            mirror.style.direction = style.direction;
        }
        mirror.textContent = text;
        const direction = this.resolveDirection(style.direction);
        const node = mirror.firstChild;
        const graphemes = [];
        if (node != null && text.length > 0) {
            const origin = mirror.getBoundingClientRect();
            const range = this.document.createRange();
            for (const { segment, index } of graphemeSegments(text)) {
                if (segment === '\n')
                    continue;
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
        return { graphemes, direction };
    }
    dispose() {
        this.mirror.remove();
    }
    resolveDirection(requested) {
        if (requested !== 'auto')
            return requested;
        const view = this.document.defaultView;
        const computed = view?.getComputedStyle(this.mirror).direction;
        return computed === 'rtl' ? 'rtl' : 'ltr';
    }
}
/**
 * A range after a newline can include an empty caret box on the previous row.
 * Prefer the actual glyph, retaining a caret box for truly zero-width text.
 */
function glyphRect(range) {
    const rects = range.getClientRects();
    for (let index = 0; index < rects.length; index++) {
        const rect = rects[index];
        if (rect.width > 0 && rect.height > 0)
            return rect;
    }
    return rects[rects.length - 1] ?? range.getBoundingClientRect();
}
/** Reads the vertical font metrics of a canvas context, in layout units. */
function measureFontMetrics(context, fontSize) {
    const metrics = context.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
        return fallbackFontMetrics(fontSize);
    }
    if (!(ascent > 0) && !(descent > 0))
        return fallbackFontMetrics(fontSize);
    return { ascent, descent };
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
const SELECTION_Z = -2e-4;
const CARET_Z = 0.0002;
const ZERO_INSET = [0, 0, 0, 0];
const CORNERS = [
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
class EditableText {
    constructor(viewport, options = {}) {
        this.options = options;
        this.group = new THREE.Group();
        this.selection = createQuadMesh('EditableTextSelection');
        this.caret = createQuadMesh('EditableTextCaret');
        this.boundingBox = signal({
            size: new THREE.Vector3(1, 1, 1),
            center: new THREE.Vector3(),
        });
        this.disposed = false;
        this.width = 0;
        this.height = 0;
        this.insets = ZERO_INSET;
        this.innerWidth = 0;
        this.innerHeight = 0;
        this.scrollX = 0;
        this.scrollY = 0;
        this.layoutKey = '';
        this.paintKey = '';
        this.revealKey = '';
        this.appearanceKey = '';
        this.content = new Content({
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
        }, undefined, { boundingBox: this.boundingBox });
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
                message: 'A 2D canvas is required to draw editable text; this document refused one.',
            });
            return;
        }
        try {
            this.measurer = options.measurer ?? new DomTextMeasurer();
        }
        catch (cause) {
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
    get isReady() {
        return (!this.disposed &&
            this.layout != null &&
            this.state != null &&
            this.layout.text === this.state.text);
    }
    /** Alias of {@link isReady} for call sites that read like a signal. */
    get ready() {
        return this.isReady;
    }
    /** Last unresolved failure, or `undefined` once a layout succeeds again. */
    get error() {
        return this.failure;
    }
    /** Horizontal scroll offset in layout units; RTL overflow can make it negative. */
    get offsetX() {
        return this.scrollX;
    }
    /** Vertical scroll offset in layout units. */
    get offsetY() {
        return this.scrollY;
    }
    /** Height of the laid out text in layout units. */
    get scrollHeight() {
        return this.painted?.height ?? 0;
    }
    /** Largest vertical offset {@link scrollBy} can reach. */
    get maxScrollTop() {
        return this.maxScrollY();
    }
    /**
     * Pushes the authoritative state. Object identity is preserved across calls,
     * and updates that only change selection, focus, or colors never repeat the
     * text measurement.
     */
    update(state) {
        if (this.disposed)
            return;
        const resolved = resolveState(state);
        const previous = this.state;
        this.state = resolved;
        if (previous == null ||
            previous.selectionStart !== resolved.selectionStart ||
            previous.selectionEnd !== resolved.selectionEnd) {
            if (!matchesSelection(this.navigated, resolved))
                this.goalX = undefined;
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
    afterLayout() {
        if (this.disposed)
            return;
        const size = this.content.size.peek();
        this.applySize(size?.[0] ?? 0, size?.[1] ?? 0, this.content.paddingInset.peek(), this.content.borderInset.peek());
    }
    /**
     * Maps a world point to the nearest caret index, honoring wrapped lines and
     * grapheme boundaries. Returns `undefined` when no current layout describes
     * the value, so stale geometry can never produce an index for it.
     */
    caretAtPoint(worldPoint) {
        const layout = this.activeLayout();
        if (layout == null)
            return undefined;
        if (layout.text.length === 0)
            return 0;
        const local = this.toTextCoords(worldPoint);
        if (local == null)
            return undefined;
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
    navigate(key, options = {}) {
        const layout = this.activeLayout();
        const state = this.state;
        if (layout == null || state == null)
            return undefined;
        if (layout.text.length === 0) {
            const collapsed = { start: 0, end: 0, direction: 'none' };
            this.navigated = collapsed;
            return collapsed;
        }
        const extend = options.extend === true;
        const focus = focusIndex(state, key, extend);
        const anchor = focus === state.selectionStart
            ? state.selectionEnd
            : state.selectionStart;
        const geometry = caretGeometry(layout, clampIndex(layout.text, focus));
        if (geometry == null)
            return undefined;
        let target;
        if (key === 'Home' || key === 'End') {
            this.goalX = undefined;
            const line = layout.lines[geometry.line];
            target = key === 'Home' ? line.start : line.end;
        }
        else {
            const goalX = this.goalX ?? geometry.x;
            this.goalX = goalX;
            const next = geometry.line + (key === 'ArrowUp' ? -1 : 1);
            if (next < 0) {
                target = 0;
            }
            else if (next >= layout.lines.length) {
                target = layout.text.length;
            }
            else {
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
        const result = extend
            ? {
                start: Math.min(anchor, target),
                end: Math.max(anchor, target),
                direction: target < anchor ? 'backward' : 'forward',
            }
            : { start: target, end: target, direction: 'none' };
        this.navigated = result;
        return result;
    }
    /** Maps a world point to viewport pixels, as `SemanticScrollState` expects. */
    projectPoint(point) {
        const local = this.toInnerPoint(point);
        if (local == null)
            return undefined;
        return new THREE.Vector2(local.x, local.y);
    }
    /** Scrolls vertically by `delta` layout units; returns true when it moved. */
    scrollBy(delta) {
        const next = clamp(this.scrollY + delta, 0, this.maxScrollY());
        if (next === this.scrollY)
            return false;
        this.scrollY = next;
        this.refresh();
        return true;
    }
    /** Scrolls horizontally by `delta` layout units; returns true when it moved. */
    scrollHorizontallyBy(delta) {
        const next = clamp(this.scrollX + delta, this.minScrollX(), this.maxScrollX());
        if (next === this.scrollX)
            return false;
        this.scrollX = next;
        this.refresh();
        return true;
    }
    /** Releases everything this instance owns, including the hidden mirror. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.stopLayoutEffect();
        this.measurer?.dispose();
        this.group.clear();
        this.group.removeFromParent();
        this.glyphs.removeFromParent();
        this.glyphs.geometry.dispose();
        this.glyphs.material.dispose();
        this.texture?.dispose();
        this.selection.dispose();
        this.caret.dispose();
        this.content.removeFromParent();
        this.content.dispose();
    }
    activeLayout() {
        return this.isReady ? this.layout : undefined;
    }
    applySize(width, height, padding, border) {
        const insets = [
            (padding?.[0] ?? 0) + (border?.[0] ?? 0),
            (padding?.[1] ?? 0) + (border?.[1] ?? 0),
            (padding?.[2] ?? 0) + (border?.[2] ?? 0),
            (padding?.[3] ?? 0) + (border?.[3] ?? 0),
        ];
        const innerWidth = Math.max(0, width - insets[1] - insets[3]);
        const innerHeight = Math.max(0, height - insets[0] - insets[2]);
        if (this.width === width &&
            this.height === height &&
            this.innerWidth === innerWidth &&
            this.innerHeight === innerHeight &&
            this.insets.every((inset, index) => inset === insets[index])) {
            return;
        }
        this.width = width;
        this.height = height;
        this.insets = insets;
        this.innerWidth = innerWidth;
        this.innerHeight = innerHeight;
        this.boundingBox.value = {
            size: new THREE.Vector3(Math.max(innerWidth, Number.EPSILON), Math.max(innerHeight, Number.EPSILON), 1),
            center: new THREE.Vector3(),
        };
        if (this.state == null)
            return;
        this.revealKey = '';
        this.relayout();
        this.refresh();
    }
    /** Re-measures the text when anything that moves a character has changed. */
    relayout() {
        const state = this.state;
        const measurer = this.measurer;
        const context = this.context;
        if (state == null || measurer == null || context == null)
            return;
        if (!(this.innerWidth > 0) || !(this.innerHeight > 0))
            return;
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
        if (key === this.layoutKey)
            return;
        let layout;
        let painted;
        try {
            context.font = fontShorthand(style.fontSize, style.fontWeight);
            context.fontKerning = 'normal';
            const metrics = measureFontMetrics(context, style.fontSize);
            layout = buildEditableTextLayout(state.text, style, measurer.measure(state.text, style), metrics);
            painted = placeholder
                ? buildEditableTextLayout(state.placeholder, style, measurer.measure(state.placeholder, style), metrics)
                : layout;
        }
        catch (cause) {
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
    applyAppearance(state) {
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
        if (key === this.appearanceKey)
            return;
        this.appearanceKey = key;
        this.content.setProperties({
            opacity: state.opacity,
            depthTest: state.depthTest,
            renderOrder: state.renderOrder,
        });
    }
    /** Materials owned by this presentation. */
    materials() {
        return [
            this.glyphs.material,
            this.selection.mesh.material,
            this.caret.mesh.material,
        ];
    }
    /**
     * Repositions the scrolled geometry and rebuilds the caret and selection
     * quads from the active layout.
     */
    refresh() {
        const state = this.state;
        if (state == null)
            return;
        const currentLayout = this.activeLayout();
        this.scrollX = clamp(this.scrollX, this.minScrollX(), this.maxScrollX());
        this.scrollY = clamp(this.scrollY, 0, this.maxScrollY());
        if (currentLayout != null)
            this.reveal(state, currentLayout);
        this.group.position.set(-this.innerWidth / 2 - this.scrollX, this.innerHeight / 2 + this.scrollY, 0);
        this.group.updateMatrix();
        // The glyph plane covers the viewport itself, so it cancels the scroll the
        // group applies and the canvas carries the offset instead.
        this.glyphs.position.set(this.scrollX + this.innerWidth / 2, -this.scrollY - this.innerHeight / 2, 0);
        this.glyphs.scale.set(Math.max(this.innerWidth, Number.EPSILON), Math.max(this.innerHeight, Number.EPSILON), 1);
        this.glyphs.updateMatrix();
        this.paint();
        const clip = this.clipRect();
        const layout = this.activeLayout();
        if (layout == null) {
            this.content.root.peek().requestRender?.();
            return;
        }
        const quads = [];
        if (layout.text.length > 0 && state.selectionEnd > state.selectionStart) {
            for (const rect of selectionRects(layout, state.selectionStart, state.selectionEnd)) {
                const quad = clipQuad(rect, clip);
                if (quad != null)
                    quads.push(quad);
            }
        }
        this.selection.write(quads, new THREE.Color(state.selectionColor), state.selectionOpacity, SELECTION_Z);
        const caretQuads = [];
        if (state.focused && state.caretVisible) {
            const caret = this.caretQuad(state, layout, clip);
            if (caret != null)
                caretQuads.push(caret);
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
    paint() {
        const state = this.state;
        const layout = this.painted;
        const context = this.context;
        const canvas = this.canvas;
        const texture = this.texture;
        if (state == null ||
            layout == null ||
            context == null ||
            canvas == null ||
            texture == null) {
            return;
        }
        const width = this.innerWidth;
        const height = this.innerHeight;
        if (!(width > 0) || !(height > 0))
            return;
        const scale = resolveRasterScale(width, height);
        const color = cssColor(placeholderVisible(state) ? state.placeholderColor : state.color);
        const key = [
            this.layoutKey,
            this.scrollX,
            this.scrollY,
            width,
            height,
            scale,
            color,
        ].join('\u0000');
        if (key === this.paintKey)
            return;
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
                if (-line.bottom <= this.scrollY ||
                    -line.top >= this.scrollY + height) {
                    continue;
                }
                for (const segment of line.segments) {
                    context.direction = segment.rtl ? 'rtl' : 'ltr';
                    context.fillText(layout.text.slice(segment.start, segment.end), segment.left, -line.baseline);
                }
            }
        }
        catch (cause) {
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
    caretQuad(state, layout, clip) {
        const index = state.selectionDirection === 'backward'
            ? state.selectionStart
            : state.selectionEnd;
        const geometry = caretGeometry(layout, clampIndex(layout.text, index));
        if (geometry == null)
            return undefined;
        const line = layout.lines[geometry.line];
        let left = geometry.x - state.caretWidth / 2;
        let right = left + state.caretWidth;
        if (left < clip.left) {
            left = clip.left;
            right = left + state.caretWidth;
        }
        else if (right > clip.right) {
            right = clip.right;
            left = right - state.caretWidth;
        }
        return clipQuad({ left, right, bottom: line.bottom, top: line.top }, clip);
    }
    reveal(state, layout) {
        if (!state.focused || this.innerWidth <= 0 || this.innerHeight <= 0)
            return;
        const index = state.selectionDirection === 'backward'
            ? state.selectionStart
            : state.selectionEnd;
        const key = `${this.layoutKey}\u0000${index}\u0000${this.innerWidth}x${this.innerHeight}`;
        if (key === this.revealKey)
            return;
        this.revealKey = key;
        const geometry = caretGeometry(layout, clampIndex(layout.text, index));
        if (geometry == null)
            return;
        const line = layout.lines[geometry.line];
        const pad = state.caretWidth;
        if (geometry.x - pad < this.scrollX) {
            this.scrollX = geometry.x - pad;
        }
        else if (geometry.x + pad > this.scrollX + this.innerWidth) {
            this.scrollX = geometry.x + pad - this.innerWidth;
        }
        this.scrollX = clamp(this.scrollX, this.minScrollX(), this.maxScrollX());
        if (line.top > -this.scrollY) {
            this.scrollY = -line.top;
        }
        else if (line.bottom < -this.innerHeight - this.scrollY) {
            this.scrollY = -this.innerHeight - line.bottom;
        }
        this.scrollY = clamp(this.scrollY, 0, this.maxScrollY());
    }
    clipRect() {
        return {
            left: this.scrollX,
            right: this.scrollX + this.innerWidth,
            bottom: -this.innerHeight - this.scrollY,
            top: -this.scrollY,
        };
    }
    minScrollX() {
        if (this.state?.multiline !== false)
            return 0;
        return Math.min(0, this.painted?.left ?? 0);
    }
    maxScrollX() {
        if (this.state?.multiline !== false)
            return 0;
        const caretWidth = this.state?.caretWidth ?? DEFAULT_CARET_WIDTH;
        const right = this.painted?.right ?? 0;
        return Math.max(0, right + caretWidth - this.innerWidth);
    }
    maxScrollY() {
        if (this.state?.multiline !== true)
            return 0;
        return Math.max(0, this.scrollHeight - this.innerHeight);
    }
    /** Maps a world point to pixels measured from the inner box's top-left. */
    toInnerPoint(point) {
        if (this.width <= 0 || this.height <= 0)
            return undefined;
        this.content.updateWorldMatrix(true, false);
        const local = this.content.worldToLocal(point.clone());
        if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
            return undefined;
        }
        return new THREE.Vector2((local.x + 0.5) * this.width - this.insets[3], (0.5 - local.y) * this.height - this.insets[0]);
    }
    /** Maps a world point to text coordinates, where y grows upwards from zero. */
    toTextCoords(point) {
        const inner = this.toInnerPoint(point);
        if (inner == null)
            return undefined;
        return new THREE.Vector2(inner.x + this.scrollX, -inner.y - this.scrollY);
    }
    fail(failure) {
        if (this.disposed)
            return;
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
/**
 * Builds the textured plane the glyphs are painted onto. A document that cannot
 * provide a 2D context still yields a mesh, so the caller can report the
 * failure instead of leaving a half-constructed object behind.
 */
function createGlyphSurface() {
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
    return { mesh, canvas, context, texture };
}
function createQuadMesh(name) {
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
    let positions = new THREE.BufferAttribute(new Float32Array(0), POSITION_COMPONENTS);
    let colors = new THREE.BufferAttribute(new Float32Array(0), COLOR_COMPONENTS);
    const allocate = (quads) => {
        capacity = Math.max(INITIAL_QUAD_CAPACITY, quads * QUAD_CAPACITY_GROWTH_FACTOR);
        positions = new THREE.BufferAttribute(new Float32Array(capacity * VERTICES_PER_QUAD * POSITION_COMPONENTS), POSITION_COMPONENTS);
        colors = new THREE.BufferAttribute(new Float32Array(capacity * VERTICES_PER_QUAD * COLOR_COMPONENTS), COLOR_COMPONENTS);
        positions.setUsage(THREE.DynamicDrawUsage);
        colors.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('position', positions);
        geometry.setAttribute('color', colors);
    };
    return {
        mesh,
        write(quads, color, alpha, z) {
            if (quads.length > capacity)
                allocate(quads.length);
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
function resolveState(state) {
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
function layoutStyle(state, width) {
    return {
        fontSize: state.fontSize,
        fontWeight: state.fontWeight,
        lineHeight: state.lineHeight > 0
            ? state.fontSize * state.lineHeight
            : state.fontSize * DEFAULT_TEXT_LINE_HEIGHT,
        textAlign: state.textAlign,
        direction: state.direction,
        multiline: state.multiline,
        width,
    };
}
function placeholderVisible(state) {
    return state.text.length === 0 && state.placeholder.length > 0;
}
function focusIndex(state, key, extend) {
    if (extend) {
        return state.selectionDirection === 'backward'
            ? state.selectionStart
            : state.selectionEnd;
    }
    if (state.selectionStart === state.selectionEnd)
        return state.selectionEnd;
    return key === 'ArrowUp' || key === 'Home'
        ? state.selectionStart
        : state.selectionEnd;
}
function matchesSelection(selection, state) {
    return (selection != null &&
        selection.start === state.selectionStart &&
        selection.end === state.selectionEnd);
}
function clipQuad(quad, clip) {
    const left = Math.max(quad.left, clip.left);
    const right = Math.min(quad.right, clip.right);
    const bottom = Math.max(quad.bottom, clip.bottom);
    const top = Math.min(quad.top, clip.top);
    if (!(right > left) || !(top > bottom))
        return undefined;
    return { left, right, bottom, top };
}
function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}
function clampIndex(value, index) {
    if (!Number.isFinite(index))
        return 0;
    return clamp(Math.round(index), 0, value.length);
}

export { EditableText };
//# sourceMappingURL=EditableText.js.map

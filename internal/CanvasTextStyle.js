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
* @version v0.24.0
* @commitid 6084768
* @builddate 2026-10-26T22:10:44.503Z
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
import * as THREE from "three";
//#region src/ui/internal/UIContentDefaults.ts
/** Line-height fallback as a multiple of the current font size. */
const DEFAULT_TEXT_LINE_HEIGHT = 1.2;
//#endregion
//#region src/ui/internal/CanvasTextStyle.ts
/**
* Font stack shared by every canvas-rendered UI text.
*
* It resolves to the host operating system's UI face, so the platform's own
* fallback chain covers every script the device can display instead of a single
* bundled typeface that would draw missing-glyph boxes.
*/
const SYSTEM_FONT_STACK = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
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
const graphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/** Maps the CSS-like weight keywords onto numeric CSS font weights. */
function resolveFontWeight(value) {
	if (typeof value === "number") return value;
	if (value === "bold") return BOLD_FONT_WEIGHT;
	if (value === "medium") return MEDIUM_FONT_WEIGHT;
	return NORMAL_FONT_WEIGHT;
}
/** Builds a CSS `font` shorthand for a canvas context or a DOM mirror. */
function fontShorthand(fontSize, weight) {
	return `${resolveFontWeight(weight)} ${fontSize}px ${SYSTEM_FONT_STACK}`;
}
/** Converts a Three.js color representation into a CSS color string. */
function cssColor(color) {
	if (typeof color === "string") return color;
	return `#${new THREE.Color(color).getHexString()}`;
}
/**
* Resolves a CSS-like line height into layout units. Bare numbers are a
* multiple of the font size, matching CSS.
*/
function resolveLineHeight(value, fontSize) {
	if (typeof value === "number") return value * fontSize;
	if (typeof value === "string" && value.endsWith("px")) return Number.parseFloat(value);
	if (typeof value === "string" && value.endsWith("%")) return Number.parseFloat(value) / 100 * fontSize;
	return fontSize * DEFAULT_TEXT_LINE_HEIGHT;
}
/** Splits text into user-perceived characters, never inside a grapheme. */
function graphemes(text) {
	return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}
/** Splits text into graphemes carrying their UTF-16 start index. */
function graphemeSegments(text) {
	return Array.from(graphemeSegmenter.segment(text), ({ segment, index }) => ({
		segment,
		index
	}));
}
/**
* Supersampling factor for a canvas covering `width` by `height` layout units,
* capped so the backing texture stays within {@link MAX_CANVAS_DIMENSION}.
*/
function resolveRasterScale(width, height) {
	return Math.max(Number.EPSILON, Math.min((globalThis.devicePixelRatio || 1) * CANVAS_SUPERSAMPLING, MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height));
}
//#endregion
export { resolveLineHeight as a, graphemes as i, fontShorthand as n, resolveRasterScale as o, graphemeSegments as r, DEFAULT_TEXT_LINE_HEIGHT as s, cssColor as t };

//# sourceMappingURL=CanvasTextStyle.js.map
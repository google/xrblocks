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
* @version v0.23.0
* @commitid de7f64d
* @builddate 2026-10-19T02:44:30.729Z
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
import { a as setWebGPUUIHandler, s as MAX_RESIZE_CORNER_FRACTION } from "./PanelMaterialFactory.js";
import * as THREE from "three";
import { Discard, Fn, If, abs, atan, clamp, cos, distance, exp, float, fwidth, length, materialReference, max, min, mix, positionWorld, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
//#region src/ui/internal/WebGPUUIMaterials.ts
/**
* TSL (node material) implementations of the XR Blocks panel shaders, used on
* `THREE.WebGPURenderer`. Registered through `PanelMaterialFactory` when this
* module is dynamically imported (see `Core.init`), so the base SDK never
* statically requires `three/tsl` or `three/webgpu`.
*
* The materials share the exact uniform maps of their GLSL counterparts
* (`{value}` entries, mutated in place by `GradientPanelUtils` and friends).
*/
const PI = Math.PI;
const PAINT_TYPE_SOLID = 0;
const PAINT_TYPE_GRADIENT = 1;
const GRADIENT_TYPE_RADIAL = 1;
/**
* Maps a raw uniform value to its WGSL uniform type, mirroring what
* `uniform(value)` infers, so `materialReference` can declare the same type.
*/
function inferUniformType(value) {
	const v = value;
	if (typeof value === "boolean") return "bool";
	if (typeof value === "number") return "float";
	if (v?.isVector2) return "vec2";
	if (v?.isVector4) return "vec4";
	if (v?.isColor) return "vec3";
	if (v?.isVector3) return "vec3";
	if (v?.isEuler) return "vec3";
	if (v?.isMatrix4) return "mat4";
	return "float";
}
/**
* Builds the per-material uniform bindings and returns the *graph* nodes to
* feed the shader, without touching the source `{value}` entries on
* `material.uniforms` (so `GradientPanelUtils` keeps mutating them in place).
*
* All scalars, vectors, and fixed-length gradient stop/color array elements go
* through `materialReference('uniforms.<name>.value...', …)`, which re-reads
* `state.material.uniforms[name].value` on every object render. That is what
* makes structurally identical materials safe to share one node-builder state
* (one shader build): each still draws its own values without bleeding across
* panels.
*/
function bindUniformNodes(uniforms) {
	const nodes = {};
	for (const [name, entry] of Object.entries(uniforms)) {
		const value = entry.value;
		if (Array.isArray(value)) nodes[name] = value.map((item, index) => materialReference(`uniforms.${name}.value.${index}`, inferUniformType(item)));
		else nodes[name] = materialReference("uniforms." + name + ".value", inferUniformType(value));
	}
	return nodes;
}
/**
* three's `Node.customCacheKey()` returns `this.id`, so every distinct node
* instance forks `material.customProgramCacheKey()`'s graph hash. Two
* structurally identical panel materials therefore each trigger a full
* node-graph -> WGSL build (~0.9 s each — 58 builds / 20 s in the UI sample).
* Only nodes without a meaningful `customCacheKey` override use the id default
* (PropertyNode/ToneMappingNode/LightsNode/RotateNode carry structural keys);
* the graph structure is already hashed recursively by `Node.getCacheKey()`,
* so those per-instance ids are pure noise. Rewriting them to a constant makes
* structurally identical materials share one node-builder state (one build),
* while named nodes keep their discriminating keys. Per-material uniform
* values still live in each material's own uniform buffer, which three binds
* per render object (see `objectGroup`).
*/
function structuralizeNodeKeys(root) {
	const seen = /* @__PURE__ */ new Set();
	const isDefaultKey = (fn) => typeof fn === "function" && String(fn).includes("this.id");
	const walk = (node) => {
		if (!node || typeof node !== "object" || seen.has(node)) return;
		seen.add(node);
		const n = node;
		if (isDefaultKey(n.customCacheKey)) n.customCacheKey = () => "";
		let children = [];
		if (typeof n._getChildren === "function") children = n._getChildren(/* @__PURE__ */ new Set()) ?? [];
		for (const { childNode } of children) walk(childNode);
	};
	walk(root);
	root.getCacheKey?.(true);
}
const sdRoundedBox = Fn(([p, b, r]) => {
	const d = abs(p).sub(b.sub(r));
	return length(max(d, 0)).add(min(max(d.x, d.y), 0)).sub(r);
});
function mixGradientStops(t, numStops, stops, colors) {
	const finalT = clamp(t, 0, 1);
	const color = vec4(0, 0, 0, 0).toVar();
	If(numStops.greaterThanEqual(1), () => {
		color.assign(colors[0]);
		If(numStops.greaterThanEqual(2), () => {
			const matched = float(0).toVar();
			for (let i = 0; i < stops.length - 1; i++) If(matched.equal(0).and(float(i).lessThan(numStops.sub(1))).and(finalT.greaterThanEqual(stops[i])).and(finalT.lessThanEqual(stops[i + 1])), () => {
				const range = stops[i + 1].sub(stops[i]);
				const localT = finalT.sub(stops[i]).div(max(1e-4, range));
				color.assign(mix(colors[i], colors[i + 1], localT));
				matched.assign(1);
			});
			If(finalT.lessThan(stops[0]), () => {
				color.assign(colors[0]);
			});
			for (let i = 1; i < stops.length; i++) If(numStops.equal(i + 1).and(finalT.greaterThan(stops[i])), () => {
				color.assign(colors[i]);
			});
		});
	});
	return color;
}
function getGradientColor(uvValue, type, center, scaleValue, rotation, numStops, stops, colors) {
	const p = uvValue.sub(center).toVar();
	const c = cos(rotation.negate());
	const s = sin(rotation.negate());
	const px = c.mul(p.x).add(s.mul(p.y));
	const py = s.mul(p.x).negate().add(c.mul(p.y));
	p.assign(vec2(px, py));
	const sx = float(.001).toVar();
	If(abs(scaleValue.x).greaterThan(.001), () => {
		sx.assign(scaleValue.x);
	});
	const sy = float(.001).toVar();
	If(abs(scaleValue.y).greaterThan(.001), () => {
		sy.assign(scaleValue.y);
	});
	p.assign(p.div(vec2(sx, sy)));
	const t = float(0).toVar();
	If(type.equal(0), () => {
		t.assign(p.x.add(.5));
	});
	If(type.equal(1), () => {
		t.assign(length(p).mul(2));
	});
	If(type.equal(2), () => {
		t.assign(atan(p.y.negate(), p.x).div(2 * PI).add(.5));
	});
	If(type.equal(3), () => {
		t.assign(abs(p.x).add(abs(p.y)).mul(2));
	});
	return mixGradientStops(clamp(t, 0, 1), numStops, stops, colors);
}
function asNum(entry) {
	return entry;
}
function asV2(entry) {
	return entry;
}
function asV4(entry) {
	return entry;
}
function asNumArr(entry) {
	return entry;
}
function asV4Arr(entry) {
	return entry;
}
function paintColor(uniforms, prefix, uvValue, radialScale) {
	const result = vec4(0, 0, 0, 0).toVar();
	const paintType = asNum(uniforms[`${prefix}paintType`]);
	If(paintType.equal(PAINT_TYPE_SOLID), () => {
		result.assign(asV4(uniforms[`${prefix}solidColor`]));
	});
	If(paintType.equal(PAINT_TYPE_GRADIENT), () => {
		const gradientType = asNum(uniforms[`${prefix}gradientType`]);
		if (radialScale !== void 0) {
			If(gradientType.equal(GRADIENT_TYPE_RADIAL), () => {
				const t = clamp(radialScale, 0, 1);
				result.assign(mixGradientStops(t, asNum(uniforms[`${prefix}numStops`]), asNumArr(uniforms[`${prefix}gradientStops`]), asV4Arr(uniforms[`${prefix}gradientColors`])));
			});
			If(gradientType.notEqual(GRADIENT_TYPE_RADIAL), () => {
				result.assign(getGradientColor(uvValue, gradientType, asV2(uniforms[`${prefix}center`]), asV2(uniforms[`${prefix}scale`]), asNum(uniforms[`${prefix}rotation`]), asNum(uniforms[`${prefix}numStops`]), asNumArr(uniforms[`${prefix}gradientStops`]), asV4Arr(uniforms[`${prefix}gradientColors`])));
			});
		} else result.assign(getGradientColor(uvValue, gradientType, asV2(uniforms[`${prefix}center`]), asV2(uniforms[`${prefix}scale`]), asNum(uniforms[`${prefix}rotation`]), asNum(uniforms[`${prefix}numStops`]), asNumArr(uniforms[`${prefix}gradientStops`]), asV4Arr(uniforms[`${prefix}gradientColors`])));
	});
	return result;
}
/**
* Port of `UnifiedGradientPanel.frag.ts`: drop shadow, fill with inner shadow,
* stroke, and the un-premultiplied over composite.
*/
function buildUnifiedPanelMain(uniforms) {
	const resolution = asV2(uniforms.u_resolution);
	const uOpacity = asNum(uniforms.u_opacity);
	const cornerRadius = asNum(uniforms.u_corner_radius);
	const dropShadowMargin = asNum(uniforms.u_drop_shadow_margin);
	const hasFill = asNum(uniforms.u_has_fill);
	const hasStroke = asNum(uniforms.u_has_stroke);
	const hasInner = asNum(uniforms.u_has_inner_shadow);
	const hasDrop = asNum(uniforms.u_has_drop_shadow);
	const strokeWidth = asNum(uniforms.u_stroke_width);
	const strokeAlign = asNum(uniforms.u_stroke_align);
	return Fn(() => {
		const pos = uv().mul(resolution);
		const size = resolution;
		const p = pos.sub(size.mul(.5)).toVar();
		const contentHalfSize = size.sub(dropShadowMargin.mul(2)).mul(.5);
		const strokeShift = float(0).toVar();
		If(hasStroke.notEqual(0).and(strokeWidth.greaterThan(.001)), () => {
			If(strokeAlign.greaterThan(0), () => {
				strokeShift.assign(strokeWidth);
			});
			If(strokeAlign.lessThanEqual(0).and(strokeAlign.greaterThan(-.5)), () => {
				strokeShift.assign(strokeWidth.mul(.5));
			});
		});
		const casterHalfSize = contentHalfSize.add(vec2(strokeShift));
		const baseEffR = min(cornerRadius, min(contentHalfSize.x, contentHalfSize.y));
		const casterEffR = baseEffR.add(strokeShift);
		const dropColor = vec4(0, 0, 0, 0).toVar();
		If(hasDrop.notEqual(0), () => {
			const casterDist = sdRoundedBox(p, casterHalfSize, casterEffR);
			const casterAA = fwidth(casterDist);
			const cutoutAlpha = smoothstep(casterAA.mul(-.5), casterAA.mul(.5), casterDist);
			If(cutoutAlpha.greaterThan(.001), () => {
				const shadowPos = p.sub(asV2(uniforms.u_drop_position));
				const shadowDist = sdRoundedBox(shadowPos, casterHalfSize, casterEffR).sub(asNum(uniforms.u_drop_spread));
				const blur = max(1, asNum(uniforms.u_drop_blur));
				const shadowAlpha = float(1).sub(smoothstep(0, blur, shadowDist));
				const shadowStrength = pow(max(0, shadowAlpha), max(.001, asNum(uniforms.u_drop_falloff)));
				const dc = paintColor(uniforms, "u_drop_", uv(), sdRoundedBox(p.sub(asV2(uniforms.u_drop_position)), casterHalfSize, casterEffR).div(max(.001, asNum(uniforms.u_drop_blur))));
				dropColor.assign(vec4(dc.rgb, dc.a.mul(shadowStrength).mul(cutoutAlpha).mul(uOpacity)));
			});
		});
		const surfaceColor = vec4(0, 0, 0, 0).toVar();
		const dist = sdRoundedBox(p, contentHalfSize, baseEffR);
		const aa = fwidth(dist);
		const fillAlphaMask = float(1).sub(smoothstep(aa.mul(-.5), aa.mul(.5), dist));
		If(fillAlphaMask.greaterThan(.001).and(hasFill.notEqual(0)), () => {
			const fillColor = paintColor(uniforms, "u_fill_", uv()).toVar();
			If(hasInner.notEqual(0), () => {
				const strokeInset = float(0).toVar();
				If(hasStroke.notEqual(0).and(strokeWidth.greaterThan(.001)).and(strokeAlign.lessThan(.5)), () => {
					If(strokeAlign.lessThan(-.5), () => {
						strokeInset.assign(strokeWidth);
					});
					If(strokeAlign.greaterThanEqual(-.5), () => {
						strokeInset.assign(strokeWidth.mul(.5));
					});
				});
				const shadowZoneHalfSize = max(vec2(0, 0), contentHalfSize.sub(vec2(strokeInset)));
				const innerEffR = min(max(0, cornerRadius.sub(strokeInset)), min(shadowZoneHalfSize.x, shadowZoneHalfSize.y));
				const innerDist = sdRoundedBox(p, shadowZoneHalfSize, innerEffR);
				const innerAA = fwidth(innerDist);
				const innerAlphaMask = float(1).sub(smoothstep(innerAA.mul(-.5), innerAA.mul(.5), innerDist));
				If(innerAlphaMask.greaterThan(.001), () => {
					const blur = max(.001, asNum(uniforms.u_inner_blur));
					const totalInset = asNum(uniforms.u_inner_spread).add(blur);
					const bSmall = shadowZoneHalfSize.sub(vec2(totalInset));
					const rSmall = max(0, innerEffR.sub(totalInset));
					const pRel = p.sub(asV2(uniforms.u_inner_position));
					const dSmall = sdRoundedBox(pRel, bSmall, rSmall);
					const shadowVal = smoothstep(0, blur, dSmall);
					const shadowStrength = pow(clamp(shadowVal, 0, 1), max(.001, asNum(uniforms.u_inner_falloff)));
					const innerRadialT = clamp(sdRoundedBox(p.sub(asV2(uniforms.u_inner_position)), contentHalfSize, baseEffR).negate().div(max(.001, asNum(uniforms.u_inner_blur))), 0, 1);
					const innerColor = paintColor(uniforms, "u_inner_", uv(), innerRadialT);
					const innerFinalA = innerColor.a.mul(shadowStrength).mul(innerAlphaMask);
					fillColor.assign(vec4(mix(fillColor.rgb, innerColor.rgb, innerFinalA), max(fillColor.a, innerFinalA)));
				});
			});
			surfaceColor.assign(vec4(fillColor.rgb, fillColor.a.mul(fillAlphaMask).mul(uOpacity)));
		});
		const strokeResult = vec4(0, 0, 0, 0).toVar();
		If(hasStroke.notEqual(0).and(strokeWidth.greaterThan(.001)), () => {
			const shift = strokeAlign.mul(strokeWidth.mul(.5));
			const dStroke = dist.sub(shift);
			const strokeDist = abs(dStroke).sub(strokeWidth.mul(.5));
			const strokeAA = fwidth(dist);
			const strokeMask = float(1).sub(smoothstep(strokeAA.mul(-.5), strokeAA.mul(.5), strokeDist));
			If(strokeMask.greaterThan(.001), () => {
				const strokeColor = paintColor(uniforms, "u_stroke_", uv());
				strokeResult.assign(vec4(strokeColor.rgb, strokeColor.a.mul(strokeMask).mul(uOpacity)));
			});
		});
		const color = vec4(0, 0, 0, 0).toVar();
		const surfaceOverDropA = surfaceColor.a.add(dropColor.a.mul(float(1).sub(surfaceColor.a)));
		If(surfaceOverDropA.greaterThan(1e-4), () => {
			color.assign(vec4(surfaceColor.rgb.mul(surfaceColor.a).add(dropColor.rgb.mul(dropColor.a).mul(float(1).sub(surfaceColor.a))).div(surfaceOverDropA), surfaceOverDropA));
		});
		If(strokeResult.a.greaterThan(1e-4), () => {
			const finalA = strokeResult.a.add(color.a.mul(float(1).sub(strokeResult.a)));
			If(finalA.greaterThan(1e-4), () => {
				color.assign(vec4(strokeResult.rgb.mul(strokeResult.a).add(color.rgb.mul(color.a).mul(float(1).sub(strokeResult.a))).div(finalA), finalA));
			});
		});
		If(color.a.lessThan(.001), () => {
			Discard();
		});
		return color;
	});
}
/**
* Port of `UICardEdge.frag.ts`: the hover-lit manipulation edge around a card.
*/
function buildCardEdgeMain(uniforms) {
	const resolution = asV2(uniforms.u_resolution);
	const uOpacity = asNum(uniforms.u_opacity);
	const cardCornerRadius = asNum(uniforms.u_card_corner_radius);
	const edgeMargin = asNum(uniforms.u_edge_margin);
	const edgeWidth = asNum(uniforms.u_edge_width);
	const spotlightColor = asV4(uniforms.u_cursor_spotlight_color);
	const cursorRadius = asNum(uniforms.u_cursor_radius);
	const spotlightBlur = asNum(uniforms.u_cursor_spotlight_blur);
	const cursorUv = asV2(uniforms.u_cursor_uv);
	const showGlow = asNum(uniforms.u_show_glow);
	const cursorUv2 = asV2(uniforms.u_cursor_uv_2);
	const showGlow2 = asNum(uniforms.u_show_glow_2);
	const uDebug = asNum(uniforms.u_debug);
	const uResizable = asNum(uniforms.u_resizable);
	const cornerHighlight = Fn(([p, cursorUvValue, showCursor, sizeValue, cornerStart, innerHalfSize, innerRadius]) => {
		const result = float(0).toVar();
		If(showCursor.greaterThanEqual(.5), () => {
			const cursor = cursorUvValue.mul(sizeValue).sub(sizeValue.mul(.5));
			If(sdRoundedBox(cursor, innerHalfSize, innerRadius).greaterThanEqual(0), () => {
				const ap = abs(p);
				const ac = abs(cursor);
				const fragmentInCorner = ap.x.greaterThanEqual(cornerStart.x).and(ap.y.greaterThanEqual(cornerStart.y));
				const cursorInCorner = ac.x.greaterThanEqual(cornerStart.x).and(ac.y.greaterThanEqual(cornerStart.y));
				const signX = float(0).toVar();
				If(p.x.greaterThan(0), () => {
					signX.assign(1);
				});
				If(p.x.lessThan(0), () => {
					signX.assign(-1);
				});
				const signY = float(0).toVar();
				If(p.y.greaterThan(0), () => {
					signY.assign(1);
				});
				If(p.y.lessThan(0), () => {
					signY.assign(-1);
				});
				const csX = float(0).toVar();
				If(cursor.x.greaterThan(0), () => {
					csX.assign(1);
				});
				If(cursor.x.lessThan(0), () => {
					csX.assign(-1);
				});
				const csY = float(0).toVar();
				If(cursor.y.greaterThan(0), () => {
					csY.assign(1);
				});
				If(cursor.y.lessThan(0), () => {
					csY.assign(-1);
				});
				const sameCorner = signX.equal(csX).and(signY.equal(csY));
				If(fragmentInCorner.and(cursorInCorner).and(sameCorner), () => {
					result.assign(1);
				});
			});
		});
		return result;
	});
	return Fn(() => {
		const pixelRes = resolution;
		const pos = uv().mul(pixelRes);
		const sizeValue = pixelRes;
		const p = pos.sub(sizeValue.mul(.5));
		const halfSize = sizeValue.mul(.5);
		const margin = max(0, edgeMargin);
		const innerHalfSize = max(vec2(0, 0), halfSize.sub(vec2(margin)));
		const innerRadius = min(max(0, cardCornerRadius), min(innerHalfSize.x, innerHalfSize.y));
		const outerRadius = min(innerRadius.add(margin), min(halfSize.x, halfSize.y));
		const distToEdge = sdRoundedBox(p, halfSize, outerRadius);
		const aa = fwidth(distToEdge);
		const alphaMask = float(1).sub(smoothstep(aa.mul(-.5), aa.mul(.5), distToEdge));
		If(alphaMask.lessThan(.001), () => {
			Discard();
		});
		const debugColor = vec4(0, 0, 0, 0).toVar();
		const distToInner = sdRoundedBox(p, innerHalfSize, innerRadius);
		const innerAA = fwidth(distToInner);
		const edgeBandMask = smoothstep(innerAA.mul(-.5), innerAA.mul(.5), distToInner);
		If(uDebug.greaterThan(.5), () => {
			If(distToInner.lessThan(0), () => {
				debugColor.assign(vec4(0, 1, 0, .4));
			});
			If(distToInner.greaterThanEqual(0).and(distToEdge.lessThan(0)), () => {
				debugColor.assign(vec4(1, 0, 0, .4));
			});
			debugColor.assign(vec4(debugColor.rgb, debugColor.a.mul(alphaMask)));
		});
		const accumColor = vec4(0, 0, 0, 0).toVar();
		const glowAlpha = float(0).toVar();
		If(showGlow.greaterThan(.5), () => {
			const cursorPos = cursorUv.mul(sizeValue);
			const distToCursor = distance(pos, cursorPos);
			const sigma = max(10, cursorRadius.add(spotlightBlur));
			const d2 = distToCursor.mul(distToCursor);
			glowAlpha.assign(max(glowAlpha, exp(d2.mul(-.5).div(sigma.mul(sigma)))));
		});
		If(showGlow2.greaterThan(.5), () => {
			const cursorPos2 = cursorUv2.mul(sizeValue);
			const distToCursor2 = distance(pos, cursorPos2);
			const sigma = max(10, cursorRadius.add(spotlightBlur));
			const d2 = distToCursor2.mul(distToCursor2);
			glowAlpha.assign(max(glowAlpha, exp(d2.mul(-.5).div(sigma.mul(sigma)))));
		});
		glowAlpha.assign(glowAlpha.mul(edgeBandMask));
		const corner = float(0).toVar();
		If(uResizable.greaterThan(.5), () => {
			const cornerExtent = min(vec2(innerRadius.add(float(2).mul(margin))), halfSize.mul(MAX_RESIZE_CORNER_FRACTION));
			const cornerStart = halfSize.sub(cornerExtent);
			corner.assign(max(cornerHighlight(p, cursorUv, showGlow, sizeValue, cornerStart, innerHalfSize, innerRadius), cornerHighlight(p, cursorUv2, showGlow2, sizeValue, cornerStart, innerHalfSize, innerRadius)));
		});
		If(glowAlpha.greaterThan(.001).or(corner.greaterThan(0)), () => {
			const glow = vec4(spotlightColor).toVar();
			glow.assign(vec4(glow.rgb, glow.a.mul(glowAlpha)));
			If(glow.a.greaterThan(0), () => {
				const dstA = accumColor.a;
				const srcA = glow.a;
				const outA = srcA.add(dstA.mul(float(1).sub(srcA)));
				const outRGB = vec3(0, 0, 0).toVar();
				If(outA.greaterThan(.001), () => {
					outRGB.assign(glow.rgb.mul(srcA).add(accumColor.rgb.mul(dstA).mul(float(1).sub(srcA))).div(outA));
				});
				accumColor.assign(vec4(outRGB, outA));
			});
			const width = edgeWidth.mul(mix(1, 2, corner));
			const edgeMask = smoothstep(width.negate().sub(aa), width.negate(), distToEdge);
			const edgeOpacity = max(glowAlpha, corner);
			const edgeResult = vec4(0, 0, 0, 0).toVar();
			If(edgeMask.greaterThan(0).and(edgeOpacity.greaterThan(0)), () => {
				const edgeColor = vec4(spotlightColor);
				edgeResult.assign(vec4(edgeColor.rgb, edgeColor.a.mul(edgeOpacity).mul(edgeMask)));
			});
			If(edgeResult.a.greaterThan(0), () => {
				const dstA = accumColor.a;
				const srcA = edgeResult.a;
				const outA = srcA.add(dstA.mul(float(1).sub(srcA)));
				const outRGB = vec3(0, 0, 0).toVar();
				If(outA.greaterThan(.001), () => {
					outRGB.assign(edgeResult.rgb.mul(srcA).add(accumColor.rgb.mul(dstA).mul(float(1).sub(srcA))).div(outA));
				});
				accumColor.assign(vec4(outRGB, outA));
			});
		});
		accumColor.assign(vec4(accumColor.rgb, accumColor.a.mul(alphaMask)));
		If(uDebug.greaterThan(.5), () => {
			accumColor.assign(mix(accumColor, debugColor, debugColor.a));
			accumColor.assign(vec4(accumColor.rgb, max(accumColor.a, debugColor.a)));
		});
		accumColor.assign(vec4(accumColor.rgb, accumColor.a.mul(uOpacity)));
		return accumColor;
	});
}
function createNodeMaterial(main, options, kind) {
	const material = new MeshBasicNodeMaterial({
		transparent: true,
		side: options.side ?? THREE.FrontSide,
		fog: false
	});
	const planes = Array.from({ length: 4 }, (_, i) => uniform(new THREE.Vector4(0, 0, 0, 1)).setName(`xbPanelClip${i}`).onObjectUpdate(({ material: renderedMaterial }, node) => {
		const plane = renderedMaterial?.clippingPlanes?.[i];
		if (!plane) return node.value.set(0, 0, 0, 1);
		const { x, y, z } = plane.normal;
		return node.value.set(x, y, z, plane.constant);
	}));
	material.colorNode = Fn(() => {
		for (const plane of planes) Discard(positionWorld.dot(plane.xyz).add(plane.w).lessThan(0));
		return main;
	})();
	structuralizeNodeKeys(material.colorNode);
	const nodeCacheKey = material.customProgramCacheKey.bind(material);
	material.customProgramCacheKey = () => `xbPanel:${kind}:v1:${nodeCacheKey()}`;
	material.depthWrite = options.depthWrite ?? true;
	material.forceSinglePass = true;
	material.dithering = true;
	material.toneMapped = false;
	material.uniforms = options.uniforms;
	return material;
}
const webgpuUIHandler = {
	createUnifiedPanelMaterial(options) {
		return createNodeMaterial(buildUnifiedPanelMain(bindUniformNodes(options.uniforms))(), options, "unified");
	},
	createCardEdgeMaterial(options) {
		return createNodeMaterial(buildCardEdgeMain(bindUniformNodes(options.uniforms))(), {
			...options,
			side: options.side ?? THREE.DoubleSide,
			depthWrite: options.depthWrite ?? false
		}, "edge");
	}
};
let cacheSalt = 0;
const panelCacheKeys = /* @__PURE__ */ new WeakMap();
try {
	const registry = await import(
		/* @vite-ignore */
		"@pmndrs/uikit/webgpu"
);
	const current = registry.getWebGPUHandlers?.();
	const applyPanelMaterial = current?.applyPanelMaterial;
	if (registry.setWebGPUHandlers && applyPanelMaterial) registry.setWebGPUHandlers({
		...current,
		applyPanelMaterial: (material, info) => {
			material.colorNode = void 0;
			let cache = panelCacheKeys.get(material);
			if (!cache) {
				cache = {
					source: material.customProgramCacheKey?.bind(material) ?? (() => ""),
					salt: ++cacheSalt,
					revision: 0
				};
				panelCacheKeys.set(material, cache);
			}
			material.customProgramCacheKey = cache.source;
			applyPanelMaterial(material, info);
			const key = cache.source();
			if (material.map) {
				const revision = ++cache.revision;
				const salt = cache.salt;
				material.customProgramCacheKey = () => `${key}|xbTsl#${salt}:${revision}`;
			}
			material.__xbTslPanelApplied = true;
		}
	});
} catch {}
setWebGPUUIHandler(webgpuUIHandler);
//#endregion
export { webgpuUIHandler };

//# sourceMappingURL=WebGPUUIMaterials.js.map
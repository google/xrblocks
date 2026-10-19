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
* @commitid 464bf75
* @builddate 2026-10-19T03:44:53.517Z
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
//#region src/ui/shaders/Panel.vert.ts
const PanelVertexShader = `
#include <clipping_planes_pars_vertex>
varying vec2 vUv;
void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
}
`;
//#endregion
//#region src/ui/constants/UICardEdgeConstants.ts
/**
* Largest share of each side's half-length a resize corner may cover, so the
* middle of every side stays available for moving the card.
*/
const MAX_RESIZE_CORNER_FRACTION = .5;
//#endregion
//#region src/ui/shaders/CommonFunctions.glsl.ts
const CommonFunctionsShader = `
#include <clipping_planes_pars_fragment>

float panelClipAlpha() {
    vec4 diffuseColor = vec4(1.0);
    #include <clipping_planes_fragment>
    return diffuseColor.a;
}

// SDF for a rounded box in 2D.
float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - (b - r);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
`;
//#endregion
//#region src/ui/shaders/UICardEdge.frag.ts
/** Formats a number as a GLSL float literal, which needs a decimal point. */
const glslFloat = (value) => Number.isInteger(value) ? `${value}.0` : `${value}`;
/** Fragment shader for the hover-lit manipulation edge around a UI card. */
const UICardEdgeFragmentShader = CommonFunctionsShader + `
#include <common>
#include <dithering_pars_fragment>

varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_card_corner_radius;
uniform float u_edge_margin;
uniform float u_edge_width;
uniform vec4 u_cursor_spotlight_color;
uniform float u_cursor_radius;
uniform float u_cursor_spotlight_blur;
uniform vec2 u_cursor_uv;
uniform float u_show_glow;
uniform vec2 u_cursor_uv_2;
uniform float u_show_glow_2;
uniform float u_debug;
uniform float u_resizable;

const float RESIZE_CORNER_SIDE_MARGINS = ${glslFloat(2)};
const float MAX_RESIZE_CORNER_FRACTION = ${glslFloat(MAX_RESIZE_CORNER_FRACTION)};
const float RESIZE_CORNER_EDGE_WIDTH_SCALE = ${glslFloat(2)};

// Matches isOuterEdgeHit and isCornerHit in UICardEdge.ts.
float cornerHighlight(
    vec2 p,
    vec2 cursorUv,
    float showCursor,
    vec2 size,
    vec2 cornerStart,
    vec2 innerHalfSize,
    float innerRadius
) {
    if (showCursor < 0.5) return 0.0;
    vec2 cursor = cursorUv * size - size * 0.5;
    if (sdRoundedBox(cursor, innerHalfSize, innerRadius) < 0.0) return 0.0;
    bool fragmentInCorner = all(greaterThanEqual(abs(p), cornerStart));
    bool cursorInCorner = all(greaterThanEqual(abs(cursor), cornerStart));
    bool sameCorner = all(equal(sign(p), sign(cursor)));
    return fragmentInCorner && cursorInCorner && sameCorner ? 1.0 : 0.0;
}

void main() {
    vec2 pixelRes = u_resolution;
    vec2 pos = vUv * pixelRes;
    vec2 size = pixelRes;
    vec2 center = size * 0.5;
    vec2 p = pos - center;
    vec2 halfSize = size * 0.5;

    float margin = max(0.0, u_edge_margin);
    vec2 innerHalfSize = max(vec2(0.0), halfSize - margin);
    float innerRadius = min(
        max(0.0, u_card_corner_radius),
        min(innerHalfSize.x, innerHalfSize.y)
    );
    float outerRadius = min(
        innerRadius + margin,
        min(halfSize.x, halfSize.y)
    );
    float distToEdge = sdRoundedBox(p, halfSize, outerRadius);

    float aa = fwidth(distToEdge);
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distToEdge);

    if (alphaMask < 0.001) discard;

    vec4 debugColor = vec4(0.0);

    float distToInner = sdRoundedBox(p, innerHalfSize, innerRadius);
    float innerAA = fwidth(distToInner);
    float edgeBandMask = smoothstep(
        -0.5 * innerAA,
        0.5 * innerAA,
        distToInner
    );

    if (u_debug > 0.5) {
        if (distToInner < 0.0) {
            debugColor = vec4(0.0, 1.0, 0.0, 0.4);
        } else if (distToEdge < 0.0) {
            debugColor = vec4(1.0, 0.0, 0.0, 0.4);
        }
        debugColor.a *= alphaMask;
    }

    vec4 accumColor = vec4(0.0);
    float glowAlpha = 0.0;

    if (u_show_glow > 0.5) {
        vec2 cursorPos = u_cursor_uv * size;
        float distToCursor = distance(pos, cursorPos);
        float sigma = max(10.0, u_cursor_radius + u_cursor_spotlight_blur);
        float d2 = distToCursor * distToCursor;
        glowAlpha = max(glowAlpha, exp(-0.5 * d2 / (sigma * sigma)));
    }

    if (u_show_glow_2 > 0.5) {
        vec2 cursorPos2 = u_cursor_uv_2 * size;
        float distToCursor2 = distance(pos, cursorPos2);
        float sigma = max(10.0, u_cursor_radius + u_cursor_spotlight_blur);
        float d2 = distToCursor2 * distToCursor2;
        glowAlpha = max(glowAlpha, exp(-0.5 * d2 / (sigma * sigma)));
    }

    glowAlpha *= edgeBandMask;

    float corner = 0.0;
    if (u_resizable > 0.5) {
        vec2 cornerExtent = min(
            vec2(innerRadius + RESIZE_CORNER_SIDE_MARGINS * margin),
            halfSize * MAX_RESIZE_CORNER_FRACTION
        );
        vec2 cornerStart = halfSize - cornerExtent;
        corner = max(
            cornerHighlight(
                p, u_cursor_uv, u_show_glow, size, cornerStart,
                innerHalfSize, innerRadius
            ),
            cornerHighlight(
                p, u_cursor_uv_2, u_show_glow_2, size, cornerStart,
                innerHalfSize, innerRadius
            )
        );
    }

    if (glowAlpha > 0.001 || corner > 0.0) {
        vec4 glow = u_cursor_spotlight_color;
        glow.a *= glowAlpha;

        if (glow.a > 0.0) {
            float dstA = accumColor.a;
            float srcA = glow.a;
            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > 0.001) {
                outRGB =
                    (glow.rgb * srcA + accumColor.rgb * dstA * (1.0 - srcA)) /
                    outA;
            }

            accumColor = vec4(outRGB, outA);
        }

        // Hovering a resize corner lights its whole arc with a thicker stroke.
        float width =
            u_edge_width * mix(1.0, RESIZE_CORNER_EDGE_WIDTH_SCALE, corner);
        float edgeMask = smoothstep(
            -width - aa,
            -width,
            distToEdge
        );
        float edgeOpacity = max(glowAlpha, corner);

        vec4 edgeResult = vec4(0.0);
        if (edgeMask > 0.0 && edgeOpacity > 0.0) {
            vec4 edgeColor = u_cursor_spotlight_color;
            edgeColor.a *= edgeOpacity;
            edgeColor.a *= edgeMask;
            edgeResult = edgeColor;
        }

        if (edgeResult.a > 0.0) {
            float dstA = accumColor.a;
            float srcA = edgeResult.a;
            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > 0.001) {
                outRGB =
                    (edgeResult.rgb * srcA +
                        accumColor.rgb * dstA * (1.0 - srcA)) /
                    outA;
            }

            accumColor = vec4(outRGB, outA);
        }
    }

    accumColor.a *= alphaMask;

    if (u_debug > 0.5) {
        accumColor = mix(accumColor, debugColor, debugColor.a);
        accumColor.a = max(accumColor.a, debugColor.a);
    }

    accumColor.a *= u_opacity;

    gl_FragColor = accumColor;

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
}
`;
//#endregion
//#region src/ui/shaders/UnifiedGradientPanel.frag.ts
const UnifiedGradientPanelFragmentShader = CommonFunctionsShader + "\nfloat rand(vec2 n) {\n	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);\n}\n\n#include <dithering_pars_fragment>\n#define MAX_GRADIENT_STOPS 4\n#define PI 3.14159265359\n\n// Paint Types.\n#define PAINT_TYPE_SOLID 0\n#define PAINT_TYPE_GRADIENT 1\n\n// Gradient Types.\n#define GRADIENT_TYPE_LINEAR 0\n#define GRADIENT_TYPE_RADIAL 1\n#define GRADIENT_TYPE_ANGULAR 2\n#define GRADIENT_TYPE_DIAMOND 3\n\n// Interpolate color stops across a 1D scalar index range [0..1].\n// Shared by both fill meshes and radius/distance edge blended vectors (like Shadows).\nvec4 mixGradientStops(\n    float t,\n    int numStops,\n    float stops[MAX_GRADIENT_STOPS],\n    vec4 colors[MAX_GRADIENT_STOPS]\n) {\n    if (numStops < 1) return vec4(0.0);\n    if (numStops < 2) return colors[0];\n\n    float finalT = clamp(t, 0.0, 1.0);\n    vec4 color = colors[0];\n\n    for (int i = 0; i < MAX_GRADIENT_STOPS - 1; i++) {\n        if (i >= numStops - 1) break;\n\n        float t0 = stops[i];\n        float t1 = stops[i+1];\n\n        if (finalT >= t0 && finalT <= t1) {\n            float range = t1 - t0;\n            float localT = (finalT - t0) / max(0.0001, range);\n            color = mix(colors[i], colors[i+1], localT);\n            break;\n        }\n    }\n\n    // Boundary checks.\n    if (finalT < stops[0]) color = colors[0];\n    if (finalT > stops[numStops-1]) color = colors[numStops-1];\n\n    return color;\n}\n\nvec4 getGradientColor(\n    vec2 uv,\n    vec2 resolution,\n    int type,\n    vec2 center,\n    vec2 scale,\n    float rotation,\n    int numStops,\n    float stops[MAX_GRADIENT_STOPS],\n    vec4 colors[MAX_GRADIENT_STOPS]\n) {\n    if (numStops < 1) return vec4(0.0);\n    if (numStops < 2) return colors[0];\n\n    // 1. Transform UV.\n    // Center logic: user provided center (default 0.5, 0.5).\n    // We shift UV so that center is at (0,0).\n    vec2 p = uv - center;\n\n    // Rotation.\n    float c = cos(-rotation);\n    float s = sin(-rotation);\n    mat2 rot = mat2(c, -s, s, c);\n    p = rot * p;\n\n    // Scale.\n    // Expand feature = Divide coord.\n    vec2 safeScale = vec2(\n        abs(scale.x) < 0.001 ? 0.001 : scale.x,\n        abs(scale.y) < 0.001 ? 0.001 : scale.y\n    );\n    p = p / safeScale;\n\n    // 2. Calculate t (0 to 1 position in gradient).\n    float t = 0.0;\n\n    if (type == GRADIENT_TYPE_LINEAR) {\n        // Defined along X axis (after rotation).\n        // Maps x range [-0.5, 0.5] to [0.0, 1.0].\n        t = p.x + 0.5;\n    }\n    else if (type == GRADIENT_TYPE_RADIAL) {\n        // Distance from center.\n        // t=0 at center. t=1 at radius 0.5.\n        t = length(p) * 2.0;\n    }\n    else if (type == GRADIENT_TYPE_ANGULAR) {\n        // Conic gradient.\n        // atan(y, x). range -PI to PI.\n        // Standard math angle (0 = Right, CCW).\n        float angle = atan(-p.y, p.x);\n        // Map to 0..1.\n        t = (angle / (2.0 * PI)) + 0.5;\n    }\n    else if (type == GRADIENT_TYPE_DIAMOND) {\n        // |x| + |y| (Manhattan distance).\n        // Edge at 0.5 => |0.5| + |0| = 0.5.\n        // t = (abs x + abs y) * 2.\n        t = (abs(p.x) + abs(p.y)) * 2.0;\n    }\n\n    // Clamp t.\n    t = clamp(t, 0.0, 1.0);\n\n    return mixGradientStops(t, numStops, stops, colors);\n}\n\nvarying vec2 vUv;\n\nuniform vec2 u_resolution;\nuniform float u_opacity;\nuniform float u_corner_radius;\nuniform float u_drop_shadow_margin;\n\n// 1. Fill Uniforms\nuniform int u_has_fill;\nuniform int u_fill_gradientType;\nuniform int u_fill_paintType;\nuniform vec4 u_fill_solidColor;\nuniform float u_fill_rotation;\nuniform vec2 u_fill_center;\nuniform vec2 u_fill_scale;\nuniform float u_fill_gradientStops[MAX_GRADIENT_STOPS];\nuniform vec4 u_fill_gradientColors[MAX_GRADIENT_STOPS];\nuniform int u_fill_numStops;\n\n// 2. Stroke Uniforms\nuniform int u_has_stroke;\nuniform int u_stroke_gradientType;\nuniform int u_stroke_paintType;\nuniform vec4 u_stroke_solidColor;\nuniform float u_stroke_rotation;\nuniform vec2 u_stroke_center;\nuniform vec2 u_stroke_scale;\nuniform float u_stroke_gradientStops[MAX_GRADIENT_STOPS];\nuniform vec4 u_stroke_gradientColors[MAX_GRADIENT_STOPS];\nuniform int u_stroke_numStops;\nuniform float u_stroke_width;\nuniform float u_stroke_align; // Offset from edge (-1=inside, 0=center, 1=outside)\n\n// 3. Inner Shadow Uniforms\nuniform int u_has_inner_shadow;\nuniform int u_inner_gradientType;\nuniform int u_inner_paintType;\nuniform vec4 u_inner_solidColor;\nuniform float u_inner_rotation;\nuniform vec2 u_inner_center;\nuniform vec2 u_inner_scale;\nuniform float u_inner_gradientStops[MAX_GRADIENT_STOPS];\nuniform vec4 u_inner_gradientColors[MAX_GRADIENT_STOPS];\nuniform int u_inner_numStops;\nuniform float u_inner_blur;\nuniform vec2 u_inner_position;\nuniform float u_inner_spread;\nuniform float u_inner_falloff;\n\n// 4. Drop Shadow Uniforms\nuniform int u_has_drop_shadow;\nuniform int u_drop_gradientType;\nuniform int u_drop_paintType;\nuniform vec4 u_drop_solidColor;\nuniform float u_drop_rotation;\nuniform vec2 u_drop_center;\nuniform vec2 u_drop_scale;\nuniform float u_drop_gradientStops[MAX_GRADIENT_STOPS];\nuniform vec4 u_drop_gradientColors[MAX_GRADIENT_STOPS];\nuniform int u_drop_numStops;\nuniform float u_drop_blur;\nuniform vec2 u_drop_position;\nuniform float u_drop_spread;\nuniform float u_drop_falloff;\n\nvoid main() {\n    float clippingAlpha = panelClipAlpha();\n\n    // Setup Coordinates\n    vec2 pos = vUv * u_resolution;\n    vec2 size = u_resolution;\n    vec2 p = pos - (size * 0.5);\n\n    // Content box is size minus drop shadow margin\n    vec2 contentSize = size - (u_drop_shadow_margin * 2.0);\n    vec2 contentHalfSize = contentSize * 0.5;\n\n    // Stroke shift for caster sizing\n    float strokeShift = 0.0;\n    if (u_has_stroke != 0 && u_stroke_width > 0.001) {\n        if (u_stroke_align > 0.0) strokeShift = u_stroke_width; // Outside\n        else if (u_stroke_align > -0.5) strokeShift = u_stroke_width * 0.5; // Center\n    }\n\n    vec2 casterHalfSize = contentHalfSize + vec2(strokeShift);\n    float baseEffR = min(u_corner_radius, min(contentHalfSize.x, contentHalfSize.y));\n    float casterEffR = baseEffR + strokeShift;\n\n    // ----------------------------------------------------\n    // 1. Drop Shadow Pass\n    // ----------------------------------------------------\n    vec4 dropColor = vec4(0.0);\n    if (u_has_drop_shadow != 0) {\n        float casterDist = sdRoundedBox(p, casterHalfSize, casterEffR);\n        float casterAA = fwidth(casterDist);\n        float cutoutAlpha = smoothstep(-0.5 * casterAA, 0.5 * casterAA, casterDist);\n\n        if (cutoutAlpha > 0.001) {\n            vec2 shadowPos = p - u_drop_position;\n            float shadowDist = sdRoundedBox(shadowPos, casterHalfSize, casterEffR) - u_drop_spread;\n            float blur = max(1.0, u_drop_blur);\n            float shadowAlpha = 1.0 - smoothstep(0.0, blur, shadowDist);\n            shadowAlpha = pow(max(0.0, shadowAlpha), max(0.001, u_drop_falloff));\n\n            if (u_drop_paintType == PAINT_TYPE_SOLID) {\n                dropColor = u_drop_solidColor;\n            } else if (u_drop_paintType == PAINT_TYPE_GRADIENT) {\n                if (u_drop_gradientType == GRADIENT_TYPE_RADIAL) {\n                    float d = sdRoundedBox(p - u_drop_position, casterHalfSize, casterEffR);\n                    float t = clamp(d / max(0.001, u_drop_blur), 0.0, 1.0);\n                    dropColor = mixGradientStops(\n                        t,\n                        u_drop_numStops,\n                        u_drop_gradientStops,\n                        u_drop_gradientColors\n                    );\n                } else {\n                    dropColor = getGradientColor(\n                        vUv, u_resolution,\n                        u_drop_gradientType,\n                        u_drop_center,\n                        u_drop_scale,\n                        u_drop_rotation,\n                        u_drop_numStops,\n                        u_drop_gradientStops,\n                        u_drop_gradientColors\n                    );\n                }\n            }\n            dropColor.a *= shadowAlpha * cutoutAlpha * u_opacity;\n        }\n    }\n\n    // ----------------------------------------------------\n    // 2. Base Fill Pass\n    // ----------------------------------------------------\n    vec4 surfaceColor = vec4(0.0);\n    float dist = sdRoundedBox(p, contentHalfSize, baseEffR);\n    float aa = fwidth(dist);\n    float fillAlphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dist);\n\n    if (fillAlphaMask > 0.001 && u_has_fill != 0) {\n        vec4 fillColor = vec4(0.0);\n        if (u_fill_paintType == PAINT_TYPE_SOLID) {\n            fillColor = u_fill_solidColor;\n        } else if (u_fill_paintType == PAINT_TYPE_GRADIENT) {\n            fillColor = getGradientColor(\n                vUv, u_resolution,\n                u_fill_gradientType,\n                u_fill_center,\n                u_fill_scale,\n                u_fill_rotation,\n                u_fill_numStops,\n                u_fill_gradientStops,\n                u_fill_gradientColors\n            );\n        }\n\n        // ------------------------------------------------\n        // 3. Inner Shadow Composite (onto Base Fill)\n        // ------------------------------------------------\n        if (u_has_inner_shadow != 0) {\n            float strokeInset = 0.0;\n            if (u_has_stroke != 0 && u_stroke_width > 0.001 && u_stroke_align < 0.5) {\n                if (u_stroke_align < -0.5) strokeInset = u_stroke_width; // Inside\n                else strokeInset = u_stroke_width * 0.5; // Center\n            }\n\n            vec2 shadowZoneHalfSize = max(vec2(0.0), contentHalfSize - vec2(strokeInset));\n            float innerEffR = max(0.0, u_corner_radius - strokeInset);\n            innerEffR = min(innerEffR, min(shadowZoneHalfSize.x, shadowZoneHalfSize.y));\n\n            float innerDist = sdRoundedBox(p, shadowZoneHalfSize, innerEffR);\n            float innerAA = fwidth(innerDist);\n            float innerAlphaMask = 1.0 - smoothstep(-0.5 * innerAA, 0.5 * innerAA, innerDist);\n\n            if (innerAlphaMask > 0.001) {\n                vec4 innerColor = vec4(0.0);\n                if (u_inner_paintType == PAINT_TYPE_SOLID) {\n                    innerColor = u_inner_solidColor;\n                } else if (u_inner_paintType == PAINT_TYPE_GRADIENT) {\n                    if (u_inner_gradientType == GRADIENT_TYPE_RADIAL) {\n                        float d = sdRoundedBox(p - u_inner_position, contentHalfSize, baseEffR);\n                        float t = clamp(-d / max(0.001, u_inner_blur), 0.0, 1.0);\n                        innerColor = mixGradientStops(\n                            t,\n                            u_inner_numStops,\n                            u_inner_gradientStops,\n                            u_inner_gradientColors\n                        );\n                    } else {\n                        innerColor = getGradientColor(\n                            vUv, u_resolution,\n                            u_inner_gradientType,\n                            u_inner_center,\n                            u_inner_scale,\n                            u_inner_rotation,\n                            u_inner_numStops,\n                            u_inner_gradientStops,\n                            u_inner_gradientColors\n                        );\n                    }\n                }\n\n                float blur = max(0.001, u_inner_blur);\n                float totalInset = u_inner_spread + blur;\n                vec2 bSmall = shadowZoneHalfSize - totalInset;\n                float rSmall = max(0.0, innerEffR - totalInset);\n\n                vec2 p_rel = p - u_inner_position;\n                float dSmall = sdRoundedBox(p_rel, bSmall, rSmall);\n                float shadowVal = smoothstep(0.0, blur, dSmall);\n                float shadowStrength = pow(clamp(shadowVal, 0.0, 1.0), max(0.001, u_inner_falloff));\n                float innerFinalA = innerColor.a * shadowStrength * innerAlphaMask;\n\n                // Composite inner shadow over fill\n                fillColor.rgb = mix(fillColor.rgb, innerColor.rgb, innerFinalA);\n                fillColor.a = max(fillColor.a, innerFinalA);\n            }\n        }\n\n        surfaceColor = vec4(fillColor.rgb, fillColor.a * fillAlphaMask * u_opacity);\n    }\n\n    // ----------------------------------------------------\n    // 4. Stroke Pass\n    // ----------------------------------------------------\n    vec4 strokeResult = vec4(0.0);\n    if (u_has_stroke != 0 && u_stroke_width > 0.001) {\n        float shift = u_stroke_align * (u_stroke_width * 0.5);\n        float dStroke = dist - shift;\n        float halfWidth = u_stroke_width * 0.5;\n        float strokeDist = abs(dStroke) - halfWidth;\n\n        float strokeAA = fwidth(dist);\n        float strokeMask = 1.0 - smoothstep(-0.5 * strokeAA, 0.5 * strokeAA, strokeDist);\n\n        if (strokeMask > 0.001) {\n            vec4 strokeColor = vec4(0.0);\n            if (u_stroke_paintType == PAINT_TYPE_SOLID) {\n                strokeColor = u_stroke_solidColor;\n            } else if (u_stroke_paintType == PAINT_TYPE_GRADIENT) {\n                strokeColor = getGradientColor(\n                    vUv, u_resolution,\n                    u_stroke_gradientType,\n                    u_stroke_center,\n                    u_stroke_scale,\n                    u_stroke_rotation,\n                    u_stroke_numStops,\n                    u_stroke_gradientStops,\n                    u_stroke_gradientColors\n                );\n            }\n            strokeResult = vec4(strokeColor.rgb, strokeColor.a * strokeMask * u_opacity);\n        }\n    }\n\n    // ----------------------------------------------------\n    // 5. Final Composite (Accurate Un-Premultiplied Over Composite)\n    // ----------------------------------------------------\n    vec4 color = vec4(0.0);\n\n    // Surface over DropShadow\n    float surfaceOverDropA = surfaceColor.a + dropColor.a * (1.0 - surfaceColor.a);\n    if (surfaceOverDropA > 0.0001) {\n        color.rgb = (surfaceColor.rgb * surfaceColor.a + dropColor.rgb * dropColor.a * (1.0 - surfaceColor.a)) / surfaceOverDropA;\n        color.a = surfaceOverDropA;\n    }\n\n    // Stroke over Surface + DropShadow\n    if (strokeResult.a > 0.0001) {\n        float finalA = strokeResult.a + color.a * (1.0 - strokeResult.a);\n        if (finalA > 0.0001) {\n            color.rgb = (strokeResult.rgb * strokeResult.a + color.rgb * color.a * (1.0 - strokeResult.a)) / finalA;\n            color.a = finalA;\n        }\n    }\n\n    if (color.a < 0.001) discard;\n\n    gl_FragColor = color;\n    gl_FragColor.a *= clippingAlpha;\n\n    #include <tonemapping_fragment>\n    #include <colorspace_fragment>\n    #include <dithering_fragment>\n}\n";
//#endregion
//#region src/ui/internal/PanelMaterialFactory.ts
/**
* Base ShaderMaterial for Panels.
*
* Provides default uniforms safe for general use:
* - `u_time`: 0.0 (safe default for animated shaders)
* - `u_resolution`: 1x1 (updated automatically by PanelLayer)
* - `u_opacity`: 1.0 (updated automatically from the UI opacity property)
*
* Subclasses should extend this and add their own specific uniforms.
*/
var PanelShaderMaterial = class extends THREE.ShaderMaterial {
	constructor(parameters) {
		super({
			vertexShader: PanelVertexShader,
			fragmentShader: `
        #include <clipping_planes_pars_fragment>
        void main() {
          vec4 diffuseColor = vec4(1.0, 0.0, 1.0, 1.0);
          #include <clipping_planes_fragment>
          gl_FragColor = diffuseColor;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
			clipping: true,
			transparent: true,
			toneMapped: false,
			side: THREE.FrontSide,
			forceSinglePass: true,
			dithering: true,
			...parameters,
			uniforms: {
				u_time: { value: 0 },
				u_resolution: { value: new THREE.Vector2(1, 1) },
				u_opacity: { value: 1 },
				...parameters?.uniforms
			}
		});
	}
};
let webgpuUIHandler;
let webgpuMaterialLoader;
let webgpuMaterialsPromise;
/** Installs (or clears) the WebGPU material handler. */
function setWebGPUUIHandler(handler) {
	webgpuUIHandler = handler;
	if (!handler) webgpuMaterialsPromise = void 0;
}
/**
* Registers the loader for the TSL material module (called on WebGPURenderer
* init). The module itself is only fetched when UI is actually used.
*/
function setWebGPUUIMaterialLoader(loader) {
	webgpuMaterialLoader = loader;
	webgpuMaterialsPromise = void 0;
}
/**
* Loads (at most once) and registers the TSL materials. Awaited before any
* UI material is created, so callers must not create panel materials until it
* settles.
*/
function ensureWebGPUUIMaterials() {
	if (webgpuUIHandler) return Promise.resolve();
	if (!webgpuMaterialLoader) return Promise.resolve();
	webgpuMaterialsPromise ??= webgpuMaterialLoader().then(() => void 0);
	return webgpuMaterialsPromise;
}
function mergeDefaultUniforms(uniforms) {
	return {
		u_time: { value: 0 },
		u_resolution: { value: new THREE.Vector2(1, 1) },
		u_opacity: { value: 1 },
		...uniforms
	};
}
/** Creates the composite fill/stroke/shadow panel material. */
function createUnifiedPanelMaterial(options) {
	const uniforms = mergeDefaultUniforms(options.uniforms);
	if (webgpuUIHandler) return webgpuUIHandler.createUnifiedPanelMaterial({
		...options,
		uniforms
	});
	return new PanelShaderMaterial({
		fragmentShader: UnifiedGradientPanelFragmentShader,
		side: options.side ?? THREE.FrontSide,
		depthWrite: options.depthWrite ?? true,
		uniforms
	});
}
/** Creates the hover-lit manipulation edge material. */
function createCardEdgeMaterial(options) {
	const uniforms = mergeDefaultUniforms(options.uniforms);
	if (webgpuUIHandler) return webgpuUIHandler.createCardEdgeMaterial({
		...options,
		uniforms
	});
	return new PanelShaderMaterial({
		fragmentShader: UICardEdgeFragmentShader,
		side: options.side ?? THREE.DoubleSide,
		depthWrite: options.depthWrite ?? false,
		uniforms
	});
}
//#endregion
export { setWebGPUUIHandler as a, ensureWebGPUUIMaterials as i, createCardEdgeMaterial as n, setWebGPUUIMaterialLoader as o, createUnifiedPanelMaterial as r, MAX_RESIZE_CORNER_FRACTION as s, PanelShaderMaterial as t };

//# sourceMappingURL=PanelMaterialFactory.js.map
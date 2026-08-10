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
 * @version v0.20.0
 * @commitid 6610bbe
 * @builddate 2026-08-10T20:04:21.837Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
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
import { Container, Component, Custom, abortableEffect, Image, Text, reversePainterSortStable, Svg } from '@pmndrs/uikit';
import * as THREE from 'three';
import { T as TransformScript, t as MAX_GRADIENT_STOPS, u as DEFAULT_GRADIENT_PANEL_PROPS, v as ManipulationAction, w as getUIElementKind, x as getUIStructureRevision, U as UIText, y as isUIElement, z as getUIRevision, A as getUICardEdgeOptions, B as getSemanticControl, C as UICard, E as UIOverlay } from './entry.js';
import { signal, computed, effect } from '@preact/signals-core';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';

/**
 * A Container that renders one or more PanelLayers as its background.
 * It automatically syncs Container properties (size) to the panel layers.
 */
class ShaderPanel extends Container {
    constructor(properties) {
        const { ...containerProps } = properties;
        const containerConfig = {
            hasNonUikitChildren: true,
        };
        // Default styles.
        const defaultProps = {
            positionType: properties.positionType ?? 'relative',
            backgroundColor: undefined,
            pointerEvents: 'auto',
            ...containerProps,
        };
        // XR Blocks panels may contain non-rendering placement Scripts alongside
        // UIKit layout children. Non-UIKit children do not enter the Yoga layout.
        super(defaultProps, undefined, containerConfig);
        /** Array of PanelLayers rendered as background. */
        this.panelLayers = [];
    }
    add(...objects) {
        for (const object of objects) {
            if (!(object instanceof Component) &&
                !(object instanceof TransformScript)) {
                throw new Error('XR Blocks UI panels only accept UIKit components or TransformScript children.');
            }
        }
        return super.add(...objects);
    }
    /**
     * Adds a PanelLayer to the background and configures it.
     * @param layer - The layer to add.
     */
    addLayer(layer) {
        this.panelLayers.push(layer);
        this.add(layer);
        // Enforce absolute positioning to fill container.
        layer.setProperties({
            positionType: 'absolute',
            positionTop: 0,
            positionLeft: 0,
            positionRight: 0,
            positionBottom: 0,
            zIndexOffset: -1,
        });
    }
    /**
     * Removes a PanelLayer from the background.
     * @param layer - The layer to remove.
     */
    removeLayer(layer) {
        const index = this.panelLayers.indexOf(layer);
        if (index !== -1) {
            this.panelLayers.splice(index, 1);
            this.remove(layer);
        }
    }
}

const CommonFunctionsShader = `
// SDF for a rounded box in 2D.
float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - (b - r);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
`;

const GradientFunctionsShader = `
float rand(vec2 n) {
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

#include <dithering_pars_fragment>
#define MAX_GRADIENT_STOPS 4
#define PI 3.14159265359

// Paint Types.
#define PAINT_TYPE_SOLID 0
#define PAINT_TYPE_GRADIENT 1

// Gradient Types.
#define GRADIENT_TYPE_LINEAR 0
#define GRADIENT_TYPE_RADIAL 1
#define GRADIENT_TYPE_ANGULAR 2
#define GRADIENT_TYPE_DIAMOND 3

// Interpolate color stops across a 1D scalar index range [0..1].
// Shared by both fill meshes and radius/distance edge blended vectors (like Shadows).
vec4 mixGradientStops(
    float t,
    int numStops,
    float stops[MAX_GRADIENT_STOPS],
    vec4 colors[MAX_GRADIENT_STOPS]
) {
    if (numStops < 1) return vec4(0.0);
    if (numStops < 2) return colors[0];

    float finalT = clamp(t, 0.0, 1.0);
    vec4 color = colors[0];

    for (int i = 0; i < MAX_GRADIENT_STOPS - 1; i++) {
        if (i >= numStops - 1) break;

        float t0 = stops[i];
        float t1 = stops[i+1];

        if (finalT >= t0 && finalT <= t1) {
            float range = t1 - t0;
            float localT = (finalT - t0) / max(0.0001, range);
            color = mix(colors[i], colors[i+1], localT);
            break;
        }
    }

    // Boundary checks.
    if (finalT < stops[0]) color = colors[0];
    if (finalT > stops[numStops-1]) color = colors[numStops-1];

    return color;
}

vec4 getGradientColor(
    vec2 uv,
    vec2 resolution,
    int type,
    vec2 center,
    vec2 scale,
    float rotation,
    int numStops,
    float stops[MAX_GRADIENT_STOPS],
    vec4 colors[MAX_GRADIENT_STOPS]
) {
    if (numStops < 1) return vec4(0.0);
    if (numStops < 2) return colors[0];

    // 1. Transform UV.
    // Center logic: user provided center (default 0.5, 0.5).
    // We shift UV so that center is at (0,0).
    vec2 p = uv - center;

    // Rotation.
    float c = cos(-rotation);
    float s = sin(-rotation);
    mat2 rot = mat2(c, -s, s, c);
    p = rot * p;

    // Scale.
    // Expand feature = Divide coord.
    vec2 safeScale = vec2(
        abs(scale.x) < 0.001 ? 0.001 : scale.x,
        abs(scale.y) < 0.001 ? 0.001 : scale.y
    );
    p = p / safeScale;

    // 2. Calculate t (0 to 1 position in gradient).
    float t = 0.0;

    if (type == GRADIENT_TYPE_LINEAR) {
        // Defined along X axis (after rotation).
        // Maps x range [-0.5, 0.5] to [0.0, 1.0].
        t = p.x + 0.5;
    }
    else if (type == GRADIENT_TYPE_RADIAL) {
        // Distance from center.
        // t=0 at center. t=1 at radius 0.5.
        t = length(p) * 2.0;
    }
    else if (type == GRADIENT_TYPE_ANGULAR) {
        // Conic gradient.
        // atan(y, x). range -PI to PI.
        // Standard math angle (0 = Right, CCW).
        float angle = atan(-p.y, p.x);
        // Map to 0..1.
        t = (angle / (2.0 * PI)) + 0.5;
    }
    else if (type == GRADIENT_TYPE_DIAMOND) {
        // |x| + |y| (Manhattan distance).
        // Edge at 0.5 => |0.5| + |0| = 0.5.
        // t = (abs x + abs y) * 2.
        t = (abs(p.x) + abs(p.y)) * 2.0;
    }

    // Clamp t.
    t = clamp(t, 0.0, 1.0);

    return mixGradientStops(t, numStops, stops, colors);
}
`;

const GradientDropShadowFragmentShader = CommonFunctionsShader +
    GradientFunctionsShader +
    `
varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_corner_radius;
uniform float u_drop_shadow_margin;

// Stroke Info
uniform float u_stroke_width;
uniform float u_stroke_align; // -1 Inside, 0 Center, 1 Outside

// Drop Shadow Gradient
uniform int u_drop_gradientType;
uniform int u_drop_paintType;
uniform vec4 u_drop_solidColor;
uniform float u_drop_rotation;
uniform vec2 u_drop_center;
uniform vec2 u_drop_scale;
uniform float u_drop_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_drop_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_drop_numStops;

uniform float u_drop_blur;
uniform vec2 u_drop_position;
uniform float u_drop_spread;
uniform float u_drop_falloff;

void main() {
    // 1. Setup Coordinates.
    vec2 pos = vUv * u_resolution;
    vec2 size = u_resolution;

    // Calculate effective stroke expansion.
    // align 1 (outside) -> +W.
    // align 0 (center)  -> +W/2.
    // align -1 (inside) -> +0.
    float strokeShift = 0.0;
    if (u_stroke_align > 0.0) strokeShift = u_stroke_width; // Outside.
    else if (u_stroke_align > -0.5) strokeShift = u_stroke_width * 0.5; // Center.

    // Content box is usually size - 2*margin.
    // u_drop_shadow_margin is used to push the mesh bounds out.
    vec2 baseSize = size - (u_drop_shadow_margin * 2.0);
    vec2 baseHalfSize = baseSize * 0.5;

    // Now we add stroke expansion to get "Shadow Caster" size.
    vec2 casterHalfSize = baseHalfSize + vec2(strokeShift);

    // Effective Radius also expands by strokeShift.
    float effR = min(u_corner_radius, min(baseHalfSize.x, baseHalfSize.y)) + strokeShift;

    // Center coordinates.
    vec2 p = pos - (size * 0.5);

    // 2. Cutout Mask.
    // Drop shadow is drawn behind, but we cutout the caster area.
    float dist = sdRoundedBox(p, casterHalfSize, effR);

    // Adaptive AA for the cutout mask.
    float aa = fwidth(dist);
    float alphaMask = smoothstep(-0.5 * aa, 0.5 * aa, dist); // 0 inside caster, 1 outside.

    // 3. Drop Shadow Calculation.
    // Apply position.
    vec2 shadowPos = p - u_drop_position;

    // SDF.
    float shadowDist = sdRoundedBox(shadowPos, casterHalfSize, effR);

    // Apply Spread (expands the shadow shape).
    shadowDist -= u_drop_spread;

    // Blur.
    float blur = max(1.0, u_drop_blur);
    float shadowAlpha = 1.0 - smoothstep(0.0, blur, shadowDist);

    // Falloff power.
    shadowAlpha = pow(shadowAlpha, u_drop_falloff);

    // 4. Calculate Color.
    vec4 finalColor = vec4(0.0);

    if (u_drop_paintType == PAINT_TYPE_SOLID) {
        finalColor = u_drop_solidColor;
    } else if (u_drop_paintType == PAINT_TYPE_GRADIENT) {
        if (u_drop_gradientType == GRADIENT_TYPE_RADIAL) {
            float d = sdRoundedBox(p - u_drop_position, casterHalfSize, effR);
            float t = clamp(d / max(0.001, u_drop_blur), 0.0, 1.0);

            finalColor = mixGradientStops(
                t,
                u_drop_numStops,
                u_drop_gradientStops,
                u_drop_gradientColors
             );
        } else {
            finalColor = getGradientColor(
                vUv, u_resolution,
                u_drop_gradientType,
                u_drop_center,
                u_drop_scale,
                u_drop_rotation,
                u_drop_numStops,
                u_drop_gradientStops,
                u_drop_gradientColors
            );
        }
    }

    // Apply opacity.
    float finalAlpha = finalColor.a * shadowAlpha * alphaMask * u_opacity;

    gl_FragColor = vec4(finalColor.rgb, finalAlpha);

    #include <dithering_fragment>
}
`;

/**
 * Numeric IDs mapped to `GradientType` for shader uniforms lookup.
 */
const GradientTypeIds = {
    Linear: 0,
    Radial: 1,
    Angular: 2,
    Diamond: 3,
};
/**
 * Numeric IDs indicating solid vs gradient configurations inside uniform structures.
 */
const PaintTypeIds = {
    Solid: 0,
    Gradient: 1,
};

/**
 * Parses a THREE.ColorRepresentation into a THREE.Color and an opacity value.
 * Supports:
 * - Hex strings (#RRGGBB, #RRGGBBAA, #RGB, #RGBA).
 * - rgb() and rgba() CSS strings.
 * - CSS Color Names ('white', 'red', 'aliceblue') natively via THREE.Color.
 * @param value - The color representation to parse.
 * @returns An object containing the parsed THREE.Color and opacity float (0 to 1).
 */
function parseColorWithAlpha(value) {
    const result = { color: new THREE.Color(0xffffff), opacity: 1.0 };
    if (value === undefined)
        return result;
    if (typeof value === 'string') {
        if (value.trim().toLowerCase() === 'transparent') {
            result.color.set(0x000000);
            result.opacity = 0;
            return result;
        }
        // 1. Match rgb() or rgba() formats (e.g., rgba(255, 0, 0, 0.5)).
        const rgbaMatch = value.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
        if (rgbaMatch) {
            result.color.setRGB(parseInt(rgbaMatch[1]) / 255, parseInt(rgbaMatch[2]) / 255, parseInt(rgbaMatch[3]) / 255);
            if (rgbaMatch[4] !== undefined) {
                result.opacity = parseFloat(rgbaMatch[4]);
            }
            return result;
        }
        // 2. Match Hex formats with alpha (#RRGGBBAA or #RGBA).
        if (value.startsWith('#') && (value.length === 9 || value.length === 5)) {
            const hex = value.slice(1);
            const isShort = hex.length === 4;
            const maxVal = isShort ? 15 : 255;
            const colorHex = '#' + hex.slice(0, hex.length - (isShort ? 1 : 2));
            const alphaHex = hex.slice(hex.length - (isShort ? 1 : 2));
            result.color.set(colorHex);
            result.opacity = parseInt(alphaHex, 16) / maxVal;
            return result;
        }
    }
    // 3. Fallback: Parse standard 3/6-digit Hex, CSS names, or numbers.
    result.color.set(value);
    return result;
}

/**
 * Helper to get a uniform by name or prefix+name.
 * @param uniforms - The uniforms object.
 * @param arg1 - Name of uniform, or prefix if arg2 is provided.
 * @param arg2 - Optional name of uniform if arg1 is prefix.
 */
function getU(uniforms, arg1, arg2) {
    const key = arg2 ? `${arg1}${arg2}` : arg1;
    return uniforms[key];
}

/**
 * Type guard to check if a Paint is a GradientPaint.
 */
function _isGradient(paint) {
    return typeof paint === 'object' && paint !== null && 'stops' in paint;
}
/** Returns whether a paint can produce a fragment with non-zero alpha. */
function isPaintVisible(paint) {
    if (paint === undefined)
        return false;
    if (_isGradient(paint)) {
        return paint.stops.some(({ color }) => parseColorWithAlpha(color).opacity > 0);
    }
    return parseColorWithAlpha(paint).opacity > 0;
}
/**
 * Sets a solid color into ShaderUniforms.
 */
function _setSolid(uniforms, prefix, color, opacity) {
    const paintTypeU = getU(uniforms, prefix, 'paintType');
    if (paintTypeU)
        paintTypeU.value = PaintTypeIds.Solid;
    const solidColorU = getU(uniforms, prefix, 'solidColor');
    if (solidColorU) {
        const { color: c } = parseColorWithAlpha(color);
        const cObj = new THREE.Color(c);
        solidColorU.value.set(cObj.r, cObj.g, cObj.b, opacity);
    }
}
// ==========================================
// 2. Paint Uniforms (Fill / Stroke)
// ==========================================
/**
 * Creates a set of uniforms for a Paint structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_fill_', 'u_stroke_').
 * @returns An object containing initialized ShaderUniforms sets.
 */
function createPaintUniforms(prefix) {
    return {
        // 0 for Solid, 1 for Gradient. See PaintTypeIds.
        [`${prefix}paintType`]: { value: 0 },
        // RGBA vector supporting solid color maps.
        [`${prefix}solidColor`]: { value: new THREE.Vector4(0, 0, 0, 1) },
        // 0 for Linear, 1 for Radial, etc. See GradientTypeIds.
        [`${prefix}gradientType`]: { value: 0 },
        // Center anchor coordinate offset mapped from [0, 1].
        [`${prefix}center`]: { value: new THREE.Vector2(0.5, 0.5) },
        // Scalar multipliers scaling the bounding box stretch.
        [`${prefix}scale`]: { value: new THREE.Vector2(1, 1) },
        // Rotation scalar mapped in radians.
        [`${prefix}rotation`]: { value: 0 },
        // Array containing positional steps floats.
        [`${prefix}gradientStops`]: { value: new Array(MAX_GRADIENT_STOPS).fill(0) },
        // Array containing keyed color nodes mapped concurrently with stops.
        [`${prefix}gradientColors`]: {
            value: new Array(MAX_GRADIENT_STOPS)
                .fill(null)
                .map(() => new THREE.Vector4(0, 0, 0, 1)),
        },
        // Total count of verified stops mapped inside arrays.
        [`${prefix}numStops`]: { value: 0 },
    };
}
/**
 * Updates ShaderUniforms based on a Paint definition.
 * @param uniforms - The uniforms object to update.
 * @param input - The Paint definition (color or gradient) to apply.
 * @param prefix - The uniform name prefix.
 */
function updatePaintUniforms(uniforms, input, prefix) {
    if (input === undefined) {
        let defColor = 0x000000;
        let defOpacity = 0.0;
        if (prefix === 'u_fill_') {
            defColor = DEFAULT_GRADIENT_PANEL_PROPS.fillColor;
            defOpacity = 1.0;
        }
        else if (prefix === 'u_stroke_') {
            defColor = DEFAULT_GRADIENT_PANEL_PROPS.strokeColor;
            defOpacity = 1.0;
        }
        _setSolid(uniforms, prefix, defColor, defOpacity);
        return;
    }
    if (!_isGradient(input)) {
        const { color, opacity } = parseColorWithAlpha(input);
        _setSolid(uniforms, prefix, color, opacity);
        return;
    }
    const gradient = input;
    const stops = gradient.stops || [];
    const paintTypeU = getU(uniforms, prefix, 'paintType');
    if (paintTypeU)
        paintTypeU.value = PaintTypeIds.Gradient;
    const gradientTypeU = getU(uniforms, prefix, 'gradientType');
    if (gradientTypeU) {
        const typeName = (gradient.gradientType.charAt(0).toUpperCase() +
            gradient.gradientType.slice(1));
        gradientTypeU.value = GradientTypeIds[typeName] ?? 0;
    }
    const rotationU = getU(uniforms, prefix, 'rotation');
    if (rotationU)
        rotationU.value = THREE.MathUtils.degToRad(gradient.rotation ?? 0);
    const centerU = getU(uniforms, prefix, 'center');
    if (centerU) {
        const c = gradient.center ?? [0.5, 0.5];
        if (Array.isArray(c))
            centerU.value.set(c[0], c[1]);
        else
            centerU.value.copy(c);
    }
    const scaleU = getU(uniforms, prefix, 'scale');
    if (scaleU) {
        const s = gradient.scale ?? [1, 1];
        if (Array.isArray(s))
            scaleU.value.set(s[0], s[1]);
        else
            scaleU.value.copy(s);
    }
    const numStops = Math.min(stops.length, MAX_GRADIENT_STOPS);
    const numStopsU = getU(uniforms, prefix, 'numStops');
    if (numStopsU)
        numStopsU.value = numStops;
    const gradientStopsU = getU(uniforms, prefix, 'gradientStops');
    const gradientColorsU = getU(uniforms, prefix, 'gradientColors');
    const stopPositions = gradientStopsU
        ? gradientStopsU.value
        : [];
    const stopColors = gradientColorsU
        ? gradientColorsU.value
        : [];
    for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
        if (i < numStops) {
            const s = stops[i];
            if (stopPositions[i] !== undefined)
                stopPositions[i] = s.position;
            const { color, opacity } = parseColorWithAlpha(s.color);
            if (stopColors[i])
                stopColors[i].set(color.r, color.g, color.b, opacity);
        }
        else {
            if (stopPositions[i] !== undefined)
                stopPositions[i] = 0;
            if (stopColors[i])
                stopColors[i].set(0, 0, 0, 0);
        }
    }
}
// ==========================================
// 3. Shadow Uniforms
// ==========================================
/**
 * Creates a set of uniforms for a Shadow structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_inner_shadow_', 'u_outer_shadow_').
 * @returns An object containing ShaderUniforms.
 */
function createShadowUniforms(prefix) {
    return {
        ...createPaintUniforms(prefix),
        // Softness radius of the shadow blur.
        [`${prefix}blur`]: { value: 0 },
        // Directional offset [x, y] of the shadow cast.
        [`${prefix}position`]: { value: new THREE.Vector2(0, 0) },
        // Scalar expansion of the shadow silhouette before blur.
        [`${prefix}spread`]: { value: 0 },
        // Rate of exponential decay from core density to edge.
        [`${prefix}falloff`]: { value: 0 },
    };
}
/**
 * Updates ShaderUniforms based on Shadow properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Shadow properties containing blur, position, spread, falloff.
 * @param prefix - The uniform name prefix.
 */
function updateShadowUniforms(uniforms, properties, prefix) {
    if (properties.color !== undefined) {
        updatePaintUniforms(uniforms, properties.color, prefix);
    }
    if (properties.blur !== undefined) {
        const u = getU(uniforms, prefix, 'blur');
        if (u)
            u.value = properties.blur;
    }
    if (properties.spread !== undefined) {
        const u = getU(uniforms, prefix, 'spread');
        if (u)
            u.value = properties.spread;
    }
    if (properties.falloff !== undefined) {
        const u = getU(uniforms, prefix, 'falloff');
        if (u)
            u.value = properties.falloff;
    }
    if (properties.position) {
        const pos = properties.position;
        const u = getU(uniforms, prefix, 'position');
        if (u) {
            if (Array.isArray(pos)) {
                u.value.set(pos[0], pos[1]);
            }
            else {
                u.value.copy(pos);
            }
        }
    }
}
// ==========================================
// 4. Stroke Uniforms
// ==========================================
/**
 * Updates ShaderUniforms based on Stroke properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Stroke properties containing width and alignment.
 */
function updateStrokeUniforms(uniforms, properties) {
    if (uniforms.u_stroke_width && properties.strokeWidth !== undefined) {
        uniforms.u_stroke_width.value = properties.strokeWidth;
    }
    if (uniforms.u_stroke_align && properties.strokeAlign !== undefined) {
        let shaderAlign = 0.0;
        if (properties.strokeAlign === 'inside')
            shaderAlign = -1;
        else if (properties.strokeAlign === 'outside')
            shaderAlign = 1.0;
        uniforms.u_stroke_align.value = shaderAlign;
    }
}

const PanelVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

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
class PanelShaderMaterial extends THREE.ShaderMaterial {
    constructor(parameters) {
        super({
            vertexShader: PanelVertexShader,
            // Default to pink to indicate "Missing Shader" - Subclasses must override
            fragmentShader: 'void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }',
            transparent: true,
            side: THREE.FrontSide,
            forceSinglePass: true,
            dithering: true,
            ...parameters,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(1, 1) },
                u_opacity: { value: 1 },
                ...parameters?.uniforms,
            },
        });
    }
}
/**
 * A Custom component that wraps a PanelShaderMaterial.
 *
 * It automatically handles:
 * - Rendering Order (forces `elementType: 0` to render before content)
 * - Resolution Syncing (updates `u_resolution` uniform on resize)
 *
 * It is designed to be added to a `ShaderPanel` via `addLayer()`.
 */
class PanelLayer extends Custom {
    /**
     * @param material - The PanelShaderMaterial instance to use for rendering.
     * @param inputProperties - Properties provided by the consumer component.
     * @param initialClasses - Array of classes or styles to apply.
     * @param config - Optional configuration settings for the layer lifecycle.
     */
    constructor(material, inputProperties, initialClasses, config) {
        super(inputProperties, initialClasses, {
            material,
            ...config,
        });
        this.material = material;
        // Force ElementType.Panel (0) to ensure background renders before content (Icons/Text).
        abortableEffect(() => {
            const orderInfo = this.orderInfo.value;
            if (orderInfo && orderInfo.elementType !== 0) {
                // We override the elementType in place to correct the sorting order.
                this.orderInfo.value = { ...orderInfo, elementType: 0 };
            }
        }, this.abortSignal);
        // Handle resizing.
        abortableEffect(() => {
            const size = this.size.value;
            if (size) {
                this.material.uniforms.u_resolution.value.set(size[0], size[1]);
            }
        }, this.abortSignal);
        // Custom shader layers do not use UIKit's built-in panel material, so they
        // must apply the resolved opacity property through a shared uniform.
        abortableEffect(() => {
            const opacity = this.properties.signal.opacity?.value;
            this.material.uniforms.u_opacity.value =
                typeof opacity === 'string'
                    ? Number.parseFloat(opacity) / 100
                    : (opacity ?? 1);
        }, this.abortSignal);
    }
    /**
     * Helper method to update a shader uniform safely if it exists.
     * @param name - The name of the uniform to update.
     * @param value - The new value for the uniform.
     */
    updateUniform(name, value) {
        if (this.material.uniforms[name]) {
            const u = this.material.uniforms[name];
            if (u)
                u.value = value;
        }
    }
}

class DropShadowLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientDropShadowFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_drop_'),
                ...createShadowUniforms('u_drop_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_stroke_align: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'DropShadowLayer';
        abortableEffect(() => {
            const signalProps = this.properties.signal;
            const dropShadowColor = signalProps.dropShadowColor?.value;
            updatePaintUniforms(this.material.uniforms, dropShadowColor, 'u_drop_');
            updateShadowUniforms(this.material.uniforms, {
                blur: signalProps.dropShadowBlur?.value,
                position: signalProps.dropShadowPosition?.value,
                spread: signalProps.dropShadowSpread?.value,
                falloff: signalProps.dropShadowFalloff?.value,
            }, 'u_drop_');
            // Stroke Props for shadow adjustment.
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth: signalProps.strokeWidth?.value,
                strokeAlign: signalProps.strokeAlign?.value,
            });
            this.material.visible = isPaintVisible(dropShadowColor);
        }, this.abortSignal);
    }
}

const GradientFillFragmentShader = CommonFunctionsShader +
    GradientFunctionsShader +
    `
varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_corner_radius;
uniform float u_drop_shadow_margin;

// Fill Gradient (formerly Base)
uniform int u_fill_gradientType;
uniform int u_fill_paintType;
uniform vec4 u_fill_solidColor;
uniform float u_fill_rotation;
uniform vec2 u_fill_center;
uniform vec2 u_fill_scale;
uniform float u_fill_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_fill_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_fill_numStops;

void main() {
    // 1. Setup Coordinates.
    vec2 pos = vUv * u_resolution;
    vec2 size = u_resolution;

    // Content box is the "solid" area.
    vec2 contentSize = size - (u_drop_shadow_margin * 2.0);
    vec2 contentHalfSize = contentSize * 0.5;

    // Center coordinates.
    vec2 p = pos - (size * 0.5);

    // 2. Base Shape SDF.
    // Clamp radius to prevent artifacts.
    float effR = min(u_corner_radius, min(contentHalfSize.x, contentHalfSize.y));
    float dist = sdRoundedBox(p, contentHalfSize, effR);

    // 3. Clip Mask (Improved AA - Adaptive).
    // Use fwidth to determine proper AA range (1 pixel wide).
    float aa = fwidth(dist);
    // Smoothstep from -0.5*aa to 0.5*aa creates a perfect 1-pixel anti-aliased edge.
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dist);

    if (alphaMask < 0.001) discard;

    // 4. Calculate Color.
    vec4 finalColor = vec4(0.0);

    if (u_fill_paintType == PAINT_TYPE_SOLID) {
        finalColor = u_fill_solidColor;
    } else if (u_fill_paintType == PAINT_TYPE_GRADIENT) {
        finalColor = getGradientColor(
            vUv, u_resolution,
            u_fill_gradientType,
            u_fill_center,
            u_fill_scale,
            u_fill_rotation,
            u_fill_numStops,
            u_fill_gradientStops,
            u_fill_gradientColors
        );
    }

    // Apply Opacity.
    finalColor.a *= alphaMask * u_opacity;

    gl_FragColor = finalColor;

    #include <dithering_fragment>
}
`;

/**
 * Layer responsible for rendering the background fill color or gradient.
 * Uses GradientFillFragmentShader.
 */
class FillLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientFillFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_fill_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'FillLayer';
        // Sync Signals to Uniforms.
        abortableEffect(() => {
            const signalProps = this.properties.signal;
            const fillColor = signalProps.fillColor?.value;
            updatePaintUniforms(this.material.uniforms, fillColor, 'u_fill_');
            this.material.visible = isPaintVisible(fillColor);
        }, this.abortSignal);
    }
}

const GradientInnerShadowFragmentShader = CommonFunctionsShader +
    GradientFunctionsShader +
    `
varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_corner_radius;
uniform float u_drop_shadow_margin;

uniform float u_stroke_width;
uniform float u_stroke_align;


// Inner Shadow Gradient
uniform int u_inner_gradientType;
uniform int u_inner_paintType;
uniform vec4 u_inner_solidColor;
uniform float u_inner_rotation;
uniform vec2 u_inner_center;
uniform vec2 u_inner_scale;
uniform float u_inner_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_inner_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_inner_numStops;

// Standard Inner Shadow Props
uniform float u_inner_blur;
uniform vec2 u_inner_position;
uniform float u_inner_spread;
uniform float u_inner_falloff;

void main() {
    // 1. Setup Coordinates.
    vec2 pos = vUv * u_resolution;
    vec2 size = u_resolution;

    // Content box is the "solid" area.
    vec2 contentSize = size - (u_drop_shadow_margin * 2.0);
    vec2 contentHalfSize = contentSize * 0.5;

    // Adjust for Stroke Inset.
    // Inside (-1) -> Inset by W.
    // Center (0)  -> Inset by W/2.
    // Outside (1) -> Inset by 0.
    float strokeInset = 0.0;
    if (u_stroke_align < 0.5) {
        if (u_stroke_align < -0.5) strokeInset = u_stroke_width; // Inside.
        else strokeInset = u_stroke_width * 0.5; // Center.
    }

    // Shrink color area by stroke inset so shadow starts at stroke edge.
    vec2 shadowZoneHalfSize = max(vec2(0.0), contentHalfSize - vec2(strokeInset));

    // Center coordinates.
    vec2 p = pos - (size * 0.5);

    // 2. Base Shape SDF.
    // Clamp radius to prevent artifacts.
    float effR = min(u_corner_radius, min(shadowZoneHalfSize.x, shadowZoneHalfSize.y));

    effR = max(0.0, u_corner_radius - strokeInset);
    // Clamp to size.
    effR = min(effR, min(shadowZoneHalfSize.x, shadowZoneHalfSize.y));

    float dist = sdRoundedBox(p, shadowZoneHalfSize, effR);

    // 3. Clip Mask (Improved AA - Adaptive).
    // Use fwidth to determine proper AA range (1 pixel wide).
    float aa = fwidth(dist);
    // Smoothstep from -0.5*aa to 0.5*aa creates a perfect 1-pixel anti-aliased edge.
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dist);

    if (alphaMask < 0.001) discard;

    // 4. Calculate Shadow Color.
    vec4 finalColor = vec4(0.0);

    if (u_inner_paintType == PAINT_TYPE_SOLID) {
        finalColor = u_inner_solidColor;
    } else if (u_inner_paintType == PAINT_TYPE_GRADIENT) {
        if (u_inner_gradientType == GRADIENT_TYPE_RADIAL) {
             // Distance-based Radial Gradient for Shadows.
             float d = sdRoundedBox(p - u_inner_position, contentHalfSize, effR);
             float t = clamp(-d / max(0.001, u_inner_blur), 0.0, 1.0);

             finalColor = mixGradientStops(
                t,
                u_inner_numStops,
                u_inner_gradientStops,
                u_inner_gradientColors
             );
        } else {
            finalColor = getGradientColor(
                vUv, u_resolution,
                u_inner_gradientType,
                u_inner_center,
                u_inner_scale,
                u_inner_rotation,
                u_inner_numStops,
                u_inner_gradientStops,
                u_inner_gradientColors
            );
        }
    }

    // 5. Inner Shadow Factor.
    // "Outer Glow of Inner Box" Algorithm (Fixes medial axis artifacts).
    // We create a smaller "source" box and blur outwards from it.

    // Ensure blur is non-zero.
    float blur = max(0.001, u_inner_blur);
    float spread = u_inner_spread;

    // The source box is shrunk by (spread + blur).
    // This defines the "0%" shadow line (pure center color).
    float totalInset = spread + blur;
    vec2 bSmall = shadowZoneHalfSize - totalInset;
    // Radius also shrinks, but clamped to 0.
    float rSmall = max(0.0, effR - totalInset);

    vec2 p_rel = p - u_inner_position;
    // Distance from the small source box.
    // Inside source (<0) = Center Color.
    // Outside source (>0) = Transition to Shadow.
    float dSmall = sdRoundedBox(p_rel, bSmall, rSmall);

    // Calculate shadow intensity (0.0 to 1.0).
    // 0.0 at source boundary, 1.0 at blur distance.
    float shadowVal = smoothstep(0.0, blur, dSmall);

    // innerEdgeFactor is the "inverse" (1.0 = Center/Hole, 0.0 = Shadow).
    // Used in Section 6 to calculate final shadow strength.
    float innerEdgeFactor = 1.0 - shadowVal;

    // 6. Mixing (Composite Shadow).
    // shadowStrength: 1 at edge -> 0 at depth.
    float shadowStrength = 1.0 - innerEdgeFactor;

    // Falloff (Power Curve).
    // 1.0 = Linear.
    // >1.0 = Fades faster (Power curve).
    shadowStrength = pow(shadowStrength, max(0.001, u_inner_falloff));

    // Calculate finally alpha.
    float finalAlpha = finalColor.a * shadowStrength * alphaMask * u_opacity;

    gl_FragColor = vec4(finalColor.rgb, finalAlpha);

    #include <dithering_fragment>
}
`;

/**
 * Layer responsible for rendering the panel's inner shadow.
 * Uses GradientInnerShadowFragmentShader.
 */
class InnerShadowLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientInnerShadowFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_inner_'),
                ...createShadowUniforms('u_inner_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_stroke_align: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'InnerShadowLayer';
        abortableEffect(() => {
            const signalProps = this.properties.signal;
            const innerShadowColor = signalProps.innerShadowColor?.value;
            updatePaintUniforms(this.material.uniforms, innerShadowColor, 'u_inner_');
            updateShadowUniforms(this.material.uniforms, {
                blur: signalProps.innerShadowBlur?.value,
                position: signalProps.innerShadowPosition?.value,
                spread: signalProps.innerShadowSpread?.value,
                falloff: signalProps.innerShadowFalloff?.value,
            }, 'u_inner_');
            // Stroke Props for shadow adjustment.
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth: signalProps.strokeWidth?.value,
                strokeAlign: signalProps.strokeAlign?.value,
            });
            this.material.visible = isPaintVisible(innerShadowColor);
        }, this.abortSignal);
    }
}

const GradientStrokeFragmentShader = CommonFunctionsShader +
    GradientFunctionsShader +
    `
// Uniforms.
uniform int u_stroke_gradientType;
uniform int u_stroke_paintType;
uniform vec4 u_stroke_solidColor;
uniform float u_stroke_rotation;
uniform vec2 u_stroke_center;
uniform vec2 u_stroke_scale;
uniform float u_stroke_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_stroke_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_stroke_numStops;

uniform float u_stroke_width;
uniform float u_stroke_align; // Offset from edge (0=center, >0 outside, <0 inside).
uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_corner_radius;
uniform float u_drop_shadow_margin;

varying vec2 vUv;

void main() {
    // 1. Setup Coordinates.
    vec2 pos = vUv * u_resolution;
    vec2 size = u_resolution;

    if (u_stroke_width < 0.001) discard;

    // Content box is the "solid" area.
    vec2 contentSize = size - (u_drop_shadow_margin * 2.0);
    vec2 contentHalfSize = contentSize * 0.5;

    // Center coordinates.
    vec2 p = pos - (size * 0.5);

    // 2. Stroke SDF.
    // We want a stroke of width W around the rounded box.
    // The rounded box has radius R.
    // The stroke can be aligned.

    // Base distance to the rounded rect.
    float effR = min(u_corner_radius, min(contentHalfSize.x, contentHalfSize.y));
    float d = sdRoundedBox(p, contentHalfSize, effR);

    // Adjust d based on alignment.
    float shift = u_stroke_align * (u_stroke_width * 0.5);
    float dStroke = d - shift;

    // The stroke itself is the area where abs(dStroke) <= W/2.
    float halfWidth = u_stroke_width * 0.5;
    float strokeDist = abs(dStroke) - halfWidth;

    // 3. Anti-aliasing.
    float aa = fwidth(d);
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, strokeDist);

    if (alphaMask < 0.001) discard;

    // 4. Calculate Color.
    vec4 finalColor = vec4(0.0);

    if (u_stroke_paintType == PAINT_TYPE_SOLID) {
        finalColor = u_stroke_solidColor;
    } else if (u_stroke_paintType == PAINT_TYPE_GRADIENT) {
         finalColor = getGradientColor(
            vUv, u_resolution,
            u_stroke_gradientType,
            u_stroke_center,
            u_stroke_scale,
            u_stroke_rotation,
            u_stroke_numStops,
            u_stroke_gradientStops,
            u_stroke_gradientColors
        );
    }

    gl_FragColor = vec4(finalColor.rgb, finalColor.a * alphaMask * u_opacity);

    #include <dithering_fragment>
}
`;

/**
 * Layer responsible for rendering the panel's stroke or border.
 * Uses GradientStrokeFragmentShader.
 */
class StrokeLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientStrokeFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_stroke_'),
                u_stroke_align: { value: 0.0 },
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'StrokeLayer';
        abortableEffect(() => {
            const signalProps = this.properties.signal;
            const strokeColor = signalProps.strokeColor?.value;
            const strokeWidth = signalProps.strokeWidth?.value;
            updatePaintUniforms(this.material.uniforms, strokeColor, 'u_stroke_');
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth,
                strokeAlign: signalProps.strokeAlign?.value,
            });
            this.material.visible =
                isPaintVisible(strokeColor) && (strokeWidth ?? 0) > 0;
        }, this.abortSignal);
    }
}

/**
 * GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
class GradientPanel extends ShaderPanel {
    // Constructor
    constructor(properties = {}) {
        // Corner Radius
        const cornerRadiusSignal = signal(properties.cornerRadius ??
            DEFAULT_GRADIENT_PANEL_PROPS.cornerRadius);
        // Fill
        const fillColorSignal = signal(properties.fillColor ?? DEFAULT_GRADIENT_PANEL_PROPS.fillColor);
        const backfaceColorSignal = properties.backfaceColor === undefined
            ? undefined
            : signal(properties.backfaceColor);
        // Inner Shadow.
        const innerShadowColorSignal = signal(properties.innerShadowColor ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowColor);
        const innerShadowBlurSignal = signal(properties.innerShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowBlur);
        const innerShadowPositionSignal = signal(properties.innerShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowPosition);
        const innerShadowSpreadSignal = signal(properties.innerShadowSpread ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowSpread);
        const innerShadowFalloffSignal = signal(properties.innerShadowFalloff ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowFalloff);
        // Drop Shadow.
        const dropShadowColorSignal = signal(properties.dropShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowColor);
        const dropShadowBlurSignal = signal(properties.dropShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowBlur);
        const dropShadowPositionSignal = signal(properties.dropShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowPosition);
        const dropShadowSpreadSignal = signal(properties.dropShadowSpread ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowSpread);
        const dropShadowFalloffSignal = signal(properties.dropShadowFalloff ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowFalloff);
        // Margin = max(DropShadowBlur + Position + Spread, StrokeWidth / 2).
        const shadowExpansion = computed(() => {
            const blur = Math.max(dropShadowBlurSignal.value, 0);
            const spread = Math.max(dropShadowSpreadSignal.value, 0);
            const pos = dropShadowPositionSignal.value;
            let extra = 0;
            if (pos) {
                if (Array.isArray(pos))
                    extra = Math.max(Math.abs(pos[0]), Math.abs(pos[1]));
                else
                    extra = Math.max(Math.abs(pos.x), Math.abs(pos.y));
            }
            return blur + extra + spread;
        });
        // Stroke
        const strokeColorSignal = signal(properties.strokeColor ?? DEFAULT_GRADIENT_PANEL_PROPS.strokeColor);
        const strokeWidthSignal = signal(properties.strokeWidth ??
            DEFAULT_GRADIENT_PANEL_PROPS.strokeWidth);
        const strokeAlignSignal = signal(properties.strokeAlign ??
            DEFAULT_GRADIENT_PANEL_PROPS.strokeAlign);
        // Margin for layout expansion.
        const expansionMarginSignal = computed(() => {
            const s = shadowExpansion.value;
            const sWidth = strokeWidthSignal.value;
            const align = strokeAlignSignal.value;
            let strokeExpand = 0;
            // If Center (1), expand by W/2.
            // If Outside (2), expand by W.
            if (align === 'center')
                strokeExpand = sWidth * 0.5;
            else if (align === 'outside')
                strokeExpand = sWidth;
            // The shadow starts from the stroke edge, so we need to add the stroke expansion to the shadow expansion.
            // But we also need to ensure we at least cover the stroke itself (which is strokeExpand).
            // Since s + strokeExpand >= strokeExpand (assuming s >= 0), we can just sum them.
            return s + strokeExpand;
        });
        super({
            ...properties,
            overflow: 'visible',
        });
        this.name = 'GradientPanel';
        // Drop Shadow
        this.dropShadowLayer = new DropShadowLayer({
            dropShadowColor: dropShadowColorSignal,
            dropShadowBlur: dropShadowBlurSignal,
            dropShadowPosition: dropShadowPositionSignal,
            dropShadowSpread: dropShadowSpreadSignal,
            dropShadowFalloff: dropShadowFalloffSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        // Fill.
        this.fillLayer = new FillLayer({
            fillColor: fillColorSignal,
        });
        if (backfaceColorSignal) {
            this.backfaceLayer = new FillLayer({
                fillColor: backfaceColorSignal,
            });
            this.backfaceLayer.name = 'BackfaceLayer';
            this.backfaceLayer.material.side = THREE.BackSide;
        }
        // Inner Shadow
        this.innerShadowLayer = new InnerShadowLayer({
            innerShadowColor: innerShadowColorSignal,
            innerShadowBlur: innerShadowBlurSignal,
            innerShadowPosition: innerShadowPositionSignal,
            innerShadowSpread: innerShadowSpreadSignal,
            innerShadowFalloff: innerShadowFalloffSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        // Stroke
        this.strokeLayer = new StrokeLayer({
            strokeColor: strokeColorSignal,
            strokeWidth: strokeWidthSignal,
            strokeAlign: strokeAlignSignal,
        });
        if (this.backfaceLayer) {
            this.backfaceStrokeLayer = new StrokeLayer({
                strokeColor: strokeColorSignal,
                strokeWidth: strokeWidthSignal,
                strokeAlign: strokeAlignSignal,
            });
            this.backfaceStrokeLayer.name = 'BackfaceStrokeLayer';
            this.backfaceStrokeLayer.material.side = THREE.BackSide;
        }
        // Add Layers in correct order.
        if (this.backfaceLayer)
            this.addLayer(this.backfaceLayer);
        if (this.backfaceStrokeLayer)
            this.addLayer(this.backfaceStrokeLayer);
        this.addLayer(this.dropShadowLayer);
        this.addLayer(this.fillLayer);
        this.addLayer(this.innerShadowLayer);
        this.addLayer(this.strokeLayer);
        // Store Signals.
        this.cornerRadiusSignal = cornerRadiusSignal;
        this.fillColorSignal = fillColorSignal;
        this.backfaceColorSignal = backfaceColorSignal;
        this.innerShadowColorSignal = innerShadowColorSignal;
        this.innerShadowBlurSignal = innerShadowBlurSignal;
        this.innerShadowPositionSignal = innerShadowPositionSignal;
        this.innerShadowSpreadSignal = innerShadowSpreadSignal;
        this.innerShadowFalloffSignal = innerShadowFalloffSignal;
        this.dropShadowColorSignal = dropShadowColorSignal;
        this.dropShadowBlurSignal = dropShadowBlurSignal;
        this.dropShadowPositionSignal = dropShadowPositionSignal;
        this.dropShadowSpreadSignal = dropShadowSpreadSignal;
        this.dropShadowFalloffSignal = dropShadowFalloffSignal;
        this.expansionMarginSignal = expansionMarginSignal;
        this.strokeColorSignal = strokeColorSignal;
        this.strokeWidthSignal = strokeWidthSignal;
        this.strokeAlignSignal = strokeAlignSignal;
        // Layout & Z-Order.
        // Common layout configs.
        const absProps = {
            positionType: 'absolute',
            pointerEvents: 'none',
        };
        // Fill
        this.fillLayer.setProperties({
            ...absProps,
            zIndexOffset: -10,
            pointerEvents: properties.pointerEvents ?? 'auto',
        });
        this.backfaceLayer?.setProperties({
            ...absProps,
            zIndexOffset: -12,
        });
        this.backfaceStrokeLayer?.setProperties({
            ...absProps,
            zIndexOffset: -11,
        });
        // Inner Shadow
        this.innerShadowLayer.setProperties({
            ...absProps,
            zIndexOffset: -8,
        });
        // Drop Shadow
        this.dropShadowLayer.setProperties({
            ...absProps,
            zIndexOffset: -4,
        });
        // Stroke
        this.strokeLayer.setProperties({
            ...absProps,
            zIndexOffset: -6,
        });
        // Sync layout.
        const marginNeg = computed(() => -this.expansionMarginSignal.value);
        abortableEffect(() => {
            const m = marginNeg.value;
            const props = {
                positionTop: m,
                positionLeft: m,
                positionRight: m,
                positionBottom: m,
            };
            this.fillLayer.setProperties(props);
            this.innerShadowLayer.setProperties(props);
            this.dropShadowLayer.setProperties(props);
            this.strokeLayer.setProperties(props);
        }, this.abortSignal);
        // Sync Corner Radius & Stroke Width & Margin.
        abortableEffect(() => {
            const r = this.cornerRadiusSignal.value;
            const w = this.strokeWidthSignal.value;
            const m = this.expansionMarginSignal.value;
            // Apply to all layers.
            for (const layer of this.panelLayers) {
                if (layer.material.uniforms.u_corner_radius) {
                    layer.material.uniforms.u_corner_radius.value = r;
                }
                if (layer.material.uniforms.u_stroke_width) {
                    layer.material.uniforms.u_stroke_width.value = w;
                }
                if (layer.material.uniforms.u_drop_shadow_margin) {
                    layer.material.uniforms.u_drop_shadow_margin.value = m;
                }
            }
        }, this.abortSignal);
        // Auto-calculate renderOrder based on Nesting Level to prevent nested Z-fighting.
        const nestingLevelSignal = computed(() => {
            let count = 0;
            let p = this
                .parentContainer?.value;
            while (p != null) {
                count++;
                p = p
                    .parentContainer?.value;
            }
            return count;
        });
        this.nestingLevelSignal = nestingLevelSignal;
        abortableEffect(() => {
            const level = nestingLevelSignal.value;
            // Physically separate sequential layers inside local Group Z-stack.
            const baseZ = level * 0.01;
            if (this.backfaceLayer)
                this.backfaceLayer.position.z = baseZ - 0.001;
            if (this.backfaceStrokeLayer)
                this.backfaceStrokeLayer.position.z = baseZ - 0.002;
            this.dropShadowLayer.position.z = baseZ;
            this.fillLayer.position.z = baseZ + 0.001;
            this.innerShadowLayer.position.z = baseZ + 0.002;
            this.strokeLayer.position.z = baseZ + 0.003;
            const contentZ = baseZ + 0.004;
            for (const child of this.children) {
                if (child === this.dropShadowLayer ||
                    child === this.backfaceLayer ||
                    child === this.backfaceStrokeLayer ||
                    child === this.fillLayer ||
                    child === this.innerShadowLayer ||
                    child === this.strokeLayer) {
                    continue;
                }
                const childWithProps = child;
                if (typeof childWithProps.setProperties === 'function') {
                    childWithProps.setProperties({ transformTranslateZ: contentZ });
                }
                else {
                    child.position.z = contentZ;
                }
            }
        }, this.abortSignal);
    }
    /** Overrides add method to cascade physical Z-position offsets for nested panels. */
    add(...objects) {
        super.add(...objects);
        const level = this.nestingLevelSignal?.value ?? 0;
        const baseZ = level * 0.01;
        const contentZ = baseZ + 0.004;
        for (const obj of objects) {
            if (obj === this.dropShadowLayer ||
                obj === this.backfaceLayer ||
                obj === this.backfaceStrokeLayer ||
                obj === this.fillLayer ||
                obj === this.innerShadowLayer ||
                obj === this.strokeLayer) {
                continue;
            }
            const objWithProps = obj;
            if (typeof objWithProps.setProperties === 'function') {
                objWithProps.setProperties({ transformTranslateZ: contentZ });
            }
            else {
                obj.position.z = contentZ;
            }
        }
        return this;
    }
    // Setters.
    /** Sets the corner radius of the panel. */
    setCornerRadius(radius) {
        this.cornerRadiusSignal.value = radius;
    }
    /** Sets the fill color or gradient. */
    setFillColor(c) {
        this.fillColorSignal.value = c;
    }
    /** Sets the optional rear-face color or gradient. */
    setBackfaceColor(c) {
        if (this.backfaceColorSignal)
            this.backfaceColorSignal.value = c;
    }
    /** Sets the inner shadow color or gradient. */
    setInnerShadowColor(c) {
        this.innerShadowColorSignal.value = c;
    }
    /** Sets the inner shadow blur radius. */
    setInnerShadowBlur(v) {
        this.innerShadowBlurSignal.value = v;
    }
    /** Sets the inner shadow position offset. */
    setInnerShadowPosition(v) {
        this.innerShadowPositionSignal.value = v;
    }
    /** Sets the inner shadow spread expansion. */
    setInnerShadowSpread(v) {
        this.innerShadowSpreadSignal.value = v;
    }
    /** Sets the inner shadow falloff rate. */
    setInnerShadowFalloff(v) {
        this.innerShadowFalloffSignal.value = v;
    }
    /** Sets the drop shadow color or gradient. */
    setDropShadowColor(c) {
        this.dropShadowColorSignal.value = c;
    }
    /** Sets the drop shadow blur radius. */
    setDropShadowBlur(v) {
        this.dropShadowBlurSignal.value = v;
    }
    /** Sets the drop shadow position offset. */
    setDropShadowPosition(v) {
        this.dropShadowPositionSignal.value = v;
    }
    /** Sets the drop shadow spread expansion. */
    setDropShadowSpread(v) {
        this.dropShadowSpreadSignal.value = v;
    }
    /** Sets the drop shadow falloff rate. */
    setDropShadowFalloff(v) {
        this.dropShadowFalloffSignal.value = v;
    }
    /** Sets the stroke color or gradient. */
    setStrokeColor(c) {
        this.strokeColorSignal.value = c;
    }
    /** Sets the stroke width. */
    setStrokeWidth(width) {
        this.strokeWidthSignal.value = width;
    }
    /** Sets the stroke alignment (inside, outside, center). */
    setStrokeAlign(align) {
        this.strokeAlignSignal.value = align;
    }
    /**
     * Updates multiple properties at once.
     * Extracts known properties to apply them via signals/setters,
     * passing remaining properties to the super class.
     * @param props - Object containing properties to update.
     */
    setProperties(props) {
        // Extract properties to ensure they are applied in the correct order
        // and not passed to super if not needed.
        const { fillColor, backfaceColor, innerShadowColor, innerShadowBlur, innerShadowPosition, innerShadowSpread, innerShadowFalloff, dropShadowColor, dropShadowBlur, dropShadowPosition, dropShadowSpread, dropShadowFalloff, strokeColor, strokeWidth, strokeAlign, cornerRadius, ...superProps } = props;
        // Pass the rest to ShaderPanel.
        super.setProperties(superProps);
        // 1. Fill.
        if (fillColor !== undefined) {
            this.setFillColor(fillColor);
        }
        if (backfaceColor !== undefined) {
            this.setBackfaceColor(backfaceColor);
        }
        // 2. Inner Shadow.
        if (innerShadowColor !== undefined)
            this.innerShadowColorSignal.value = innerShadowColor;
        if (innerShadowBlur !== undefined)
            this.innerShadowBlurSignal.value = innerShadowBlur;
        if (innerShadowPosition !== undefined)
            this.innerShadowPositionSignal.value = innerShadowPosition;
        if (innerShadowSpread !== undefined)
            this.innerShadowSpreadSignal.value = innerShadowSpread;
        if (innerShadowFalloff !== undefined)
            this.innerShadowFalloffSignal.value = innerShadowFalloff;
        // 3. Drop Shadow.
        if (dropShadowColor !== undefined)
            this.dropShadowColorSignal.value = dropShadowColor;
        if (dropShadowBlur !== undefined)
            this.dropShadowBlurSignal.value = dropShadowBlur;
        if (dropShadowPosition !== undefined)
            this.dropShadowPositionSignal.value = dropShadowPosition;
        if (dropShadowSpread !== undefined)
            this.dropShadowSpreadSignal.value = dropShadowSpread;
        if (dropShadowFalloff !== undefined)
            this.dropShadowFalloffSignal.value = dropShadowFalloff;
        // 4. Stroke.
        if (strokeColor !== undefined) {
            this.setStrokeColor(strokeColor);
        }
        if (strokeWidth !== undefined) {
            this.setStrokeWidth(strokeWidth);
        }
        if (strokeAlign !== undefined) {
            this.setStrokeAlign(strokeAlign);
        }
        // 5. Corner Radius.
        if (cornerRadius !== undefined) {
            this.setCornerRadius(cornerRadius);
        }
    }
}

/** Fragment shader for the hover-lit manipulation edge around a UI card. */
const UICardEdgeFragmentShader = CommonFunctionsShader +
    `
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

    if (glowAlpha > 0.001) {
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

        float width = u_edge_width;
        float edgeMask = smoothstep(
            -width - aa,
            -width,
            distToEdge
        );
        float edgeOpacity = glowAlpha;

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

    #include <dithering_fragment>
}
`;

const DEFAULT_EDGE_PROPERTIES = {
    margin: 50,
    cardCornerRadius: 0,
    edgeWidth: 2,
    spotlightColor: 'rgba(255, 255, 255, 1)',
    spotlightRadius: 20,
    spotlightBlur: 40,
    debug: false,
};
class UICardEdgeLayer extends PanelLayer {
    constructor(inputProperties, initialClasses, config = {}) {
        super(new PanelShaderMaterial({
            fragmentShader: UICardEdgeFragmentShader,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: createUniforms(),
        }), inputProperties, initialClasses, config);
        abortableEffect(() => {
            const signals = this.properties.signal;
            setNumber(this.material, 'u_edge_margin', signals.u_edge_margin?.value);
            setNumber(this.material, 'u_card_corner_radius', signals.u_card_corner_radius?.value);
            setNumber(this.material, 'u_edge_width', signals.u_edge_width?.value);
            setColor(this.material, 'u_cursor_spotlight_color', signals.u_cursor_spotlight_color?.value);
            setNumber(this.material, 'u_cursor_radius', signals.u_cursor_radius?.value);
            setNumber(this.material, 'u_cursor_spotlight_blur', signals.u_cursor_spotlight_blur?.value);
            setVector2(this.material, 'u_cursor_uv', signals.u_cursor_uv?.value);
            setNumber(this.material, 'u_show_glow', signals.u_show_glow?.value);
            setVector2(this.material, 'u_cursor_uv_2', signals.u_cursor_uv_2?.value);
            setNumber(this.material, 'u_show_glow_2', signals.u_show_glow_2?.value);
            setNumber(this.material, 'u_debug', signals.u_debug?.value);
        }, this.abortSignal);
    }
    setCursor(uv, index) {
        const signals = this.properties.signal;
        const cursor = index === 0 ? signals.u_cursor_uv : signals.u_cursor_uv_2;
        const visible = index === 0 ? signals.u_show_glow : signals.u_show_glow_2;
        if (cursor && uv) {
            if (cursor.value)
                cursor.value.copy(uv);
            else
                cursor.value = uv;
            setVector2(this.material, index === 0 ? 'u_cursor_uv' : 'u_cursor_uv_2', uv);
        }
        if (visible)
            visible.value = uv ? 1 : 0;
    }
}
/** Private shader-backed card edge. */
class UICardEdge extends UICardEdgeLayer {
    constructor(properties = {}) {
        const resolved = { ...DEFAULT_EDGE_PROPERTIES, ...properties };
        const margin = Math.max(0, resolved.margin);
        const cardCornerRadius = Math.max(0, resolved.cardCornerRadius);
        super({
            positionType: 'absolute',
            positionTop: -margin,
            positionRight: -margin,
            positionBottom: -margin,
            positionLeft: -margin,
            width: 'auto',
            height: 'auto',
            pointerEvents: 'auto',
            zIndexOffset: -20,
            u_edge_margin: margin,
            u_card_corner_radius: cardCornerRadius,
            u_edge_width: resolved.edgeWidth,
            u_cursor_spotlight_color: resolved.spotlightColor,
            u_cursor_radius: resolved.spotlightRadius,
            u_cursor_spotlight_blur: resolved.spotlightBlur,
            u_cursor_uv: new THREE.Vector2(0.5, 0.5),
            u_show_glow: 0,
            u_cursor_uv_2: new THREE.Vector2(0.5, 0.5),
            u_show_glow_2: 0,
            u_debug: resolved.debug ? 1 : 0,
        });
        this.name = 'UICardEdge';
        this.cursorLocal = [new THREE.Vector3(), new THREE.Vector3()];
        this.cursorUV = [new THREE.Vector2(), new THREE.Vector2()];
        this.xb = {
            manipulationHandle: { action: ManipulationAction.Translate },
        };
        this.margin = margin;
        this._cardCornerRadius = cardCornerRadius;
        const baseRaycast = this.raycast.bind(this);
        this.raycast = (raycaster, intersections) => {
            const firstNewIntersection = intersections.length;
            baseRaycast(raycaster, intersections);
            const size = this.size.value;
            for (let index = intersections.length - 1; index >= firstNewIntersection; index--) {
                const uv = intersections[index].uv;
                if (!size ||
                    !uv ||
                    !isOuterEdgeHit(uv, size, this.margin, this._cardCornerRadius)) {
                    intersections.splice(index, 1);
                }
            }
        };
    }
    get cardCornerRadius() {
        return this._cardCornerRadius;
    }
    setCardCornerRadius(radius) {
        const nextRadius = Math.max(0, radius);
        this._cardCornerRadius = nextRadius;
        const signal = this.properties.signal.u_card_corner_radius;
        if (signal)
            signal.value = nextRadius;
        setNumber(this.material, 'u_card_corner_radius', nextRadius);
    }
    setCursorPoints(first, second) {
        this.setCursorPoint(first, 0);
        this.setCursorPoint(second, 1);
    }
    setCursorPoint(point, index) {
        if (!point || !this.size.value) {
            this.setCursor(undefined, index);
            return;
        }
        const local = this.cursorLocal[index].copy(point);
        this.worldToLocal(local);
        this.setCursor(this.cursorUV[index].set(local.x + 0.5, local.y + 0.5), index);
    }
}
function createUniforms() {
    return {
        u_edge_margin: { value: 0 },
        u_card_corner_radius: { value: 0 },
        u_edge_width: { value: 0 },
        u_cursor_spotlight_color: { value: new THREE.Vector4(1, 1, 1, 1) },
        u_cursor_radius: { value: 0 },
        u_cursor_spotlight_blur: { value: 0 },
        u_cursor_uv: { value: new THREE.Vector2(0.5, 0.5) },
        u_show_glow: { value: 0 },
        u_cursor_uv_2: { value: new THREE.Vector2(0.5, 0.5) },
        u_show_glow_2: { value: 0 },
        u_debug: { value: 0 },
    };
}
function setNumber(material, name, value) {
    if (value !== undefined)
        material.uniforms[name].value = value;
}
function setColor(material, name, value) {
    if (value === undefined)
        return;
    const { color, opacity } = parseColorWithAlpha(value);
    material.uniforms[name].value.set(color.r, color.g, color.b, opacity);
}
function setVector2(material, name, value) {
    if (value !== undefined)
        material.uniforms[name].value.copy(value);
}
function isOuterEdgeHit(uv, size, margin, cardCornerRadius) {
    const halfWidth = size[0] / 2;
    const halfHeight = size[1] / 2;
    const x = uv.x * size[0] - halfWidth;
    const y = uv.y * size[1] - halfHeight;
    const innerHalfWidth = Math.max(0, halfWidth - margin);
    const innerHalfHeight = Math.max(0, halfHeight - margin);
    const innerRadius = Math.min(cardCornerRadius, innerHalfWidth, innerHalfHeight);
    const outerRadius = Math.min(innerRadius + margin, halfWidth, halfHeight);
    return (roundedBoxDistance(x, y, halfWidth, halfHeight, outerRadius) <= 0 &&
        roundedBoxDistance(x, y, innerHalfWidth, innerHalfHeight, innerRadius) >= 0);
}
function roundedBoxDistance(x, y, halfWidth, halfHeight, radius) {
    const qx = Math.abs(x) - halfWidth + radius;
    const qy = Math.abs(y) - halfHeight + radius;
    return (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        radius);
}

const MAX_CANVAS_DIMENSION = 4096;
const MEASURE_MODE_UNDEFINED = 0;
const MEASURE_MODE_EXACTLY = 1;
const SYSTEM_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const graphemeSegmenter = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
});
/** Canvas-backed text used when UIkit's fixed glyph atlas cannot render text. */
class UnicodeText extends Image {
    constructor(properties) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas 2D is required to render Unicode UI text.');
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        super(imageProperties(properties, texture));
        this.canvas = canvas;
        this.context = context;
        this.canvasTexture = texture;
        this.textProperties = properties;
        this.configureLayout();
        this.stopSizeEffect = effect(() => {
            const size = this.size.value;
            if (size)
                this.draw(size[0], size[1]);
        });
    }
    setTextProperties(properties) {
        this.textProperties = properties;
        this.resetProperties(imageProperties(properties, this.canvasTexture));
        this.configureLayout();
        const size = this.size.peek();
        if (size)
            this.draw(size[0], size[1]);
    }
    dispose() {
        this.stopSizeEffect();
        this.canvasTexture.dispose();
        super.dispose();
    }
    configureLayout() {
        const style = metricsStyle(this.textProperties);
        applyFont(this.context, style);
        const measure = (width, widthMode) => {
            const availableWidth = widthMode === MEASURE_MODE_UNDEFINED ? Number.POSITIVE_INFINITY : width;
            const layout = layoutText(this.context, this.textProperties.text, style, availableWidth);
            return {
                width: widthMode === MEASURE_MODE_EXACTLY ? width : layout.width,
                height: layout.height,
            };
        };
        const minimum = layoutText(this.context, widestCharacter(this.context, this.textProperties.text), { ...style, whiteSpace: 'nowrap' }, Number.POSITIVE_INFINITY);
        this.node.setCustomLayouting({
            minWidth: minimum.width,
            minHeight: style.lineHeight,
            measure,
        });
    }
    draw(width, height) {
        if (!(width > 0) || !(height > 0))
            return;
        const scale = Math.max(Number.EPSILON, Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height));
        const pixelWidth = Math.max(1, Math.ceil(width * scale));
        const pixelHeight = Math.max(1, Math.ceil(height * scale));
        if (this.canvas.width !== pixelWidth ||
            this.canvas.height !== pixelHeight) {
            // Force Three.js to allocate matching GPU storage before the next upload.
            this.canvasTexture.dispose();
            this.canvas.width = pixelWidth;
            this.canvas.height = pixelHeight;
        }
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.clearRect(0, 0, pixelWidth, pixelHeight);
        this.context.setTransform(scale, 0, 0, scale, 0, 0);
        const style = metricsStyle(this.textProperties);
        applyFont(this.context, style);
        this.context.fillStyle = style.color;
        this.context.textAlign = style.textAlign;
        this.context.textBaseline = 'top';
        const layout = layoutText(this.context, this.textProperties.text, style, width);
        const x = style.textAlign === 'center'
            ? width / 2
            : style.textAlign === 'right'
                ? width
                : 0;
        for (let index = 0; index < layout.lines.length; index++) {
            this.context.fillText(layout.lines[index], x, index * style.lineHeight);
        }
        this.canvasTexture.needsUpdate = true;
        this.root.peek().requestRender?.();
    }
}
function imageProperties(properties, texture) {
    const { text: _text, color: _color, fontSize: _fontSize, fontWeight: _fontWeight, lineHeight: _lineHeight, textAlign: _textAlign, whiteSpace: _whiteSpace, ...layoutProperties } = properties;
    return {
        ...layoutProperties,
        src: texture,
        keepAspectRatio: false,
        objectFit: 'fill',
    };
}
function metricsStyle(properties) {
    const fontSize = properties.fontSize ?? 16;
    return {
        color: cssColor(properties.color ?? '#ffffff'),
        font: `${fontWeight(properties.fontWeight)} ${fontSize}px ${SYSTEM_FONT}`,
        lineHeight: resolveLineHeight(properties.lineHeight, fontSize),
        textAlign: properties.textAlign ?? 'left',
        whiteSpace: properties.whiteSpace ?? 'normal',
    };
}
function applyFont(context, style) {
    context.font = style.font;
}
function fontWeight(value) {
    if (typeof value === 'number')
        return value;
    if (value === 'bold')
        return 700;
    if (value === 'medium')
        return 500;
    return 400;
}
function resolveLineHeight(value, fontSize) {
    if (typeof value === 'number')
        return value * fontSize;
    if (typeof value === 'string' && value.endsWith('px')) {
        return Number.parseFloat(value);
    }
    if (typeof value === 'string' && value.endsWith('%')) {
        return (Number.parseFloat(value) / 100) * fontSize;
    }
    return fontSize * 1.2;
}
function cssColor(color) {
    if (typeof color === 'string')
        return color;
    return `#${new THREE.Color(color).getHexString()}`;
}
function layoutText(context, text, style, availableWidth) {
    const paragraphs = style.whiteSpace === 'pre-line'
        ? text.split(/\r?\n/u).map((line) => line.replace(/[\t ]+/gu, ' ').trim())
        : [text.replace(/\s+/gu, ' ').trim()];
    const lines = style.whiteSpace === 'nowrap'
        ? paragraphs
        : paragraphs.flatMap((line) => wrapLine(context, line, availableWidth));
    const width = lines.reduce((maximum, line) => Math.max(maximum, context.measureText(line).width), 0);
    return {
        lines: lines.length > 0 ? lines : [''],
        width,
        height: Math.max(1, lines.length) * style.lineHeight,
    };
}
function wrapLine(context, text, availableWidth) {
    if (!Number.isFinite(availableWidth) || text.length === 0)
        return [text];
    const lines = [];
    let current = '';
    for (const token of text.split(/(\s+)/u)) {
        if (!token)
            continue;
        const normalized = /^\s+$/u.test(token) ? ' ' : token;
        const candidate = current
            ? `${current}${normalized}`
            : normalized.trimStart();
        if (context.measureText(candidate).width <= availableWidth) {
            current = candidate;
            continue;
        }
        if (current.trimEnd())
            lines.push(current.trimEnd());
        current = '';
        if (context.measureText(normalized).width <= availableWidth) {
            current = normalized.trimStart();
            continue;
        }
        for (const character of graphemes(normalized)) {
            const next = `${current}${character}`;
            if (current && context.measureText(next).width > availableWidth) {
                lines.push(current);
                current = character;
            }
            else {
                current = next;
            }
        }
    }
    if (current || lines.length === 0)
        lines.push(current.trimEnd());
    return lines;
}
function widestCharacter(context, text) {
    let widest = '';
    let maximumWidth = 0;
    for (const character of graphemes(text)) {
        const width = context.measureText(character).width;
        if (!/\s/u.test(character) && width > maximumWidth) {
            widest = character;
            maximumWidth = width;
        }
    }
    return widest || ' ';
}
function graphemes(text) {
    return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

/** Stable layout node that selects native or canvas glyph rendering internally. */
class AdaptiveText extends Container {
    constructor(properties) {
        super(containerProperties(properties));
        this.name = 'AdaptiveText';
        this.updateTextProperties(properties);
    }
    updateTextProperties(properties) {
        this.resetProperties(containerProperties(properties));
        const next = requiresUnicodeTextRenderer(properties.text)
            ? this.updateUnicodeText(properties)
            : this.updateNativeText(properties);
        if (next === this.activeText)
            return;
        this.activeText?.removeFromParent();
        this.add(next);
        this.activeText = next;
    }
    dispose() {
        this.nativeText?.removeFromParent();
        this.unicodeText?.removeFromParent();
        this.nativeText?.dispose();
        this.unicodeText?.dispose();
        this.nativeText = undefined;
        this.unicodeText = undefined;
        this.activeText = undefined;
        super.dispose();
    }
    updateNativeText(properties) {
        const textProperties = nativeTextProperties(properties);
        if (!this.nativeText)
            this.nativeText = new Text(textProperties);
        else
            this.nativeText.resetProperties(textProperties);
        return this.nativeText;
    }
    updateUnicodeText(properties) {
        const textProperties = unicodeTextProperties(properties);
        if (!this.unicodeText)
            this.unicodeText = new UnicodeText(textProperties);
        else
            this.unicodeText.setTextProperties(textProperties);
        return this.unicodeText;
    }
}
function requiresUnicodeTextRenderer(value) {
    return /[^\u0020-\u007e\n\r\t]/u.test(value);
}
function containerProperties(properties) {
    const { text: _text, color: _color, fontSize: _fontSize, fontWeight: _fontWeight, lineHeight: _lineHeight, textAlign: _textAlign, verticalAlign = 'middle', whiteSpace: _whiteSpace, textOverflow: _textOverflow, ...layoutProperties } = properties;
    return {
        ...layoutProperties,
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: verticalAlign === 'top'
            ? 'flex-start'
            : verticalAlign === 'bottom'
                ? 'flex-end'
                : 'center',
    };
}
function nativeTextProperties(properties) {
    const shared = glyphProperties(properties);
    return {
        ...shared,
        whiteSpace: properties.whiteSpace === 'nowrap' ? 'normal' : properties.whiteSpace,
        wordBreak: properties.whiteSpace === 'nowrap' ? 'keep-all' : 'break-word',
    };
}
function unicodeTextProperties(properties) {
    return {
        ...glyphProperties(properties),
        whiteSpace: properties.whiteSpace,
    };
}
function glyphProperties(properties) {
    return {
        text: properties.text,
        color: properties.color,
        fontSize: properties.fontSize,
        fontWeight: properties.fontWeight,
        lineHeight: properties.lineHeight,
        textAlign: properties.textAlign,
        flexShrink: 0,
        pointerEvents: 'none',
    };
}

const ICON_BASE = 'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/';
const OVERLAY_RENDER_ORDER_BASE = 1_000_000_000;
const OVERLAY_Z_INDEX_STEP = 100_000_000;
const OVERLAY_ROOT_ORDER_STEP = 1_000_000;
const imageTextureLoader = new THREE.TextureLoader();
class UIKitMount {
    constructor(root, icons) {
        this.root = root;
        this.icons = icons;
        this.object = new THREE.Group();
        this.readyWork = [];
        this.structureRevision = -1;
        this.hitMappingsChanged = true;
        this.disposed = false;
        this.viewportWidth = -1;
        this.viewportHeight = -1;
        this.enqueue = (work) => {
            if (!this.disposed)
                this.readyWork.push(work);
        };
        this.object.name = `Private ${root.name}`;
        this.isOverlay = getUIElementKind(root) === 'overlay';
    }
    commit(theme, viewport, rootOrder) {
        if (this.disposed)
            return undefined;
        for (const work of this.readyWork.splice(0))
            work();
        const rootStack = this.isOverlay
            ? OVERLAY_RENDER_ORDER_BASE +
                Number(this.root.style.zIndex ?? 0) * OVERLAY_Z_INDEX_STEP +
                rootOrder * OVERLAY_ROOT_ORDER_STEP
            : undefined;
        const context = {
            theme,
            rootStack,
            sequence: { value: 0 },
        };
        if (!this.binding) {
            this.binding = new UIKitNodeBinding(this.root, this.icons, this.enqueue, context);
            this.rendered = this.isOverlay
                ? createOverlayViewport(this.binding.node, viewport)
                : this.binding.node;
            this.viewportWidth = viewport.width;
            this.viewportHeight = viewport.height;
            this.structureRevision = getUIStructureRevision(this.root);
            this.object.add(this.rendered);
            this.hitMappingsChanged = true;
        }
        if (this.structureRevision !== getUIStructureRevision(this.root)) {
            this.structureRevision = getUIStructureRevision(this.root);
            this.binding.reconcileTree(context);
            this.hitMappingsChanged = true;
        }
        if (this.isOverlay)
            this.updateViewport(viewport);
        if (this.binding.commit(context))
            this.hitMappingsChanged = true;
        if (!this.hitMappingsChanged)
            return undefined;
        this.hitMappingsChanged = false;
        return this.binding.hitMappings();
    }
    present(stateFor) {
        this.binding?.present(stateFor);
    }
    update(deltaSeconds) {
        this.rendered?.update(deltaSeconds * 1000);
    }
    validate() {
        const issues = [];
        for (const [element, node] of this.binding?.elementNodes() ?? []) {
            const size = node.size.peek();
            const center = node.relativeCenter.peek();
            if (!validPair(size) ||
                (node.parentContainer.peek() && !validPair(center))) {
                issues.push({
                    code: 'invalid-layout',
                    severity: 'error',
                    element,
                    message: `${element.name} does not have a finite calculated layout.`,
                });
                continue;
            }
            if (element instanceof UIText && node.isClipped.peek()) {
                issues.push({
                    code: 'text-clipped',
                    severity: 'error',
                    element,
                    message: `${element.name} is clipped by its layout container.`,
                });
            }
            const parent = node.parentContainer.peek();
            const parentSize = parent?.size.peek();
            if (!parent || !validPair(parentSize) || !center)
                continue;
            const bounds = boundsFromCenter(center, size);
            const containerBounds = contentBounds(parent);
            if (containsBounds(containerBounds, bounds))
                continue;
            const overlayRoot = element === this.root && this.isOverlay;
            issues.push({
                code: overlayRoot ? 'outside-viewport' : 'content-overflow',
                severity: overlayRoot ? 'error' : 'warning',
                element,
                message: overlayRoot
                    ? `${element.name} extends outside the overlay viewport.`
                    : `${element.name} extends outside its layout container.`,
                bounds,
                containerBounds,
            });
        }
        return issues;
    }
    dispose() {
        this.disposed = true;
        this.readyWork.length = 0;
        const binding = this.binding;
        const rendered = this.rendered;
        binding?.dispose();
        if (rendered && rendered !== binding?.node) {
            rendered.removeFromParent();
            rendered.dispose();
        }
        this.binding = undefined;
        this.rendered = undefined;
        this.object.clear();
    }
    updateViewport(viewport) {
        const wrapper = this.rendered;
        if (!wrapper ||
            (this.viewportWidth === viewport.width &&
                this.viewportHeight === viewport.height))
            return;
        this.viewportWidth = viewport.width;
        this.viewportHeight = viewport.height;
        wrapper.setProperties({
            width: viewport.width,
            height: viewport.height,
            sizeX: viewport.width,
            sizeY: viewport.height,
        });
    }
}
class UIKitBackend {
    constructor() {
        this.icons = new IconCache();
        this.previousLocalClippingEnabled = false;
    }
    configureRenderer(renderer) {
        if (this.renderer === renderer)
            return;
        this.restoreRenderer();
        this.renderer = renderer;
        this.previousLocalClippingEnabled = renderer.localClippingEnabled;
        renderer.localClippingEnabled = true;
        renderer.setTransparentSort(reversePainterSortStable);
    }
    createMount(root) {
        return new UIKitMount(root, this.icons);
    }
    dispose() {
        this.restoreRenderer();
        this.icons.dispose();
    }
    restoreRenderer() {
        if (!this.renderer)
            return;
        this.renderer.localClippingEnabled = this.previousLocalClippingEnabled;
        this.renderer = undefined;
    }
}
function createUIBackend() {
    return new UIKitBackend();
}
/** A retained physical node and the small private subtree it owns. */
class UIKitNodeBinding {
    constructor(element, icons, enqueue, context) {
        this.element = element;
        this.icons = icons;
        this.enqueue = enqueue;
        this.children = new Map();
        this.childOrder = [];
        this.cursorPoints = [
            new THREE.Vector3(),
            new THREE.Vector3(),
        ];
        this.notifyResource = () => {
            if (!this.disposed)
                this.enqueue(() => this.resourceRevision++);
        };
        this.ownsImageTexture = false;
        this.imageRequest = 0;
        this.resourceRevision = 0;
        this.appliedResourceRevision = -1;
        this.revision = -1;
        this.presentationKey = -1;
        this.baseProperties = {};
        this.presentedProperties = {};
        this.disposed = false;
        const properties = this.propertiesFor(context, baseState(element), undefined);
        const kind = getUIElementKind(element);
        if (kind === 'text') {
            this.node = new AdaptiveText(properties);
        }
        else if (kind === 'image') {
            this.node = new Image(properties, undefined, { loadTexture: false });
        }
        else if (kind === 'icon') {
            this.node = new Svg(properties);
        }
        else {
            this.node = new GradientPanel(properties);
        }
        this.baseProperties = properties;
        this.presentedProperties = properties;
        this.theme = context.theme;
        this.reconcileTree(context);
        this.commit(context);
    }
    reconcileTree(context) {
        if (!isContainerNode(this.node))
            return;
        const nextOrder = this.element.children.filter(isUIElement);
        const next = new Map();
        for (const child of nextOrder) {
            const binding = this.children.get(child) ??
                new UIKitNodeBinding(child, this.icons, this.enqueue, context);
            next.set(child, binding);
        }
        for (const [element, binding] of this.children) {
            if (!next.has(element))
                binding.dispose();
        }
        this.children.clear();
        this.childOrder.length = 0;
        for (const child of nextOrder) {
            const binding = next.get(child);
            this.children.set(child, binding);
            this.childOrder.push(child);
            this.node.add(binding.node);
            binding.reconcileTree(context);
        }
        this.ensurePrivateNodes(context.theme);
        if (this.edge) {
            this.edge.removeFromParent();
            this.node.add(this.edge);
        }
    }
    /** Returns true when physical hit mappings changed. */
    commit(context) {
        if (this.disposed)
            return false;
        const order = context.rootStack === undefined
            ? undefined
            : context.rootStack +
                Number(this.element.style.zIndex ?? 0) * 1_000 +
                context.sequence.value++;
        const orderChanged = order !== this.renderOrder;
        const revision = getUIRevision(this.element);
        const nextPointerEvents = this.element.xb?.pointerEvents;
        const needsProperties = revision !== this.revision ||
            context.theme !== this.theme ||
            orderChanged ||
            nextPointerEvents !== this.pointerEvents ||
            this.resourceRevision !== this.appliedResourceRevision;
        let hitMappingsChanged = orderChanged;
        if (needsProperties) {
            this.renderOrder = order;
            const properties = this.propertiesFor(context, baseState(this.element), order);
            this.applyProperties(properties);
            this.baseProperties = properties;
            this.presentedProperties = properties;
            this.presentationKey = -1;
            this.revision = revision;
            this.theme = context.theme;
            this.appliedResourceRevision = this.resourceRevision;
            this.ensurePrivateNodes(context.theme);
            hitMappingsChanged = this.syncEdge(properties);
        }
        this.node.visible = this.element.visible;
        this.syncImage();
        this.setHitEnabled(this.baseProperties);
        for (const child of this.childOrder) {
            if (this.children.get(child).commit(context))
                hitMappingsChanged = true;
        }
        return hitMappingsChanged;
    }
    present(stateFor) {
        if (this.disposed)
            return;
        const state = stateFor(this.element, this.edge ? this.cursorPoints : undefined);
        const key = stateKey(state);
        if (key !== this.presentationKey) {
            const context = {
                theme: this.theme,
                rootStack: undefined,
                sequence: { value: 0 },
            };
            const properties = this.propertiesFor(context, state, this.renderOrder);
            this.applyProperties(properties);
            this.presentedProperties = properties;
            this.presentationKey = key;
            this.ensurePrivateNodes(this.theme);
        }
        this.edge?.setCursorPoints(state.cursorPointCount > 0 ? this.cursorPoints[0] : undefined, state.cursorPointCount > 1 ? this.cursorPoints[1] : undefined);
        for (const child of this.childOrder)
            this.children.get(child).present(stateFor);
    }
    hitMappings() {
        const mappings = [
            { physical: this.node, logical: this.element },
        ];
        if (this.edge)
            mappings.push({ physical: this.edge, logical: this.element });
        for (const child of this.childOrder) {
            mappings.push(...this.children.get(child).hitMappings());
        }
        return mappings;
    }
    *elementNodes() {
        yield [this.element, this.node];
        for (const child of this.childOrder)
            yield* this.children.get(child).elementNodes();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const child of this.children.values())
            child.dispose();
        this.children.clear();
        this.childOrder.length = 0;
        this.edge?.removeFromParent();
        this.edge?.dispose();
        this.buttonIcon?.removeFromParent();
        this.buttonIcon?.dispose();
        this.buttonLabel?.removeFromParent();
        this.buttonLabel?.dispose();
        this.sliderContent?.dispose();
        if (this.ownsImageTexture)
            this.imageTexture?.dispose();
        this.imageTexture = undefined;
        this.node.removeFromParent();
        this.node.dispose();
    }
    propertiesFor(context, state, renderOrder) {
        const style = toUIKitStyle(resolveStyle(this.element, state, context.theme));
        if (renderOrder !== undefined) {
            style.depthTest = false;
            style.depthWrite = false;
            style.renderOrder = renderOrder;
        }
        const kind = getUIElementKind(this.element);
        if (kind === 'text') {
            return {
                text: this.element.text,
                color: style.color ??
                    context.theme.colors.text,
                ...style,
                pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
            };
        }
        if (kind === 'image') {
            const { cornerRadius: rawCornerRadius, ...imageStyle } = style;
            const cornerRadius = numericCornerRadius(rawCornerRadius);
            return {
                ...imageStyle,
                borderTopLeftRadius: cornerRadius,
                borderTopRightRadius: cornerRadius,
                borderBottomLeftRadius: cornerRadius,
                borderBottomRightRadius: cornerRadius,
                pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
            };
        }
        if (kind === 'icon') {
            return {
                content: this.icons.get(iconAssetPath(this.element), this.notifyResource),
                ...style,
                pointerEvents: this.element.xb?.pointerEvents ?? 'auto',
            };
        }
        return panelDefaults(this.element, context.theme, style);
    }
    applyProperties(properties) {
        const changed = changedProperties(this.presentedProperties, properties);
        if (Object.keys(changed).length === 0)
            return;
        if (this.node instanceof AdaptiveText) {
            this.node.updateTextProperties(properties);
        }
        else {
            this.node.setProperties(changed);
        }
        if (this.node instanceof Image) {
            this.node.material.opacity = resolvedOpacity(properties.opacity);
        }
        if (this.renderOrder !== undefined)
            this.node.renderOrder = this.renderOrder;
    }
    ensurePrivateNodes(theme) {
        if (!(this.node instanceof GradientPanel))
            return;
        const kind = getUIElementKind(this.element);
        if (kind === 'button')
            this.updateButtonContent(theme);
        if (kind === 'slider') {
            this.sliderContent ??= createSliderContent(this.node);
            this.sliderContent.update(this.element, theme);
        }
    }
    updateButtonContent(theme) {
        const button = this.element;
        const color = this.presentedProperties.color ??
            (button.disabled ? theme.colors.disabledText : theme.colors.primaryText);
        if (button.icon) {
            const properties = {
                content: this.icons.get(defaultIconAssetPath(button.icon), this.notifyResource),
                width: 24,
                height: 24,
                color,
                pointerEvents: 'none',
            };
            if (!this.buttonIcon) {
                this.buttonIcon = new Svg(properties);
                this.node.add(this.buttonIcon);
            }
            else {
                this.buttonIcon.setProperties(properties);
            }
        }
        else if (this.buttonIcon) {
            this.buttonIcon.removeFromParent();
            this.buttonIcon.dispose();
            this.buttonIcon = undefined;
        }
        if (button.label) {
            const properties = {
                text: button.label,
                color,
                pointerEvents: 'none',
            };
            if (!this.buttonLabel) {
                this.buttonLabel = new Text(properties);
                this.node.add(this.buttonLabel);
            }
            else {
                this.buttonLabel.setProperties(properties);
            }
        }
        else if (this.buttonLabel) {
            this.buttonLabel.removeFromParent();
            this.buttonLabel.dispose();
            this.buttonLabel = undefined;
        }
    }
    syncEdge(properties) {
        if (!(this.node instanceof GradientPanel))
            return false;
        const options = getUIElementKind(this.element) === 'card'
            ? getUICardEdgeOptions(this.element)
            : undefined;
        if (!options && this.edge) {
            this.edge.removeFromParent();
            this.edge.dispose();
            this.edge = undefined;
            return true;
        }
        if (options && !this.edge) {
            this.edge = new UICardEdge({
                cardCornerRadius: numericCornerRadius(properties.cornerRadius),
            });
            this.node.add(this.edge);
            return true;
        }
        this.edge?.setCardCornerRadius(numericCornerRadius(properties.cornerRadius));
        return false;
    }
    syncImage() {
        if (!(this.node instanceof Image))
            return;
        const source = this.element.src;
        if (source === this.imageSource)
            return;
        this.imageSource = source;
        const request = ++this.imageRequest;
        if (source instanceof THREE.Texture) {
            this.replaceImageTexture(source, false);
            return;
        }
        void imageTextureLoader
            .loadAsync(source)
            .then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.matrixAutoUpdate = false;
            if (this.disposed) {
                texture.dispose();
                return;
            }
            this.enqueue(() => {
                if (this.disposed ||
                    request !== this.imageRequest ||
                    this.imageSource !== source) {
                    texture.dispose();
                    return;
                }
                this.replaceImageTexture(texture, true);
                this.resourceRevision++;
            });
        })
            .catch(() => undefined);
    }
    replaceImageTexture(texture, ownsTexture) {
        const previous = this.imageTexture;
        const previousOwned = this.ownsImageTexture;
        this.imageTexture = texture;
        this.ownsImageTexture = ownsTexture;
        this.node.texture.value = texture;
        if (previousOwned && previous && previous !== texture)
            previous.dispose();
    }
    setHitEnabled(properties) {
        const kind = getUIElementKind(this.element);
        const blocksHits = kind === 'button' ||
            kind === 'slider' ||
            !isTransparent(properties.fillColor);
        const pointerEvents = this.element.xb?.pointerEvents;
        const enabled = blocksHits && pointerEvents !== 'none';
        if (pointerEvents === this.pointerEvents && enabled === this.hitEnabled)
            return;
        this.pointerEvents = pointerEvents;
        this.hitEnabled = enabled;
        setPhysicalHitEnabled(this.node, enabled);
    }
}
function isContainerNode(node) {
    return node instanceof Container || node instanceof GradientPanel;
}
function baseState(element) {
    return {
        hovered: false,
        active: false,
        disabled: getSemanticControl(element)?.isDisabled() ?? false,
        cursorPointCount: 0,
    };
}
function setPhysicalHitEnabled(object, enabled) {
    object.xb ??= {};
    object.xb.pointerEvents = enabled ? 'auto' : 'none';
}
function changedProperties(previous, next) {
    const properties = {};
    for (const [key, value] of Object.entries(next)) {
        if (!Object.is(previous[key], value))
            properties[key] = value;
    }
    for (const key of Object.keys(previous)) {
        if (!(key in next))
            properties[key] = undefined;
    }
    return properties;
}
function numericCornerRadius(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, value)
        : 0;
}
function resolvedOpacity(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string' && value.endsWith('%')) {
        return Number.parseFloat(value) / 100;
    }
    return 1;
}
function resolveStyle(element, state, theme) {
    const kind = getUIElementKind(element);
    const surfaceStyle = hasSurfaceAppearance(element)
        ? (theme.styles?.surface ?? {})
        : {};
    const themeStyle = kind === 'card' || kind === 'overlay' ? {} : (theme.styles?.[kind] ?? {});
    const style = element.style;
    return {
        ...surfaceStyle,
        ...themeStyle,
        ...style,
        ...(state.hovered ? surfaceStyle?.[':hover'] : undefined),
        ...(state.hovered ? themeStyle[':hover'] : undefined),
        ...(state.hovered ? style[':hover'] : undefined),
        ...(state.active ? surfaceStyle?.[':active'] : undefined),
        ...(state.active ? themeStyle[':active'] : undefined),
        ...(state.active ? style[':active'] : undefined),
        ...(state.disabled ? surfaceStyle?.[':disabled'] : undefined),
        ...(state.disabled ? themeStyle[':disabled'] : undefined),
        ...(state.disabled ? style[':disabled'] : undefined),
    };
}
function stateKey(state) {
    return (Number(state.hovered) |
        (Number(state.active) << 1) |
        (Number(state.disabled) << 2));
}
function isTransparent(color) {
    if (color === undefined || color === 'transparent')
        return true;
    if (typeof color !== 'string')
        return false;
    const compact = color.replace(/\s/g, '').toLowerCase();
    return (/^#[0-9a-f]{3}0$/u.test(compact) ||
        /^#[0-9a-f]{6}00$/u.test(compact) ||
        /^(?:rgba|hsla)\([^)]*,0(?:\.0+)?\)$/u.test(compact));
}
function panelDefaults(element, theme, style) {
    const kind = getUIElementKind(element);
    const defaults = {
        fillColor: kind === 'button'
            ? element.disabled
                ? theme.colors.disabledSurface
                : theme.colors.primary
            : hasSurfaceAppearance(element)
                ? theme.colors.surface
                : kind === 'slider'
                    ? 'rgba(255, 255, 255, 0)'
                    : 'rgba(0, 0, 0, 0)',
        cornerRadius: theme.borderRadius,
        opacity: style.opacity ?? 1,
        strokeColor: style.strokeColor ?? 'transparent',
        strokeWidth: style.strokeWidth ?? 0,
        strokeAlign: style.strokeAlign ?? DEFAULT_GRADIENT_PANEL_PROPS.strokeAlign,
        innerShadowColor: style.innerShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowColor,
        innerShadowBlur: style.innerShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowBlur,
        innerShadowPosition: style.innerShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowPosition,
        innerShadowSpread: style.innerShadowSpread ?? DEFAULT_GRADIENT_PANEL_PROPS.innerShadowSpread,
        innerShadowFalloff: style.innerShadowFalloff ??
            DEFAULT_GRADIENT_PANEL_PROPS.innerShadowFalloff,
        dropShadowColor: style.dropShadowColor ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowColor,
        dropShadowBlur: style.dropShadowBlur ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowBlur,
        dropShadowPosition: style.dropShadowPosition ??
            DEFAULT_GRADIENT_PANEL_PROPS.dropShadowPosition,
        dropShadowSpread: style.dropShadowSpread ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowSpread,
        dropShadowFalloff: style.dropShadowFalloff ?? DEFAULT_GRADIENT_PANEL_PROPS.dropShadowFalloff,
        color: style.color,
        pointerEvents: element.xb?.pointerEvents ?? 'auto',
        ...style,
    };
    if (kind === 'card' || kind === 'overlay') {
        defaults.flexDirection = style.flexDirection ?? 'column';
        defaults.justifyContent = style.justifyContent ?? 'center';
        defaults.alignItems = style.alignItems ?? 'stretch';
    }
    if (kind === 'card') {
        const card = element;
        defaults.backfaceColor = defaults.fillColor;
        defaults.pixelSize = card.pixelSize;
        defaults.sizeX = card.size.width;
        defaults.sizeY = card.size.height;
        defaults.width = card.size.width / card.pixelSize;
        defaults.height = card.size.height / card.pixelSize;
        defaults.anchorX = card.anchorX;
        defaults.anchorY = card.anchorY;
    }
    else if (kind === 'overlay') {
        defaults.depthTest = false;
    }
    return defaults;
}
function createOverlayViewport(surface, viewport) {
    const wrapper = new Container({
        width: viewport.width,
        height: viewport.height,
        sizeX: viewport.width,
        sizeY: viewport.height,
        pixelSize: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        depthTest: false,
    });
    wrapper.add(surface);
    return wrapper;
}
function hasSurfaceAppearance(element) {
    return ((element instanceof UICard || element instanceof UIOverlay) &&
        element.appearance === 'surface');
}
function validPair(value) {
    return (value !== undefined &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1]));
}
function boundsFromCenter(center, size) {
    return {
        x: center[0] - size[0] / 2,
        y: center[1] - size[1] / 2,
        width: size[0],
        height: size[1],
    };
}
function contentBounds(parent) {
    const [width, height] = parent.size.peek() ?? [0, 0];
    const [top, right, bottom, left] = parent.paddingInset.peek() ?? [0, 0, 0, 0];
    return {
        x: -width / 2 + left,
        y: -height / 2 + bottom,
        width: Math.max(0, width - left - right),
        height: Math.max(0, height - top - bottom),
    };
}
function containsBounds(container, child) {
    const tolerance = 0.5;
    return (child.x >= container.x - tolerance &&
        child.y >= container.y - tolerance &&
        child.x + child.width <= container.x + container.width + tolerance &&
        child.y + child.height <= container.y + container.height + tolerance);
}
const FALLBACK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#ffffff" d="M11 18h2v2h-2zm1-16a7 7 0 0 0-7 7h2a5 5 0 1 1 8.6 3.5C13.7 14.2 11 15.2 11 18h2c0-1.5 1.4-2.2 3.1-3.7A7 7 0 0 0 12 2z"/>
</svg>`;
/** Backend-owned icon cache. Completions are staged by bindings. */
class IconCache {
    constructor() {
        this.content = new Map();
        this.pending = new Map();
        this.disposed = false;
    }
    get(path, subscriber) {
        const cached = this.content.get(path);
        if (cached)
            return cached;
        let request = this.pending.get(path);
        if (!request) {
            const controller = new AbortController();
            const newRequest = { controller, subscribers: new Set() };
            request = newRequest;
            this.pending.set(path, newRequest);
            void fetch(`${ICON_BASE}${path}`, {
                signal: controller.signal,
            })
                .then((response) => {
                if (!response.ok)
                    throw new Error(`Icon request failed: ${response.status}`);
                return response.text();
            })
                .then((content) => {
                if (this.disposed)
                    return;
                if (!content.includes('<svg'))
                    throw new Error('Invalid icon SVG.');
                this.content.set(path, content);
                for (const notify of newRequest.subscribers)
                    notify();
            })
                .catch(() => {
                if (!this.disposed) {
                    this.content.set(path, FALLBACK_ICON);
                    for (const notify of newRequest.subscribers)
                        notify();
                }
            })
                .finally(() => this.pending.delete(path));
        }
        request.subscribers.add(subscriber);
        return FALLBACK_ICON;
    }
    dispose() {
        this.disposed = true;
        for (const { controller } of this.pending.values())
            controller.abort();
        this.pending.clear();
        this.content.clear();
    }
}
function createSliderContent(panel) {
    const thumbSize = 28;
    const rail = new Container({
        positionType: 'absolute',
        positionLeft: thumbSize / 2,
        positionRight: thumbSize / 2,
        positionTop: '50%',
        transformTranslateY: '-50%',
        height: thumbSize,
        pointerEvents: 'none',
    });
    const track = new GradientPanel({
        positionType: 'absolute',
        positionLeft: 0,
        positionRight: 0,
        positionTop: '50%',
        transformTranslateY: '-50%',
        height: 10,
        fillColor: 'transparent',
        cornerRadius: 5,
        pointerEvents: 'none',
    });
    const fill = new GradientPanel({
        positionType: 'absolute',
        positionLeft: 0,
        positionTop: '50%',
        transformTranslateY: '-50%',
        height: 10,
        cornerRadius: 5,
        pointerEvents: 'none',
    });
    const thumb = new GradientPanel({
        positionType: 'absolute',
        positionTop: '50%',
        transformTranslateX: '-50%',
        transformTranslateY: '-50%',
        width: thumbSize,
        height: thumbSize,
        cornerRadius: thumbSize / 2,
        pointerEvents: 'none',
    });
    const update = (slider, theme) => {
        const ratio = slider.max === slider.min
            ? 0
            : (slider.value - slider.min) / (slider.max - slider.min);
        const color = slider.disabled
            ? theme.colors.disabledText
            : theme.colors.primary;
        track.setProperties({ fillColor: theme.colors.outline });
        fill.setProperties({ width: `${ratio * 100}%`, fillColor: color });
        thumb.setProperties({
            positionLeft: `${ratio * 100}%`,
            fillColor: color,
        });
    };
    rail.add(track, fill, thumb);
    panel.add(rail);
    return {
        update,
        dispose: () => {
            track.removeFromParent();
            fill.removeFromParent();
            thumb.removeFromParent();
            track.dispose();
            fill.dispose();
            thumb.dispose();
            rail.removeFromParent();
            rail.dispose();
        },
    };
}
function toUIKitStyle(style) {
    const result = {};
    if (style.padding !== undefined) {
        result.paddingTop = style.padding;
        result.paddingRight = style.padding;
        result.paddingBottom = style.padding;
        result.paddingLeft = style.padding;
    }
    if (style.margin !== undefined) {
        result.marginTop = style.margin;
        result.marginRight = style.margin;
        result.marginBottom = style.margin;
        result.marginLeft = style.margin;
    }
    if (style.gap !== undefined) {
        result.gapRow = style.gap;
        result.gapColumn = style.gap;
    }
    if (style.transform?.translateX !== undefined) {
        result.transformTranslateX = style.transform.translateX;
    }
    if (style.transform?.translateY !== undefined) {
        result.transformTranslateY = style.transform.translateY;
    }
    for (const [key, value] of Object.entries(style)) {
        if (key.startsWith(':') ||
            value === undefined ||
            key === 'padding' ||
            key === 'margin' ||
            key === 'gap' ||
            key === 'transform') {
            continue;
        }
        const mapped = key === 'position'
            ? 'positionType'
            : key === 'backgroundColor'
                ? 'fillColor'
                : key === 'borderColor'
                    ? 'strokeColor'
                    : key === 'borderWidth'
                        ? 'strokeWidth'
                        : key === 'borderAlign'
                            ? 'strokeAlign'
                            : key === 'borderRadius'
                                ? 'cornerRadius'
                                : key === 'top'
                                    ? 'positionTop'
                                    : key === 'right'
                                        ? 'positionRight'
                                        : key === 'bottom'
                                            ? 'positionBottom'
                                            : key === 'left'
                                                ? 'positionLeft'
                                                : key === 'rowGap'
                                                    ? 'gapRow'
                                                    : key === 'columnGap'
                                                        ? 'gapColumn'
                                                        : key;
        result[mapped] = value;
    }
    return result;
}
function iconAssetPath(icon) {
    const name = `${encodeURIComponent(icon.icon)}${icon.filled ? '-fill' : ''}`;
    return `${icon.weight}/${icon.variant}/${name}.svg`;
}
function defaultIconAssetPath(icon) {
    return `400/outlined/${encodeURIComponent(icon)}.svg`;
}

export { createUIBackend };
//# sourceMappingURL=UIKitBackend.js.map

import {
  CORNER_DIAGONAL_ANGLE,
  EDGE_ALPHA_EPSILON,
  EDGE_GLOW_FADE_ALPHA,
  EDGE_GLOW_FADE_WIDTH,
  EDGE_GLOW_FLAT_RADIUS,
  EDGE_GLOW_PRESSED_FADE_ALPHA,
  EDGE_GLOW_PRESSED_FADE_LENGTH,
  EDGE_GLOW_PRESSED_FLAT_RADIUS,
  EDGE_GLOW_PRESSED_RADIUS,
  EDGE_GLOW_RADIUS,
  EDGE_GLOW_RIM_ALPHA,
  EDGE_GLOW_RIM_WIDTH,
  EDGE_NORMAL_EPSILON,
  RESIZE_CORNER_ARC_GAP,
  RESIZE_CORNER_ARC_LENGTH,
  RESIZE_CORNER_ARC_PRESSED_GAP,
  RESIZE_CORNER_ARC_PRESSED_WIDTH,
  RESIZE_CORNER_ARC_WIDTH,
} from '../constants/UICardEdgeConstants';
import {glslFloat} from '../../utils/GlslUtils';
import {CommonFunctionsShader} from './CommonFunctions.glsl';

/** Fragment shader for the hover-lit manipulation edge around a UI card. */
export const UICardEdgeFragmentShader =
  CommonFunctionsShader +
  `
#include <common>
#include <dithering_pars_fragment>

varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_card_corner_radius;
uniform float u_edge_margin;
uniform vec4 u_cursor_spotlight_color;
uniform vec2 u_cursor_uv;
uniform float u_show_glow;
uniform float u_glow_press_length;
uniform float u_glow_press_fill;
uniform vec2 u_cursor_uv_2;
uniform float u_show_glow_2;
uniform float u_glow_press_length_2;
uniform float u_glow_press_fill_2;
uniform vec4 u_glow_pressed_rim_color;
uniform vec4 u_glow_pressed_fill_color;
uniform float u_debug;
uniform vec4 u_corner_color;
uniform vec2 u_corner_sign;
uniform float u_corner_alpha;
uniform float u_corner_press;
uniform vec2 u_corner_sign_2;
uniform float u_corner_alpha_2;
uniform float u_corner_press_2;

const float RESIZE_CORNER_ARC_WIDTH = ${glslFloat(RESIZE_CORNER_ARC_WIDTH)};
const float RESIZE_CORNER_ARC_LENGTH = ${glslFloat(RESIZE_CORNER_ARC_LENGTH)};
const float RESIZE_CORNER_ARC_GAP = ${glslFloat(RESIZE_CORNER_ARC_GAP)};
const float RESIZE_CORNER_ARC_PRESSED_WIDTH = ${glslFloat(RESIZE_CORNER_ARC_PRESSED_WIDTH)};
const float RESIZE_CORNER_ARC_PRESSED_GAP = ${glslFloat(RESIZE_CORNER_ARC_PRESSED_GAP)};
const float EDGE_GLOW_RIM_WIDTH = ${glslFloat(EDGE_GLOW_RIM_WIDTH)};
const float EDGE_GLOW_RIM_ALPHA = ${glslFloat(EDGE_GLOW_RIM_ALPHA)};
const float EDGE_GLOW_FADE_ALPHA = ${glslFloat(EDGE_GLOW_FADE_ALPHA)};
const float EDGE_GLOW_FADE_WIDTH = ${glslFloat(EDGE_GLOW_FADE_WIDTH)};
const float EDGE_GLOW_FLAT_RADIUS = ${glslFloat(EDGE_GLOW_FLAT_RADIUS)};
const float EDGE_GLOW_RADIUS = ${glslFloat(EDGE_GLOW_RADIUS)};
const float EDGE_GLOW_PRESSED_FADE_ALPHA = ${glslFloat(EDGE_GLOW_PRESSED_FADE_ALPHA)};
const float EDGE_GLOW_PRESSED_FADE_LENGTH = ${glslFloat(EDGE_GLOW_PRESSED_FADE_LENGTH)};
const float EDGE_GLOW_PRESSED_FLAT_RADIUS = ${glslFloat(EDGE_GLOW_PRESSED_FLAT_RADIUS)};
const float EDGE_GLOW_PRESSED_RADIUS = ${glslFloat(EDGE_GLOW_PRESSED_RADIUS)};
const float CORNER_DIAGONAL_ANGLE = ${glslFloat(CORNER_DIAGONAL_ANGLE)};
const float EDGE_NORMAL_EPSILON = ${glslFloat(EDGE_NORMAL_EPSILON)};
const float EDGE_ALPHA_EPSILON = ${glslFloat(EDGE_ALPHA_EPSILON)};

// The point on the band's outer border reached from p by moving straight
// away from the card's rounded rect. Rim points map to themselves, and unlike
// the nearest rim point this stays continuous across the band beside the
// card's rounded corners. Matches edgeRimPoint in WebGPUUIMaterials.ts.
vec2 edgeRimPoint(
    vec2 p,
    vec2 innerHalfSize,
    float innerRadius,
    vec2 halfSize,
    float outerRadius
) {
    vec2 a = abs(p);
    vec2 v = a - (innerHalfSize - innerRadius);
    vec2 n = min(v.x, v.y) > 0.0
        ? normalize(v)
        : (v.x > v.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec2 center = halfSize - outerRadius;
    vec2 toLine = (halfSize - a) / max(n, vec2(EDGE_NORMAL_EPSILON));
    vec2 w = a - center;
    float b = dot(w, n);
    float toCircle =
        sqrt(max(0.0, b * b - dot(w, w) + outerRadius * outerRadius)) - b;
    float t = a.x + n.x * toLine.y <= center.x
        ? toLine.y
        : (a.y + n.y * toLine.x <= center.y ? toLine.x : toCircle);
    return (step(0.0, p) * 2.0 - 1.0) * (a + n * t);
}

// Flat-topped window around a cursor, with a linear falloff, shortened as
// press goes to 1. It uses the straight-line distance from the cursor to the
// pixel's rim point, so the band's fade toward the card follows the rim's
// window, the lit stretch shortens as the cursor moves toward the card,
// and near a corner it wraps round the corner. Matches edgeGlowWindow in
// WebGPUUIMaterials.ts.
float edgeGlowWindow(
    vec2 p,
    vec2 cursorP,
    vec2 innerHalfSize,
    float innerRadius,
    vec2 halfSize,
    float outerRadius,
    float press
) {
    vec2 rimP = edgeRimPoint(p, innerHalfSize, innerRadius, halfSize, outerRadius);
    float dist = length(rimP - cursorP);
    float flatRadius = mix(
        EDGE_GLOW_FLAT_RADIUS,
        EDGE_GLOW_PRESSED_FLAT_RADIUS,
        press
    );
    float glowRadius = mix(EDGE_GLOW_RADIUS, EDGE_GLOW_PRESSED_RADIUS, press);
    return 1.0 - clamp(
        (dist - flatRadius) / (glowRadius - flatRadius),
        0.0,
        1.0
    );
}

// Coverage of a round-capped arc concentric with the card's rounded corner,
// centered on the corner's diagonal. Pressing thins it from the inside over
// the same angle. Matches cornerArc in WebGPUUIMaterials.ts.
float cornerArc(
    vec2 p,
    vec2 corner,
    float alpha,
    float press,
    vec2 innerHalfSize,
    float innerRadius,
    float aa
) {
    if (alpha <= 0.0 || any(lessThan(p * corner, vec2(0.0)))) return 0.0;
    float halfAngle = min(
        CORNER_DIAGONAL_ANGLE,
        0.5 * RESIZE_CORNER_ARC_LENGTH / (innerRadius + RESIZE_CORNER_ARC_GAP)
    );
    float radius = innerRadius +
        mix(RESIZE_CORNER_ARC_GAP, RESIZE_CORNER_ARC_PRESSED_GAP, press);
    vec2 q = abs(p) - (innerHalfSize - innerRadius);
    float angle = clamp(
        atan(q.y, q.x),
        CORNER_DIAGONAL_ANGLE - halfAngle,
        CORNER_DIAGONAL_ANGLE + halfAngle
    );
    float d = length(q - radius * vec2(cos(angle), sin(angle)));
    float halfWidth = 0.5 *
        mix(RESIZE_CORNER_ARC_WIDTH, RESIZE_CORNER_ARC_PRESSED_WIDTH, press);
    return alpha * (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, d));
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
    // The band's outer corners are centred on the card's sharp corners
    // rather than on its rounded ones.
    float outerRadius = min(margin, min(halfSize.x, halfSize.y));
    float distToEdge = sdRoundedBox(p, halfSize, outerRadius);

    float aa = fwidth(distToEdge);
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distToEdge);

    if (alphaMask < EDGE_ALPHA_EPSILON) discard;

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
    float glowWindow = 0.0;
    float glowWeight = 0.0;
    float glowPressFill = 0.0;

    if (u_show_glow > 0.0) {
        float slotWindow = u_show_glow * edgeGlowWindow(
            p,
            u_cursor_uv * size - halfSize,
            innerHalfSize,
            innerRadius,
            halfSize,
            outerRadius,
            u_glow_press_length
        );
        glowWindow = max(glowWindow, slotWindow);
        glowWeight += slotWindow;
        glowPressFill += slotWindow * u_glow_press_fill;
    }

    if (u_show_glow_2 > 0.0) {
        float slotWindow = u_show_glow_2 * edgeGlowWindow(
            p,
            u_cursor_uv_2 * size - halfSize,
            innerHalfSize,
            innerRadius,
            halfSize,
            outerRadius,
            u_glow_press_length_2
        );
        glowWindow = max(glowWindow, slotWindow);
        glowWeight += slotWindow;
        glowPressFill += slotWindow * u_glow_press_fill_2;
    }

    // Where two glows overlap, blend their press states by window strength.
    glowPressFill /= max(glowWeight, EDGE_ALPHA_EPSILON);

    // A thin rim on the band's outer border over a fill toward the card: a
    // quadratic fade while hovered, an exponential one reaching the card when
    // pressed.
    float rimCoverage = smoothstep(
        -EDGE_GLOW_RIM_WIDTH - aa,
        -EDGE_GLOW_RIM_WIDTH,
        distToEdge
    );
    float rim = EDGE_GLOW_RIM_ALPHA * rimCoverage;
    float inward = max(0.0, -distToEdge - EDGE_GLOW_RIM_WIDTH);
    float hoverFade = max(0.0, 1.0 - inward / EDGE_GLOW_FADE_WIDTH);
    float fade = mix(
        EDGE_GLOW_FADE_ALPHA * hoverFade * hoverFade,
        EDGE_GLOW_PRESSED_FADE_ALPHA *
            exp(-inward / EDGE_GLOW_PRESSED_FADE_LENGTH),
        glowPressFill
    );
    float glowAlpha = glowWindow * max(rim, fade) * edgeBandMask;

    float corner = max(
        cornerArc(
            p,
            u_corner_sign,
            u_corner_alpha,
            u_corner_press,
            innerHalfSize,
            innerRadius,
            aa
        ),
        cornerArc(
            p,
            u_corner_sign_2,
            u_corner_alpha_2,
            u_corner_press_2,
            innerHalfSize,
            innerRadius,
            aa
        )
    );

    if (glowAlpha > EDGE_ALPHA_EPSILON || corner > 0.0) {
        vec3 hoverRGB = u_cursor_spotlight_color.rgb;
        vec4 glow = vec4(
            mix(
                mix(hoverRGB, u_glow_pressed_fill_color.rgb, glowPressFill),
                mix(hoverRGB, u_glow_pressed_rim_color.rgb, glowPressFill),
                rimCoverage
            ),
            u_cursor_spotlight_color.a * glowAlpha
        );

        if (glow.a > 0.0) {
            float dstA = accumColor.a;
            float srcA = glow.a;
            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > EDGE_ALPHA_EPSILON) {
                outRGB =
                    (glow.rgb * srcA + accumColor.rgb * dstA * (1.0 - srcA)) /
                    outA;
            }

            accumColor = vec4(outRGB, outA);
        }

        vec4 edgeResult = vec4(0.0);

        // The hovered resize corner's arc, drawn over the glow.
        if (corner > 0.0) {
            vec4 arcColor = u_corner_color;
            arcColor.a *= corner;
            float dstA = edgeResult.a;
            float outA = arcColor.a + dstA * (1.0 - arcColor.a);
            edgeResult = vec4(
                (arcColor.rgb * arcColor.a +
                    edgeResult.rgb * dstA * (1.0 - arcColor.a)) /
                    max(outA, EDGE_ALPHA_EPSILON),
                outA
            );
        }

        if (edgeResult.a > 0.0) {
            float dstA = accumColor.a;
            float srcA = edgeResult.a;
            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > EDGE_ALPHA_EPSILON) {
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

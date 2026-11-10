import {
  EDGE_GLOW_FADE_ALPHA,
  EDGE_GLOW_FADE_WIDTH,
  EDGE_GLOW_FLAT_HALF_LENGTH,
  EDGE_GLOW_HALF_LENGTH,
  EDGE_GLOW_PRESSED_FADE_ALPHA,
  EDGE_GLOW_PRESSED_FADE_LENGTH,
  EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH,
  EDGE_GLOW_PRESSED_HALF_LENGTH,
  EDGE_GLOW_RIM_ALPHA,
  EDGE_GLOW_RIM_WIDTH,
  RESIZE_CORNER_ARC_GAP,
  RESIZE_CORNER_ARC_LENGTH,
  RESIZE_CORNER_ARC_PRESSED_GAP,
  RESIZE_CORNER_ARC_PRESSED_WIDTH,
  RESIZE_CORNER_ARC_WIDTH,
} from '../constants/UICardEdgeConstants';
import {CommonFunctionsShader} from './CommonFunctions.glsl';

/** Formats a number as a GLSL float literal, which needs a decimal point. */
const glslFloat = (value: number) =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

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
const float EDGE_GLOW_FLAT_HALF_LENGTH = ${glslFloat(EDGE_GLOW_FLAT_HALF_LENGTH)};
const float EDGE_GLOW_HALF_LENGTH = ${glslFloat(EDGE_GLOW_HALF_LENGTH)};
const float EDGE_GLOW_PRESSED_FADE_ALPHA = ${glslFloat(EDGE_GLOW_PRESSED_FADE_ALPHA)};
const float EDGE_GLOW_PRESSED_FADE_LENGTH = ${glslFloat(EDGE_GLOW_PRESSED_FADE_LENGTH)};
const float EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH = ${glslFloat(EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH)};
const float EDGE_GLOW_PRESSED_HALF_LENGTH = ${glslFloat(EDGE_GLOW_PRESSED_HALF_LENGTH)};

// Flat-topped window along the edge around a cursor, with a linear falloff,
// shortened as press goes to 1. The along-edge distance drops the
// across-band offset from the straight-line distance, so the window follows
// the band around rounded corners. Matches edgeGlowWindow in
// WebGPUUIMaterials.ts.
float edgeGlowWindow(
    vec2 p,
    vec2 cursorP,
    vec2 halfSize,
    float outerRadius,
    float distToEdge,
    float press
) {
    float across = distToEdge - sdRoundedBox(cursorP, halfSize, outerRadius);
    vec2 delta = p - cursorP;
    float along2 = max(0.0, dot(delta, delta) - across * across);
    float flatHalfLength = mix(
        EDGE_GLOW_FLAT_HALF_LENGTH,
        EDGE_GLOW_PRESSED_FLAT_HALF_LENGTH,
        press
    );
    float halfLength = mix(
        EDGE_GLOW_HALF_LENGTH,
        EDGE_GLOW_PRESSED_HALF_LENGTH,
        press
    );
    return 1.0 - clamp(
        (sqrt(along2) - flatHalfLength) / (halfLength - flatHalfLength),
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
        0.25 * PI,
        0.5 * RESIZE_CORNER_ARC_LENGTH / (innerRadius + RESIZE_CORNER_ARC_GAP)
    );
    float radius = innerRadius +
        mix(RESIZE_CORNER_ARC_GAP, RESIZE_CORNER_ARC_PRESSED_GAP, press);
    vec2 q = abs(p) - (innerHalfSize - innerRadius);
    float angle = clamp(
        atan(q.y, q.x),
        0.25 * PI - halfAngle,
        0.25 * PI + halfAngle
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
    float glowWindow = 0.0;
    float glowWeight = 0.0;
    float glowPressFill = 0.0;

    if (u_show_glow > 0.0) {
        float slotWindow = u_show_glow * edgeGlowWindow(
            p,
            u_cursor_uv * size - halfSize,
            halfSize,
            outerRadius,
            distToEdge,
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
            halfSize,
            outerRadius,
            distToEdge,
            u_glow_press_length_2
        );
        glowWindow = max(glowWindow, slotWindow);
        glowWeight += slotWindow;
        glowPressFill += slotWindow * u_glow_press_fill_2;
    }

    // Where two glows overlap, blend their press states by window strength.
    glowPressFill /= max(glowWeight, 0.001);

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

    if (glowAlpha > 0.001 || corner > 0.0) {
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

            if (outA > 0.001) {
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
                    max(outA, 0.001),
                outA
            );
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

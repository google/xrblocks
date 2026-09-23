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
            vec2(innerRadius + 2.0 * margin),
            halfSize * 0.5
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
        float width = u_edge_width * (1.0 + corner);
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

    #include <dithering_fragment>
}
`;

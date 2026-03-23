import { CommonFunctionsShader } from './CommonFunctions.glsl.js';

const ManipulationPanelFragmentShader = CommonFunctionsShader +
    `
#include <common>
#include <dithering_pars_fragment>

varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_manipulation_corner_radius;
uniform float u_manipulation_margin;
uniform float u_manipulation_edge_width;
uniform vec4 u_manipulation_edge_color;
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

    float effR = min(u_manipulation_corner_radius, min(halfSize.x, halfSize.y));
    float distToEdge = sdRoundedBox(p, halfSize, effR);

    float aa = fwidth(distToEdge);
    float alphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distToEdge);

    if (alphaMask < 0.001) discard;

    vec4 debugColor = vec4(0.0);

    float margin = max(0.0, u_manipulation_margin);
    vec2 innerHalfSize = max(vec2(0.0), halfSize - margin);
    float distToInner = sdRoundedBox(p, innerHalfSize, 0.0);

    float innerMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, distToInner);

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

    if (glowAlpha > 0.001) {
        vec4 glow = u_cursor_spotlight_color;
        glow.a *= glowAlpha;

        if (glow.a > 0.0) {
            vec3 dstRGB = accumColor.rgb;
            float dstA = accumColor.a;

            vec3 srcRGB = glow.rgb;
            float srcA = glow.a;

            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > 0.001) {
                outRGB = (srcRGB * srcA + dstRGB * dstA * (1.0 - srcA)) / outA;
            }

            accumColor = vec4(outRGB, outA);
        }

        float dist = distToEdge;
        float width = u_manipulation_edge_width;

        float edgeMask = smoothstep(-width - aa, -width, dist);
        float edgeOpacity = glowAlpha;

        vec4 edgeResult = vec4(0.0);
        if (edgeMask > 0.0 && edgeOpacity > 0.0) {
            vec4 eColor = u_manipulation_edge_color;
            eColor.a *= edgeOpacity;
            eColor.a *= edgeMask;
            edgeResult = eColor;
        }

        if (edgeResult.a > 0.0) {
            vec3 dstRGB = accumColor.rgb;
            float dstA = accumColor.a;

            vec3 srcRGB = edgeResult.rgb;
            float srcA = edgeResult.a;

            float outA = srcA + dstA * (1.0 - srcA);
            vec3 outRGB = vec3(0.0);

            if (outA > 0.001) {
                outRGB = (srcRGB * srcA + dstRGB * dstA * (1.0 - srcA)) / outA;
            }

            accumColor = vec4(outRGB, outA);
        }
    }

    accumColor.a *= alphaMask;

    if (u_debug > 0.5) {
        accumColor = mix(accumColor, debugColor, debugColor.a);
        accumColor.a = max(accumColor.a, debugColor.a);
    }

    gl_FragColor = accumColor;

    #include <dithering_fragment>
}
`;

export { ManipulationPanelFragmentShader };

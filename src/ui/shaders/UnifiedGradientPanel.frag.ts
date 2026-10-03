import {CommonFunctionsShader} from './CommonFunctions.glsl';
import {GradientFunctionsShader} from './GradientFunctions.glsl';

export const UnifiedGradientPanelFragmentShader =
  CommonFunctionsShader +
  GradientFunctionsShader +
  `
varying vec2 vUv;

uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_corner_radius;
uniform float u_drop_shadow_margin;

// 1. Fill Uniforms
uniform int u_has_fill;
uniform int u_fill_gradientType;
uniform int u_fill_paintType;
uniform vec4 u_fill_solidColor;
uniform float u_fill_rotation;
uniform vec2 u_fill_center;
uniform vec2 u_fill_scale;
uniform float u_fill_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_fill_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_fill_numStops;

// 2. Stroke Uniforms
uniform int u_has_stroke;
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
uniform float u_stroke_align; // Offset from edge (-1=inside, 0=center, 1=outside)

// 3. Inner Shadow Uniforms
uniform int u_has_inner_shadow;
uniform int u_inner_gradientType;
uniform int u_inner_paintType;
uniform vec4 u_inner_solidColor;
uniform float u_inner_rotation;
uniform vec2 u_inner_center;
uniform vec2 u_inner_scale;
uniform float u_inner_gradientStops[MAX_GRADIENT_STOPS];
uniform vec4 u_inner_gradientColors[MAX_GRADIENT_STOPS];
uniform int u_inner_numStops;
uniform float u_inner_blur;
uniform vec2 u_inner_position;
uniform float u_inner_spread;
uniform float u_inner_falloff;

// 4. Drop Shadow Uniforms
uniform int u_has_drop_shadow;
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
    float clippingAlpha = panelClipAlpha();

    // Setup Coordinates
    vec2 pos = vUv * u_resolution;
    vec2 size = u_resolution;
    vec2 p = pos - (size * 0.5);

    // Content box is size minus drop shadow margin
    vec2 contentSize = size - (u_drop_shadow_margin * 2.0);
    vec2 contentHalfSize = contentSize * 0.5;

    // Stroke shift for caster sizing
    float strokeShift = 0.0;
    if (u_has_stroke != 0 && u_stroke_width > 0.001) {
        if (u_stroke_align > 0.0) strokeShift = u_stroke_width; // Outside
        else if (u_stroke_align > -0.5) strokeShift = u_stroke_width * 0.5; // Center
    }

    vec2 casterHalfSize = contentHalfSize + vec2(strokeShift);
    float baseEffR = min(u_corner_radius, min(contentHalfSize.x, contentHalfSize.y));
    float casterEffR = baseEffR + strokeShift;

    // ----------------------------------------------------
    // 1. Drop Shadow Pass
    // ----------------------------------------------------
    vec4 dropColor = vec4(0.0);
    if (u_has_drop_shadow != 0) {
        float casterDist = sdRoundedBox(p, casterHalfSize, casterEffR);
        float casterAA = fwidth(casterDist);
        float cutoutAlpha = smoothstep(-0.5 * casterAA, 0.5 * casterAA, casterDist);

        if (cutoutAlpha > 0.001) {
            vec2 shadowPos = p - u_drop_position;
            float shadowDist = sdRoundedBox(shadowPos, casterHalfSize, casterEffR) - u_drop_spread;
            float blur = max(1.0, u_drop_blur);
            float shadowAlpha = 1.0 - smoothstep(0.0, blur, shadowDist);
            shadowAlpha = pow(max(0.0, shadowAlpha), max(0.001, u_drop_falloff));

            if (u_drop_paintType == PAINT_TYPE_SOLID) {
                dropColor = u_drop_solidColor;
            } else if (u_drop_paintType == PAINT_TYPE_GRADIENT) {
                if (u_drop_gradientType == GRADIENT_TYPE_RADIAL) {
                    float d = sdRoundedBox(p - u_drop_position, casterHalfSize, casterEffR);
                    float t = clamp(d / max(0.001, u_drop_blur), 0.0, 1.0);
                    dropColor = mixGradientStops(
                        t,
                        u_drop_numStops,
                        u_drop_gradientStops,
                        u_drop_gradientColors
                    );
                } else {
                    dropColor = getGradientColor(
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
            dropColor.a *= shadowAlpha * cutoutAlpha * u_opacity;
        }
    }

    // ----------------------------------------------------
    // 2. Base Fill Pass
    // ----------------------------------------------------
    vec4 surfaceColor = vec4(0.0);
    float dist = sdRoundedBox(p, contentHalfSize, baseEffR);
    float aa = fwidth(dist);
    float fillAlphaMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dist);

    if (fillAlphaMask > 0.001 && u_has_fill != 0) {
        vec4 fillColor = vec4(0.0);
        if (u_fill_paintType == PAINT_TYPE_SOLID) {
            fillColor = u_fill_solidColor;
        } else if (u_fill_paintType == PAINT_TYPE_GRADIENT) {
            fillColor = getGradientColor(
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

        // ------------------------------------------------
        // 3. Inner Shadow Composite (onto Base Fill)
        // ------------------------------------------------
        if (u_has_inner_shadow != 0) {
            float strokeInset = 0.0;
            if (u_has_stroke != 0 && u_stroke_width > 0.001 && u_stroke_align < 0.5) {
                if (u_stroke_align < -0.5) strokeInset = u_stroke_width; // Inside
                else strokeInset = u_stroke_width * 0.5; // Center
            }

            vec2 shadowZoneHalfSize = max(vec2(0.0), contentHalfSize - vec2(strokeInset));
            float innerEffR = max(0.0, u_corner_radius - strokeInset);
            innerEffR = min(innerEffR, min(shadowZoneHalfSize.x, shadowZoneHalfSize.y));

            float innerDist = sdRoundedBox(p, shadowZoneHalfSize, innerEffR);
            float innerAA = fwidth(innerDist);
            float innerAlphaMask = 1.0 - smoothstep(-0.5 * innerAA, 0.5 * innerAA, innerDist);

            if (innerAlphaMask > 0.001) {
                vec4 innerColor = vec4(0.0);
                if (u_inner_paintType == PAINT_TYPE_SOLID) {
                    innerColor = u_inner_solidColor;
                } else if (u_inner_paintType == PAINT_TYPE_GRADIENT) {
                    if (u_inner_gradientType == GRADIENT_TYPE_RADIAL) {
                        float d = sdRoundedBox(p - u_inner_position, contentHalfSize, baseEffR);
                        float t = clamp(-d / max(0.001, u_inner_blur), 0.0, 1.0);
                        innerColor = mixGradientStops(
                            t,
                            u_inner_numStops,
                            u_inner_gradientStops,
                            u_inner_gradientColors
                        );
                    } else {
                        innerColor = getGradientColor(
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

                float blur = max(0.001, u_inner_blur);
                float totalInset = u_inner_spread + blur;
                vec2 bSmall = shadowZoneHalfSize - totalInset;
                float rSmall = max(0.0, innerEffR - totalInset);

                vec2 p_rel = p - u_inner_position;
                float dSmall = sdRoundedBox(p_rel, bSmall, rSmall);
                float shadowVal = smoothstep(0.0, blur, dSmall);
                float shadowStrength = pow(clamp(shadowVal, 0.0, 1.0), max(0.001, u_inner_falloff));
                float innerFinalA = innerColor.a * shadowStrength * innerAlphaMask;

                // Composite inner shadow over fill
                fillColor.rgb = mix(fillColor.rgb, innerColor.rgb, innerFinalA);
                fillColor.a = max(fillColor.a, innerFinalA);
            }
        }

        surfaceColor = vec4(fillColor.rgb, fillColor.a * fillAlphaMask * u_opacity);
    }

    // ----------------------------------------------------
    // 4. Stroke Pass
    // ----------------------------------------------------
    vec4 strokeResult = vec4(0.0);
    if (u_has_stroke != 0 && u_stroke_width > 0.001) {
        float shift = u_stroke_align * (u_stroke_width * 0.5);
        float dStroke = dist - shift;
        float halfWidth = u_stroke_width * 0.5;
        float strokeDist = abs(dStroke) - halfWidth;

        float strokeAA = fwidth(dist);
        float strokeMask = 1.0 - smoothstep(-0.5 * strokeAA, 0.5 * strokeAA, strokeDist);

        if (strokeMask > 0.001) {
            vec4 strokeColor = vec4(0.0);
            if (u_stroke_paintType == PAINT_TYPE_SOLID) {
                strokeColor = u_stroke_solidColor;
            } else if (u_stroke_paintType == PAINT_TYPE_GRADIENT) {
                strokeColor = getGradientColor(
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
            strokeResult = vec4(strokeColor.rgb, strokeColor.a * strokeMask * u_opacity);
        }
    }

    // ----------------------------------------------------
    // 5. Final Composite: DropShadow -> Surface -> Stroke
    // ----------------------------------------------------
    vec4 color = dropColor;
    if (surfaceColor.a > 0.0) {
        color.rgb = mix(color.rgb, surfaceColor.rgb, surfaceColor.a);
        color.a = surfaceColor.a + color.a * (1.0 - surfaceColor.a);
    }
    if (strokeResult.a > 0.0) {
        color.rgb = mix(color.rgb, strokeResult.rgb, strokeResult.a);
        color.a = strokeResult.a + color.a * (1.0 - strokeResult.a);
    }

    if (color.a < 0.001) discard;

    gl_FragColor = color;
    gl_FragColor.a *= clippingAlpha;

    #include <dithering_fragment>
}
`;

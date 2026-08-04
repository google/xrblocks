import {CommonFunctionsShader} from './CommonFunctions.glsl';
import {GradientFunctionsShader} from './GradientFunctions.glsl';

export const GradientDropShadowFragmentShader =
  CommonFunctionsShader +
  GradientFunctionsShader +
  `
varying vec2 vUv;

uniform vec2 u_resolution;
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
    float finalAlpha = finalColor.a * shadowAlpha * alphaMask;

    gl_FragColor = vec4(finalColor.rgb, finalAlpha);

    #include <dithering_fragment>
}
`;

import {CommonFunctionsShader} from './CommonFunctions.glsl';
import {GradientFunctionsShader} from './GradientFunctions.glsl';

export const GradientFillFragmentShader =
  CommonFunctionsShader +
  GradientFunctionsShader +
  `
varying vec2 vUv;

uniform vec2 u_resolution;
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
    finalColor.a *= alphaMask;

    gl_FragColor = finalColor;

    #include <dithering_fragment>
}
`;

import {CommonFunctionsShader} from './CommonFunctions.glsl';
import {GradientFunctionsShader} from './GradientFunctions.glsl';

export const GradientStrokeFragmentShader =
  CommonFunctionsShader +
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

    gl_FragColor = vec4(finalColor.rgb, finalColor.a * alphaMask);

    #include <dithering_fragment>
}
`;

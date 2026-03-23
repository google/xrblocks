import { CommonFunctionsShader } from './CommonFunctions.glsl.js';
import { GradientFunctionsShader } from './GradientFunctions.glsl.js';

const GradientInnerShadowFragmentShader = CommonFunctionsShader +
    GradientFunctionsShader +
    `
varying vec2 vUv;

uniform vec2 u_resolution;
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
    float finalAlpha = finalColor.a * shadowStrength * alphaMask;

    gl_FragColor = vec4(finalColor.rgb, finalAlpha);

    #include <dithering_fragment>
}
`;

export { GradientInnerShadowFragmentShader };

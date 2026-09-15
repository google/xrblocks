export const GradientFunctionsShader = `
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

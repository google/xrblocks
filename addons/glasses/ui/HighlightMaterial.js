import * as THREE from 'three';

const LINEAR_GRADIENT_GLSL = `
vec4 get_linear_gradient_color() {
    // --- 1. Calculate Gradient Angle (104deg) ---

    // Center UV coordinates (from 0..1 to -0.5..0.5)
    vec2 uv = vUv - 0.5;
    uv.x = -uv.x;

    // CSS angle (104deg) converted to radians
    float angle = 104.0 * 3.14159 / 180.0;
    float s = sin(angle);
    float c = cos(angle);

    // Create a 2D rotation matrix
    mat2 rot = mat2(c, -s, s, c);

    // Rotate the UV coordinates
    // We take the .y component for our gradient progress
    vec2 rotated_uv = rot * uv;

    // Re-normalize progress 't' to be in the 0.0 to 1.0 range
    float t = rotated_uv.y + 0.5;

    // --- 2. Define Colors and Stops ---

    // Bottom layer color: #858885
    vec3 baseColor = vec3(133.0/255.0, 136.0/255.0, 133.0/255.0);

    // Top layer color: #FFF (white)
    vec3 topColor = vec3(1.0, 1.0, 1.0);

    // Define the alpha stops from the CSS
    // #FFF 7.37% -> a=1.0 at t=0.0737
    float t1 = 0.0737; float a1 = 1.0;

    // rgba(255, 255, 255, 0.00) 45.87% -> a=0.0 at t=0.4587
    float t2 = 0.4587; float a2 = 0.0;

    // rgba(255, 255, 255, 0.00) 81.69% -> a=0.0 at t=0.8169
    float t3 = 0.8169; float a3 = 0.0;

    // rgba(255, 255, 255, 0.80) 93.83% -> a=0.8 at t=0.9383
    float t4 = 0.9383; float a4 = 0.80;

    // --- 3. Calculate Gradient Alpha ---
    // This is a piecewise linear interpolation
    float gradientAlpha;

    if (t <= t1) {
        gradientAlpha = a1; // Before first stop
    } else if (t <= t2) {
        float w = (t - t1) / (t2 - t1); // Interpolation factor
        gradientAlpha = mix(a1, a2, w); // mix() is linear interpolation
    } else if (t <= t3) {
        gradientAlpha = a2; // Constant section (a2 == a3)
    } else if (t <= t4) {
        float w = (t - t3) / (t4 - t3);
        gradientAlpha = mix(a3, a4, w);
    } else {
        gradientAlpha = a4; // After last stop
    }

    // --- 4. Blend Final Color ---

    // Create the top layer RGBA color
    vec4 gradientLayer = vec4(topColor, gradientAlpha);

    // Alpha-blend the top layer over the base color
    // C_out = C_top * A_top + C_bottom * (1 - A_top)
    // This is exactly what mix() does:
    vec3 finalColor = mix(baseColor, gradientLayer.rgb, gradientLayer.a);

    return vec4(finalColor, 1.0);
}
`;
class HighlightMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(parameters) {
        parameters.fragmentShader = parameters.fragmentShader.replace('#include <clipping_planes_pars_fragment>', ['#include <clipping_planes_pars_fragment>', LINEAR_GRADIENT_GLSL].join('\n'));
        parameters.fragmentShader = parameters.fragmentShader.replace('#include <clipping_planes_fragment>', [
            '#include <clipping_planes_fragment>',
            'borderColor=get_linear_gradient_color().xyz;',
        ].join('\n'));
    }
    customProgramCacheKey() {
        return 'HighlightMaterial-v1';
    }
}

export { HighlightMaterial };

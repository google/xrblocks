export const CommonFunctionsShader = `
#include <clipping_planes_pars_fragment>

float panelClipAlpha() {
    vec4 diffuseColor = vec4(1.0);
    #include <clipping_planes_fragment>
    return diffuseColor.a;
}

// SDF for a rounded box in 2D.
float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - (b - r);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
`;

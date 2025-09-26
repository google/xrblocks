/**
 * A basic, performant shader for rendering textures with transparency.
 *
 * This shader does not react to scene lighting ("Unlit"), making it ideal for
 * UI elements, sprites, or other objects that should maintain their original
 * texture colors regardless of lighting conditions. It supports both per-pixel
 * alpha from the texture and a global opacity uniform for fading effects.
 */
export declare const UnlitAlphaShader: {
    uniforms: {
        uTexture: {
            value: null;
        };
        uOpacity: {
            value: number;
        };
    };
    vertexShader: string;
    fragmentShader: string;
};

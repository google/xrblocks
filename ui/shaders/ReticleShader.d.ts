import * as THREE from 'three';
/**
 * Shader for the Reticle UI component.
 *
 * This shader renders a dynamic, anti-aliased circle that provides visual
 * feedback for user interaction. It can smoothly transition between a hollow
 * ring (idle/hover state) and a solid, shrinking circle (pressed state).
 * The anti-aliasing is achieved using screen-space derivatives (fwidth) to
 * ensure crisp edges at any resolution or distance.
 */
export declare const ReticleShader: {
    name: string;
    uniforms: {
        uColor: {
            value: THREE.Color;
        };
        uPressed: {
            value: number;
        };
    };
    vertexShader: string;
    fragmentShader: string;
};

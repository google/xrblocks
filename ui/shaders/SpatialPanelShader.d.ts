import * as THREE from 'three';
/**
 * Shader for the interactive SpatialPanel UI component.
 *
 * This shader renders a rounded rectangle (squircle) that can display a
 * background color or texture. Its key feature is the ability to render
 * dynamic, radial "glow" highlights at the location of up to two controller
 * reticles. The highlight is constrained to the panel's border, providing clear
 * visual feedback for dragging and interaction.
 */
export declare const SpatialPanelShader: {
    uniforms: {
        uMainTex: {
            value: null;
        };
        uUseImage: {
            value: number;
        };
        uBackgroundColor: {
            value: THREE.Vector4;
        };
        uBoxSize: {
            value: THREE.Vector2;
        };
        uRadius: {
            value: number;
        };
        uReticleUVs: {
            value: THREE.Vector4;
        };
        uSelected: {
            value: THREE.Vector2;
        };
        uBorderWidth: {
            value: number;
        };
        uHighlightRadius: {
            value: number;
        };
        uOutlineWidth: {
            value: number;
        };
        uOpacity: {
            value: number;
        };
    };
    vertexShader: string;
    fragmentShader: string;
};

import * as THREE from 'three';
/**
 * Shader for the non-interactive Panel background.
 *
 * This shader renders a simple, anti-aliased rounded rectangle (squircle). It
 * can display either a solid background color or a texture map. It is more
 * performant than the SpatialPanelShader as it omits all interactive highlight
 * calculations.
 */
export declare const SquircleShader: {
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
        uOpacity: {
            value: number;
        };
    };
    vertexShader: string;
    fragmentShader: string;
};

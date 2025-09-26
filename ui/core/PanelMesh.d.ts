import * as THREE from 'three';
import type { Shader } from '../../utils/Types';
/**
 * A specialized `THREE.Mesh` designed for rendering UI panel
 * backgrounds. It utilizes a custom shader to draw rounded rectangles
 * (squircles) and provides methods to dynamically update its appearance,
 * such as aspect ratio and size. This class is a core building block for
 * `Panel` components.
 */
export declare class PanelMesh extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    /** Text description of the PanelMesh */
    name: string;
    /**
     * Provides convenient access to the material's shader uniforms.
     * @returns The uniforms object of the shader material.
     */
    get uniforms(): {
        [uniform: string]: THREE.IUniform<any>;
    };
    /**
     * Creates an instance of PanelMesh.
     * @param shader - Shader for the panel mesh.
     * @param backgroundColor - The background color as a CSS string.
     * @param panelScale - The initial scale of the plane
     */
    constructor(shader: Shader, backgroundColor?: string, panelScale?: number);
    /**
     * Sets the panel's absolute dimensions (width and height) in the shader.
     * This is used by the shader to correctly calculate properties like rounded
     * corner radii.
     * @param width - The width of the panel.
     * @param height - The height of the panel.
     */
    setWidthHeight(width: number, height: number): void;
    /**
     * Adjusts the mesh's scale to match a given aspect ratio, preventing the
     * panel from appearing stretched.
     * @param aspectRatio - The desired width-to-height ratio.
     */
    setAspectRatio(aspectRatio: number): void;
}

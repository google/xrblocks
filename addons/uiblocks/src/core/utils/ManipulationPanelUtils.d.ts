import * as THREE from 'three';
import { ShaderUniforms } from '../types/ShaderTypes';
/**
 * Creates a set of uniforms for manipulation effects (margin, border, glow).
 * @returns An object containing initialized ShaderUniforms.
 */
export declare function createManipulationUniforms(): ShaderUniforms;
/**
 * Updates manipulation uniforms based on provided properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Object containing interactive properties (cursor uv, glow, glow2).
 */
export declare function updateManipulationUniforms(uniforms: ShaderUniforms, properties: {
    u_manipulation_margin?: number;
    u_manipulation_corner_radius?: number;
    u_manipulation_edge_width?: number;
    u_manipulation_edge_color?: THREE.ColorRepresentation;
    u_cursor_spotlight_color?: THREE.ColorRepresentation;
    u_cursor_radius?: number;
    u_cursor_spotlight_blur?: number;
    u_debug?: number;
    u_cursor_uv?: THREE.Vector2 | [number, number];
    u_show_glow?: number;
    u_cursor_uv_2?: THREE.Vector2 | [number, number];
    u_show_glow_2?: number;
    [key: string]: unknown;
}): void;

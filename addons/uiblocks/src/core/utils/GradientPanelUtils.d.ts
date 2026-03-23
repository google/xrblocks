import * as THREE from 'three';
import { Paint, ShaderUniforms, StrokeAlign } from '../types/ShaderTypes';
/**
 * Creates a set of uniforms for a Paint structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_fill_', 'u_stroke_').
 * @returns An object containing initialized ShaderUniforms sets.
 */
export declare function createPaintUniforms(prefix: string): ShaderUniforms;
/**
 * Updates ShaderUniforms based on a Paint definition.
 * @param uniforms - The uniforms object to update.
 * @param input - The Paint definition (color or gradient) to apply.
 * @param prefix - The uniform name prefix.
 */
export declare function updatePaintUniforms(uniforms: ShaderUniforms, input: Paint | undefined, prefix: string): void;
/**
 * Creates a set of uniforms for a Shadow structure.
 * @param prefix - The prefix for uniform names (e.g., 'u_inner_shadow_', 'u_outer_shadow_').
 * @returns An object containing ShaderUniforms.
 */
export declare function createShadowUniforms(prefix: string): ShaderUniforms;
/**
 * Updates ShaderUniforms based on Shadow properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Shadow properties containing blur, position, spread, falloff.
 * @param prefix - The uniform name prefix.
 */
export declare function updateShadowUniforms(uniforms: ShaderUniforms, properties: {
    color?: Paint;
    blur?: number;
    position?: THREE.Vector2 | [number, number];
    spread?: number;
    falloff?: number;
}, prefix: string): void;
/**
 * Updates ShaderUniforms based on Stroke properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Stroke properties containing width and alignment.
 */
export declare function updateStrokeUniforms(uniforms: ShaderUniforms, properties: {
    strokeWidth?: number;
    strokeAlign?: StrokeAlign;
}): void;

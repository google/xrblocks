import * as THREE from 'three';
/**
 * Supported gradient mapping types.
 */
export type GradientType = 'linear' | 'radial' | 'angular' | 'diamond';
/**
 * Numeric IDs mapped to `GradientType` for shader uniforms lookup.
 */
export declare const GradientTypeIds: {
    Linear: number;
    Radial: number;
    Angular: number;
    Diamond: number;
};
/**
 * A single keyed position structure for building color ramp gradients.
 */
export interface ColorStop {
    /** Normalized position from 0.0 (start) to 1.0 (end) */
    position: number;
    /** Color representation (Hex, CSS string, or THREE.Color) */
    color: THREE.ColorRepresentation;
}
/**
 * Defines settings for linear or radial gradient fills.
 */
export interface GradientPaint {
    /** The type of gradient layout structure */
    gradientType: GradientType;
    /** Array of boundary nodes containing position and color coordinates */
    stops: ColorStop[];
    /** Rotation angle in degrees (default 0) */
    rotation?: number;
    /** Origin coordinate anchor of the gradient scale mapping (default [0.5, 0.5]) */
    center?: THREE.Vector2 | [number, number];
    /** Scalar scaling offset mapping multipliers (default [1.0, 1.0]) */
    scale?: THREE.Vector2 | [number, number];
}
/**
 * Flat static color representation (CSS, Hex, or THREE.Color).
 */
export type SolidPaint = THREE.ColorRepresentation;
/**
 * Union supported coloring style applied to paths or faces.
 */
export type Paint = SolidPaint | GradientPaint;
/**
 * Numeric IDs indicating solid vs gradient configurations inside uniform structures.
 */
export declare const PaintTypeIds: {
    Solid: number;
    Gradient: number;
};
/**
 * Defines bounding box calculation bias mappings during stroke drawing.
 */
export type StrokeAlign = 'inside' | 'center' | 'outside';
/**
 * Base template signature wrapper containing Three.js shader dictionary binds.
 */
export type ShaderUniforms = {
    [key: string]: THREE.IUniform;
};

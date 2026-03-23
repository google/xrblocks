import { ShaderUniforms } from '../types/ShaderTypes';
/**
 * Helper to get a uniform by name or prefix+name.
 * @param uniforms - The uniforms object.
 * @param arg1 - Name of uniform, or prefix if arg2 is provided.
 * @param arg2 - Optional name of uniform if arg1 is prefix.
 */
export declare function getU(uniforms: ShaderUniforms, arg1: string, arg2?: string): import("three").IUniform<any>;

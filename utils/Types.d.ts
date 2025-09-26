import * as THREE from 'three';
/**
 * Misc collection of types not specific to any XR Blocks module.
 */
export type Constructor<T = object> = new (...args: any[]) => T;
export type ShaderUniforms = {
    [uniform: string]: THREE.IUniform;
};
/**
 * Defines the structure for a shader object compatible with PanelMesh,
 * requiring uniforms, a vertex shader, and a fragment shader.
 */
export interface Shader {
    uniforms: ShaderUniforms;
    vertexShader: string;
    fragmentShader: string;
    defines?: {
        [key: string]: unknown;
    };
}
/**
 * A recursive readonly type.
 */
export type DeepReadonly<T> = T extends ((...args: any[]) => any) ? T : T extends object ? {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;
/**
 * A recursive partial type.
 */
export type DeepPartial<T> = T extends ((...args: any[]) => any) ? T : T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

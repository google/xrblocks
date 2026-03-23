import * as THREE from 'three';
import { parseColorWithAlpha } from './ColorUtils.js';
import { getU } from './ShaderUtils.js';

/**
 * Creates a set of uniforms for manipulation effects (margin, border, glow).
 * @returns An object containing initialized ShaderUniforms.
 */
function createManipulationUniforms() {
    return {
        u_manipulation_margin: { value: 0.0 },
        u_manipulation_corner_radius: { value: 0.0 },
        u_manipulation_edge_width: { value: 0.0 },
        u_manipulation_edge_color: { value: new THREE.Vector4(1, 1, 1, 1) },
        u_cursor_spotlight_color: { value: new THREE.Vector4(1, 1, 1, 1) },
        u_cursor_radius: { value: 0.0 },
        u_cursor_spotlight_blur: { value: 0.0 },
        u_cursor_uv: { value: new THREE.Vector2(0.5, 0.5) },
        u_show_glow: { value: 0.0 },
        u_cursor_uv_2: { value: new THREE.Vector2(0.5, 0.5) },
        u_show_glow_2: { value: 0.0 },
        u_debug: { value: 0.0 },
    };
}
/**
 * Updates manipulation uniforms based on provided properties.
 * @param uniforms - The uniforms object to update.
 * @param properties - Object containing interactive properties (cursor uv, glow, glow2).
 */
function updateManipulationUniforms(uniforms, properties) {
    if (properties.u_manipulation_margin !== undefined) {
        const u = getU(uniforms, 'u_manipulation_margin');
        if (u)
            u.value = properties.u_manipulation_margin;
    }
    if (properties.u_manipulation_corner_radius !== undefined) {
        const u = getU(uniforms, 'u_manipulation_corner_radius');
        if (u)
            u.value = properties.u_manipulation_corner_radius;
    }
    if (properties.u_manipulation_edge_width !== undefined) {
        const u = getU(uniforms, 'u_manipulation_edge_width');
        if (u)
            u.value = properties.u_manipulation_edge_width;
    }
    if (properties.u_manipulation_edge_color !== undefined) {
        const u = getU(uniforms, 'u_manipulation_edge_color');
        if (u) {
            const { color, opacity } = parseColorWithAlpha(properties.u_manipulation_edge_color);
            u.value.set(color.r, color.g, color.b, opacity);
        }
    }
    if (properties.u_cursor_spotlight_color !== undefined) {
        const u = getU(uniforms, 'u_cursor_spotlight_color');
        if (u) {
            const { color, opacity } = parseColorWithAlpha(properties.u_cursor_spotlight_color);
            u.value.set(color.r, color.g, color.b, opacity);
        }
    }
    if (properties.u_cursor_radius !== undefined) {
        const u = getU(uniforms, 'u_cursor_radius');
        if (u)
            u.value = properties.u_cursor_radius;
    }
    if (properties.u_cursor_spotlight_blur !== undefined) {
        const u = getU(uniforms, 'u_cursor_spotlight_blur');
        if (u)
            u.value = properties.u_cursor_spotlight_blur;
    }
    if (properties.u_debug !== undefined) {
        const u = getU(uniforms, 'u_debug');
        if (u)
            u.value = properties.u_debug;
    }
    if (properties.u_cursor_uv !== undefined) {
        const u = getU(uniforms, 'u_cursor_uv');
        if (u) {
            if (Array.isArray(properties.u_cursor_uv)) {
                u.value.set(properties.u_cursor_uv[0], properties.u_cursor_uv[1]);
            }
            else {
                u.value.copy(properties.u_cursor_uv);
            }
        }
    }
    if (properties.u_show_glow !== undefined) {
        const u = getU(uniforms, 'u_show_glow');
        if (u)
            u.value = properties.u_show_glow;
    }
    if (properties.u_cursor_uv_2 !== undefined) {
        const u = getU(uniforms, 'u_cursor_uv_2');
        if (u) {
            if (Array.isArray(properties.u_cursor_uv_2)) {
                u.value.set(properties.u_cursor_uv_2[0], properties.u_cursor_uv_2[1]);
            }
            else {
                u.value.copy(properties.u_cursor_uv_2);
            }
        }
    }
    if (properties.u_show_glow_2 !== undefined) {
        const u = getU(uniforms, 'u_show_glow_2');
        if (u)
            u.value = properties.u_show_glow_2;
    }
}

export { createManipulationUniforms, updateManipulationUniforms };

import { InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import * as THREE from 'three';
import { PanelLayer, PanelLayerProperties } from './PanelLayer';
/**
 * Properties for configuring a ManipulationLayer.
 * These map directly to uniforms used by ManipulationPanelFragmentShader.
 */
export type ManipulationLayerProperties = PanelLayerProperties & {
    /** Margin for the manipulation bounding box frame expansion (usually for edge rendering, shadow casting safety, etc.) */
    u_manipulation_margin?: number;
    /** Corner radius of the selection frame. */
    u_manipulation_corner_radius?: number;
    /** Spotlight color overlay usually triggered on focus or cursor hover. */
    u_cursor_spotlight_color?: THREE.ColorRepresentation;
    /** Width of the selection edge highlight. */
    u_manipulation_edge_width?: number;
    /** Color of the selection edge highlight. */
    u_manipulation_edge_color?: THREE.ColorRepresentation;
    /** UV coordinate of the primary cursor. */
    u_cursor_uv?: THREE.Vector2;
    /** Intensity/toggle for primary cursor spotlight glow effect. */
    u_show_glow?: number;
    /** UV coordinate of the secondary cursor. */
    u_cursor_uv_2?: THREE.Vector2;
    /** Intensity/toggle for secondary cursor spotlight glow effect. */
    u_show_glow_2?: number;
    /** Debug flag to visualize bounds. */
    u_debug?: number;
    /** Radius of the spotlight in pixels. */
    u_cursor_radius?: number;
    /** Blur radius of the spotlight in pixels. */
    u_cursor_spotlight_blur?: number;
};
/**
 * Layer responsible for rendering interactive manipulation effects.
 * Includes cursor spotlights and edge selection highlights.
 */
export declare class ManipulationLayer extends PanelLayer<ManipulationLayerProperties> {
    name: string;
    constructor(inputProperties: InProperties<ManipulationLayerProperties> | undefined, initialClasses?: Array<InProperties<ManipulationLayerProperties> | string> | undefined, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<ManipulationLayerProperties>;
        defaults?: WithSignal<ManipulationLayerProperties>;
    });
    updateCursor(uv: THREE.Vector2 | null, index?: number): void;
}

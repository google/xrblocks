import { Panel } from '../core/Panel';
import { PanelOptions } from '../core/PanelOptions';
/**
 * A fundamental UI container that lets you display app content in a
 * 3D space. It can be thought of as a "window" or "surface" in XR. It provides
 * visual feedback for user interactions like hovering and selecting, driven by
 * a custom shader, and can be made draggable.
 */
export type SpatialPanelOptions = PanelOptions & {
    showEdge?: boolean;
    dragFacingCamera?: boolean;
};
export declare class SpatialPanel extends Panel {
    /**
     * Keeps the panel facing the camera as it is dragged.
     */
    dragFacingCamera: boolean;
    /**
     * Creates an instance of SpatialPanel.
     */
    constructor(options?: SpatialPanelOptions);
    update(): void;
    /**
     * Updates shader uniforms to provide visual feedback for controller
     * interactions, such as hover and selection highlights. This method is
     * optimized to only update uniforms when the state changes.
     */
    private _updateInteractionFeedback;
}

import {Panel} from '../core/Panel';
import {PanelOptions} from '../core/PanelOptions';

/**
 * A fundamental UI container that lets you display app content in a
 * 3D space. It can be thought of as a "window" or "surface" in XR. It provides
 * visual feedback for user interactions like hovering and selecting, driven by
 * a custom shader, and can be made draggable.
 */
export type SpatialPanelOptions = PanelOptions&{
  showEdge?: boolean;
  dragFacingCamera?: boolean;
};

export class SpatialPanel extends Panel {
  /**
   * Keeps the panel facing the camera as it is dragged.
   */
  dragFacingCamera = true;

  /**
   * Creates an instance of SpatialPanel.
   */
  constructor(options: SpatialPanelOptions = {}) {
    options.draggable = options.draggable ?? true;
    options.dragFacingCamera = options.dragFacingCamera ?? true;
    super(options);
    // Reset the following fields with our own defaults.
    this.draggable = options.draggable ?? this.draggable;
    this.dragFacingCamera = options.dragFacingCamera ?? this.dragFacingCamera;
    this.mesh.material.visible = options.showEdge !== false;
  }

  update() {
    super.update();
    this._updateInteractionFeedback();
  }

  /**
   * Updates shader uniforms to provide visual feedback for controller
   * interactions, such as hover and selection highlights. This method is
   * optimized to only update uniforms when the state changes.
   */
  private _updateInteractionFeedback() {
    if (this.useBorderlessShader || !this.showHighlights) {
      return;
    }
    const [id1, id2] = this.ux.getPrimaryTwoControllerIds();

    // --- Update Selection Uniform ---
    const isSelected1 = (id1 !== null) ? this.ux.selected[id1] : false;
    const isSelected2 = (id2 !== null) ? this.ux.selected[id2] : false;

    this.mesh.material.uniforms.uSelected.value.set(
        isSelected1 ? 1.0 : 0.0, isSelected2 ? 1.0 : 0.0);

    // --- Update Reticle UVs Uniform ---
    const u1 = (id1 !== null) ? this.ux.uvs[id1].x : -1;
    const v1 = (id1 !== null) ? this.ux.uvs[id1].y : -1;
    const u2 = (id2 !== null) ? this.ux.uvs[id2].x : -1;
    const v2 = (id2 !== null) ? this.ux.uvs[id2].y : -1;

    this.mesh.material.uniforms.uReticleUVs.value.set(u1, v1, u2, v2);
  }
}

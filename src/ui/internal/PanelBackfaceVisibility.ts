import * as THREE from 'three';

/**
 * Marks a panel's front layer (the main `UnifiedPanelLayer`) so it can be
 * skipped while the camera is behind the panel, where it is backface-culled.
 * See `GradientPanel`.
 */
export const PANEL_FRONT_MARKER = 'xrblocksPanelFront';

/**
 * Marks a panel back-face layer (rendered with `THREE.BackSide`) so it can be
 * skipped while the camera is in front of the panel, where it is
 * backface-culled. See `GradientPanel`.
 */
export const PANEL_BACKFACE_MARKER = 'xrblocksPanelBackface';

/**
 * Whether the camera is on the side of the panel's front face (the side its
 * local +z normal points toward).
 *
 * This matches three's culling exactly: a `FrontSide` plane draws when the
 * camera faces its normal and a `BackSide` plane draws when it does not,
 * including for mirrored (negative-determinant) `matrixWorld` — three flips
 * the rasterized front face to compensate for the mirrored winding.
 */
export function isCameraFacingPanelFront(
  panel: THREE.Object3D,
  camera: THREE.Object3D
): boolean {
  const panelMatrix = panel.matrixWorld.elements;
  const cameraMatrix = camera.matrixWorld.elements;
  // Unnormalized world normal (local +z through matrixWorld); only the sign
  // of the dot product matters. camera.matrixWorld is current each frame.
  const dx = cameraMatrix[12] - panelMatrix[12];
  const dy = cameraMatrix[13] - panelMatrix[13];
  const dz = cameraMatrix[14] - panelMatrix[14];
  return panelMatrix[8] * dx + panelMatrix[9] * dy + panelMatrix[10] * dz > 0;
}

/**
 * Skips panel face draw calls the camera cannot see: the front layer while
 * the camera is behind the panel and the back-face layer while it is in
 * front. The culled-at-raster side paints 0 px but still cost a draw call
 * per view; both sides draw as usual from their own side.
 */
export function updatePanelFaceVisibility(
  root: THREE.Object3D,
  camera: THREE.Object3D
): void {
  root.traverse((object) => {
    const userData = object.userData;
    if (userData[PANEL_BACKFACE_MARKER]) {
      object.visible = !isCameraFacingPanelFront(object, camera);
    } else if (userData[PANEL_FRONT_MARKER]) {
      object.visible = isCameraFacingPanelFront(object, camera);
    }
  });
}

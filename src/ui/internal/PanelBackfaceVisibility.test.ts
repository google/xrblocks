import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  isCameraFacingPanelFront,
  PANEL_BACKFACE_MARKER,
  updatePanelBackfaceVisibility,
} from './PanelBackfaceVisibility';

function makePanel(matrix: THREE.Matrix4): THREE.Object3D {
  const panel = new THREE.Object3D();
  panel.matrixWorld.copy(matrix);
  panel.userData[PANEL_BACKFACE_MARKER] = true;
  return panel;
}

function makeCamera(x: number, y: number, z: number): THREE.Object3D {
  const camera = new THREE.Object3D();
  camera.position.set(x, y, z);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('isCameraFacingPanelFront', () => {
  it('faces a +z panel from in front', () => {
    const panel = makePanel(new THREE.Matrix4());
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 0, 1))).toBe(true);
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 0, -1))).toBe(false);
  });

  it('follows a translated panel', () => {
    const panel = makePanel(new THREE.Matrix4().makeTranslation(0, 1.5, -1.2));
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 1.5, 0))).toBe(true);
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 1.5, -3))).toBe(false);
  });

  it('keeps the front side for mirrored (negative-determinant) panels', () => {
    // three flips the rasterized front face for negative determinants, so the
    // camera-facing side is still the local +z side.
    const panel = makePanel(new THREE.Matrix4().makeScale(1, -1, 1));
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 0, 1))).toBe(true);
    expect(isCameraFacingPanelFront(panel, makeCamera(0, 0, -1))).toBe(false);
  });

  it('treats an edge-on camera as not facing the front (safe default on)', () => {
    const panel = makePanel(new THREE.Matrix4());
    expect(isCameraFacingPanelFront(panel, makeCamera(2, 0, 0))).toBe(false);
  });
});

describe('updatePanelBackfaceVisibility', () => {
  it('hides marked layers only while the camera faces the panel front', () => {
    const root = new THREE.Object3D();
    const panel = makePanel(new THREE.Matrix4());
    root.add(panel);

    updatePanelBackfaceVisibility(root, makeCamera(0, 0, 1));
    expect(panel.visible).toBe(false);

    updatePanelBackfaceVisibility(root, makeCamera(0, 0, -1));
    expect(panel.visible).toBe(true);
  });

  it('leaves unmarked meshes alone', () => {
    const root = new THREE.Object3D();
    const other = new THREE.Object3D();
    root.add(other);
    updatePanelBackfaceVisibility(root, makeCamera(0, 0, 1));
    expect(other.visible).toBe(true);
  });
});

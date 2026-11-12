import * as THREE from 'three';
import {expect, it} from 'vitest';
import {
  PANEL_BACKFACE_MARKER,
  updatePanelBackfaceVisibility,
} from './PanelBackfaceVisibility';

it('changes only marked backfaces as the camera crosses transformed or mirrored panels', () => {
  for (const scale of [1, -1]) {
    const root = new THREE.Group();
    const panel = new THREE.Object3D();
    const other = new THREE.Object3D();
    panel.position.set(0.3, 1.2, -2);
    panel.scale.y = scale;
    panel.rotation.y = Math.PI / 2;
    panel.userData[PANEL_BACKFACE_MARKER] = true;
    root.add(panel, other);
    root.updateMatrixWorld(true);
    const camera = new THREE.Object3D();
    camera.position.set(1.3, 1.2, -2);
    camera.updateMatrixWorld(true);
    updatePanelBackfaceVisibility(root, camera);
    expect(panel.visible).toBe(false);
    camera.position.x = -0.7;
    camera.updateMatrixWorld(true);
    updatePanelBackfaceVisibility(root, camera);
    expect(panel.visible).toBe(true);
    expect(other.visible).toBe(true);
  }
});

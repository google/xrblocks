import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {UnifiedPanelLayer} from './UnifiedPanelLayer';

it('supplies transformed ancestor clipping to a custom WebGL panel', async () => {
  const mount = new THREE.Group();
  mount.position.set(0.3, 1.2, -2);
  mount.rotation.y = 0.4;
  mount.scale.setScalar(0.7);
  const viewport = new Container({
    width: 200,
    height: 100,
    pixelSize: 0.01,
    overflow: 'hidden',
  });
  const panel = new UnifiedPanelLayer({
    width: 300,
    height: 300,
    fillColor: '#ffffff',
  });
  mount.add(viewport);
  viewport.add(panel);
  try {
    await vi.waitFor(() => {
      viewport.update(16);
      expect(viewport.size.peek()).toEqual([200, 100]);
    });
    mount.updateMatrixWorld(true);
    // Renderer-facing clipping data; rendered pixels need a browser check.
    const inside = (x: number, y: number) => {
      const point = new THREE.Vector3(x, y, 0).applyMatrix4(mount.matrixWorld);
      if (!(panel.material as THREE.ShaderMaterial).clipping) return true;
      return (
        panel.material.clippingPlanes?.every(
          (plane) => plane.distanceToPoint(point) >= 0
        ) ?? true
      );
    };
    expect(inside(0, 0)).toBe(true);
    expect(inside(1.1, 0)).toBe(false);
    expect(inside(0, -0.6)).toBe(false);
  } finally {
    panel.dispose();
    panel.material.dispose();
    viewport.dispose();
  }
});

import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {panelLayers, StencilMaterial} from './PanelLayerRegistry';

function panel(z: number): {
  root: THREE.Object3D;
  slab: THREE.Mesh;
  content: THREE.Mesh;
} {
  const root = new THREE.Object3D();
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial()
  );
  const content = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial()
  );
  root.add(slab, content);
  root.position.set(0, 0, z);
  return {root, slab, content};
}

function stampsOf(container: THREE.Object3D): THREE.Mesh[] {
  return container.children.filter(
    (child) => child.name === 'PanelLayerStamp'
  ) as THREE.Mesh[];
}

function stampOf(container: THREE.Object3D, source: THREE.Mesh): THREE.Mesh {
  const stamp = stampsOf(container).find(
    (mesh) => mesh.geometry === source.geometry
  );
  expect(stamp).toBeDefined();
  return stamp!;
}

function shellOf(
  container: THREE.Object3D,
  kind: 'PanelLayerMask' | 'PanelLayerTint'
): THREE.Mesh {
  const mesh = container.children.find((child) => child.name === kind) as
    | THREE.Mesh
    | undefined;
  expect(mesh).toBeDefined();
  return mesh!;
}

describe('PanelLayerRegistry', () => {
  it('stacks panels by slab depth, front-most at level 1', () => {
    const back = panel(-1.2);
    const front = panel(-1.1);
    panelLayers.register(back.root, back.root);
    panelLayers.register(front.root, front.root);
    try {
      panelLayers.update();
      expect(panelLayers.getLevel(front.root)).toBe(1);
      expect(panelLayers.getLevel(back.root)).toBe(2);
      // The back content must stamp first so the front-most level survives
      // the stencil replace.
      expect(stampOf(back.root, back.content).renderOrder).toBeLessThan(
        stampOf(front.root, front.content).renderOrder
      );
      // The back-most slab must stamp last so it survives in the high nibble.
      expect(shellOf(front.root, 'PanelLayerMask').renderOrder).toBeLessThan(
        shellOf(back.root, 'PanelLayerMask').renderOrder
      );
    } finally {
      panelLayers.unregister(back.root);
      panelLayers.unregister(front.root);
    }
  });

  it('splits the stencil byte: content in the low nibble, slabs in the high', () => {
    const p = panel(-1.1);
    panelLayers.register(p.root, p.root);
    try {
      panelLayers.update();
      const stamp = stampOf(p.root, p.content).material as StencilMaterial;
      expect(stamp.stencilWriteMask).toBe(0x0f);
      expect(stamp.stencilRef).toBe(1);
      const mask = shellOf(p.root, 'PanelLayerMask')
        .material as StencilMaterial;
      expect(mask.stencilWriteMask).toBe(0xf0);
      expect(mask.stencilRef).toBe(0x10);
      const tint = shellOf(p.root, 'PanelLayerTint')
        .material as StencilMaterial;
      expect(tint.stencilWriteMask).toBe(0);
      expect(tint.stencilRef).toBe(0x20);
    } finally {
      panelLayers.unregister(p.root);
    }
  });

  it('stamps solid content but not the glass shell', () => {
    const p = panel(-1.1);
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial()
    );
    edge.name = 'UICardEdge';
    const layer = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial()
    );
    layer.name = 'UnifiedPanelLayer';
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial()
    );
    glow.name = 'TextGlow';
    p.root.add(edge, layer, glow);
    panelLayers.register(p.root, p.root);
    try {
      panelLayers.update();
      expect(stampsOf(p.root).map((mesh) => mesh.geometry)).toEqual([
        p.content.geometry,
      ]);
      expect(panelLayers.isGlassShell(p.root, p.slab)).toBe(true);
      expect(panelLayers.isGlassShell(p.root, edge)).toBe(true);
      expect(panelLayers.isGlassShell(p.root, p.content)).toBe(false);
    } finally {
      panelLayers.unregister(p.root);
    }
  });

  it('re-levels on movement and pushes levels into layering materials', () => {
    const a = panel(-1.1);
    const b = panel(-1.2);
    const shell = a.slab.material as THREE.MeshBasicMaterial;
    shell.stencilWrite = true;
    shell.stencilWriteMask = 0;
    const content = a.content.material as THREE.MeshBasicMaterial;
    content.stencilWrite = true;
    content.stencilWriteMask = 0;
    panelLayers.register(a.root, a.root);
    panelLayers.register(b.root, b.root);
    try {
      panelLayers.update();
      expect(panelLayers.getLevel(a.root)).toBe(1);
      expect(content.stencilRef).toBe(1);
      expect(shell.stencilRef).toBe(0x10);
      a.root.position.z = -1.5;
      panelLayers.update();
      expect(panelLayers.getLevel(a.root)).toBe(2);
      expect(content.stencilRef).toBe(2);
      expect(shell.stencilRef).toBe(0x20);
      const stamp = stampOf(a.root, a.content).material as StencilMaterial;
      expect(stamp.stencilRef).toBe(2);
      const mask = shellOf(a.root, 'PanelLayerMask')
        .material as StencilMaterial;
      expect(mask.stencilRef).toBe(0x20);
    } finally {
      panelLayers.unregister(a.root);
      panelLayers.unregister(b.root);
    }
  });

  it('keeps each stamp mirroring its source transform', () => {
    const container = new THREE.Object3D();
    const p = panel(-1.1);
    p.content.position.set(0.25, 0, 0.01);
    container.add(p.root);
    container.position.set(5, 0, 0);
    panelLayers.register(container, p.root);
    try {
      panelLayers.update();
      const stamp = stampOf(container, p.content);
      const world = stamp.getWorldPosition(new THREE.Vector3());
      expect(world.x).toBeCloseTo(5.25);
      expect(world.z).toBeCloseTo(-1.09);
      const mask = shellOf(container, 'PanelLayerMask');
      expect(mask.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(5);
    } finally {
      panelLayers.unregister(p.root);
    }
  });

  it('prunes stamps for content that disappears', () => {
    const p = panel(-1.1);
    panelLayers.register(p.root, p.root);
    panelLayers.update();
    expect(stampsOf(p.root)).toHaveLength(1);
    p.content.removeFromParent();
    panelLayers.update();
    expect(stampsOf(p.root)).toHaveLength(0);
    panelLayers.unregister(p.root);
  });

  it('unregisters the stamps with the panel', () => {
    const p = panel(-1.1);
    panelLayers.register(p.root, p.root);
    panelLayers.update();
    expect(stampsOf(p.root)).toHaveLength(1);
    panelLayers.unregister(p.root);
    expect(panelLayers.has(p.root)).toBe(false);
    expect(stampsOf(p.root)).toHaveLength(0);
    expect(
      p.root.children.filter((child) => child.name === 'PanelLayerMask')
    ).toHaveLength(0);
  });

  it('treats unregistered objects as level 1 without stamps', () => {
    const stranger = new THREE.Object3D();
    expect(panelLayers.has(stranger)).toBe(false);
    expect(panelLayers.getLevel(stranger)).toBe(1);
  });
});

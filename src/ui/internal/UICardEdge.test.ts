import * as THREE from 'three';
import {expect, it, vi} from 'vitest';
import {UICardEdge} from './UICardEdge';

it('routes a transformed card band to translation or corner resize and rejects its interior', () => {
  const edge = new UICardEdge({
    margin: 50,
    cardCornerRadius: 24,
    resizable: true,
  });
  edge.size.value = [500, 300];
  edge.position.set(0.3, 1.2, -2);
  edge.rotation.set(0.2, 0.4, 0);
  edge.scale.setScalar(0.7);
  edge.updateMatrixWorld(true);
  const point = (x: number, y: number) =>
    edge.localToWorld(new THREE.Vector3(x / 500, y / 300, 0));
  try {
    expect(edge.containsPoint(point(0, 140))).toBe(true);
    expect(edge.touchTarget(point(0, 140))).toBeUndefined();
    expect(edge.containsPoint(point(248, 148))).toBe(true);
    expect(edge.touchTarget(point(248, 148))).toBe(edge.resizeHandle);
    expect(edge.containsPoint(point(0, 0))).toBe(false);
    expect(edge.containsPoint(point(252, 148))).toBe(false);
    expect(edge.touchTarget(point(252, 148))).toBeUndefined();
  } finally {
    edge.dispose();
  }
});

it('keeps a nonresizable corner available for translation', () => {
  const edge = new UICardEdge({
    margin: 50,
    cardCornerRadius: 24,
    resizable: false,
  });
  edge.size.value = [500, 300];
  const corner = new THREE.Vector3(-248 / 500, 148 / 300, 0);
  try {
    expect(edge.containsPoint(corner)).toBe(true);
    expect(edge.touchTarget(corner)).toBeUndefined();
  } finally {
    edge.dispose();
  }
});

it('releases its owned material and detaches from the scene', () => {
  const edge = new UICardEdge();
  new THREE.Group().add(edge);
  const disposed = vi.fn();
  edge.material.addEventListener('dispose', disposed);
  edge.dispose();
  expect(edge.parent).toBeNull();
  expect(disposed).toHaveBeenCalledOnce();
});

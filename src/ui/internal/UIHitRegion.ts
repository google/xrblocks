import type {Component} from '@pmndrs/uikit';
import * as THREE from 'three';

const CLIP_PLANE_EPSILON = 1e-9;
const MIN_AREA_VECTOR_LENGTH_SQ = 1e-20;

/** Shares mounted clipping geometry between ray hits, touch, and scene context. */
export class UIHitRegion {
  constructor(private readonly node: Component) {}

  containsPoint = (point: THREE.Vector3, padding = 0): boolean => {
    const node = this.node;
    if (!this.available()) return false;
    node.updateWorldMatrix(true, false);
    if (Math.abs(node.matrixWorld.determinant()) < Number.EPSILON) return false;
    const local = node.worldToLocal(point.clone());
    const xScale = new THREE.Vector3()
      .setFromMatrixColumn(node.matrixWorld, 0)
      .length();
    const yScale = new THREE.Vector3()
      .setFromMatrixColumn(node.matrixWorld, 1)
      .length();
    if (
      Math.abs(local.x) > 0.5 + padding / xScale ||
      Math.abs(local.y) > 0.5 + padding / yScale
    ) {
      return false;
    }
    const global = point.clone().applyMatrix4(this.globalToWorld().invert());
    return this.planes().every(
      (plane) => plane.distanceToPoint(global) >= -CLIP_PLANE_EPSILON
    );
  };

  bounds = (target: THREE.Box3): THREE.Box3 | null => {
    if (!this.available()) return null;
    const panel = this.node.globalPanelMatrix.peek();
    if (!panel) return null;
    let polygon = [
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
    ].map((point) => point.applyMatrix4(panel));
    for (const plane of this.planes()) polygon = clipPolygon(polygon, plane);
    if (polygon.length < 3) return null;
    const area = new THREE.Vector3();
    for (let i = 1; i + 1 < polygon.length; i++) {
      area.add(
        polygon[i]
          .clone()
          .sub(polygon[0])
          .cross(polygon[i + 1].clone().sub(polygon[0]))
      );
    }
    if (area.lengthSq() < MIN_AREA_VECTOR_LENGTH_SQ) return null;
    const matrix = this.globalToWorld();
    target.makeEmpty();
    for (const point of polygon)
      target.expandByPoint(point.applyMatrix4(matrix));
    return target;
  };

  private available(): boolean {
    const size = this.node.size.peek();
    return Boolean(
      this.node.visible &&
        this.node.displayed.peek() &&
        !this.node.isClipped.peek() &&
        size &&
        size[0] > 0 &&
        size[1] > 0
    );
  }

  private planes(): readonly THREE.Plane[] {
    return this.node.parentContainer.peek()?.clippingRect.peek()?.planes ?? [];
  }

  private globalToWorld(): THREE.Matrix4 {
    const root = this.node.root.peek().component;
    root.parent?.updateWorldMatrix(true, false);
    root.updateMatrix();
    const matrix = root.matrix.clone();
    if (root.parent) matrix.premultiply(root.parent.matrixWorld);
    return matrix;
  }
}

function clipPolygon(
  polygon: THREE.Vector3[],
  plane: THREE.Plane
): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const da = plane.distanceToPoint(a);
    const db = plane.distanceToPoint(b);
    if (da >= 0) result.push(a);
    if (da < 0 !== db < 0) {
      result.push(a.clone().lerp(b, da / (da - db)));
    }
  }
  return result;
}

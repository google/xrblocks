/**
 * Numbered annotation pins placed on the photo-depth mesh: a small dot on
 * the surface, a short stem along the surface normal and a number label that
 * always faces the viewer. Pins live in world space, so they stay put across
 * re-captures and scale changes.
 */
import * as THREE from 'three';

const DOT_RADIUS = 0.012;
const STEM_LENGTH = 0.08;
const LABEL_SIZE = 0.06;
const PIN_COLOR = '#ffb300';

/**
 * Where a pin goes for a ray hit on a mesh: the hit point and the world
 * surface normal, turned to face the ray's origin (the mesh is double sided,
 * so the face winding alone does not say which side the user is on).
 */
export function pinPlacement(intersection, ray) {
  const normal = intersection.face
    ? intersection.face.normal
        .clone()
        .transformDirection(intersection.object.matrixWorld)
    : ray.direction.clone().negate();
  if (normal.dot(ray.direction) > 0) normal.negate();
  return {point: intersection.point.clone(), normal};
}

/** Ray hits on `mesh`, even though its own `raycast` is disabled. */
export function raycastMesh(mesh, raycaster) {
  const hits = [];
  THREE.Mesh.prototype.raycast.call(mesh, raycaster, hits);
  return hits.sort((a, b) => a.distance - b.distance);
}

function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PIN_COLOR;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Pins extends THREE.Group {
  dotGeometry = new THREE.SphereGeometry(DOT_RADIUS, 16, 12);
  pinMaterial = new THREE.MeshBasicMaterial({color: PIN_COLOR});
  nextNumber = 1;

  get count() {
    return this.children.length;
  }

  /** Adds pin number {@link nextNumber} at `point` along `normal`. */
  addPin(point, normal) {
    const pin = new THREE.Group();
    pin.name = `Pin ${this.nextNumber}`;
    const dot = new THREE.Mesh(this.dotGeometry, this.pinMaterial);
    dot.position.copy(point);
    const top = point.clone().addScaledVector(normal, STEM_LENGTH);
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([point, top]),
      new THREE.LineBasicMaterial({color: PIN_COLOR})
    );
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture(String(this.nextNumber)),
        depthTest: false,
      })
    );
    label.position.copy(top).addScaledVector(normal, LABEL_SIZE / 2);
    label.scale.setScalar(LABEL_SIZE);
    label.renderOrder = 10;
    for (const part of [dot, stem, label]) {
      part.raycast = () => {};
      pin.add(part);
    }
    this.add(pin);
    this.nextNumber++;
    return pin;
  }

  clear() {
    for (const pin of [...this.children]) {
      pin.removeFromParent();
      for (const part of pin.children) {
        if (part.isLine) {
          part.geometry.dispose();
          part.material.dispose();
        } else if (part.isSprite) {
          part.material.map.dispose();
          part.material.dispose();
        }
      }
    }
    this.nextNumber = 1;
  }

  dispose() {
    this.clear();
    this.dotGeometry.dispose();
    this.pinMaterial.dispose();
  }
}

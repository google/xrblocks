import * as THREE from 'three';

import {ManipulationAction} from '../../interaction/manipulation/ManipulationTypes';

const CORNER_RADIUS = 0.03;
const SEGMENTS = 5;
const MAX_OPACITY = 0.5;
const FADE_SPEED = 2;

/** Private visual and translation surface owned by ModelViewer. */
export class ModelViewerPlatform extends THREE.Mesh<
  THREE.ExtrudeGeometry,
  THREE.MeshLambertMaterial[]
> {
  private opacity = 0;
  private targetOpacity = 0;

  constructor(width: number, depth: number, thickness: number) {
    const faceMaterial = createMaterial();
    const sideMaterial = createMaterial();
    super(createPlatformGeometry(width, depth, thickness), [
      faceMaterial,
      sideMaterial,
    ]);
    this.xb = {
      manipulationHandle: {action: ManipulationAction.Translate},
    };
    this.userData.xrblocksPrivate = true;
  }

  setHovered(hovered: boolean): void {
    this.targetOpacity = hovered ? MAX_OPACITY : 0;
  }

  update(deltaSeconds: number): void {
    const difference = this.targetOpacity - this.opacity;
    const step = Math.min(Math.abs(difference), FADE_SPEED * deltaSeconds);
    this.opacity += Math.sign(difference) * step;

    const [faceMaterial, sideMaterial] = this.material;
    faceMaterial.opacity = 0.5 * this.opacity;
    sideMaterial.opacity = this.opacity;
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    for (const material of this.material) material.dispose();
  }
}

function createMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
  });
}

/** Builds the existing rounded slab look with Three.js geometry primitives. */
function createPlatformGeometry(
  width: number,
  depth: number,
  thickness: number
): THREE.ExtrudeGeometry {
  const bevel = thickness / 2;
  const shapeWidth = Math.max(width - 2 * bevel, bevel);
  const shapeDepth = Math.max(depth - 2 * bevel, bevel);
  const radius = Math.max(
    0,
    Math.min(CORNER_RADIUS - bevel, shapeWidth / 2, shapeDepth / 2)
  );
  const geometry = new THREE.ExtrudeGeometry(
    createRoundedRectangle(shapeWidth, shapeDepth, radius),
    {
      depth: 0,
      steps: 1,
      curveSegments: SEGMENTS,
      bevelEnabled: true,
      bevelSegments: SEGMENTS,
      bevelSize: bevel,
      bevelThickness: bevel,
    }
  );
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  return geometry;
}

function createRoundedRectangle(
  width: number,
  height: number,
  radius: number
): THREE.Shape {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const shape = new THREE.Shape();

  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

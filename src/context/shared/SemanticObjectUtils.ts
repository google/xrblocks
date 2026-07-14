import * as THREE from 'three';

import {XRSystems} from '../../core/components/XRSystems';
import {DepthMesh} from '../../depth/DepthMesh';

type BoundsObject = THREE.Object3D & {
  isUI?: boolean;
  baseSizeX?: number;
  baseSizeY?: number;
};

const boundsBox = new THREE.Box3();
const boundsCorner = new THREE.Vector3();

export function isSemanticInternalObject(object: THREE.Object3D): boolean {
  if (isInternalRoot(object)) {
    return true;
  }

  let parent = object.parent;
  while (parent) {
    if (isInternalRoot(parent)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

export function isObjectVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function hasRenderableDescendant(object: THREE.Object3D): boolean {
  const stack = [...object.children];
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (isSemanticInternalObject(child)) {
      continue;
    }
    if (child instanceof THREE.Mesh) {
      return true;
    }
    stack.push(...child.children);
  }
  return false;
}

export function isDescendantOf(
  object: THREE.Object3D,
  ancestor: THREE.Object3D
): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function getObjectBounds(
  object: THREE.Object3D,
  target?: THREE.Box3
): THREE.Box3 | null {
  const uiBounds = getUIObjectBounds(object, target);
  if (uiBounds) {
    return uiBounds;
  }

  try {
    boundsBox.setFromObject(object);
  } catch (_error) {
    return null;
  }
  if (boundsBox.isEmpty()) {
    return null;
  }
  return target ? target.copy(boundsBox) : boundsBox.clone();
}

function isInternalRoot(object: THREE.Object3D): boolean {
  return (
    object instanceof XRSystems ||
    object instanceof DepthMesh ||
    (object.constructor as typeof DepthMesh).isDepthMesh === true
  );
}

function getUIObjectBounds(
  object: THREE.Object3D,
  target?: THREE.Box3
): THREE.Box3 | null {
  const uiObject = object as BoundsObject;
  if (
    uiObject.isUI !== true ||
    typeof uiObject.baseSizeX !== 'number' ||
    typeof uiObject.baseSizeY !== 'number'
  ) {
    return null;
  }

  object.updateMatrixWorld(true);
  const halfWidth = uiObject.baseSizeX / 2;
  const halfHeight = uiObject.baseSizeY / 2;
  boundsBox.makeEmpty();

  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [-halfHeight, halfHeight]) {
      boundsCorner.set(x, y, 0).applyMatrix4(object.matrixWorld);
      boundsBox.expandByPoint(boundsCorner);
    }
  }

  return target ? target.copy(boundsBox) : boundsBox.clone();
}

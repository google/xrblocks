import * as THREE from 'three';

import {XRSystems} from '../../core/components/XRSystems';
import {DepthMesh} from '../../depth/DepthMesh';
import {getUIPresentationObject} from '../../ui/UIElement';
import {UICard, getResolvedUICardSize} from '../../ui/components/UICard';

type BoundsObject = THREE.Object3D & {
  isUI?: boolean;
  size?: {width?: number; height?: number};
};

const boundsBox = new THREE.Box3();
const boundsCorner = new THREE.Vector3();

export function isSemanticInternalObject(object: THREE.Object3D): boolean {
  if (object.userData.xrblocksPrivateSelf === true || isInternalRoot(object)) {
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
    if (child.userData.xrblocksPrivateSelf === true) {
      stack.push(...child.children);
      continue;
    }
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
  const presentation = getUIPresentationObject(object);
  if (presentation) {
    const presentationBounds = getThreeObjectBounds(presentation, target);
    if (presentationBounds) {
      return presentationBounds;
    }
  }

  const uiBounds = getUIObjectBounds(object, target);
  if (uiBounds) {
    return uiBounds;
  }

  return getThreeObjectBounds(object, target);
}

function getThreeObjectBounds(
  object: THREE.Object3D,
  target?: THREE.Box3
): THREE.Box3 | null {
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
    object.userData.xrblocksPrivate === true ||
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
  const resolvedCardSize =
    object instanceof UICard ? getResolvedUICardSize(object) : undefined;
  const size = resolvedCardSize ?? uiObject.size;
  if (
    uiObject.isUI !== true ||
    typeof size?.width !== 'number' ||
    typeof size.height !== 'number'
  ) {
    return null;
  }

  object.updateMatrixWorld(true);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  boundsBox.makeEmpty();

  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [-halfHeight, halfHeight]) {
      boundsCorner.set(x, y, 0).applyMatrix4(object.matrixWorld);
      boundsBox.expandByPoint(boundsCorner);
    }
  }

  return target ? target.copy(boundsBox) : boundsBox.clone();
}

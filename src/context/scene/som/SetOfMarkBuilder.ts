import * as THREE from 'three';

import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {getObjectBounds} from '../../shared/SemanticObjectUtils';
import {
  SetOfMark,
  SetOfMarkContext,
  VisibleObjectsContext,
} from '../../shared/SemanticTypes';

const tempCenter = new THREE.Vector3();
const tempBoundsBox = new THREE.Box3();
const tempProjection = new THREE.Vector3();

export async function createSetOfMarkContext({
  tree,
  image,
  nodeObjects,
  registry,
  projectionMatrix,
  matrixWorldInverse,
}: {
  tree: VisibleObjectsContext;
  image: string;
  nodeObjects: Map<string, THREE.Object3D>;
  registry: SemanticIdRegistry;
  projectionMatrix: THREE.Matrix4;
  matrixWorldInverse: THREE.Matrix4;
}): Promise<SetOfMarkContext> {
  const marks: SetOfMark[] = [];
  for (const node of Object.values(tree.nodes)) {
    if (!node.view?.inLineOfSight) {
      continue;
    }
    const object = nodeObjects.get(node.id);
    if (!object) {
      continue;
    }
    const screenPosition = projectObjectCenter(
      object,
      projectionMatrix,
      matrixWorldInverse
    );
    if (!screenPosition) {
      continue;
    }
    marks.push({
      label: registry.getMarkLabel(object),
      nodeId: node.id,
      role: node.role,
      name: node.name,
      x: screenPosition.x,
      y: screenPosition.y,
    });
  }

  return {
    snapshotId: tree.snapshotId,
    capturedAt: tree.capturedAt,
    image: await renderSetOfMarkImage(image, marks),
    marks,
  };
}

function projectObjectCenter(
  object: THREE.Object3D,
  projectionMatrix: THREE.Matrix4,
  matrixWorldInverse: THREE.Matrix4
) {
  const box = getObjectBounds(object, tempBoundsBox);
  if (box) {
    box.getCenter(tempCenter);
  } else {
    object.getWorldPosition(tempCenter);
  }

  const projected = tempProjection
    .copy(tempCenter)
    .applyMatrix4(matrixWorldInverse)
    .applyMatrix4(projectionMatrix);
  if (
    projected.x < -1 ||
    projected.x > 1 ||
    projected.y < -1 ||
    projected.y > 1 ||
    projected.z < -1 ||
    projected.z > 1
  ) {
    return null;
  }
  return {
    x: (projected.x + 1) / 2,
    y: (1 - projected.y) / 2,
  };
}

async function renderSetOfMarkImage(
  image: string,
  marks: SetOfMark[]
): Promise<string> {
  if (typeof document === 'undefined' || !image || marks.length === 0) {
    return image;
  }

  const img = new Image();
  img.src = image;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SOM screenshot.'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return image;
  }
  ctx.drawImage(img, 0, 0);

  for (const mark of marks) {
    const x = mark.x * canvas.width;
    const y = mark.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0055';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark.label, x, y);
  }

  return canvas.toDataURL('image/png');
}

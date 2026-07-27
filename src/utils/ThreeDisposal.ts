import * as THREE from 'three';

type DisposableObject = THREE.Object3D & {dispose?: () => void};
type RenderableObject = THREE.Object3D & {
  geometry?: {dispose?: () => void};
  material?: THREE.Material | THREE.Material[];
};

export function disposeMaterial(
  material: THREE.Material | THREE.Material[] | undefined,
  except = new Set<THREE.Material>()
) {
  if (!material) {
    return;
  }
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (!except.has(item)) {
      item.dispose();
    }
  }
}

export function disposeMeshResources(mesh: THREE.Mesh) {
  disposeRenderableResources(mesh);
}

export function disposeRenderableResources(object: THREE.Object3D) {
  const renderable = object as RenderableObject;
  renderable.geometry?.dispose?.();
  disposeMaterial(renderable.material);
}

function hasRenderableResources(
  object: THREE.Object3D
): object is RenderableObject {
  const renderable = object as RenderableObject;
  return !!(renderable.geometry || renderable.material);
}

export function disposeObjectTree(object: THREE.Object3D) {
  for (const child of [...object.children]) {
    disposeObjectTree(child);
    object.remove(child);
  }

  if (hasRenderableResources(object)) {
    disposeRenderableResources(object);
  }

  const disposable = object as DisposableObject;
  disposable.dispose?.();
}

export function disposeObjectChildren(object: THREE.Object3D) {
  for (const child of [...object.children]) {
    disposeObjectTree(child);
    object.remove(child);
  }
}

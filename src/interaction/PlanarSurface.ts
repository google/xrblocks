import * as THREE from 'three';

export interface SurfaceProjection {
  readonly point: THREE.Vector3;
  readonly uv: THREE.Vector2;
}

export type PlanarSurfaceProjector = (
  ray: THREE.Ray
) => SurfaceProjection | undefined;

/** Captures a mesh's local XY plane for continued pointer projection. */
export function createPlanarSurfaceProjector(
  surface: THREE.Object3D
): PlanarSurfaceProjector | undefined {
  if (!(surface instanceof THREE.Mesh)) return undefined;
  surface.geometry.computeBoundingBox();
  const bounds = surface.geometry.boundingBox?.clone();
  if (!bounds || !hasFinitePlanarBounds(bounds)) return undefined;

  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const plane = new THREE.Plane(
    new THREE.Vector3(0, 0, 1),
    -(bounds.min.z + bounds.max.z) / 2
  );
  const worldToLocal = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const localPoint = new THREE.Vector3();

  return (ray) => {
    surface.updateWorldMatrix(true, false);
    if (Math.abs(surface.matrixWorld.determinant()) < Number.EPSILON) {
      return undefined;
    }
    worldToLocal.copy(surface.matrixWorld).invert();
    localRay.copy(ray).applyMatrix4(worldToLocal);
    if (!localRay.intersectPlane(plane, localPoint)) return undefined;

    return {
      point: localPoint.clone().applyMatrix4(surface.matrixWorld),
      uv: new THREE.Vector2(
        (localPoint.x - bounds.min.x) / width,
        (localPoint.y - bounds.min.y) / height
      ),
    };
  };
}

function hasFinitePlanarBounds(bounds: THREE.Box3): boolean {
  return (
    Number.isFinite(bounds.min.x) &&
    Number.isFinite(bounds.max.x) &&
    Number.isFinite(bounds.min.y) &&
    Number.isFinite(bounds.max.y) &&
    Number.isFinite(bounds.min.z) &&
    Number.isFinite(bounds.max.z) &&
    bounds.max.x > bounds.min.x &&
    bounds.max.y > bounds.min.y
  );
}

import * as THREE from 'three';

import {CachedGeometryRays} from './DepthMeshGeometry';

export interface DepthGridRaycastParams {
  targetObject: THREE.Object3D;
  geometry: THREE.BufferGeometry;
  meta: CachedGeometryRays;
  material: THREE.Material;
  matrixWorld: THREE.Matrix4;
  updateVertexNormals: boolean;
  raycaster: THREE.Raycaster;
  intersects: THREE.Intersection[];
}

/**
 * Performs a 2D projective grid walk over a rectilinear depth heightfield,
 * testing only the grid cells crossed by the projected 3D ray segment.
 */
export class DepthMeshRaycaster {
  private readonly inverseMatrix = new THREE.Matrix4();
  private readonly localRay = new THREE.Ray();
  private readonly vA = new THREE.Vector3();
  private readonly vB = new THREE.Vector3();
  private readonly vC = new THREE.Vector3();
  private readonly vD = new THREE.Vector3();
  private readonly intersectPoint = new THREE.Vector3();
  private readonly worldPoint = new THREE.Vector3();

  raycast(params: DepthGridRaycastParams) {
    const {
      targetObject,
      geometry,
      meta,
      material,
      matrixWorld,
      updateVertexNormals,
      raycaster,
      intersects,
    } = params;

    const startIndex = intersects.length;
    this.raycastRectilinearGrid(
      targetObject,
      geometry,
      meta.rayXY,
      meta.segments,
      meta.minVertexDepth,
      meta.maxVertexDepth,
      material,
      matrixWorld,
      updateVertexNormals,
      raycaster,
      intersects
    );
    if (intersects.length - startIndex > 1) {
      const added = intersects.splice(startIndex);
      added.sort((a, b) => (a.faceIndex ?? 0) - (b.faceIndex ?? 0));
      intersects.push(...added);
    }
  }

  private raycastRectilinearGrid(
    targetObject: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    rayXY: Float64Array,
    segments: number,
    minVertexDepth: number,
    maxVertexDepth: number,
    material: THREE.Material,
    matrixWorld: THREE.Matrix4,
    updateVertexNormals: boolean,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[]
  ) {
    this.inverseMatrix.copy(matrixWorld).invert();
    const localRay = this.localRay
      .copy(raycaster.ray)
      .applyMatrix4(this.inverseMatrix);

    const ox = localRay.origin.x;
    const oy = localRay.origin.y;
    const oz = localRay.origin.z;
    const dx = localRay.direction.x;
    const dy = localRay.direction.y;
    const dz = localRay.direction.z;

    const gridX1 = segments + 1;
    const lastIdx = 2 * (gridX1 * gridX1 - 1);
    const rx0 = rayXY[0];
    const ry0 = rayXY[1];
    const rx1 = rayXY[lastIdx];
    const ry1 = rayXY[lastIdx + 1];
    const rxMin = Math.min(rx0, rx1) - 1e-5;
    const rxMax = Math.max(rx0, rx1) + 1e-5;
    const ryMin = Math.min(ry0, ry1) - 1e-5;
    const ryMax = Math.max(ry0, ry1) + 1e-5;
    const zMin = Math.max(1e-4, minVertexDepth - 1e-4);
    const zMax = maxVertexDepth + 1e-4;

    let t0 = 0;
    let t1 = Infinity;
    const clipPlane = (a: number, b: number): boolean => {
      if (a > 1e-12) {
        const t = b / a;
        if (t < t1) t1 = t;
      } else if (a < -1e-12) {
        const t = b / a;
        if (t > t0) t0 = t;
      } else if (b < -1e-7) {
        return false;
      }
      return t0 <= t1;
    };

    if (
      !clipPlane(dz, -oz - zMin) ||
      !clipPlane(-dz, oz + zMax) ||
      !clipPlane(-(dx + dz * rxMin), ox + oz * rxMin) ||
      !clipPlane(dx + dz * rxMax, -(ox + oz * rxMax)) ||
      !clipPlane(-(dy + dz * ryMin), oy + oz * ryMin) ||
      !clipPlane(dy + dz * ryMax, -(oy + oz * ryMax)) ||
      !Number.isFinite(t1)
    ) {
      return;
    }

    const invNegZ0 = -1.0 / (oz + t0 * dz);
    const invNegZ1 = -1.0 / (oz + t1 * dz);
    const invRxSpan = segments / (rx1 - rx0);
    const invRySpan = segments / (ry1 - ry0);
    const c0 = ((ox + t0 * dx) * invNegZ0 - rx0) * invRxSpan;
    const r0 = ((oy + t0 * dy) * invNegZ0 - ry0) * invRySpan;
    const c1 = ((ox + t1 * dx) * invNegZ1 - rx0) * invRxSpan;
    const r1 = ((oy + t1 * dy) * invNegZ1 - ry0) * invRySpan;

    const dc = c1 - c0;
    const dr = r1 - r0;
    const maxCell = segments - 1;
    const posArray = geometry.attributes.position.array;
    const uvAttr = geometry.attributes.uv;
    const normalAttr = geometry.attributes.normal;

    if (Math.abs(dc) >= Math.abs(dr)) {
      const cMin = Math.min(c0, c1);
      const cMax = Math.max(c0, c1);
      const ixStart = Math.max(0, Math.min(maxCell, Math.floor(cMin - 1e-5)));
      const ixEnd = Math.max(0, Math.min(maxCell, Math.floor(cMax + 1e-5)));
      const slope = Math.abs(dc) > 1e-7 ? dr / dc : 0;
      for (let ix = ixStart; ix <= ixEnd; ++ix) {
        const segC0 = Math.max(cMin, Math.min(cMax, ix));
        const segC1 = Math.max(cMin, Math.min(cMax, ix + 1));
        const rAt0 = r0 + (segC0 - c0) * slope;
        const rAt1 = r0 + (segC1 - c0) * slope;
        const iyStart = Math.max(
          0,
          Math.min(maxCell, Math.floor(Math.min(rAt0, rAt1) - 1e-5))
        );
        const iyEnd = Math.max(
          0,
          Math.min(maxCell, Math.floor(Math.max(rAt0, rAt1) + 1e-5))
        );
        for (let iy = iyStart; iy <= iyEnd; ++iy) {
          this.testGridCell(
            targetObject,
            ix,
            iy,
            gridX1,
            segments,
            posArray,
            uvAttr,
            normalAttr,
            material,
            matrixWorld,
            updateVertexNormals,
            raycaster,
            intersects
          );
        }
      }
    } else {
      const rMin = Math.min(r0, r1);
      const rMax = Math.max(r0, r1);
      const iyStart = Math.max(0, Math.min(maxCell, Math.floor(rMin - 1e-5)));
      const iyEnd = Math.max(0, Math.min(maxCell, Math.floor(rMax + 1e-5)));
      const invSlope = Math.abs(dr) > 1e-7 ? dc / dr : 0;
      for (let iy = iyStart; iy <= iyEnd; ++iy) {
        const segR0 = Math.max(rMin, Math.min(rMax, iy));
        const segR1 = Math.max(rMin, Math.min(rMax, iy + 1));
        const cAt0 = c0 + (segR0 - r0) * invSlope;
        const cAt1 = c0 + (segR1 - r0) * invSlope;
        const ixStart = Math.max(
          0,
          Math.min(maxCell, Math.floor(Math.min(cAt0, cAt1) - 1e-5))
        );
        const ixEnd = Math.max(
          0,
          Math.min(maxCell, Math.floor(Math.max(cAt0, cAt1) + 1e-5))
        );
        for (let ix = ixStart; ix <= ixEnd; ++ix) {
          this.testGridCell(
            targetObject,
            ix,
            iy,
            gridX1,
            segments,
            posArray,
            uvAttr,
            normalAttr,
            material,
            matrixWorld,
            updateVertexNormals,
            raycaster,
            intersects
          );
        }
      }
    }
  }

  private testGridCell(
    targetObject: THREE.Object3D,
    ix: number,
    iy: number,
    gridX1: number,
    segments: number,
    posArray: THREE.TypedArray,
    uvAttr:
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined,
    normalAttr:
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined,
    material: THREE.Material,
    matrixWorld: THREE.Matrix4,
    updateVertexNormals: boolean,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[]
  ) {
    const a = ix + gridX1 * iy;
    const b = ix + gridX1 * (iy + 1);
    const c = ix + 1 + gridX1 * (iy + 1);
    const d = ix + 1 + gridX1 * iy;

    const a3 = 3 * a;
    const b3 = 3 * b;
    const c3 = 3 * c;
    const d3 = 3 * d;
    this.vA.set(posArray[a3], posArray[a3 + 1], posArray[a3 + 2]);
    this.vB.set(posArray[b3], posArray[b3 + 1], posArray[b3 + 2]);
    this.vC.set(posArray[c3], posArray[c3 + 1], posArray[c3 + 2]);
    this.vD.set(posArray[d3], posArray[d3 + 1], posArray[d3 + 2]);

    const baseFaceIndex = 2 * (ix + segments * iy);
    this.testGridTriangle(
      targetObject,
      a,
      b,
      d,
      this.vA,
      this.vB,
      this.vD,
      baseFaceIndex,
      uvAttr,
      normalAttr,
      material,
      matrixWorld,
      updateVertexNormals,
      raycaster,
      intersects
    );
    this.testGridTriangle(
      targetObject,
      b,
      c,
      d,
      this.vB,
      this.vC,
      this.vD,
      baseFaceIndex + 1,
      uvAttr,
      normalAttr,
      material,
      matrixWorld,
      updateVertexNormals,
      raycaster,
      intersects
    );
  }

  private testGridTriangle(
    targetObject: THREE.Object3D,
    idxA: number,
    idxB: number,
    idxC: number,
    vA: THREE.Vector3,
    vB: THREE.Vector3,
    vC: THREE.Vector3,
    faceIndex: number,
    uvAttr:
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined,
    normalAttr:
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined,
    material: THREE.Material,
    matrixWorld: THREE.Matrix4,
    updateVertexNormals: boolean,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[]
  ) {
    const localRay = this.localRay;
    const intersectPoint = this.intersectPoint;
    const hit =
      material.side === THREE.BackSide
        ? localRay.intersectTriangle(vC, vB, vA, true, intersectPoint)
        : localRay.intersectTriangle(
            vA,
            vB,
            vC,
            material.side === THREE.FrontSide,
            intersectPoint
          );
    if (hit === null) {
      return;
    }

    const worldPoint = this.worldPoint
      .copy(intersectPoint)
      .applyMatrix4(matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(worldPoint);
    if (distance < raycaster.near || distance > raycaster.far) {
      return;
    }

    const barycoord = new THREE.Vector3();
    THREE.Triangle.getBarycoord(intersectPoint, vA, vB, vC, barycoord);
    const faceNormal = THREE.Triangle.getNormal(
      vA,
      vB,
      vC,
      new THREE.Vector3()
    );
    const face: THREE.Face = {
      a: idxA,
      b: idxB,
      c: idxC,
      normal: faceNormal,
      materialIndex: 0,
    };

    let normal: THREE.Vector3 | undefined;
    if (normalAttr) {
      if (updateVertexNormals) {
        normal = THREE.Triangle.getInterpolatedAttribute(
          normalAttr,
          idxA,
          idxB,
          idxC,
          barycoord,
          new THREE.Vector3()
        );
        if (normal.dot(localRay.direction) > 0) {
          normal.multiplyScalar(-1);
        }
      } else {
        normal = faceNormal.clone();
      }
    }

    const intersection: THREE.Intersection = {
      distance,
      point: worldPoint.clone(),
      object: targetObject,
      face,
      faceIndex,
      barycoord,
    };
    if (uvAttr) {
      intersection.uv = THREE.Triangle.getInterpolatedAttribute(
        uvAttr,
        idxA,
        idxB,
        idxC,
        barycoord,
        new THREE.Vector2()
      );
    }
    if (normal) {
      intersection.normal = normal;
    }

    intersects.push(intersection);
  }
}

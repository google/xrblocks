import * as THREE from 'three';

import {clamp} from '../utils/utils';

export interface DepthGeometryUpdateParams {
  depthData: Readonly<XRCPUDepthInformation>;
  geometry: THREE.BufferGeometry;
  depthDataFormat: XRDepthDataFormat;
  projectionMatrixInverse: Readonly<THREE.Matrix4>;
  patchHoles: boolean;
  patchHolesUpper: boolean;
  minDepthPrev: number;
  maxDepthPrev: number;
  minDepth: number;
  maxDepth: number;
}

/**
 * Creates a PlaneGeometry with UVs remapped to the active depth sensor region.
 */
export function createDepthPlaneGeometry(
  segments: number,
  minU: number,
  maxU: number,
  minV: number,
  maxV: number
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
  const uvs = geometry.attributes.uv.array;
  const rangeU = maxU - minU;
  const rangeV = maxV - minV;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = minU + uvs[i] * rangeU;
    uvs[i + 1] = minV + uvs[i + 1] * rangeV;
  }
  return geometry;
}

/**
 * Computes smooth vertex normals directly on a regular (cols x rows) grid
 * using central differences, avoiding Three.js's indexed triangle accumulation.
 */
export function computeGridVertexNormals(
  geometry: THREE.BufferGeometry,
  cols: number,
  rows: number
) {
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!normAttr || posAttr.count !== cols * rows) {
    geometry.computeVertexNormals();
    return;
  }

  const pos = posAttr.array;
  const norm = normAttr.array;

  for (let row = 0; row < rows; ++row) {
    const rowUp = row > 0 ? row - 1 : 0;
    const rowDown = row < rows - 1 ? row + 1 : rows - 1;
    const rowOffset = row * cols;
    const upOffset = rowUp * cols;
    const downOffset = rowDown * cols;

    for (let col = 0; col < cols; ++col) {
      const colLeft = col > 0 ? col - 1 : 0;
      const colRight = col < cols - 1 ? col + 1 : cols - 1;

      const iLeft = (rowOffset + colLeft) * 3;
      const iRight = (rowOffset + colRight) * 3;
      const iUp = (upOffset + col) * 3;
      const iDown = (downOffset + col) * 3;

      const txX = pos[iRight] - pos[iLeft];
      const txY = pos[iRight + 1] - pos[iLeft + 1];
      const txZ = pos[iRight + 2] - pos[iLeft + 2];

      const tyX = pos[iUp] - pos[iDown];
      const tyY = pos[iUp + 1] - pos[iDown + 1];
      const tyZ = pos[iUp + 2] - pos[iDown + 2];

      const nx = txY * tyZ - txZ * tyY;
      const ny = txZ * tyX - txX * tyZ;
      const nz = txX * tyY - txY * tyX;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const iOut = (rowOffset + col) * 3;
      if (len > 0) {
        const invLen = 1.0 / len;
        norm[iOut] = nx * invLen;
        norm[iOut + 1] = ny * invLen;
        norm[iOut + 2] = nz * invLen;
      } else {
        norm[iOut] = 0;
        norm[iOut + 1] = 0;
        norm[iOut + 2] = 1;
      }
    }
  }

  normAttr.needsUpdate = true;
}

/**
 * Caches per-vertex camera unprojection rays and performs vectorized depth-mesh
 * vertex position updates.
 */
export class DepthGeometryUpdater {
  private readonly geometryRayCache = new WeakMap<
    THREE.BufferGeometry,
    {rayXY: Float64Array; projInvElements: Float64Array}
  >();
  private readonly scratchVertexPosition = new THREE.Vector3();

  getOrComputeUnprojectionRays(
    geometry: THREE.BufferGeometry,
    projectionMatrixInverse: Readonly<THREE.Matrix4>
  ): Float64Array {
    const vertexCount = geometry.attributes.position.count;
    const projElements = projectionMatrixInverse.elements;
    let cached = this.geometryRayCache.get(geometry);
    if (cached && cached.rayXY.length === 2 * vertexCount) {
      let unchanged = true;
      for (let k = 0; k < 16; ++k) {
        if (cached.projInvElements[k] !== projElements[k]) {
          unchanged = false;
          break;
        }
      }
      if (unchanged) {
        return cached.rayXY;
      }
    } else {
      cached = {
        rayXY: new Float64Array(2 * vertexCount),
        projInvElements: new Float64Array(16),
      };
      this.geometryRayCache.set(geometry, cached);
    }

    cached.projInvElements.set(projElements);
    const rayXY = cached.rayXY;
    const uvArray = geometry.attributes.uv.array;
    const vertexPosition = this.scratchVertexPosition;
    for (let i = 0; i < vertexCount; ++i) {
      const u = uvArray[2 * i];
      const v = uvArray[2 * i + 1];
      vertexPosition
        .set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1)
        .applyMatrix4(projectionMatrixInverse);
      const invNegZ = -1.0 / vertexPosition.z;
      rayXY[2 * i] = vertexPosition.x * invNegZ;
      rayXY[2 * i + 1] = vertexPosition.y * invNegZ;
    }
    return rayXY;
  }

  updateGeometryPositions(params: DepthGeometryUpdateParams): {
    minDepth: number;
    maxDepth: number;
  } {
    const {
      depthData,
      geometry,
      depthDataFormat,
      projectionMatrixInverse,
      patchHoles,
      patchHolesUpper,
      minDepthPrev,
      maxDepthPrev,
    } = params;
    let {minDepth, maxDepth} = params;

    const width = depthData.width;
    const height = depthData.height;
    const maxX = width - 1;
    const maxY = height - 1;
    const rawValueToMeters = depthData.rawValueToMeters;
    const depthArray =
      depthDataFormat === 'float32'
        ? new Float32Array(depthData.data)
        : new Uint16Array(depthData.data);

    const uvArray = geometry.attributes.uv.array;
    const posArray = geometry.attributes.position.array;
    const vertexCount = geometry.attributes.position.count;
    const rayXY = this.getOrComputeUnprojectionRays(
      geometry,
      projectionMatrixInverse
    );

    const transformMatrix = depthData.normDepthBufferFromNormView?.matrix;
    const hasTransform = Boolean(transformMatrix);
    let m0 = 1,
      m1 = 0,
      m3 = 0,
      m4 = 0,
      m5 = 1,
      m7 = 0,
      m12 = 0,
      m13 = 0,
      m15 = 1;
    let isAffineTransform = true;
    if (transformMatrix) {
      m0 = transformMatrix[0];
      m1 = transformMatrix[1];
      m3 = transformMatrix[3];
      m4 = transformMatrix[4];
      m5 = transformMatrix[5];
      m7 = transformMatrix[7];
      m12 = transformMatrix[12];
      m13 = transformMatrix[13];
      m15 = transformMatrix[15];
      isAffineTransform = m3 === 0 && m7 === 0 && m15 === 1;
    }

    for (let i = 0; i < vertexCount; ++i) {
      const uvIdx = 2 * i;
      const u = uvArray[uvIdx];
      const v = uvArray[uvIdx + 1];
      const vInv = 1.0 - v;

      let sampleU = u;
      let sampleV = vInv;

      if (hasTransform) {
        sampleU = m0 * u + m4 * vInv + m12;
        sampleV = m1 * u + m5 * vInv + m13;
        if (!isAffineTransform) {
          const invW = 1.0 / (m3 * u + m7 * vInv + m15);
          sampleU *= invW;
          sampleV *= invW;
        }
      }

      const depthX = Math.round(clamp(sampleU * maxX, 0, maxX));
      const depthY = Math.round(clamp(sampleV * maxY, 0, maxY));
      const rawDepth = depthArray[depthY * width + depthX];
      let depth = rawValueToMeters * rawDepth;

      if (depth > 0) {
        if (depth < minDepth) {
          minDepth = depth;
        } else if (depth > maxDepth) {
          maxDepth = depth;
        }
      }

      if (depth === 0 && patchHoles) {
        depth = maxDepthPrev;
      }

      if (patchHolesUpper && v > 0.9) {
        depth = minDepthPrev;
      }

      const posIdx = 3 * i;
      posArray[posIdx] = depth * rayXY[uvIdx];
      posArray[posIdx + 1] = depth * rayXY[uvIdx + 1];
      posArray[posIdx + 2] = -depth;
    }

    return {minDepth, maxDepth};
  }
}

import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const rigidWorldMatrix = new THREE.Matrix4();
const inverseRigidWorldMatrix = new THREE.Matrix4();
const relativeMatrix = new THREE.Matrix4();

/**
 * Merges the meshes below an object into geometry expressed relative to the
 * object's world-space rigid transform. Scale is baked into the vertices.
 */
export function mergeObjectGeometry(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  root.getWorldPosition(worldPosition);
  root.getWorldQuaternion(worldQuaternion);
  rigidWorldMatrix.compose(
    worldPosition,
    worldQuaternion,
    new THREE.Vector3(1, 1, 1)
  );
  inverseRigidWorldMatrix.copy(rigidWorldMatrix).invert();

  const geometries: THREE.BufferGeometry[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      mesh.geometry.attributes.position.clone()
    );
    if (mesh.geometry.index) {
      geometry.setIndex(mesh.geometry.index.clone());
    }
    relativeMatrix.multiplyMatrices(inverseRigidWorldMatrix, mesh.matrixWorld);
    geometry.applyMatrix4(relativeMatrix);
    geometries.push(geometry);
  });

  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;
  if (!merged.index) {
    const count = merged.attributes.position.count;
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  merged.computeVertexNormals();
  return merged;
}

export function geometryVertices(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const offset = i * 3;
    vertices[offset] = position.getX(i);
    vertices[offset + 1] = position.getY(i);
    vertices[offset + 2] = position.getZ(i);
  }
  return vertices;
}

export function geometryIndices(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  if (!index) return new Uint32Array();
  return new Uint32Array(index.array as ArrayLike<number>);
}

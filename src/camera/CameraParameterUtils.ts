import * as THREE from 'three';

export function intrinsicsToProjectionMatrix(
  K: number[],
  width: number,
  height: number,
  near: number,
  far: number,
  target = new THREE.Matrix4()
) {
  const fx = K[0];
  const fy = K[4];
  const cx = K[2];
  const cy = K[5];

  // Calculate the projection matrix elements
  // Note: Three.js set() takes row-major arguments (m00, m01, m02...)
  // but stores them column-major internally.

  const x = (2 * fx) / width;
  const y = (2 * fy) / height;

  // Principal point offsets
  // These map the center of the image (cx, cy) to the center of the viewport
  const a = 1 - (2 * cx) / width;
  const b = (2 * cy) / height - 1;

  const c = -(far + near) / (far - near);
  const d = -(2 * far * near) / (far - near);

  target.set(x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0);

  return target;
}

import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  MESH_MODES,
  applyMeshMode,
  buildDepthMesh,
  depthColor,
  createDepthMesh,
  depthTexture,
  photoTexture,
  turbo,
} from './depthmesh.js';
import {MOGE_SIZE, letterboxParams} from './moge.js';
import {PLANE} from './testScenes';

const K = {fx: 280, fy: 280, cx: 224, cy: 224};

function depthMapOf(depthAt: (px: number, py: number) => number) {
  const data = new Float32Array(PLANE);
  for (let py = 0; py < MOGE_SIZE; py++) {
    for (let px = 0; px < MOGE_SIZE; px++) {
      data[py * MOGE_SIZE + px] = depthAt(px, py);
    }
  }
  return {width: MOGE_SIZE, height: MOGE_SIZE, data, ...K};
}

/** Grid vertices per axis at a stride (pixels 0, s, 2s, ... below 448). */
const gridSize = (stride: number) => Math.floor((MOGE_SIZE - 1) / stride) + 1;

describe('turbo / depthColor', () => {
  it('runs from blue (near) to red (far)', () => {
    const [r0, , b0] = depthColor(0);
    const [r1, , b1] = depthColor(1);
    expect(b0).toBeGreaterThan(0.7);
    expect(b0).toBeGreaterThan(r0);
    expect(r1).toBeGreaterThan(b1);
    const [, gMid] = turbo(0.5);
    expect(gMid).toBeGreaterThan(0.8);
    for (const t of [-1, 0, 0.3, 0.7, 1, 2]) {
      for (const c of turbo(t)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('buildDepthMesh', () => {
  it('covers a wall with two triangles per grid cell', () => {
    for (const stride of [2, 4, 8]) {
      const geometry = buildDepthMesh(
        depthMapOf(() => 2),
        {stride}
      );
      const n = gridSize(stride);
      expect(geometry.userData.vertices).toBe(n * n);
      expect(geometry.userData.triangles).toBe(2 * (n - 1) * (n - 1));
      geometry.dispose();
    }
  });

  it('puts vertices on the camera rays and faces the camera', () => {
    const geometry = buildDepthMesh(
      depthMapOf(() => 2),
      {stride: 4}
    );
    const position = geometry.getAttribute('position');
    expect(position.getZ(0)).toBeCloseTo(-2, 6);
    // Pixel (0, 0) is up and to the left of the optical axis.
    expect(position.getX(0)).toBeLessThan(0);
    expect(position.getY(0)).toBeGreaterThan(0);
    const index = geometry.getIndex()!;
    const [a, b, c] = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(position, index.getX(k))
    );
    const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
    expect(normal.z).toBeCloseTo(1, 6); // back towards the camera at +z
    geometry.dispose();
  });

  it('drops the triangles bridging a depth jump', () => {
    // Left half at 1 m (a box edge), right half at 2 m (the wall behind).
    const step = depthMapOf((px) => (px < 222 ? 1 : 2));
    const stride = 4;
    const geometry = buildDepthMesh(step, {stride});
    const n = gridSize(stride);
    // Grid columns 0..55 are near, 56.. far: the column of cells between
    // them (one per row, two triangles each) is gone.
    expect(geometry.userData.triangles).toBe(2 * (n - 1) * (n - 2));
    // A gentle slope is kept.
    const slope = buildDepthMesh(
      depthMapOf((px) => 1 + px / 448),
      {stride}
    );
    expect(slope.userData.triangles).toBe(2 * (n - 1) * (n - 1));
    geometry.dispose();
    slope.dispose();
  });

  it('leaves holes where MoGe gave no depth', () => {
    const stride = 4;
    const n = gridSize(stride);
    // One missing grid vertex removes the 6 triangles that touch it.
    const hole = depthMapOf((px, py) => (px === 200 && py === 200 ? 0 : 2));
    const geometry = buildDepthMesh(hole, {stride});
    expect(geometry.userData.vertices).toBe(n * n - 1);
    expect(geometry.userData.triangles).toBe(2 * (n - 1) * (n - 1) - 6);
    geometry.dispose();
    expect(() => buildDepthMesh(depthMapOf(() => 0))).toThrow(/no surface/);
  });

  it('colors by depth (near blue, far red) and by photo', () => {
    const map = depthMapOf((_px, py) => 1 + (3 * py) / 447);
    const rgba = new Uint8ClampedArray(PLANE * 4).fill(255);
    const geometry = buildDepthMesh(map, {stride: 8, rgba});
    const {depthColor, photoColor} = geometry.userData;
    const last = depthColor.count - 1;
    expect(depthColor.getZ(0)).toBeGreaterThan(depthColor.getX(0)); // top: near
    expect(depthColor.getX(last)).toBeGreaterThan(depthColor.getZ(last));
    expect(photoColor.getX(0)).toBeCloseTo(1, 6);
    // Scaling all depths leaves the depth coloring unchanged.
    const scaled = buildDepthMesh(
      {...map, data: map.data.map((d) => d * 1.3)},
      {stride: 8}
    );
    expect(scaled.userData.depthColor.getX(last)).toBeCloseTo(
      depthColor.getX(last),
      5
    );
    geometry.dispose();
    scaled.dispose();
  });
});

describe('mesh modes', () => {
  it('swaps coloring and wireframe, and is not a pointer target', () => {
    const rgba = new Uint8ClampedArray(PLANE * 4).fill(128);
    const mesh = createDepthMesh(
      buildDepthMesh(
        depthMapOf(() => 2),
        {stride: 8, rgba}
      )
    );
    const material = mesh.material as THREE.MeshBasicMaterial;
    const {depthColor, photoColor} = mesh.geometry.userData;
    expect(MESH_MODES).toEqual(['off', 'depth', 'photo', 'wire']);
    applyMeshMode(mesh, 'off');
    expect(mesh.visible).toBe(false);
    applyMeshMode(mesh, 'photo');
    expect(mesh.geometry.getAttribute('color')).toBe(photoColor);
    expect(material.wireframe).toBe(false);
    applyMeshMode(mesh, 'wire');
    expect(mesh.geometry.getAttribute('color')).toBe(depthColor);
    expect(material.wireframe).toBe(true);
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
    mesh.geometry.dispose();
    material.dispose();
  });
});

describe('thumbnails', () => {
  const letterbox = letterboxParams(1280, 720); // 448x252 at y 98

  it('crops the letterbox and flips rows for the texture', () => {
    const rgba = new Uint8ClampedArray(PLANE * 4);
    // Mark the top-left drawn pixel red.
    rgba[(letterbox.offY * MOGE_SIZE + 0) * 4] = 255;
    const texture = photoTexture(rgba, letterbox, MOGE_SIZE);
    const {width, height, data} = texture.image;
    expect([width, height]).toEqual([448, 252]);
    // Top image row is the last texture row.
    expect(data[(height - 1) * width * 4]).toBe(255);
    expect(data[0]).toBe(0);
    texture.dispose();
  });

  it('draws the depth in Turbo and missing depth in black', () => {
    const map = depthMapOf((px) => (px < 10 ? 0 : 1 + px / 100));
    const texture = depthTexture(map, letterbox);
    const {width, data} = texture.image;
    const at = (x: number) => Array.from(data.slice(x * 4, x * 4 + 3));
    expect(at(0)).toEqual([0, 0, 0]);
    const [r, , b] = at(width - 1);
    expect(r).toBeGreaterThan(b); // far = red
    texture.dispose();
  });
});

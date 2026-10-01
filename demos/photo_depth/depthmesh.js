/**
 * Photo depth map → static triangle mesh (and images of it), built from the
 * MoGe depth alone: holes are the pixels MoGe gave no depth (its mask, the
 * letterbox padding and the rim), and depth jumps are measured on MoGe's own
 * depths. Sensed depth never shapes the mesh; the demo targets glasses that
 * have none.
 */
import * as THREE from 'three';

import {SRGB_TO_LINEAR, depthRange, unprojectPixel} from './depthmap.js';

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/**
 * Google's Turbo colormap (polynomial fit by Anton Mikhailov): dark blue at
 * 0, through green and yellow, to dark red at 1. Returns sRGB in [0, 1].
 */
export function turbo(t, target = [0, 0, 0]) {
  const x = Math.min(1, Math.max(0, t));
  const poly = (c) =>
    c[0] + x * (c[1] + x * (c[2] + x * (c[3] + x * (c[4] + x * c[5]))));
  target[0] = clamp01(
    poly([0.1357, 4.6154, -42.6603, 132.1311, -152.9424, 59.2864])
  );
  target[1] = clamp01(poly([0.0914, 2.1942, 4.843, -14.185, 4.2773, 2.8296]));
  target[2] = clamp01(
    poly([0.1067, 12.6419, -60.582, 110.3628, -89.9031, 27.3482])
  );
  return target;
}

/**
 * Depth coloring for `t` = 0 (near) … 1 (far): Turbo without its near-black
 * ends, so near reads as clear blue and far as red over passthrough.
 */
export function depthColor(t, target = [0, 0, 0]) {
  return turbo(0.08 + 0.87 * clamp01(t), target);
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Indexed triangle mesh of a depth map in the capturing camera's three.js
 * frame (place it with `matrix = worldFromView`, like the cloud).
 *
 * Vertices sit on every `stride`-th pixel along the same camera rays as the
 * cloud. Each grid cell gives up to two triangles; a triangle is kept only
 * when its three vertices have depth and their depths differ by at most
 * `maxRelJump` (far / near − 1), so object silhouettes don't grow skirts
 * down to the background.
 *
 * Attributes: `position`; and, swapped into `color` by the caller,
 * `userData.photoColor` (the photo, when `rgba` is given) and
 * `userData.depthColor` (Turbo over the robust depth range, near = blue).
 */
export function buildDepthMesh(
  depthMap,
  {stride = 4, maxRelJump = 0.1, rgba = null} = {}
) {
  const {width, height, data} = depthMap;
  const cols = Math.floor((width - 1) / stride) + 1;
  const rows = Math.floor((height - 1) / stride) + 1;
  // Grid vertex → mesh vertex index (−1 = no depth).
  const vertexOf = new Int32Array(cols * rows).fill(-1);
  const depthOf = [];
  const positions = [];
  const photoColors = [];
  const p = new THREE.Vector3();
  for (let gy = 0; gy < rows; gy++) {
    const py = gy * stride;
    for (let gx = 0; gx < cols; gx++) {
      const px = gx * stride;
      const i = py * width + px;
      const depth = data[i];
      if (!(depth > 0)) continue;
      vertexOf[gy * cols + gx] = depthOf.length;
      depthOf.push(depth);
      unprojectPixel(depthMap, px, py, depth, p);
      positions.push(p.x, p.y, p.z);
      if (rgba) {
        photoColors.push(
          SRGB_TO_LINEAR[rgba[i * 4]],
          SRGB_TO_LINEAR[rgba[i * 4 + 1]],
          SRGB_TO_LINEAR[rgba[i * 4 + 2]]
        );
      }
    }
  }

  const limit = 1 + maxRelJump;
  const indices = [];
  const tryTriangle = (a, b, c) => {
    if (a < 0 || b < 0 || c < 0) return;
    const da = depthOf[a];
    const db = depthOf[b];
    const dc = depthOf[c];
    if (Math.max(da, db, dc) > limit * Math.min(da, db, dc)) return;
    // Counter-clockwise seen from the camera (front faces point back at it).
    indices.push(a, c, b);
  };
  for (let gy = 0; gy + 1 < rows; gy++) {
    for (let gx = 0; gx + 1 < cols; gx++) {
      const tl = vertexOf[gy * cols + gx];
      const tr = vertexOf[gy * cols + gx + 1];
      const bl = vertexOf[(gy + 1) * cols + gx];
      const br = vertexOf[(gy + 1) * cols + gx + 1];
      tryTriangle(tl, tr, bl);
      tryTriangle(tr, br, bl);
    }
  }
  if (indices.length === 0) throw new Error('the depth map has no surface');

  const {near, far} = depthRange(depthMap);
  const span = Math.max(1e-6, far - near);
  const depthColors = new Float32Array(depthOf.length * 3);
  const rgb = [0, 0, 0];
  for (let v = 0; v < depthOf.length; v++) {
    depthColor((depthOf[v] - near) / span, rgb);
    depthColors[v * 3] = srgbToLinear(rgb[0]);
    depthColors[v * 3 + 1] = srgbToLinear(rgb[1]);
    depthColors[v * 3 + 2] = srgbToLinear(rgb[2]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const vertexCount = depthOf.length;
  geometry.setIndex(
    vertexCount > 65535
      ? new THREE.Uint32BufferAttribute(indices, 1)
      : new THREE.Uint16BufferAttribute(indices, 1)
  );
  const depthAttribute = new THREE.Float32BufferAttribute(depthColors, 3);
  geometry.setAttribute('color', depthAttribute);
  geometry.computeBoundingSphere();
  geometry.userData = {
    depthColor: depthAttribute,
    photoColor: rgba ? new THREE.Float32BufferAttribute(photoColors, 3) : null,
    near,
    far,
    triangles: indices.length / 3,
    vertices: vertexCount,
  };
  return geometry;
}

/**
 * The part of a 448² model-grid image inside the letterbox, as a texture for
 * a `UIImage` (rows flipped: DataTexture row 0 is the bottom).
 * `pixel(i, out)` writes the sRGB bytes of grid pixel `i` into `out[0..3]`.
 */
function gridTexture(letterbox, gridWidth, pixel) {
  const {offX, offY, drawW, drawH} = letterbox;
  const out = new Uint8Array(drawW * drawH * 4);
  const rgba = [0, 0, 0, 255];
  for (let y = 0; y < drawH; y++) {
    const row = (drawH - 1 - y) * drawW;
    for (let x = 0; x < drawW; x++) {
      pixel((offY + y) * gridWidth + offX + x, rgba);
      out.set(rgba, (row + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(out, drawW, drawH);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The photo MoGe saw (letterbox padding cropped away). */
export function photoTexture(rgba, letterbox, gridWidth) {
  return gridTexture(letterbox, gridWidth, (i, out) => {
    out[0] = rgba[i * 4];
    out[1] = rgba[i * 4 + 1];
    out[2] = rgba[i * 4 + 2];
  });
}

/**
 * The depth map as a Turbo image over `[near, far]` (default: its robust
 * range); pixels without depth are black.
 */
export function depthTexture(
  depthMap,
  letterbox,
  range = depthRange(depthMap)
) {
  const {near, far} = range;
  const span = Math.max(1e-6, far - near);
  const rgb = [0, 0, 0];
  return gridTexture(letterbox, depthMap.width, (i, out) => {
    const depth = depthMap.data[i];
    if (!(depth > 0)) {
      out[0] = out[1] = out[2] = 0;
      return;
    }
    depthColor((depth - near) / span, rgb);
    out[0] = Math.round(rgb[0] * 255);
    out[1] = Math.round(rgb[1] * 255);
    out[2] = Math.round(rgb[2] * 255);
  });
}

/** Mesh display modes, cycled by the panel button. */
export const MESH_MODES = ['off', 'depth', 'photo', 'wire'];

/**
 * Applies a display mode to a mesh from {@link buildDepthMesh}: `depth` and
 * `photo` fill with that coloring, `wire` draws depth-colored edges.
 */
export function applyMeshMode(mesh, mode) {
  const {geometry, material} = mesh;
  mesh.visible = mode !== 'off';
  const photo = mode === 'photo' && geometry.userData.photoColor;
  geometry.setAttribute(
    'color',
    photo ? geometry.userData.photoColor : geometry.userData.depthColor
  );
  material.wireframe = mode === 'wire';
  material.opacity = mode === 'photo' ? 1 : 0.8;
  material.transparent = material.opacity < 1;
  material.needsUpdate = true;
}

/** A mesh for {@link buildDepthMesh}'s geometry, world-anchored by caller. */
export function createDepthMesh(geometry) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    })
  );
  mesh.name = 'PhotoDepthMesh';
  // Not a pointer target yet (phase 3 selects on it).
  mesh.raycast = () => {};
  return mesh;
}

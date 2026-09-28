import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {intrinsicsToProjectionMatrix} from '../../src/camera/CameraParameterUtils';
import {
  buildDepthMap,
  depthMapToCloud,
  depthRange,
  disposeObject,
  horizontalFov,
  intrinsicsFromFov,
  intrinsicsFromProjection,
  intrinsicsToLetterbox,
  samplePointMap,
  solveFocalShift,
  solveShift,
  unprojectPixel,
} from './depthmap.js';
import {MOGE_SIZE, letterboxParams} from './moge.js';
import {PLANE, cameraPose, makeScene, planeDepth} from './testScenes';

// The Galaxy XR / Quest 3 camera model (1280×720, ~77° horizontal FOV)
// mapped onto the 448² model grid.
const DEVICE_K = {fx: 800, fy: 800, cx: 640, cy: 360};
const LETTERBOX = letterboxParams(1280, 720);
const K448 = intrinsicsToLetterbox(DEVICE_K, LETTERBOX);

/** A desk-like scene: a floor seen from 1.4 m, pitched 35° down. */
function floorScene(options = {}) {
  const pose = cameraPose(new THREE.Vector3(0, 1.4, 0), -0.6);
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const depthAt = planeDepth(K448, pose, floor);
  const valid = new Uint8Array(PLANE);
  for (let y = LETTERBOX.offY; y < LETTERBOX.offY + LETTERBOX.drawH; y++) {
    for (let x = 0; x < MOGE_SIZE; x++) valid[y * MOGE_SIZE + x] = 1;
  }
  return makeScene({
    K: K448,
    depthAt: (px, py) => (valid[py * MOGE_SIZE + px] ? depthAt(px, py) : 0),
    valid,
    ...options,
  });
}

describe('intrinsics', () => {
  it('round-trips through the SDK projection matrix', () => {
    const K = [800, 0, 640, 0, 810, 350, 0, 0, 1];
    const projection = intrinsicsToProjectionMatrix(
      K,
      1280,
      720,
      0.1,
      1000,
      new THREE.Matrix4()
    );
    const back = intrinsicsFromProjection(projection, 1280, 720);
    expect(back.fx).toBeCloseTo(800, 6);
    expect(back.fy).toBeCloseTo(810, 6);
    expect(back.cx).toBeCloseTo(640, 6);
    expect(back.cy).toBeCloseTo(350, 6);
  });

  it('maps a 16:9 camera onto the letterboxed grid', () => {
    expect(LETTERBOX).toMatchObject({
      drawW: 448,
      drawH: 252,
      offX: 0,
      offY: 98,
    });
    expect(K448.fx).toBeCloseTo(280, 6);
    expect(K448.fy).toBeCloseTo(280, 6);
    expect(K448.cx).toBeCloseTo(224, 6);
    expect(K448.cy).toBeCloseTo(98 + 126, 6);
  });

  it('letterboxes portrait and square photos', () => {
    expect(letterboxParams(720, 1280)).toMatchObject({
      drawW: 252,
      drawH: 448,
      offX: 98,
      offY: 0,
    });
    expect(letterboxParams(512, 512)).toMatchObject({
      drawW: 448,
      drawH: 448,
      offX: 0,
      offY: 0,
    });
  });

  it('converts between focal length and field of view', () => {
    expect(horizontalFov(800, 1280)).toBeCloseTo(77.32, 2);
    const K = intrinsicsFromFov(90, 448, 448);
    expect(K.fx).toBeCloseTo(224, 6);
    expect(K.cx).toBe(224);
  });
});

describe('solveShift', () => {
  it('recovers the z-shift of an exact affine point map', () => {
    const scene = floorScene({shift: 0.8, scale: 2.5});
    const sample = samplePointMap(scene.points, scene.mask, scene.valid);
    expect(sample.n).toBeGreaterThan(1000);
    const {shift, rmsPx} = solveShift(sample, K448);
    expect(shift).toBeCloseTo(0.8, 4);
    expect(rmsPx).toBeLessThan(0.01);
  });

  it('recovers negative shifts', () => {
    const scene = floorScene({shift: -0.3, scale: 1.2});
    const sample = samplePointMap(scene.points, scene.mask, scene.valid);
    expect(solveShift(sample, K448).shift).toBeCloseTo(-0.3, 4);
  });

  it('stays close under depth noise', () => {
    const scene = floorScene({shift: 0.5, scale: 2, zNoise: 0.01});
    const sample = samplePointMap(scene.points, scene.mask, scene.valid);
    const {shift, rmsPx} = solveShift(sample, K448);
    expect(Math.abs(shift - 0.5)).toBeLessThan(0.05);
    expect(rmsPx).toBeGreaterThan(0.01);
  });

  it('refuses a nearly empty point map', () => {
    const scene = floorScene();
    scene.mask.fill(0);
    const sample = samplePointMap(scene.points, scene.mask, scene.valid);
    expect(() => solveShift(sample, K448)).toThrow(/too few/);
  });
});

describe('solveFocalShift', () => {
  it('recovers focal and shift together from a slanted scene', () => {
    const scene = floorScene({shift: 0.8, scale: 2.5});
    const sample = samplePointMap(scene.points, scene.mask, scene.valid);
    const {shift, focal} = solveFocalShift(sample, {cx: K448.cx, cy: K448.cy});
    expect(Math.abs(focal / K448.fx - 1)).toBeLessThan(0.02);
    expect(shift).toBeCloseTo(0.8, 2);
  });
});

describe('buildDepthMap', () => {
  it('produces metric planar depth and drops padding and masked pixels', () => {
    const scene = floorScene({shift: 0.8, scale: 2.5});
    const masked = (LETTERBOX.offY + 100) * MOGE_SIZE + 200;
    scene.mask[masked] = 0.2;
    const map = buildDepthMap(scene, K448, 0.8, 2.5);
    expect(map).toMatchObject({width: MOGE_SIZE, height: MOGE_SIZE, ...K448});
    const probe = (LETTERBOX.offY + 60) * MOGE_SIZE + 120;
    expect(map.data[probe]).toBeCloseTo(scene.trueDepth[probe], 4);
    expect(map.data[masked]).toBe(0);
    expect(map.data[10 * MOGE_SIZE + 10]).toBe(0); // letterbox padding
    // The row right next to the padding is dropped too.
    expect(map.data[LETTERBOX.offY * MOGE_SIZE + 200]).toBe(0);
    expect(map.count).toBeGreaterThan(0.9 * 448 * 240);
  });

  it('applies the metric scale linearly', () => {
    const scene = floorScene();
    const probe = (LETTERBOX.offY + 60) * MOGE_SIZE + 120;
    const a = buildDepthMap(scene, K448, 0.8, 2.5).data[probe];
    const b = buildDepthMap(scene, K448, 0.8, 5).data[probe];
    expect(b / a).toBeCloseTo(2, 6);
  });
});

describe('unprojectPixel / depthMapToCloud', () => {
  const map = {
    width: MOGE_SIZE,
    height: MOGE_SIZE,
    data: new Float32Array(PLANE),
    ...K448,
  };

  it('puts the principal point on the optical axis (three.js camera frame)', () => {
    const p = unprojectPixel(map, 223.5, 223.5, 2, new THREE.Vector3());
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.z).toBe(-2);
    // Right of and below the center: +x, -y.
    const q = unprojectPixel(map, 300, 300, 2, new THREE.Vector3());
    expect(q.x).toBeGreaterThan(0);
    expect(q.y).toBeLessThan(0);
  });

  it('builds a colored, non-raycastable cloud of the valid pixels', () => {
    const data = new Float32Array(PLANE);
    for (let i = 0; i < 1000; i++) data[50000 + i] = 1.5;
    const rgba = new Uint8ClampedArray(PLANE * 4).fill(255);
    const cloud = depthMapToCloud({...map, data}, rgba);
    expect(cloud.userData.count).toBe(1000);
    const z = cloud.geometry.getAttribute('position').getZ(0);
    expect(z).toBeCloseTo(-1.5, 6);
    expect(cloud.geometry.getAttribute('color').getX(0)).toBeCloseTo(1, 6);
    const hits: THREE.Intersection[] = [];
    cloud.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
    expect(depthRange({...map, data}).median).toBeCloseTo(1.5, 6);
    disposeObject(cloud);
  });

  it('refuses an empty depth map', () => {
    expect(() =>
      depthMapToCloud(map, new Uint8ClampedArray(PLANE * 4))
    ).toThrow(/empty/);
  });
});

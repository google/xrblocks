import aruco from 'js-aruco2';
import posit from 'js-aruco2/src/posit1.js';
import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  meanSidePixels,
  normalizeCorners,
  refineCornersSubpixel,
  reprojectionErrorPx,
  solveMarkerPose,
  type GrayImage,
  type Point2,
} from './ArucoPose';
import type {ArucoCameraIntrinsics} from './ArucoTypes';

const {AR} = aruco;
const {POS} = posit;

const WIDTH = 640;
const HEIGHT = 480;
const SIZE = 0.15;
// Deliberately off-centre with fx != fy: POSIT alone assumes neither.
const INTRINSICS: ArucoCameraIntrinsics = {fx: 600, fy: 590, cx: 330, cy: 250};

type Pose = {rotation: number[]; translation: [number, number, number]};

function makePose(
  eulerDegrees: [number, number, number],
  translation: [number, number, number]
): Pose {
  const [x, y, z] = eulerDegrees.map(THREE.MathUtils.degToRad);
  const e = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(x, y, z, 'XYZ')
  ).elements;
  // Column-major elements to a row-major 3x3.
  return {
    rotation: [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]],
    translation,
  };
}

function project(pose: Pose, mx: number, my: number): Point2 {
  const r = pose.rotation;
  const t = pose.translation;
  const x = r[0] * mx + r[1] * my + t[0];
  const y = r[3] * mx + r[4] * my + t[1];
  const z = r[6] * mx + r[7] * my + t[2];
  return {
    x: (INTRINSICS.fx * x) / z + INTRINSICS.cx,
    y: (INTRINSICS.fy * y) / z + INTRINSICS.cy,
  };
}

function projectCorners(pose: Pose): Point2[] {
  const h = SIZE / 2;
  return [
    project(pose, -h, -h),
    project(pose, h, -h),
    project(pose, h, h),
    project(pose, -h, h),
  ];
}

function rotationAngleDegrees(a: number[], b: number[]): number {
  // trace(A * B^T) = 1 + 2 cos(theta)
  let trace = 0;
  for (let i = 0; i < 9; ++i) trace += a[i] * b[i];
  return THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp((trace - 1) / 2, -1, 1))
  );
}

/**
 * Renders marker `id` as seen through `pose`, 4x4 supersampled, by casting
 * every pixel back onto the marker plane.
 */
function renderMarker(
  dictionaryName: string,
  id: number,
  pose: Pose
): {width: number; height: number; data: Uint8ClampedArray} {
  const dictionary = new AR.Dictionary(dictionaryName);
  const cells = dictionary.markSize;
  const code = dictionary.codeList[id];
  const r = pose.rotation;
  const t = pose.translation;
  // Pixel-from-plane homography K [r1 r2 t], inverted to go the other way.
  const planeFromPixel = new THREE.Matrix3()
    .set(
      INTRINSICS.fx * r[0] + INTRINSICS.cx * r[6],
      INTRINSICS.fx * r[1] + INTRINSICS.cx * r[7],
      INTRINSICS.fx * t[0] + INTRINSICS.cx * t[2],
      INTRINSICS.fy * r[3] + INTRINSICS.cy * r[6],
      INTRINSICS.fy * r[4] + INTRINSICS.cy * r[7],
      INTRINSICS.fy * t[1] + INTRINSICS.cy * t[2],
      r[6],
      r[7],
      t[2]
    )
    .invert().elements;
  const cell = SIZE / cells;
  const shade = (u: number, v: number): number => {
    const w = planeFromPixel[2] * u + planeFromPixel[5] * v + planeFromPixel[8];
    const mx =
      (planeFromPixel[0] * u + planeFromPixel[3] * v + planeFromPixel[6]) / w;
    const my =
      (planeFromPixel[1] * u + planeFromPixel[4] * v + planeFromPixel[7]) / w;
    const column = Math.floor((mx + SIZE / 2) / cell);
    const row = Math.floor((my + SIZE / 2) / cell);
    // One white cell of paper margin, then a mid-grey background.
    if (column < -1 || row < -1 || column > cells || row > cells) return 110;
    if (column < 0 || row < 0 || column >= cells || row >= cells) return 235;
    if (column === 0 || row === 0 || column === cells - 1 || row === cells - 1)
      return 20;
    return code[(row - 1) * (cells - 2) + (column - 1)] === '1' ? 235 : 20;
  };

  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const samples = 4;
  for (let v = 0; v < HEIGHT; ++v) {
    for (let u = 0; u < WIDTH; ++u) {
      let sum = 0;
      for (let sv = 0; sv < samples; ++sv) {
        for (let su = 0; su < samples; ++su) {
          // Pixel (u, v) covers [u - 0.5, u + 0.5): its centre is the
          // integer coordinate the detector reports corners in.
          sum += shade(
            u - 0.5 + (su + 0.5) / samples,
            v - 0.5 + (sv + 0.5) / samples
          );
        }
      }
      const value = sum / (samples * samples);
      const offset = (v * WIDTH + u) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return {width: WIDTH, height: HEIGHT, data};
}

describe('solveMarkerPose', () => {
  it('centres corners on the principal point with +Y up', () => {
    const [corner] = normalizeCorners([{x: 340, y: 240}], INTRINSICS);
    expect(corner.x).toBeCloseTo(10);
    expect(corner.y).toBeCloseTo((10 * 600) / 590);
  });

  it.each([
    ['frontal', [0, 0, 0], [0, 0, 1]],
    ['oblique', [35, -25, 10], [0.1, -0.05, 1.2]],
    ['steep and off-axis', [-50, 30, -80], [-0.3, 0.2, 0.9]],
  ] as const)('recovers a %s pose from exact corners', (_, euler, position) => {
    const truth = makePose([...euler], [...position]);
    const corners = projectCorners(truth);
    const solved = solveMarkerPose(
      new POS.Posit(SIZE, INTRINSICS.fx),
      corners,
      INTRINSICS,
      SIZE
    )!;
    expect(solved).not.toBeNull();
    // POSIT is iterative: it stops a fraction of a pixel short on oblique views.
    expect(solved.reprojectionError).toBeLessThan(0.25);
    expect(rotationAngleDegrees(solved.rotation, truth.rotation)).toBeLessThan(
      0.5
    );
    for (let i = 0; i < 3; ++i) {
      expect(solved.translation[i]).toBeCloseTo(truth.translation[i], 2);
    }
  });

  it('reports a large reprojection error for a wrong pose', () => {
    const truth = makePose([35, -25, 10], [0.1, -0.05, 1.2]);
    const flipped = makePose([-35, 25, 10], [0.1, -0.05, 1.2]);
    const corners = projectCorners(truth);
    expect(reprojectionErrorPx(truth, corners, INTRINSICS, SIZE)).toBeCloseTo(
      0
    );
    expect(
      reprojectionErrorPx(flipped, corners, INTRINSICS, SIZE)
    ).toBeGreaterThan(1);
  });
});

describe('js-aruco2 end to end', () => {
  it.each([
    ['ARUCO_MIP_36h12', 7],
    ['ARUCO', 123],
  ] as const)('detects and localizes a rendered %s marker', (name, id) => {
    const truth = makePose([30, -20, 8], [0.06, -0.04, 0.8]);
    const image = renderMarker(name, id, truth);
    const detector = new AR.Detector({
      dictionaryName: name,
      maxHammingDistance: 1,
    });
    const markers = detector.detect(image);
    expect(markers.map((marker) => marker.id)).toEqual([id]);

    const cells = new AR.Dictionary(name).markSize;
    const refined = refineCornersSubpixel(
      detector.grey,
      markers[0].corners,
      cells
    );
    const exact = projectCorners(truth);
    const cornerError = (corners: Point2[]) =>
      Math.max(
        ...corners.map((corner, i) =>
          Math.hypot(corner.x - exact[i].x, corner.y - exact[i].y)
        )
      );
    // Refinement must beat the detector's integer corners.
    expect(cornerError(refined)).toBeLessThan(0.35);
    expect(cornerError(refined)).toBeLessThan(cornerError(markers[0].corners));

    const solved = solveMarkerPose(
      new POS.Posit(SIZE, INTRINSICS.fx),
      refined,
      INTRINSICS,
      SIZE
    )!;
    expect(rotationAngleDegrees(solved.rotation, truth.rotation)).toBeLessThan(
      3
    );
    expect(solved.translation[2]).toBeCloseTo(truth.translation[2], 1);
    expect(
      Math.hypot(
        solved.translation[0] - truth.translation[0],
        solved.translation[1] - truth.translation[1],
        solved.translation[2] - truth.translation[2]
      )
    ).toBeLessThan(0.015);
  });
});

describe('refineCornersSubpixel', () => {
  it('leaves corners alone when the marker is too small to refine', () => {
    const image: GrayImage = {
      width: 64,
      height: 64,
      data: new Uint8Array(4096),
    };
    const corners = [
      {x: 20, y: 20},
      {x: 36, y: 20},
      {x: 36, y: 36},
      {x: 20, y: 36},
    ];
    expect(meanSidePixels(corners)).toBe(16);
    expect(refineCornersSubpixel(image, corners, 8)).toEqual(corners);
  });

  it('never moves a corner onto a distant feature', () => {
    // A blank image has no gradients at all: refinement must be a no-op.
    const image: GrayImage = {
      width: 200,
      height: 200,
      data: new Uint8Array(40000).fill(128),
    };
    const corners = [
      {x: 50, y: 50},
      {x: 150, y: 50},
      {x: 150, y: 150},
      {x: 50, y: 150},
    ];
    expect(refineCornersSubpixel(image, corners, 8)).toEqual(corners);
  });
});

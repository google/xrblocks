/**
 * Pose estimation glue between the js-aruco2 detector and the tracker.
 *
 * js-aruco2 reports the four marker corners at integer-pixel accuracy, and
 * its coplanar POSIT solver assumes a centred principal point, one focal
 * length and a y-up image. The helpers here refine the corners, adapt real
 * pinhole intrinsics to those assumptions, and return the pose in the
 * computer-vision convention the tracker expects: camera +X right, +Y down,
 * +Z forward; marker +X right and +Y down as the print is viewed, +Z into
 * the marker.
 *
 * Everything is pure (no `xrblocks`, DOM or worker dependencies) so it can be
 * unit-tested, and the POSIT solver is injected rather than imported.
 */

import type {ArucoCameraIntrinsics} from './ArucoTypes';

/** An image-space point in pixels. */
export interface Point2 {
  x: number;
  y: number;
}

/** A single-channel 8-bit image, as kept by `AR.Detector.grey`. */
export interface GrayImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** The part of js-aruco2's `POS.Pose` this module reads. */
export interface PositPose {
  bestRotation: number[][];
  bestTranslation: number[];
  alternativeRotation: number[][];
  alternativeTranslation: number[];
}

/** The part of js-aruco2's `POS.Posit` this module calls. */
export interface PositSolver {
  pose(imagePoints: Point2[]): PositPose;
}

/** A camera-from-marker pose in computer-vision coordinates. */
export interface MarkerPose {
  /** 3×3 rotation matrix in row-major order. */
  rotation: number[];
  /** Translation in the units of the POSIT model size (metres). */
  translation: [number, number, number];
  /** RMS pixel distance between the observed and reprojected corners. */
  reprojectionError: number;
}

/**
 * Maps pixel corners into the image POSIT assumes: origin on the principal
 * point, +Y up, and Y stretched by `fx / fy` so that the single focal length
 * handed to POSIT is exactly `fx`.
 */
export function normalizeCorners(
  corners: readonly Point2[],
  intrinsics: ArucoCameraIntrinsics
): Point2[] {
  const aspect = intrinsics.fx / intrinsics.fy;
  return corners.map((corner) => ({
    x: corner.x - intrinsics.cx,
    y: (intrinsics.cy - corner.y) * aspect,
  }));
}

/**
 * Converts a POSIT pose (y-up camera and marker frames) to computer-vision
 * coordinates by flipping Y on both sides: `R' = S·R·S`, `t' = S·t` with
 * `S = diag(1, -1, 1)`.
 */
export function positToCvPose(
  rotation: readonly (readonly number[])[],
  translation: readonly number[]
): {rotation: number[]; translation: [number, number, number]} {
  return {
    rotation: [
      rotation[0][0],
      -rotation[0][1],
      rotation[0][2],
      -rotation[1][0],
      rotation[1][1],
      -rotation[1][2],
      rotation[2][0],
      -rotation[2][1],
      rotation[2][2],
    ],
    translation: [translation[0], -translation[1], translation[2]],
  };
}

/**
 * Marker corners in its own frame, in detector order: clockwise from the
 * top-left as the print is viewed (+Y down).
 */
function markerCorners(sizeMeters: number): [number, number][] {
  const half = sizeMeters / 2;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
}

/**
 * RMS pixel distance between observed corners and the marker's corners
 * projected through `pose`. Returns `Infinity` when any corner lands behind
 * the camera.
 */
export function reprojectionErrorPx(
  pose: {rotation: readonly number[]; translation: readonly number[]},
  corners: readonly Point2[],
  intrinsics: ArucoCameraIntrinsics,
  sizeMeters: number
): number {
  const r = pose.rotation;
  const t = pose.translation;
  const model = markerCorners(sizeMeters);
  let sum = 0;
  for (let i = 0; i < 4; ++i) {
    const [mx, my] = model[i];
    const x = r[0] * mx + r[1] * my + t[0];
    const y = r[3] * mx + r[4] * my + t[1];
    const z = r[6] * mx + r[7] * my + t[2];
    if (!(z > 0)) return Infinity;
    const du = (intrinsics.fx * x) / z + intrinsics.cx - corners[i].x;
    const dv = (intrinsics.fy * y) / z + intrinsics.cy - corners[i].y;
    sum += du * du + dv * dv;
  }
  return Math.sqrt(sum / 4);
}

function isFiniteSolution(
  rotation: readonly (readonly number[])[],
  translation: readonly number[]
): boolean {
  return (
    rotation.length === 3 &&
    rotation.every((row) => row.length === 3 && row.every(Number.isFinite)) &&
    translation.length === 3 &&
    translation.every(Number.isFinite)
  );
}

/**
 * Solves the camera-from-marker pose of one detected quad.
 *
 * A planar target seen by a perspective camera has two plausible poses.
 * POSIT returns both; rather than trusting its own ranking (made in its
 * normalized image), this keeps whichever reprojects closer to the observed
 * corners in real pixels.
 *
 * @param posit - A `POS.Posit(sizeMeters, intrinsics.fx)` instance.
 * @param corners - Detector corners, clockwise from the top-left, in pixels.
 * @returns The better solution, or `null` when POSIT found none.
 */
export function solveMarkerPose(
  posit: PositSolver,
  corners: readonly Point2[],
  intrinsics: ArucoCameraIntrinsics,
  sizeMeters: number
): MarkerPose | null {
  if (corners.length !== 4) return null;
  const solved = posit.pose(normalizeCorners(corners, intrinsics));
  let best: MarkerPose | null = null;
  for (const [rotation, translation] of [
    [solved.bestRotation, solved.bestTranslation],
    [solved.alternativeRotation, solved.alternativeTranslation],
  ] as const) {
    if (!isFiniteSolution(rotation, translation)) continue;
    const pose = positToCvPose(rotation, translation);
    if (!(pose.translation[2] > 0)) continue;
    const reprojectionError = reprojectionErrorPx(
      pose,
      corners,
      intrinsics,
      sizeMeters
    );
    if (!best || reprojectionError < best.reprojectionError) {
      best = {...pose, reprojectionError};
    }
  }
  return best && Number.isFinite(best.reprojectionError) ? best : null;
}

/** Mean side length of a quad, in pixels. */
export function meanSidePixels(corners: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < corners.length; ++i) {
    const next = corners[(i + 1) % corners.length];
    sum += Math.hypot(next.x - corners[i].x, next.y - corners[i].y);
  }
  return sum / corners.length;
}

// A refined corner further than this from the detector's is a jump onto some
// other feature, not a refinement.
const MAX_REFINEMENT_SHIFT_PX = 2;
const REFINEMENT_ITERATIONS = 6;

/**
 * Refines quad corners to sub-pixel accuracy.
 *
 * At a true corner every nearby image gradient is perpendicular to the
 * vector from the corner to that pixel, so the corner is the least-squares
 * solution of `Σ g·gᵀ (q − p) = 0` over a small window (the classic
 * `cornerSubPix` iteration). The window is sized from the quad so that it
 * stays within the marker's one-cell border and never reaches the code cells.
 *
 * @param cellsPerSide - Marker grid size including the border (7 or 8).
 * @returns New corner objects; a corner that cannot be refined is returned
 *   unchanged.
 */
export function refineCornersSubpixel(
  image: GrayImage,
  corners: readonly Point2[],
  cellsPerSide: number
): Point2[] {
  const cellPixels = meanSidePixels(corners) / cellsPerSide;
  const halfWindow = Math.min(5, Math.floor(cellPixels * 0.75));
  if (halfWindow < 2) return corners.map((corner) => ({...corner}));
  return corners.map((corner) => refineCorner(image, corner, halfWindow));
}

function refineCorner(
  image: GrayImage,
  corner: Point2,
  halfWindow: number
): Point2 {
  const {width, height, data} = image;
  const sigma = halfWindow / 2;
  const inverseTwoSigmaSq = 1 / (2 * sigma * sigma);
  let qx = corner.x;
  let qy = corner.y;

  for (let iteration = 0; iteration < REFINEMENT_ITERATIONS; ++iteration) {
    const centreX = Math.round(qx);
    const centreY = Math.round(qy);
    if (
      centreX - halfWindow < 1 ||
      centreY - halfWindow < 1 ||
      centreX + halfWindow > width - 2 ||
      centreY + halfWindow > height - 2
    ) {
      break;
    }
    let a = 0;
    let b = 0;
    let c = 0;
    let bx = 0;
    let by = 0;
    for (let py = centreY - halfWindow; py <= centreY + halfWindow; ++py) {
      const row = py * width;
      for (let px = centreX - halfWindow; px <= centreX + halfWindow; ++px) {
        const gx = (data[row + px + 1] - data[row + px - 1]) / 2;
        const gy = (data[row + width + px] - data[row - width + px]) / 2;
        const dx = px - qx;
        const dy = py - qy;
        const weight = Math.exp(-(dx * dx + dy * dy) * inverseTwoSigmaSq);
        const gxx = weight * gx * gx;
        const gxy = weight * gx * gy;
        const gyy = weight * gy * gy;
        a += gxx;
        b += gxy;
        c += gyy;
        bx += gxx * px + gxy * py;
        by += gxy * px + gyy * py;
      }
    }
    const determinant = a * c - b * b;
    // Flat or single-edge neighbourhoods do not constrain a corner.
    if (!(Math.abs(determinant) > 1e-6 * (a + c) * (a + c))) break;
    const nextX = (c * bx - b * by) / determinant;
    const nextY = (a * by - b * bx) / determinant;
    const step = Math.hypot(nextX - qx, nextY - qy);
    qx = nextX;
    qy = nextY;
    if (step < 0.01) break;
  }

  if (
    !Number.isFinite(qx) ||
    !Number.isFinite(qy) ||
    Math.hypot(qx - corner.x, qy - corner.y) > MAX_REFINEMENT_SHIFT_PX
  ) {
    return {...corner};
  }
  return {x: qx, y: qy};
}

// ---------------------------------------------------------------------------
// Structural types for the parts of js-aruco2 the addon uses. The package
// ships no declarations and is loaded from a URL at runtime, so its `AR` and
// `POS` namespaces are described by hand.
// ---------------------------------------------------------------------------

/** An RGBA image: an `ImageData`, or the same three fields. */
export interface ArucoInputImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** A marker reported by `AR.Detector.detect`. */
export interface ArucoMarker {
  id: number;
  /** Clockwise from the marker's own top-left corner, in pixels. */
  corners: Point2[];
  hammingDistance: number;
}

/** `AR.Detector` */
export interface ArucoDetector {
  /** The grayscale image of the most recent `detect` call. */
  grey: GrayImage;
  detect(image: ArucoInputImage): ArucoMarker[];
}

/** `AR.Dictionary` */
export interface ArucoDictionary {
  /** Cells per side, including the one-cell black border. */
  markSize: number;
  codeList: string[];
  generateSVG(id: number): string;
}

/** The `AR` namespace exported by `src/aruco.js`. */
export interface ArucoNamespace {
  DICTIONARIES: Record<string, {nBits: number; tau?: number}>;
  Detector: new (config?: {
    dictionaryName?: string;
    /** Matches are accepted strictly below this Hamming distance. */
    maxHammingDistance?: number;
  }) => ArucoDetector;
  Dictionary: new (dictionaryName: string) => ArucoDictionary;
}

/** The `POS` namespace exported by `src/posit1.js`. */
export interface PositNamespace {
  Posit: new (modelSize: number, focalLength: number) => PositSolver;
}

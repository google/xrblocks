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
import type { ArucoCameraIntrinsics } from './ArucoTypes';
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
export declare function normalizeCorners(corners: readonly Point2[], intrinsics: ArucoCameraIntrinsics): Point2[];
/**
 * Converts a POSIT pose (y-up camera and marker frames) to computer-vision
 * coordinates by flipping Y on both sides: `R' = S·R·S`, `t' = S·t` with
 * `S = diag(1, -1, 1)`.
 */
export declare function positToCvPose(rotation: readonly (readonly number[])[], translation: readonly number[]): {
    rotation: number[];
    translation: [number, number, number];
};
/**
 * RMS pixel distance between observed corners and the marker's corners
 * projected through `pose`. Returns `Infinity` when any corner lands behind
 * the camera.
 */
export declare function reprojectionErrorPx(pose: {
    rotation: readonly number[];
    translation: readonly number[];
}, corners: readonly Point2[], intrinsics: ArucoCameraIntrinsics, sizeMeters: number): number;
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
export declare function solveMarkerPose(posit: PositSolver, corners: readonly Point2[], intrinsics: ArucoCameraIntrinsics, sizeMeters: number): MarkerPose | null;
/** Mean side length of a quad, in pixels. */
export declare function meanSidePixels(corners: readonly Point2[]): number;
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
export declare function refineCornersSubpixel(image: GrayImage, corners: readonly Point2[], cellsPerSide: number): Point2[];
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
    DICTIONARIES: Record<string, {
        nBits: number;
        tau?: number;
    }>;
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

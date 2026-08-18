/** The AprilTag family supported by this addon. */
export const APRILTAG_FAMILY = 'tag25h9' as const;

/** First valid ID in the tag25h9 family. */
export const TAG25H9_MIN_ID = 0;

/** Last valid ID in the tag25h9 family (35 tags total). */
export const TAG25H9_MAX_ID = 34;

/** Default tag selected by the demo. */
export const DEFAULT_TAG25H9_ID = 17;

/**
 * Physical width of the black-and-white tag code, excluding the surrounding
 * white paper margin. This is the 155.6 mm "tag size" from the printed tag.
 */
export const DEFAULT_TAG25H9_SIZE_METERS = 0.1556;

/** The state of an {@link AprilTagTracker}'s persistent spatial anchor. */
export type AprilTagTrackingState =
  | 'initializing'
  | 'searching'
  | 'tracked'
  | 'anchored'
  | 'error';

/** A raw pose estimate reported by the native AprilTag detector. */
export interface AprilTagDetection {
  /** Numeric tag ID in the tag25h9 family. */
  id: number;
  /** Number of corrected code bits. Lower is better. */
  hamming: number;
  /** Detector confidence margin. Higher is better. */
  decisionMargin: number;
  /** Pixel reprojection error of the pose solution. Lower is better. */
  reprojectionError: number;
  /** 3×3 camera-from-tag rotation matrix in row-major order. */
  rotation: readonly number[];
  /** Camera-from-tag translation in metres, in computer-vision coordinates. */
  translation: readonly [number, number, number];
}

/** Camera intrinsics expressed in image pixels. */
export interface AprilTagCameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** Options for {@link AprilTagTracker}. */
export interface AprilTagTrackerOptions {
  /** Tag25h9 ID to track. @defaultValue 17 */
  tagId?: number;
  /** Printed black-and-white tag width in metres. @defaultValue 0.1556 */
  tagSizeMeters?: number;
  /** Minimum interval between detector requests. @defaultValue 100 */
  pollingIntervalMs?: number;
  /** Time constant for visual-pose smoothing. @defaultValue 90 */
  smoothingTimeConstantMs?: number;
  /** Maximum corrected code bits accepted from the detector. @defaultValue 1 */
  maxHamming?: number;
  /** Minimum detector confidence margin accepted. @defaultValue 20 */
  minDecisionMargin?: number;
  /**
   * Extra rotation in radians applied to the SDK's estimated device-camera
   * extrinsics, in the camera's own view space, matching the
   * `Object3DDetector` calibration convention. Use it to null a constant
   * registration error measured on a specific device.
   * @defaultValue `{yaw: 0, pitch: 0, roll: 0}`
   */
  cameraRotationOffset?: {yaw?: number; pitch?: number; roll?: number};
  /**
   * Initial camera calibration to start from — for example values recovered
   * on this device in a previous run (the tracker logs a pinnable line to
   * the console whenever its calibration converges). `rotation` is an
   * `[x, y, z, w]` quaternion and `translation` is `[x, y, z]` metres, both
   * relative to the SDK's assumed device-camera extrinsics. The
   * self-calibration keeps refining from these values.
   */
  calibration?: {
    rotation?: number[];
    translation?: number[];
    rangeScale?: number;
  };
}

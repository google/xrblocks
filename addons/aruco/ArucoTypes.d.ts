/** Marker dictionaries that ship inside the js-aruco2 detector. */
export type ArucoDictionaryName = 'ARUCO_MIP_36h12' | 'ARUCO';
/** Number of marker IDs in each dictionary; valid IDs are `0..size-1`. */
export declare const ARUCO_DICTIONARY_SIZES: Readonly<Record<ArucoDictionaryName, number>>;
/**
 * Default dictionary. `ARUCO_MIP_36h12` keeps 12 bits between any two codes,
 * so misread cells are corrected instead of turning into another marker's ID;
 * the original `ARUCO` dictionary only keeps 3 and cannot correct anything.
 */
export declare const DEFAULT_ARUCO_DICTIONARY: ArucoDictionaryName;
/** Default marker selected by the demo. */
export declare const DEFAULT_ARUCO_MARKER_ID = 0;
/**
 * Physical width of the marker's black square (its outer border included,
 * the white paper margin excluded). Always measure the actual print.
 */
export declare const DEFAULT_ARUCO_MARKER_SIZE_METERS = 0.15;
/**
 * Where the detector worker loads js-aruco2 from. The package is CommonJS;
 * jsDelivr's `+esm` endpoint serves it as an ES module a module worker can
 * `import()`. Override through {@link ArucoTrackerOptions.moduleUrls} to
 * self-host.
 */
export declare const DEFAULT_ARUCO_MODULE_URLS: Readonly<ArucoModuleUrls>;
/** ES-module URLs of the two js-aruco2 files the worker needs. */
export interface ArucoModuleUrls {
    /** `src/aruco.js`: exposes `AR` (detector and dictionaries). */
    aruco: string;
    /** `src/posit1.js`: exposes `POS` (coplanar POSIT pose estimation). */
    posit: string;
}
/** The state of an {@link ArucoTracker}'s persistent spatial anchor. */
export type ArucoTrackingState = 'initializing' | 'searching' | 'tracked' | 'anchored' | 'error';
/** A raw pose estimate reported by the detector worker. */
export interface ArucoDetection {
    /** Marker ID within the active dictionary. */
    id: number;
    /** Number of corrected code bits. Lower is better. */
    hamming: number;
    /** Mean side length of the detected quad in pixels. Higher is better. */
    sidePixels: number;
    /** RMS pixel reprojection error of the pose solution. Lower is better. */
    reprojectionError: number;
    /** 3×3 camera-from-marker rotation matrix in row-major order. */
    rotation: readonly number[];
    /** Camera-from-marker translation in metres, computer-vision coordinates. */
    translation: readonly [number, number, number];
}
/** Camera intrinsics expressed in image pixels. */
export interface ArucoCameraIntrinsics {
    fx: number;
    fy: number;
    cx: number;
    cy: number;
}
/** Options for {@link ArucoTracker}. */
export interface ArucoTrackerOptions {
    /** Marker ID to track. @defaultValue 0 */
    markerId?: number;
    /** Printed black-square width in metres. @defaultValue 0.15 */
    markerSizeMeters?: number;
    /** Marker dictionary. @defaultValue 'ARUCO_MIP_36h12' */
    dictionary?: ArucoDictionaryName;
    /** Minimum interval between detector requests. @defaultValue 100 */
    pollingIntervalMs?: number;
    /** Time constant for visual-pose smoothing. @defaultValue 90 */
    smoothingTimeConstantMs?: number;
    /**
     * Maximum corrected code bits accepted from the detector.
     * @defaultValue 4 for `ARUCO_MIP_36h12`, 0 for `ARUCO`
     */
    maxHamming?: number;
    /**
     * Minimum mean side length of the detected quad, in pixels. Smaller
     * sightings carry too little perspective for a usable orientation.
     * @defaultValue 24
     */
    minSidePixels?: number;
    /** Maximum RMS reprojection error accepted, in pixels. @defaultValue 3 */
    maxReprojectionErrorPx?: number;
    /**
     * Refine the detector's integer-pixel corners to sub-pixel accuracy before
     * solving the pose. @defaultValue true
     */
    refineCorners?: boolean;
    /** Where to load js-aruco2 from; see {@link DEFAULT_ARUCO_MODULE_URLS}. */
    moduleUrls?: Partial<ArucoModuleUrls>;
    /**
     * Extra rotation in radians applied to the SDK's estimated device-camera
     * extrinsics, in the camera's own view space, matching the
     * `Object3DDetector` calibration convention. Use it to null a constant
     * registration error measured on a specific device.
     * @defaultValue `{yaw: 0, pitch: 0, roll: 0}`
     */
    cameraRotationOffset?: {
        yaw?: number;
        pitch?: number;
        roll?: number;
    };
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
    /**
     * Whether to use localStorage for the camera calibration: restore a
     * previously persisted calibration on startup and write the live one back
     * whenever it converges. Set `false` for a fully session-local tracker
     * that neither reads nor writes storage — every session then
     * self-calibrates from scratch. A pinned `calibration` option is honored
     * either way. @defaultValue true
     */
    persistCalibration?: boolean;
}

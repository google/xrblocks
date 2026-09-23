/**
 * Self-calibrating spatial-anchor solver for a printed tag.
 *
 * Platforms with first-class marker tracking (Quest passthrough camera API,
 * HoloLens QR tracking) are accurate because the runtime supplies a
 * calibrated camera: exact intrinsics, exact camera-to-head extrinsics, and
 * per-frame synchronized poses. A WebXR `getUserMedia` stream supplies none
 * of those, so XRBlocks ships hand-measured estimates — and every degree of
 * extrinsics error moves a tag anchor by centimetres in a direction that
 * changes with the viewpoint, which the viewer perceives as the anchor
 * swimming while they walk.
 *
 * This solver recovers the missing calibration from the tag observations
 * themselves. Each accepted detection contributes a measured camera-from-tag
 * pose together with the SDK's device-camera world pose at capture time. A
 * damped Gauss–Newton (Levenberg–Marquardt) fit over a set of
 * viewpoint-diverse keyframes jointly estimates:
 *
 * - the tag's world pose `T` (6 DOF) — the anchor,
 * - a correction `E` to the SDK's assumed camera extrinsics (6 DOF), and
 * - a shared range scale `k` absorbing focal-length / printed-size error,
 *
 * by minimizing `inv(P_i · E) · T ≈ M_i(k)` over keyframes `i`, where `P_i`
 * is the SDK camera pose and `M_i` the measured camera-from-tag pose with
 * its translation scaled by `k`. The headset's SLAM poses act as the
 * reference that makes the calibration observable; priors hold `E` at
 * identity and `k` at 1 along directions the current viewpoint diversity
 * cannot observe. The anchor output is the optimized `T`, which is
 * world-fixed by construction — it only moves when the fit genuinely
 * improves.
 */
import * as THREE from 'three';
/** One accepted visual observation of the tag. */
export interface MarkerPoseObservation {
    /** SDK-modelled device-camera pose in world space at capture time. */
    worldFromCamera: THREE.Matrix4;
    /** Measured camera-from-tag rotation, in the Three.js camera frame. */
    rotation: THREE.Quaternion;
    /** Measured camera-from-tag translation in metres (monocular range). */
    translation: THREE.Vector3;
    /** Quality weight in (0, 1]. */
    weight: number;
    /** Capture timestamp in the `performance.now()` timebase. */
    timeMs: number;
}
/** Result of classifying an observation against the current model. */
export interface MarkerObservationVerdict {
    /** Whether the observation entered the keyframe set. */
    ingested: boolean;
    /** Whether it disagreed with a well-established model. */
    isOutlier: boolean;
    /** Rotation disagreement with the current model, or `null` before init. */
    rotationResidualRad: number | null;
    /** Translation disagreement with the current model, or `null`. */
    translationResidualM: number | null;
}
/** Quality metrics of the most recent {@link MarkerAnchorCalibrator.solve}. */
export interface MarkerCalibrationSolveResult {
    rmsRotationResidualRad: number;
    rmsTranslationResidualM: number;
    keyframeCount: number;
    /** Spread of keyframe camera positions in metres. */
    baselineMeters: number;
    /** Whether the fit is diverse and tight enough to trust the calibration. */
    converged: boolean;
}
/** Persistable device calibration recovered by the solver. */
export interface MarkerCameraCalibration {
    rotation: THREE.Quaternion;
    translation: THREE.Vector3;
    rangeScale: number;
}
export declare class MarkerAnchorCalibrator {
    private keyframes;
    private tagRotation;
    private tagPosition;
    private extrinsicRotation;
    private extrinsicTranslation;
    private rangeScaleValue;
    private initializedValue;
    private readonly priorRotation;
    private readonly priorTranslation;
    private priorRangeScale;
    private readonly scratchTag;
    private readonly scratchExtrinsic;
    private readonly scratchCombined;
    private readonly scratchPredicted;
    private readonly scratchQuaternion;
    private readonly scratchRelative;
    private readonly scratchVector;
    private readonly scratchTranslation;
    private readonly scratchDirection;
    /** Whether a tag pose has been seeded. */
    get initialized(): boolean;
    /** Number of retained keyframes. */
    get keyframeCount(): number;
    /** Current smoothed multiplicative range correction. */
    get rangeScale(): number;
    /** Magnitude of the current extrinsics correction, for diagnostics. */
    get extrinsicCorrection(): {
        rotationRad: number;
        translationM: number;
    };
    /** The optimized tag world pose. Only valid once {@link initialized}. */
    getWorldFromTag(target?: THREE.Matrix4): THREE.Matrix4;
    /** Snapshot of the recovered camera calibration for persistence. */
    getCalibration(): MarkerCameraCalibration;
    /**
     * Restore a previously recovered camera calibration. The priors are
     * recentred on the restored values, so subsequent solves refine from here
     * rather than pulling the calibration back toward the SDK model while the
     * baseline is still uninformative.
     */
    setCalibration(calibration: Partial<MarkerCameraCalibration>): void;
    /**
     * Clear the tag pose and keyframes while keeping the recovered camera
     * calibration — the calibration describes the device, not the tag.
     */
    resetTag(): void;
    /** Reset only the range scale (for example after a tag-size change). */
    resetRangeScale(): void;
    /** Clear everything, including the camera calibration. */
    resetAll(): void;
    /** Initialize the tag pose from a single observation. */
    seed(observation: MarkerPoseObservation): void;
    /**
     * Classify an observation against the current model and, unless it is an
     * outlier, fold it into the keyframe set.
     */
    observe(observation: MarkerPoseObservation): MarkerObservationVerdict;
    /**
     * Run up to `maxIterations` of damped Gauss–Newton over the keyframes.
     * Returns quality metrics, or `null` when there is nothing to solve.
     */
    solve(nowMs: number, maxIterations?: number): MarkerCalibrationSolveResult | null;
    private summarize;
    /** Disagreement of one observation with the current model. */
    residualForObservation(observation: {
        worldFromCamera: THREE.Matrix4;
        rotation: THREE.Quaternion;
        translation: THREE.Vector3;
    }): {
        rotationRad: number;
        translationM: number;
    };
    private predictCameraFromTag;
    private pushKeyframe;
    private evictMostRedundant;
    private snapshotState;
    private applyDelta;
    private computeResiduals;
    private computeJacobian;
}

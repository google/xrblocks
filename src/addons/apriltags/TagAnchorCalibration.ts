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
export interface TagPoseObservation {
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
export interface TagObservationVerdict {
  /** Whether the observation entered the keyframe set. */
  ingested: boolean;
  /** Whether it disagreed with a well-established model. */
  isOutlier: boolean;
  /** Rotation disagreement with the current model, or `null` before init. */
  rotationResidualRad: number | null;
  /** Translation disagreement with the current model, or `null`. */
  translationResidualM: number | null;
}

/** Quality metrics of the most recent {@link TagAnchorCalibrator.solve}. */
export interface TagCalibrationSolveResult {
  rmsRotationResidualRad: number;
  rmsTranslationResidualM: number;
  keyframeCount: number;
  /** Spread of keyframe camera positions in metres. */
  baselineMeters: number;
  /** Whether the fit is diverse and tight enough to trust the calibration. */
  converged: boolean;
}

/** Persistable device calibration recovered by the solver. */
export interface TagCameraCalibration {
  rotation: THREE.Quaternion;
  translation: THREE.Vector3;
  rangeScale: number;
}

type Keyframe = {
  worldFromCamera: THREE.Matrix4;
  rotation: THREE.Quaternion;
  translation: THREE.Vector3;
  weight: number;
  timeMs: number;
  cameraPosition: THREE.Vector3;
  tagDirectionWorld: THREE.Vector3;
};

// Measurement noise model. The bearing (perpendicular to the view ray) of a
// tag detection is precise, but the monocular range grows quadratically
// noisy with distance — weighting them equally lets far observations drag
// the anchor along the view ray ("the anchor sinks when I walk away").
const ROTATION_SIGMA_BASE_RAD = 0.04; // ≈ 2.3° at 1 m, scaled with range.
const RANGE_SIGMA_BASE_M = 0.008;
const RANGE_SIGMA_QUADRATIC_M = 0.012; // + 1.2 cm · range².
const BEARING_SIGMA_BASE_M = 0.003;
const BEARING_SIGMA_PER_METER = 0.004;

// Priors holding unobserved calibration directions at the SDK model.
const PRIOR_WEIGHT_EXTRINSIC_ROTATION = 1 / 0.04; // σ ≈ 2.3°.
const PRIOR_WEIGHT_EXTRINSIC_TRANSLATION = 1 / 0.02; // σ ≈ 2 cm.
const PRIOR_WEIGHT_RANGE_SCALE = 1 / 0.15;

const RANGE_SCALE_MIN = 0.5;
const RANGE_SCALE_MAX = 2.0;

const MAX_KEYFRAMES = 32;
// Combined position (m) + 0.5·bearing (rad) novelty below which a new
// observation refreshes the nearest keyframe instead of adding one.
const KEYFRAME_NOVELTY_MIN = 0.05;
// Keyframes older than this decay in weight; SLAM drift slowly invalidates
// very old reference poses.
const KEYFRAME_AGING_MS = 120_000;

// Outlier thresholds versus a well-established model.
const OUTLIER_MIN_KEYFRAMES = 6;
const OUTLIER_ROTATION_RAD = 0.5;
const OUTLIER_TRANSLATION_BASE_M = 0.3;
const OUTLIER_TRANSLATION_RANGE_FRACTION = 0.15;

// Convergence gates for trusting (and persisting) the calibration.
const CONVERGED_MIN_KEYFRAMES = 8;
const CONVERGED_MIN_BASELINE_M = 0.3;
const CONVERGED_MAX_RMS_TRANSLATION_M = 0.05;

const STATE_SIZE = 13;
const NUMERIC_JACOBIAN_EPSILON = 1e-5;

type SolverState = {
  tagRotation: THREE.Quaternion;
  tagPosition: THREE.Vector3;
  extrinsicRotation: THREE.Quaternion;
  extrinsicTranslation: THREE.Vector3;
  rangeScale: number;
};

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

function so3Log(q: THREE.Quaternion, target: THREE.Vector3): THREE.Vector3 {
  let {x, y, z, w} = q;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const sinHalf = Math.sqrt(x * x + y * y + z * z);
  if (sinHalf < 1e-9) return target.set(2 * x, 2 * y, 2 * z);
  const angle = 2 * Math.atan2(sinHalf, Math.min(w, 1));
  const scale = angle / sinHalf;
  return target.set(x * scale, y * scale, z * scale);
}

function so3Exp(v: THREE.Vector3, target: THREE.Quaternion): THREE.Quaternion {
  const angle = v.length();
  if (angle < 1e-9) {
    return target.set(v.x / 2, v.y / 2, v.z / 2, 1).normalize();
  }
  const scale = Math.sin(angle / 2) / angle;
  return target.set(v.x * scale, v.y * scale, v.z * scale, Math.cos(angle / 2));
}

/**
 * Solves `A x = b` for a symmetric positive-definite `A` (size
 * {@link STATE_SIZE}) via Cholesky decomposition. Returns `null` when `A` is
 * not positive definite.
 */
function choleskySolve(a: Float64Array, b: Float64Array): Float64Array | null {
  const n = STATE_SIZE;
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j <= i; ++j) {
      let sum = a[i * n + j];
      for (let m = 0; m < j; ++m) sum -= l[i * n + m] * l[j * n + m];
      if (i === j) {
        if (sum <= 0) return null;
        l[i * n + j] = Math.sqrt(sum);
      } else {
        l[i * n + j] = sum / l[j * n + j];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; ++i) {
    let sum = b[i];
    for (let m = 0; m < i; ++m) sum -= l[i * n + m] * y[m];
    y[i] = sum / l[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; --i) {
    let sum = y[i];
    for (let m = i + 1; m < n; ++m) sum -= l[m * n + i] * x[m];
    x[i] = sum / l[i * n + i];
  }
  return x;
}

export class TagAnchorCalibrator {
  private keyframes: Keyframe[] = [];
  private tagRotation = new THREE.Quaternion();
  private tagPosition = new THREE.Vector3();
  private extrinsicRotation = new THREE.Quaternion();
  private extrinsicTranslation = new THREE.Vector3();
  private rangeScaleValue = 1;
  private initializedValue = false;
  // Prior centers: the calibration the solver is anchored to along
  // directions the current viewpoint diversity cannot observe. Recentred by
  // {@link setCalibration} so a restored calibration is not washed back
  // toward identity while the viewer stands still.
  private readonly priorRotation = new THREE.Quaternion();
  private readonly priorTranslation = new THREE.Vector3();
  private priorRangeScale = 1;

  // Scratch objects reused across residual evaluations.
  private readonly scratchTag = new THREE.Matrix4();
  private readonly scratchExtrinsic = new THREE.Matrix4();
  private readonly scratchCombined = new THREE.Matrix4();
  private readonly scratchPredicted = new THREE.Matrix4();
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly scratchRelative = new THREE.Quaternion();
  private readonly scratchVector = new THREE.Vector3();
  private readonly scratchTranslation = new THREE.Vector3();
  private readonly scratchDirection = new THREE.Vector3();

  /** Whether a tag pose has been seeded. */
  get initialized(): boolean {
    return this.initializedValue;
  }

  /** Number of retained keyframes. */
  get keyframeCount(): number {
    return this.keyframes.length;
  }

  /** Current smoothed multiplicative range correction. */
  get rangeScale(): number {
    return this.rangeScaleValue;
  }

  /** Magnitude of the current extrinsics correction, for diagnostics. */
  get extrinsicCorrection(): {rotationRad: number; translationM: number} {
    return {
      rotationRad: so3Log(this.extrinsicRotation, this.scratchVector).length(),
      translationM: this.extrinsicTranslation.length(),
    };
  }

  /** The optimized tag world pose. Only valid once {@link initialized}. */
  getWorldFromTag(target = new THREE.Matrix4()): THREE.Matrix4 {
    return target.compose(this.tagPosition, this.tagRotation, UNIT_SCALE);
  }

  /** Snapshot of the recovered camera calibration for persistence. */
  getCalibration(): TagCameraCalibration {
    return {
      rotation: this.extrinsicRotation.clone(),
      translation: this.extrinsicTranslation.clone(),
      rangeScale: this.rangeScaleValue,
    };
  }

  /**
   * Restore a previously recovered camera calibration. The priors are
   * recentred on the restored values, so subsequent solves refine from here
   * rather than pulling the calibration back toward the SDK model while the
   * baseline is still uninformative.
   */
  setCalibration(calibration: Partial<TagCameraCalibration>): void {
    if (calibration.rotation) {
      this.extrinsicRotation.copy(calibration.rotation).normalize();
      this.priorRotation.copy(this.extrinsicRotation);
    }
    if (calibration.translation) {
      this.extrinsicTranslation.copy(calibration.translation);
      this.priorTranslation.copy(this.extrinsicTranslation);
    }
    if (
      calibration.rangeScale !== undefined &&
      Number.isFinite(calibration.rangeScale)
    ) {
      this.rangeScaleValue = THREE.MathUtils.clamp(
        calibration.rangeScale,
        RANGE_SCALE_MIN,
        RANGE_SCALE_MAX
      );
      this.priorRangeScale = this.rangeScaleValue;
    }
  }

  /**
   * Clear the tag pose and keyframes while keeping the recovered camera
   * calibration — the calibration describes the device, not the tag.
   */
  resetTag(): void {
    this.keyframes = [];
    this.initializedValue = false;
  }

  /** Reset only the range scale (for example after a tag-size change). */
  resetRangeScale(): void {
    this.rangeScaleValue = 1;
    this.priorRangeScale = 1;
  }

  /** Clear everything, including the camera calibration. */
  resetAll(): void {
    this.resetTag();
    this.extrinsicRotation.identity();
    this.extrinsicTranslation.set(0, 0, 0);
    this.rangeScaleValue = 1;
    this.priorRotation.identity();
    this.priorTranslation.set(0, 0, 0);
    this.priorRangeScale = 1;
  }

  /** Initialize the tag pose from a single observation. */
  seed(observation: TagPoseObservation): void {
    this.keyframes = [];
    const measured = this.scratchPredicted.compose(
      this.scratchTranslation
        .copy(observation.translation)
        .multiplyScalar(this.rangeScaleValue),
      observation.rotation,
      UNIT_SCALE
    );
    const extrinsic = this.scratchExtrinsic.compose(
      this.extrinsicTranslation,
      this.extrinsicRotation,
      UNIT_SCALE
    );
    const worldFromTag = new THREE.Matrix4()
      .multiplyMatrices(observation.worldFromCamera, extrinsic)
      .multiply(measured);
    worldFromTag.decompose(
      this.tagPosition,
      this.tagRotation,
      this.scratchVector
    );
    this.initializedValue = true;
    this.pushKeyframe(observation);
  }

  /**
   * Classify an observation against the current model and, unless it is an
   * outlier, fold it into the keyframe set.
   */
  observe(observation: TagPoseObservation): TagObservationVerdict {
    if (!this.initializedValue) {
      this.seed(observation);
      return {
        ingested: true,
        isOutlier: false,
        rotationResidualRad: null,
        translationResidualM: null,
      };
    }

    const residual = this.residualForObservation(observation);
    if (
      this.keyframes.length >= OUTLIER_MIN_KEYFRAMES &&
      (residual.rotationRad > OUTLIER_ROTATION_RAD ||
        residual.translationM >
          Math.max(
            OUTLIER_TRANSLATION_BASE_M,
            OUTLIER_TRANSLATION_RANGE_FRACTION *
              this.rangeScaleValue *
              observation.translation.length()
          ))
    ) {
      return {
        ingested: false,
        isOutlier: true,
        rotationResidualRad: residual.rotationRad,
        translationResidualM: residual.translationM,
      };
    }

    this.pushKeyframe(observation);
    return {
      ingested: true,
      isOutlier: false,
      rotationResidualRad: residual.rotationRad,
      translationResidualM: residual.translationM,
    };
  }

  /**
   * Run up to `maxIterations` of damped Gauss–Newton over the keyframes.
   * Returns quality metrics, or `null` when there is nothing to solve.
   */
  solve(nowMs: number, maxIterations = 8): TagCalibrationSolveResult | null {
    if (!this.initializedValue || this.keyframes.length === 0) return null;

    let state = this.snapshotState();
    let residuals = this.computeResiduals(state, nowMs);
    let cost = residuals.reduce((sum, value) => sum + value * value, 0);
    let lambda = 1e-3;

    for (let iteration = 0; iteration < maxIterations; ++iteration) {
      const jacobian = this.computeJacobian(state, residuals, nowMs);
      const jtj = new Float64Array(STATE_SIZE * STATE_SIZE);
      const jtr = new Float64Array(STATE_SIZE);
      const rows = residuals.length;
      for (let row = 0; row < rows; ++row) {
        const r = residuals[row];
        for (let a = 0; a < STATE_SIZE; ++a) {
          const ja = jacobian[a * rows + row];
          jtr[a] += ja * r;
          for (let b = a; b < STATE_SIZE; ++b) {
            jtj[a * STATE_SIZE + b] += ja * jacobian[b * rows + row];
          }
        }
      }
      for (let a = 0; a < STATE_SIZE; ++a) {
        for (let b = 0; b < a; ++b) {
          jtj[a * STATE_SIZE + b] = jtj[b * STATE_SIZE + a];
        }
      }

      let improved = false;
      let stepNorm = 0;
      for (let attempt = 0; attempt < 4; ++attempt) {
        const damped = Float64Array.from(jtj);
        for (let d = 0; d < STATE_SIZE; ++d) {
          damped[d * STATE_SIZE + d] +=
            lambda * jtj[d * STATE_SIZE + d] + 1e-10;
        }
        const negJtr = Float64Array.from(jtr, (value) => -value);
        const step = choleskySolve(damped, negJtr);
        if (!step) {
          lambda *= 10;
          continue;
        }
        const candidate = this.applyDelta(state, step);
        const candidateResiduals = this.computeResiduals(candidate, nowMs);
        const candidateCost = candidateResiduals.reduce(
          (sum, value) => sum + value * value,
          0
        );
        if (candidateCost < cost) {
          state = candidate;
          residuals = candidateResiduals;
          cost = candidateCost;
          lambda = Math.max(lambda * 0.3, 1e-6);
          stepNorm = Math.max(...step.map(Math.abs));
          improved = true;
          break;
        }
        lambda *= 10;
      }
      if (!improved || stepNorm < 1e-7) break;
    }

    this.tagRotation.copy(state.tagRotation);
    this.tagPosition.copy(state.tagPosition);
    this.extrinsicRotation.copy(state.extrinsicRotation);
    this.extrinsicTranslation.copy(state.extrinsicTranslation);
    this.rangeScaleValue = state.rangeScale;

    return this.summarize(nowMs);
  }

  private summarize(nowMs: number): TagCalibrationSolveResult {
    let rotationSquaredSum = 0;
    let translationSquaredSum = 0;
    const boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const keyframe of this.keyframes) {
      const residual = this.residualForObservation(keyframe);
      rotationSquaredSum += residual.rotationRad * residual.rotationRad;
      translationSquaredSum += residual.translationM * residual.translationM;
      boundsMin.min(keyframe.cameraPosition);
      boundsMax.max(keyframe.cameraPosition);
    }
    const count = this.keyframes.length;
    const baselineMeters = count > 0 ? boundsMax.distanceTo(boundsMin) : 0;
    const rmsTranslation = Math.sqrt(
      translationSquaredSum / Math.max(1, count)
    );
    void nowMs;
    return {
      rmsRotationResidualRad: Math.sqrt(
        rotationSquaredSum / Math.max(1, count)
      ),
      rmsTranslationResidualM: rmsTranslation,
      keyframeCount: count,
      baselineMeters,
      converged:
        count >= CONVERGED_MIN_KEYFRAMES &&
        baselineMeters >= CONVERGED_MIN_BASELINE_M &&
        rmsTranslation <= CONVERGED_MAX_RMS_TRANSLATION_M,
    };
  }

  /** Disagreement of one observation with the current model. */
  residualForObservation(observation: {
    worldFromCamera: THREE.Matrix4;
    rotation: THREE.Quaternion;
    translation: THREE.Vector3;
  }): {rotationRad: number; translationM: number} {
    const predicted = this.predictCameraFromTag(
      observation.worldFromCamera,
      this.snapshotState()
    );
    const rotationRad = so3Log(
      this.scratchRelative
        .copy(observation.rotation)
        .invert()
        .premultiply(this.scratchQuaternion.setFromRotationMatrix(predicted)),
      this.scratchVector
    ).length();
    const translationM = this.scratchTranslation
      .setFromMatrixPosition(predicted)
      .addScaledVector(observation.translation, -this.rangeScaleValue)
      .length();
    return {rotationRad, translationM};
  }

  private predictCameraFromTag(
    worldFromCamera: THREE.Matrix4,
    state: SolverState
  ): THREE.Matrix4 {
    this.scratchTag.compose(state.tagPosition, state.tagRotation, UNIT_SCALE);
    this.scratchExtrinsic.compose(
      state.extrinsicTranslation,
      state.extrinsicRotation,
      UNIT_SCALE
    );
    this.scratchCombined
      .multiplyMatrices(worldFromCamera, this.scratchExtrinsic)
      .invert();
    return this.scratchPredicted.multiplyMatrices(
      this.scratchCombined,
      this.scratchTag
    );
  }

  private pushKeyframe(observation: TagPoseObservation): void {
    const cameraPosition = new THREE.Vector3().setFromMatrixPosition(
      observation.worldFromCamera
    );
    const tagDirectionWorld = new THREE.Vector3()
      .copy(observation.translation)
      .normalize()
      .transformDirection(observation.worldFromCamera);
    const keyframe: Keyframe = {
      worldFromCamera: observation.worldFromCamera.clone(),
      rotation: observation.rotation.clone().normalize(),
      translation: observation.translation.clone(),
      weight: observation.weight,
      timeMs: observation.timeMs,
      cameraPosition,
      tagDirectionWorld,
    };

    let nearestIndex = -1;
    let nearestNovelty = Infinity;
    for (let i = 0; i < this.keyframes.length; ++i) {
      const other = this.keyframes[i];
      const novelty =
        other.cameraPosition.distanceTo(cameraPosition) +
        0.5 * other.tagDirectionWorld.angleTo(tagDirectionWorld);
      if (novelty < nearestNovelty) {
        nearestNovelty = novelty;
        nearestIndex = i;
      }
    }

    if (nearestIndex >= 0 && nearestNovelty < KEYFRAME_NOVELTY_MIN) {
      // Same viewpoint as an existing keyframe: refresh it rather than
      // diluting the set with duplicates.
      this.keyframes[nearestIndex] = keyframe;
      return;
    }
    this.keyframes.push(keyframe);
    if (this.keyframes.length > MAX_KEYFRAMES) {
      this.evictMostRedundant();
    }
  }

  private evictMostRedundant(): void {
    let dropIndex = 0;
    let smallest = Infinity;
    for (let i = 0; i < this.keyframes.length; ++i) {
      for (let j = i + 1; j < this.keyframes.length; ++j) {
        const a = this.keyframes[i];
        const b = this.keyframes[j];
        const novelty =
          a.cameraPosition.distanceTo(b.cameraPosition) +
          0.5 * a.tagDirectionWorld.angleTo(b.tagDirectionWorld);
        if (novelty < smallest) {
          smallest = novelty;
          // Drop the older member of the most redundant pair.
          dropIndex = a.timeMs <= b.timeMs ? i : j;
        }
      }
    }
    this.keyframes.splice(dropIndex, 1);
  }

  private snapshotState(): SolverState {
    return {
      tagRotation: this.tagRotation.clone(),
      tagPosition: this.tagPosition.clone(),
      extrinsicRotation: this.extrinsicRotation.clone(),
      extrinsicTranslation: this.extrinsicTranslation.clone(),
      rangeScale: this.rangeScaleValue,
    };
  }

  private applyDelta(state: SolverState, delta: Float64Array): SolverState {
    const rotationDelta = new THREE.Vector3(delta[0], delta[1], delta[2]);
    const tagRotation = so3Exp(rotationDelta, new THREE.Quaternion())
      .multiply(state.tagRotation)
      .normalize();
    const extrinsicDelta = new THREE.Vector3(delta[6], delta[7], delta[8]);
    const extrinsicRotation = state.extrinsicRotation
      .clone()
      .multiply(so3Exp(extrinsicDelta, new THREE.Quaternion()))
      .normalize();
    return {
      tagRotation,
      tagPosition: state.tagPosition
        .clone()
        .add(new THREE.Vector3(delta[3], delta[4], delta[5])),
      extrinsicRotation,
      extrinsicTranslation: state.extrinsicTranslation
        .clone()
        .add(new THREE.Vector3(delta[9], delta[10], delta[11])),
      rangeScale: THREE.MathUtils.clamp(
        state.rangeScale + delta[12],
        RANGE_SCALE_MIN,
        RANGE_SCALE_MAX
      ),
    };
  }

  private computeResiduals(state: SolverState, nowMs: number): Float64Array {
    const residuals = new Float64Array(6 * this.keyframes.length + 7);
    let row = 0;
    for (const keyframe of this.keyframes) {
      const age = Math.max(0, nowMs - keyframe.timeMs);
      const weight = keyframe.weight * Math.exp(-age / KEYFRAME_AGING_MS);
      const predicted = this.predictCameraFromTag(
        keyframe.worldFromCamera,
        state
      );
      const range = state.rangeScale * keyframe.translation.length();
      const rotationResidual = so3Log(
        this.scratchRelative
          .copy(keyframe.rotation)
          .invert()
          .premultiply(this.scratchQuaternion.setFromRotationMatrix(predicted)),
        this.scratchVector
      );
      const rotationWeight =
        weight / (ROTATION_SIGMA_BASE_RAD * Math.max(1, range));
      residuals[row++] = rotationResidual.x * rotationWeight;
      residuals[row++] = rotationResidual.y * rotationWeight;
      residuals[row++] = rotationResidual.z * rotationWeight;
      // Split the translation residual into its along-ray (range) and
      // perpendicular (bearing) components and weight each by its own noise
      // model.
      const translationResidual = this.scratchTranslation
        .setFromMatrixPosition(predicted)
        .addScaledVector(keyframe.translation, -state.rangeScale);
      const direction = this.scratchDirection
        .copy(keyframe.translation)
        .normalize();
      const alongRay = translationResidual.dot(direction);
      const rangeSigma =
        RANGE_SIGMA_BASE_M + RANGE_SIGMA_QUADRATIC_M * range * range;
      const bearingSigma =
        BEARING_SIGMA_BASE_M + BEARING_SIGMA_PER_METER * range;
      translationResidual
        .multiplyScalar(weight / bearingSigma)
        .addScaledVector(
          direction,
          alongRay * weight * (1 / rangeSigma - 1 / bearingSigma)
        );
      residuals[row++] = translationResidual.x;
      residuals[row++] = translationResidual.y;
      residuals[row++] = translationResidual.z;
    }
    // Priors are centred on the restored/initial calibration (see
    // setCalibration), not on identity.
    const extrinsicRotationLog = so3Log(
      this.scratchRelative
        .copy(this.priorRotation)
        .invert()
        .premultiply(state.extrinsicRotation),
      this.scratchVector
    );
    residuals[row++] = extrinsicRotationLog.x * PRIOR_WEIGHT_EXTRINSIC_ROTATION;
    residuals[row++] = extrinsicRotationLog.y * PRIOR_WEIGHT_EXTRINSIC_ROTATION;
    residuals[row++] = extrinsicRotationLog.z * PRIOR_WEIGHT_EXTRINSIC_ROTATION;
    residuals[row++] =
      (state.extrinsicTranslation.x - this.priorTranslation.x) *
      PRIOR_WEIGHT_EXTRINSIC_TRANSLATION;
    residuals[row++] =
      (state.extrinsicTranslation.y - this.priorTranslation.y) *
      PRIOR_WEIGHT_EXTRINSIC_TRANSLATION;
    residuals[row++] =
      (state.extrinsicTranslation.z - this.priorTranslation.z) *
      PRIOR_WEIGHT_EXTRINSIC_TRANSLATION;
    residuals[row++] =
      (state.rangeScale - this.priorRangeScale) * PRIOR_WEIGHT_RANGE_SCALE;
    return residuals;
  }

  private computeJacobian(
    state: SolverState,
    baseResiduals: Float64Array,
    nowMs: number
  ): Float64Array {
    const rows = baseResiduals.length;
    const jacobian = new Float64Array(STATE_SIZE * rows);
    const delta = new Float64Array(STATE_SIZE);
    for (let column = 0; column < STATE_SIZE; ++column) {
      delta.fill(0);
      delta[column] = NUMERIC_JACOBIAN_EPSILON;
      const perturbed = this.computeResiduals(
        this.applyDelta(state, delta),
        nowMs
      );
      for (let row = 0; row < rows; ++row) {
        jacobian[column * rows + row] =
          (perturbed[row] - baseResiduals[row]) / NUMERIC_JACOBIAN_EPSILON;
      }
    }
    return jacobian;
  }
}

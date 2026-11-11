import * as THREE from 'three';

import {
  DEFAULT_FACE_CAMERA_CAPSULE_HALF_HEIGHT,
  DEFAULT_FACE_CAMERA_SMOOTHING,
  faceCameraSlerpAlpha,
} from '../../../utils/FaceCameraMath';
import {smoothingAlpha} from '../../../utils/SmoothingMath';
import {cloneScaleOptions} from '../ManipulationConfig';
import {
  MANIPULATION_EASE_SECONDS,
  clampScaleFactor,
  faceCameraQuaternion,
  isFiniteVector,
  isPositiveFinite,
  isPositiveVector,
  worldPositionToLocal,
} from '../ManipulationMath';
import {
  ManipulationAction,
  type PushPullOptions,
  type TranslateOptions,
} from '../ManipulationTypes';
import type {
  ManipulationDriver,
  ManipulationDriverSession,
  Proposal,
  RaySmoothingState,
  TranslateBaseline,
} from './DriverTypes';

// Thumbstick deflection ignored so resting sticks and drift don't push/pull.
const PUSH_PULL_DEADZONE = 0.15;
// xr-standard gamepad mapping: thumbstick Y, where forward is negative.
const XR_STANDARD_THUMBSTICK_Y_AXIS = 3;
// Exponential rate: full deflection multiplies the distance by e^1.5 per second.
const DEFAULT_PUSH_PULL_SPEED = 1.5;
// Meters. Keeps the grab point in front of the controller when pulling.
const MIN_RAY_DEPTH = 0.05;
/**
 * Squared length below which a ray's cross product with world up is treated
 * as zero, meaning the ray points straight up or down and the ray frame uses
 * RAY_FRAME_FALLBACK_AXIS instead.
 */
const RAY_FRAME_PARALLEL_EPSILON_SQ = 1e-8;
/**
 * Distance, in meters, at which the scaled distance equals the real one.
 */
const REFERENCE_SCALE_DISTANCE = 1.75;
/**
 * Change in the scaled distance per meter of real distance, so owners look
 * larger closer and smaller farther.
 */
const DISTANCE_SCALE_RATE = 0.5;
/**
 * Hand travel, in meters, that the ray ignores as the pinch starts.
 */
const RAY_DEADZONE_DISTANCE = 0.03;
/** Hand turn, in radians, that the ray ignores as the pinch starts. */
const RAY_DEADZONE_ANGLE = THREE.MathUtils.degToRad(1.6);
/** Hand travel, in meters, by which the ray follows the hand fully. */
const RAY_FULL_DISTANCE = 0.1;
/** Hand turn, in radians, by which the ray follows the hand fully. */
const RAY_FULL_ANGLE = THREE.MathUtils.degToRad(7);
/** Shorter origin time constant while the hand reverses, in seconds. */
const RAY_REVERSAL_SMOOTHING_TIME = 0.018;
/** Angle between the remaining gap and the motion where reversal begins. */
const RAY_REVERSAL_START_ANGLE = THREE.MathUtils.degToRad(45);
/** Angle where the reversal time constant applies fully. */
const RAY_REVERSAL_FULL_ANGLE = THREE.MathUtils.degToRad(100);
/** Speed, in meters per second, below which the smoothed origin is still. */
const RAY_MIN_VELOCITY = 0.001;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Right-vector reference when the ray points straight up or down.
const RAY_FRAME_FALLBACK_AXIS = new THREE.Vector3(0, 0, 1);
/** Grab offset used when a move has no ray capture. */
const ZERO_OFFSET = new THREE.Vector3();

// Scratch objects for the per-move helpers below. None of them is returned to
// a caller that keeps it.
const _rawDirection = new THREE.Vector3();
const _targetOrigin = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _previousOrigin = new THREE.Vector3();
const _gap = new THREE.Vector3();
const _rayPoint = new THREE.Vector3();
const _rayOffset = new THREE.Vector3();
const _rayFrameRotation = new THREE.Quaternion();
const _probePosition = new THREE.Vector3();
const _limitOffset = new THREE.Vector3();
const _frameForward = new THREE.Vector3();
const _frameRight = new THREE.Vector3();
const _frameUp = new THREE.Vector3();
const _frameBasis = new THREE.Matrix4();
const _slerpRotation = new THREE.Quaternion();
const _slerpPartial = new THREE.Quaternion();

/** Captures and proposes Translate data. It does not own sessions or events. */
export class TranslateDriver implements ManipulationDriver<TranslateBaseline> {
  readonly action = ManipulationAction.Translate;
  private readonly viewerPosition = new THREE.Vector3();
  private readonly smoothedRay = new THREE.Ray();
  private readonly limitCorrection = new THREE.Vector3();

  constructor(
    private readonly camera?: THREE.Camera,
    private readonly timer?: THREE.Timer
  ) {}

  capture(session: ManipulationDriverSession): TranslateBaseline | undefined {
    const snapshot = session.primary.snapshot;
    const options = session.config.translate ?? {};
    if (
      (options.faceCamera &&
        ((options.mode !== undefined &&
          options.mode !== 'capsule' &&
          options.mode !== 'cylindrical' &&
          options.mode !== 'spherical') ||
          (options.capsuleHalfHeight !== undefined &&
            (!Number.isFinite(options.capsuleHalfHeight) ||
              options.capsuleHalfHeight < 0)) ||
          (options.smoothing !== undefined &&
            (!Number.isFinite(options.smoothing) || options.smoothing < 0)))) ||
      (!!options.pushPull && !resolvePushPull(options.pushPull)) ||
      !validDistanceLimits(options)
    ) {
      return undefined;
    }
    const worldPosition = session.owner.getWorldPosition(new THREE.Vector3());
    const viewerDistance = this.camera
      ?.getWorldPosition(new THREE.Vector3())
      .distanceTo(worldPosition);
    const cameraDistance = options.scaleWithDistance
      ? viewerDistance
      : undefined;
    const hasLimits =
      options.minDistance !== undefined || options.maxDistance !== undefined;
    const baseline: TranslateBaseline = {
      action: this.action,
      worldPosition,
      sourcePosition: snapshot.position.clone(),
      options: {...options},
      scale: session.owner.scale.clone(),
      cameraDistance:
        cameraDistance !== undefined &&
        isPositiveFinite(cameraDistance) &&
        isPositiveVector(session.owner.scale)
          ? cameraDistance
          : undefined,
      distanceLimits:
        hasLimits && viewerDistance !== undefined
          ? {
              min: Math.min(options.minDistance ?? 0, viewerDistance),
              max: Math.max(options.maxDistance ?? Infinity, viewerDistance),
            }
          : undefined,
      scaleOptions: cloneScaleOptions(session.config.scale),
    };
    if (snapshot.ray) {
      const {origin, direction} = snapshot.ray;
      baseline.rayDepth = direction.dot(
        session.primary.capture.point.clone().sub(origin)
      );
      const rayPoint = snapshot.ray.at(baseline.rayDepth, new THREE.Vector3());
      baseline.rayOffset = worldPosition.clone().sub(rayPoint);
      // A face-camera owner turns with the ray, so its grab offset does too.
      if (options.faceCamera) {
        baseline.rayOffset.applyQuaternion(
          rayFrame(direction, _rayFrameRotation).invert()
        );
      }
      if (options.raySmoothing) {
        const unit = direction.clone().normalize();
        baseline.raySmoothing = {
          startOrigin: origin.clone(),
          startDirection: unit.clone(),
          origin: origin.clone(),
          direction: unit,
          velocity: new THREE.Vector3(),
          weight: 0,
        };
      }
    }
    return baseline;
  }

  propose(
    session: ManipulationDriverSession,
    baseline: TranslateBaseline
  ): Proposal | undefined {
    const snapshot = session.primary.snapshot;
    const viewer = this.camera?.getWorldPosition(this.viewerPosition);
    let point: THREE.Vector3;
    let worldPosition: THREE.Vector3;
    if (snapshot.ray && baseline.rayDepth !== undefined && baseline.rayOffset) {
      const ray = this.smoothRay(baseline, snapshot.ray);
      baseline.rayDepth = this.pushPull(
        session,
        baseline,
        ray,
        baseline.rayDepth,
        viewer
      );
      point = ray.at(baseline.rayDepth, new THREE.Vector3());
      worldPosition = this.rayWorldPosition(
        baseline,
        ray,
        baseline.rayDepth,
        viewer,
        new THREE.Vector3()
      );
    } else {
      const moved = snapshot.position.clone().sub(baseline.sourcePosition);
      point = session.primary.capture.point.clone().add(moved);
      worldPosition = baseline.worldPosition.clone().add(moved);
    }
    point.add(
      this.limitDistance(baseline, worldPosition, viewer, this.limitCorrection)
    );
    const delta = worldPosition.clone().sub(baseline.worldPosition);
    const parent = session.owner.parent;
    parent?.updateWorldMatrix(true, false);
    const localPosition = worldPositionToLocal(
      worldPosition,
      parent?.matrixWorld
    );
    const localQuaternion = baseline.options.faceCamera
      ? faceCameraQuaternion(
          worldPosition,
          viewer,
          parent?.getWorldQuaternion(new THREE.Quaternion()),
          baseline.options.mode,
          baseline.options.capsuleHalfHeight ??
            DEFAULT_FACE_CAMERA_CAPSULE_HALF_HEIGHT
        )
      : undefined;
    const scale = this.scaleWithDistance(baseline, worldPosition, viewer);
    const rotationAlpha = this.timer
      ? faceCameraSlerpAlpha(
          baseline.options.smoothing ?? DEFAULT_FACE_CAMERA_SMOOTHING,
          this.timer.getDelta()
        )
      : 1;
    if (
      !isFiniteVector(point) ||
      !isFiniteVector(delta) ||
      !isFiniteVector(worldPosition) ||
      !isFiniteVector(localPosition)
    ) {
      return undefined;
    }
    return {
      action: this.action,
      point,
      delta,
      position: localPosition,
      worldPosition,
      scale,
      apply: () => {
        if (!isFiniteVector(localPosition)) return;
        session.owner.position.copy(localPosition);
        if (baseline.cameraDistance !== undefined) {
          session.owner.scale.copy(scale);
        }
        if (localQuaternion) {
          session.owner.quaternion.slerp(localQuaternion, rotationAlpha);
        }
      },
    };
  }

  /**
   * Returns the ray that drives the move. With `raySmoothing`, the raw ray is
   * held by the deadzone, blended in by the unlock ramp, and then eased once
   * per frame. Without a timer it follows the blended ray directly. The
   * smoothed ray is reused by the next call, so callers must not keep it.
   */
  private smoothRay(baseline: TranslateBaseline, raw: THREE.Ray): THREE.Ray {
    const state = baseline.raySmoothing;
    if (!state) return raw;
    const rawDirection = _rawDirection.copy(raw.direction).normalize();
    // Latched so a drag that comes back near its start does not lock again.
    state.weight = Math.max(
      state.weight,
      rayUnlockWeight(state, raw.origin, rawDirection)
    );
    const targetOrigin = _targetOrigin
      .copy(state.startOrigin)
      .lerp(raw.origin, state.weight);
    const targetDirection = slerpDirection(
      _targetDirection.copy(state.startDirection),
      rawDirection,
      state.weight
    );
    if (this.timer) {
      this.easeRay(state, targetOrigin, targetDirection, this.timer);
    } else {
      state.origin.copy(targetOrigin);
      state.direction.copy(targetDirection);
    }
    return this.smoothedRay.set(state.origin, state.direction);
  }

  /**
   * Eases the smoothed ray toward the target ray, once per frame, and tracks
   * the smoothed origin's velocity for reversals.
   */
  private easeRay(
    state: RaySmoothingState,
    targetOrigin: THREE.Vector3,
    targetDirection: THREE.Vector3,
    timer: THREE.Timer
  ): void {
    const time = timer.getElapsed();
    const deltaTime = timer.getDelta();
    if (state.time === time) return;
    state.time = time;
    if (!isPositiveFinite(deltaTime)) return;
    const previous = _previousOrigin.copy(state.origin);
    state.origin.lerp(
      targetOrigin,
      smoothingAlpha(deltaTime, originSmoothingTime(state, targetOrigin))
    );
    state.velocity.subVectors(state.origin, previous).divideScalar(deltaTime);
    slerpDirection(
      state.direction,
      targetDirection,
      smoothingAlpha(deltaTime, MANIPULATION_EASE_SECONDS)
    );
  }

  /**
   * Writes the owner's world position for a grab point at `depth` along `ray`
   * into `target`. The capture offset turns with the ray when the owner faces
   * the camera and scales with the owner when `scaleWithDistance` is on.
   */
  private rayWorldPosition(
    baseline: TranslateBaseline,
    ray: THREE.Ray,
    depth: number,
    viewer: THREE.Vector3 | undefined,
    target: THREE.Vector3
  ): THREE.Vector3 {
    const point = ray.at(depth, _rayPoint);
    const offset = _rayOffset.copy(baseline.rayOffset ?? ZERO_OFFSET);
    if (baseline.options.faceCamera) {
      offset.applyQuaternion(rayFrame(ray.direction, _rayFrameRotation));
    }
    const position = target.copy(point).add(offset);
    if (baseline.cameraDistance === undefined || !viewer) return position;
    // The scale depends on the resulting distance, so evaluate it twice.
    for (let pass = 0; pass < 2; pass++) {
      const factor = this.distanceScaleFactor(baseline, position, viewer);
      position.copy(point).addScaledVector(offset, factor);
    }
    return position;
  }

  /**
   * Moves `worldPosition` back within the distance limits from the viewer and
   * writes the correction that was applied into `correction`.
   */
  private limitDistance(
    baseline: TranslateBaseline,
    worldPosition: THREE.Vector3,
    viewer: THREE.Vector3 | undefined,
    correction: THREE.Vector3
  ): THREE.Vector3 {
    correction.set(0, 0, 0);
    const limits = baseline.distanceLimits;
    if (!limits || !viewer) return correction;
    const offset = _limitOffset.copy(worldPosition).sub(viewer);
    const distance = offset.length();
    if (!isPositiveFinite(distance)) return correction;
    const clamped = THREE.MathUtils.clamp(distance, limits.min, limits.max);
    if (clamped === distance) return correction;
    correction.copy(offset).multiplyScalar(clamped / distance - 1);
    worldPosition.add(correction);
    return correction;
  }

  /**
   * Moves the grab point along the ray with the thumbstick's forward axis,
   * keeping the owner within the distance limits from the viewer.
   */
  private pushPull(
    session: ManipulationDriverSession,
    baseline: TranslateBaseline,
    ray: THREE.Ray,
    depth: number,
    viewer?: THREE.Vector3
  ): number {
    const speed = resolvePushPull(baseline.options.pushPull);
    // Only XR controllers: on a desktop gamepad the same axis is the right
    // stick, which the simulator uses to look up and down.
    const gamepad = session.primary.snapshot.controller.gamepad;
    const stick =
      gamepad?.mapping === 'xr-standard'
        ? gamepad.axes[XR_STANDARD_THUMBSTICK_Y_AXIS]
        : undefined;
    if (
      !speed ||
      !this.timer ||
      stick === undefined ||
      !Number.isFinite(stick) ||
      Math.abs(stick) < PUSH_PULL_DEADZONE
    ) {
      return depth;
    }
    // propose() can run more than once per frame; step only once.
    const time = this.timer.getElapsed();
    if (baseline.pushPullTime === time) return depth;
    baseline.pushPullTime = time;
    const next = Math.max(
      Math.min(MIN_RAY_DEPTH, depth),
      depth * Math.exp(-stick * speed * this.timer.getDelta())
    );
    const limits = baseline.distanceLimits;
    if (!limits || !viewer) return next;
    const current = this.rayWorldPosition(
      baseline,
      ray,
      depth,
      viewer,
      _probePosition
    ).distanceTo(viewer);
    const candidate = this.rayWorldPosition(
      baseline,
      ray,
      next,
      viewer,
      _probePosition
    ).distanceTo(viewer);
    // Only block steps that move farther outside the limits, so an owner that
    // starts outside them never snaps, and pulling back responds immediately.
    if (candidate > current && candidate > limits.max) return depth;
    if (candidate < current && candidate < limits.min) return depth;
    return next;
  }

  private scaleWithDistance(
    baseline: TranslateBaseline,
    worldPosition: THREE.Vector3,
    viewer?: THREE.Vector3
  ): THREE.Vector3 {
    const scale = baseline.scale.clone();
    if (baseline.cameraDistance === undefined || !viewer) return scale;
    return scale.multiplyScalar(
      this.distanceScaleFactor(baseline, worldPosition, viewer)
    );
  }

  /** Returns the distance scale factor at `worldPosition`, or 1 if invalid. */
  private distanceScaleFactor(
    baseline: TranslateBaseline,
    worldPosition: THREE.Vector3,
    viewer: THREE.Vector3
  ): number {
    if (baseline.cameraDistance === undefined) return 1;
    const factor = clampScaleFactor(
      sizeDistance(viewer.distanceTo(worldPosition)) /
        sizeDistance(baseline.cameraDistance),
      baseline.scale,
      baseline.scaleOptions
    );
    return isPositiveFinite(factor) ? factor : 1;
  }
}

/**
 * Returns the distance that sets an owner's scale at a real `distance` from
 * the viewer. Scale is the ratio of this value now to its value at capture.
 * It stays positive for any distance, since DISTANCE_SCALE_RATE is below 1.
 */
function sizeDistance(distance: number): number {
  return (
    REFERENCE_SCALE_DISTANCE +
    DISTANCE_SCALE_RATE * (distance - REFERENCE_SCALE_DISTANCE)
  );
}

/**
 * Writes the rotation of the ray-hit frame into `target`: forward along
 * `direction`, right horizontal, and up perpendicular to both.
 */
function rayFrame(
  direction: THREE.Vector3,
  target: THREE.Quaternion
): THREE.Quaternion {
  const forward = _frameForward.copy(direction).normalize();
  const right = _frameRight.copy(forward).cross(WORLD_UP);
  if (right.lengthSq() < RAY_FRAME_PARALLEL_EPSILON_SQ)
    right.copy(forward).cross(RAY_FRAME_FALLBACK_AXIS);
  right.normalize();
  const up = _frameUp.copy(right).cross(forward);
  return target.setFromRotationMatrix(
    _frameBasis.makeBasis(right, up, forward.negate())
  );
}

/** Deadzone and ramp weight: 0 inside the deadzone, 1 at full engagement. */
function rayUnlockWeight(
  state: RaySmoothingState,
  origin: THREE.Vector3,
  direction: THREE.Vector3
): number {
  const distance = origin.distanceTo(state.startOrigin);
  const angle = direction.angleTo(state.startDirection);
  return Math.max(
    THREE.MathUtils.clamp(
      (distance - RAY_DEADZONE_DISTANCE) /
        (RAY_FULL_DISTANCE - RAY_DEADZONE_DISTANCE),
      0,
      1
    ),
    THREE.MathUtils.clamp(
      (angle - RAY_DEADZONE_ANGLE) / (RAY_FULL_ANGLE - RAY_DEADZONE_ANGLE),
      0,
      1
    )
  );
}

/**
 * Origin time constant, shortened as the remaining gap turns against the
 * smoothed velocity so reversals do not lag behind the hand.
 */
function originSmoothingTime(
  state: RaySmoothingState,
  target: THREE.Vector3
): number {
  const gap = _gap.subVectors(target, state.origin);
  if (state.velocity.length() < RAY_MIN_VELOCITY || gap.lengthSq() === 0) {
    return MANIPULATION_EASE_SECONDS;
  }
  const reversal = THREE.MathUtils.clamp(
    (gap.angleTo(state.velocity) - RAY_REVERSAL_START_ANGLE) /
      (RAY_REVERSAL_FULL_ANGLE - RAY_REVERSAL_START_ANGLE),
    0,
    1
  );
  return THREE.MathUtils.lerp(
    MANIPULATION_EASE_SECONDS,
    RAY_REVERSAL_SMOOTHING_TIME,
    reversal
  );
}

/** Rotates unit vector `from` toward unit vector `to` by `t` in place. */
function slerpDirection(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const rotation = _slerpRotation.setFromUnitVectors(from, to);
  return from
    .applyQuaternion(_slerpPartial.identity().slerp(rotation, t))
    .normalize();
}

/** Returns the push/pull speed, or undefined when disabled or invalid. */
function resolvePushPull(
  value: TranslateOptions['pushPull']
): number | undefined {
  if (!value) return undefined;
  const speed =
    (value === true ? undefined : (value as PushPullOptions).speed) ??
    DEFAULT_PUSH_PULL_SPEED;
  return isPositiveFinite(speed) ? speed : undefined;
}

function validDistanceLimits({minDistance, maxDistance}: TranslateOptions) {
  if (minDistance !== undefined && !(minDistance >= 0)) return false;
  if (maxDistance !== undefined && !(maxDistance > 0)) return false;
  return (minDistance ?? 0) <= (maxDistance ?? Infinity);
}

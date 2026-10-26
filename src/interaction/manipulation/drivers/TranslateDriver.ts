import * as THREE from 'three';

import {
  DEFAULT_FACE_CAMERA_CAPSULE_HALF_HEIGHT,
  DEFAULT_FACE_CAMERA_SMOOTHING,
  faceCameraSlerpAlpha,
} from '../../../utils/FaceCameraMath';
import {cloneScaleOptions} from '../ManipulationConfig';
import {
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
// Android XR keeps panel size consistent up to 1.75 m, then scales at 0.5 m
// per meter so farther panels look smaller.
const CONSTANT_SIZE_DISTANCE = 1.75;
const FAR_SCALE_RATE = 0.5;

/** Captures and proposes Translate data. It does not own sessions or events. */
export class TranslateDriver implements ManipulationDriver<TranslateBaseline> {
  readonly action = ManipulationAction.Translate;

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
      baseline.rayDepth = snapshot.ray.direction.dot(
        session.primary.capture.point.clone().sub(snapshot.ray.origin)
      );
      baseline.rayPoint = snapshot.ray
        .at(baseline.rayDepth, new THREE.Vector3())
        .clone();
    }
    return baseline;
  }

  propose(
    session: ManipulationDriverSession,
    baseline: TranslateBaseline
  ): Proposal | undefined {
    const snapshot = session.primary.snapshot;
    const viewer = this.camera?.getWorldPosition(new THREE.Vector3());
    let delta: THREE.Vector3;
    let point: THREE.Vector3;
    if (snapshot.ray && baseline.rayDepth !== undefined && baseline.rayPoint) {
      baseline.rayDepth = this.pushPull(
        session,
        baseline,
        snapshot.ray,
        baseline.rayDepth,
        viewer
      );
      point = snapshot.ray.at(baseline.rayDepth, new THREE.Vector3());
      delta = point.clone().sub(baseline.rayPoint);
    } else {
      delta = snapshot.position.clone().sub(baseline.sourcePosition);
      point = session.primary.capture.point.clone().add(delta);
    }
    const worldPosition = baseline.worldPosition.clone().add(delta);
    const correction = this.limitDistance(baseline, worldPosition, viewer);
    delta.add(correction);
    point.add(correction);
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
          const speed = delta.length();
          const effectiveAlpha = Math.min(1, rotationAlpha + speed * 3.0);
          session.owner.quaternion.slerp(localQuaternion, effectiveAlpha);
        }
      },
    };
  }

  /**
   * Moves `worldPosition` back within the distance limits from the viewer and
   * returns the correction that was applied.
   */
  private limitDistance(
    baseline: TranslateBaseline,
    worldPosition: THREE.Vector3,
    viewer?: THREE.Vector3
  ): THREE.Vector3 {
    const correction = new THREE.Vector3();
    const limits = baseline.distanceLimits;
    if (!limits || !viewer) return correction;
    const offset = worldPosition.clone().sub(viewer);
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
    const distanceAt = (value: number) =>
      ray
        .at(value, new THREE.Vector3())
        .sub(baseline.rayPoint!)
        .add(baseline.worldPosition)
        .distanceTo(viewer);
    const current = distanceAt(depth);
    const candidate = distanceAt(next);
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
    const distance = viewer.distanceTo(worldPosition);
    const factor = clampScaleFactor(
      sizeDistance(distance) / sizeDistance(baseline.cameraDistance),
      baseline.scale,
      baseline.scaleOptions
    );
    return isPositiveFinite(factor) ? scale.multiplyScalar(factor) : scale;
  }
}

function sizeDistance(distance: number): number {
  return distance <= CONSTANT_SIZE_DISTANCE
    ? distance
    : CONSTANT_SIZE_DISTANCE +
        FAR_SCALE_RATE * (distance - CONSTANT_SIZE_DISTANCE);
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

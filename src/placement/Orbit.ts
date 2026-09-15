import * as THREE from 'three';

import {TransformScript} from './TransformScript';

const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const NEGATIVE_Z_AXIS = new THREE.Vector3(0, 0, -1);
const WORLD_FRAME = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(X_AXIS, NEGATIVE_Z_AXIS, Y_AXIS)
);

export type OrbitPath = 'circular' | 'elliptical';
export type OrbitFrame = 'world' | 'target' | 'view';
export type OrbitDirection = 'clockwise' | 'counterclockwise';

export interface OrbitOptions {
  /** Object at the focus of the orbit. */
  target: THREE.Object3D;
  /** Semi-major radius in meters. Defaults to 0.5. */
  radius?: number;
  /** Seconds per orbit. Defaults to 20. */
  period?: number;
  /** Circular or Kepler-style elliptical motion. Defaults to circular. */
  path?: OrbitPath;
  /** Reference frame for the orbital plane. Defaults to world. */
  frame?: OrbitFrame;
  /** Ellipse eccentricity in [0, 1). Defaults to 0.2 for ellipses. */
  eccentricity?: number;
  /** Initial orbital-plane tilt in radians. Defaults to 0. */
  inclination?: number;
  /** Seconds per full rotation of the orbital plane. */
  precessionPeriod?: number;
  /** Direction viewed from the positive orbital normal. */
  direction?: OrbitDirection;
  /** Minimum gap between captured object bounds in meters. Defaults to 0. */
  clearance?: number;
}

/**
 * Moves its parent around a target focus.
 *
 * Bounds are captured during initialization and after `resume()`. Call
 * `resume()` after changing geometry or scale to refresh overlap avoidance.
 */
export class Orbit extends TransformScript {
  static dependencies = {camera: THREE.Camera, timer: THREE.Timer};

  private camera?: THREE.Camera;
  private timer?: THREE.Timer;
  private readonly target: THREE.Object3D;
  private readonly configuredRadius: number;
  private readonly period: number;
  private readonly frame: OrbitFrame;
  private readonly eccentricity: number;
  private readonly minorAxisScale: number;
  private readonly precessionPeriod?: number;
  private readonly directionSign: number;
  private readonly clearance: number;

  private semiMajorRadius: number;
  private meanAnomaly = 0;
  private precessionAngle = 0;

  private readonly orientation = new THREE.Quaternion();
  private readonly frameQuaternion = new THREE.Quaternion();
  private readonly precessionQuaternion = new THREE.Quaternion();
  private readonly orbitQuaternion = new THREE.Quaternion();
  private readonly basisMatrix = new THREE.Matrix4();
  private readonly targetPosition = new THREE.Vector3();
  private readonly ownerPosition = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly orbitOffset = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3();
  private readonly worldQuaternion = new THREE.Quaternion();

  constructor(options: OrbitOptions) {
    super();
    if (!options?.target) throw new Error('Orbit requires a target object.');

    this.target = options.target;
    this.configuredRadius = positive(options.radius ?? 0.5, 'radius');
    this.semiMajorRadius = this.configuredRadius;
    this.period = positive(options.period ?? 20, 'period');

    const path = oneOf(
      options.path ?? 'circular',
      ['circular', 'elliptical'] as const,
      'path'
    );
    const eccentricity =
      options.eccentricity ?? (path === 'elliptical' ? 0.2 : 0);
    if (path === 'circular' && eccentricity !== 0) {
      throw new Error('Circular Orbit paths require zero eccentricity.');
    }
    this.eccentricity = range(eccentricity, 0, 1, 'eccentricity');
    this.minorAxisScale = Math.sqrt(1 - this.eccentricity ** 2);

    this.frame = oneOf(
      options.frame ?? 'world',
      ['world', 'target', 'view'] as const,
      'frame'
    );
    this.precessionPeriod = optionalPositive(
      options.precessionPeriod,
      'precessionPeriod'
    );
    this.orientation.setFromAxisAngle(
      X_AXIS,
      finite(options.inclination ?? 0, 'inclination')
    );

    const direction = oneOf(
      options.direction ?? 'counterclockwise',
      ['clockwise', 'counterclockwise'] as const,
      'direction'
    );
    this.directionSign = direction === 'clockwise' ? -1 : 1;
    this.clearance = nonnegative(options.clearance ?? 0, 'clearance');
  }

  init({camera, timer}: {camera: THREE.Camera; timer: THREE.Timer}) {
    this.camera = camera;
    this.timer = timer;

    const owner = this.parent;
    if (!owner) return;
    if (
      isAncestorOrSelf(owner, this.target) ||
      isAncestorOrSelf(this.target, owner)
    ) {
      throw new Error(
        'Orbit target must not be its owner, ancestor, or descendant.'
      );
    }

    this.semiMajorRadius = this.configuredRadius;
    this.applyClearance(owner);
    this.updateOrbitOrientation();
  }

  update() {
    const owner = this.parent;
    if (!this.canUpdate || !owner || !this.timer) return;

    const delta = this.timer.getDelta();
    if (!Number.isFinite(delta) || delta <= 0) return;

    this.meanAnomaly = normalizeAngle(
      this.meanAnomaly + this.directionSign * ((TAU * delta) / this.period)
    );
    if (this.precessionPeriod !== undefined) {
      this.precessionAngle = normalizeAngle(
        this.precessionAngle + (TAU * delta) / this.precessionPeriod
      );
    }

    this.updateOrbitOrientation();
    this.applyPosition(owner);
  }

  /** Restarts the orbit from the parent's manipulated position. */
  protected rebase() {
    const owner = this.parent;
    if (!owner) return;

    this.updateOrbitOrientation();
    owner.getWorldPosition(this.ownerPosition);
    this.orbitOffset.copy(this.ownerPosition).sub(this.targetPosition);
    const distance = this.orbitOffset.length();

    if (distance > EPSILON) {
      this.rebasePlane(this.orbitOffset.multiplyScalar(1 / distance));
      this.semiMajorRadius = distance / (1 - this.eccentricity);
      this.meanAnomaly = 0;
    }

    this.applyClearance(owner);
    this.updateOrbitOrientation();
    this.applyPosition(owner);
  }

  private updateOrbitOrientation() {
    this.updateFrame();
    this.precessionQuaternion.setFromAxisAngle(Z_AXIS, this.precessionAngle);
    this.orbitQuaternion
      .copy(this.frameQuaternion)
      .multiply(this.precessionQuaternion)
      .multiply(this.orientation)
      .normalize();
  }

  private updateFrame() {
    this.target.getWorldPosition(this.targetPosition);

    if (this.frame === 'world') {
      this.frameQuaternion.copy(WORLD_FRAME);
      return;
    }

    if (this.frame === 'target') {
      this.target
        .getWorldQuaternion(this.frameQuaternion)
        .multiply(WORLD_FRAME);
      return;
    }

    const camera = this.camera;
    if (!camera) {
      this.frameQuaternion.copy(WORLD_FRAME);
      return;
    }
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldQuaternion(this.worldQuaternion);
    this.cameraUp.copy(camera.up).applyQuaternion(this.worldQuaternion);
    this.basisMatrix.lookAt(
      this.cameraPosition,
      this.targetPosition,
      this.cameraUp
    );
    this.frameQuaternion.setFromRotationMatrix(this.basisMatrix);
  }

  private rebasePlane(direction: THREE.Vector3) {
    this.normal.copy(Z_AXIS).applyQuaternion(this.orbitQuaternion);
    projectOntoPlane(this.normal, direction);
    if (this.normal.lengthSq() <= EPSILON) {
      this.normal.copy(Y_AXIS);
      projectOntoPlane(this.normal, direction);
    }
    if (this.normal.lengthSq() <= EPSILON) {
      this.normal.copy(X_AXIS);
      projectOntoPlane(this.normal, direction);
    }
    this.normal.normalize();
    this.tangent.crossVectors(this.normal, direction).normalize();
    this.basisMatrix.makeBasis(direction, this.tangent, this.normal);
    this.orbitQuaternion.setFromRotationMatrix(this.basisMatrix);

    this.orientation
      .copy(this.frameQuaternion)
      .multiply(this.precessionQuaternion)
      .invert()
      .multiply(this.orbitQuaternion)
      .normalize();
  }

  private applyPosition(owner: THREE.Object3D) {
    const eccentricAnomaly = solveKepler(this.meanAnomaly, this.eccentricity);
    this.orbitOffset.set(
      this.semiMajorRadius * (Math.cos(eccentricAnomaly) - this.eccentricity),
      this.semiMajorRadius * this.minorAxisScale * Math.sin(eccentricAnomaly),
      0
    );
    this.orbitOffset.applyQuaternion(this.orbitQuaternion);
    this.worldPosition.copy(this.targetPosition).add(this.orbitOffset);
    owner.parent?.worldToLocal(this.worldPosition);
    owner.position.copy(this.worldPosition);
  }

  private applyClearance(owner: THREE.Object3D) {
    const minimumPeriapsis =
      worldBoundingRadius(this.target) +
      worldBoundingRadius(owner) +
      this.clearance;
    this.semiMajorRadius = Math.max(
      this.semiMajorRadius,
      minimumPeriapsis / (1 - this.eccentricity)
    );
  }
}

function projectOntoPlane(vector: THREE.Vector3, normal: THREE.Vector3) {
  vector.addScaledVector(normal, -vector.dot(normal));
}

function worldBoundingRadius(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return 0;

  const origin = object.getWorldPosition(new THREE.Vector3());
  const x = Math.max(
    Math.abs(bounds.min.x - origin.x),
    Math.abs(bounds.max.x - origin.x)
  );
  const y = Math.max(
    Math.abs(bounds.min.y - origin.y),
    Math.abs(bounds.max.y - origin.y)
  );
  const z = Math.max(
    Math.abs(bounds.min.z - origin.z),
    Math.abs(bounds.max.z - origin.z)
  );
  return Math.hypot(x, y, z);
}

function solveKepler(meanAnomaly: number, eccentricity: number) {
  if (eccentricity === 0) return meanAnomaly;

  let mean = normalizeAngle(meanAnomaly);
  if (mean > Math.PI) mean -= TAU;

  let lower = -Math.PI;
  let upper = Math.PI;
  let eccentricAnomaly =
    eccentricity < 0.8 || mean === 0 ? mean : Math.sign(mean) * Math.PI;

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const error =
      eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - mean;
    if (Math.abs(error) <= 1e-12) return eccentricAnomaly;
    if (error > 0) upper = eccentricAnomaly;
    else lower = eccentricAnomaly;

    const derivative = 1 - eccentricity * Math.cos(eccentricAnomaly);
    const next = eccentricAnomaly - error / derivative;
    eccentricAnomaly =
      Number.isFinite(next) && next > lower && next < upper
        ? next
        : (lower + upper) * 0.5;
  }
  return eccentricAnomaly;
}

function normalizeAngle(angle: number) {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Orbit ${name} must be finite.`);
  }
  return value;
}

function positive(value: number, name: string) {
  finite(value, name);
  if (value <= 0) throw new Error(`Orbit ${name} must be greater than zero.`);
  return value;
}

function optionalPositive(value: number | undefined, name: string) {
  return value === undefined ? undefined : positive(value, name);
}

function nonnegative(value: number, name: string) {
  finite(value, name);
  if (value < 0) throw new Error(`Orbit ${name} must be nonnegative.`);
  return value;
}

function range(value: number, min: number, max: number, name: string) {
  finite(value, name);
  if (value < min || value >= max) {
    throw new Error(`Orbit ${name} must be in [${min}, ${max}).`);
  }
  return value;
}

function oneOf<T extends string>(
  value: string,
  choices: readonly T[],
  name: string
): T {
  if (!choices.includes(value as T)) {
    throw new Error(`Orbit ${name} must be ${choices.join(' or ')}.`);
  }
  return value as T;
}

function isAncestorOrSelf(
  object: THREE.Object3D,
  possibleAncestor: THREE.Object3D
) {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (current === possibleAncestor) return true;
  }
  return false;
}

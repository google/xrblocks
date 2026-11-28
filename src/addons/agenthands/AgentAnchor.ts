import * as THREE from 'three';

// Where the agent appears by default: a little under arm's length in front of
// the viewer and below eye level, so the hands sit at chest height.
const DEFAULT_DISTANCE_M = 0.7;
const DEFAULT_HEIGHT_M = -0.35;
// How far from where the viewer looks, and how far away, the agent can be
// before it counts as out of view.
const DEFAULT_VIEW_ANGLE = THREE.MathUtils.degToRad(40);
const DEFAULT_MAX_DISTANCE_M = 3;
// Closer than this (horizontally) a point has no useful direction from the
// viewer or the glide center.
const MIN_HORIZONTAL_DISTANCE_M = 1e-3;

const scratchEye = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export interface AgentAnchorOptions {
  /** Metres in front of the viewer to place the agent. */
  distance?: number;
  /** Metres above the viewer's eyes to place the agent; negative is below. */
  height?: number;
  /**
   * Radians from where the viewer is heading within which the agent is in
   * view. Looking up or down doesn't count, the same as for placement.
   */
  viewAngle?: number;
  /** Metres from the viewer beyond which the agent is out of view. */
  maxDistance?: number;
  /**
   * Whether the agent turns in place to face the viewer as they move. When
   * off, it keeps the heading it was placed with. Defaults to off.
   */
  faceViewer?: boolean;
  /**
   * Whether the agent follows the viewer, staying in front of them as they
   * turn and walk, instead of staying where it was placed. While following it
   * also faces them, so `faceViewer` makes no difference. Defaults to off.
   */
  followViewer?: boolean;
}

/**
 * Keeps the agent world-locked. It is placed in front of the viewer once and
 * then stays at that spot in the room as the viewer turns and walks, unless
 * `followViewer` is on. Call `update()` each frame and turn the agent by
 * `facing()`: it keeps the direction it was placed with, or with `faceViewer`
 * on, turns in place toward the viewer. `comeIntoView()` brings it back in
 * front of the viewer when it is out of view, for example when the user
 * starts talking to it.
 *
 * The viewer is usually the camera and looks down its local -Z axis.
 */
export class AgentAnchor {
  /** Where the agent rests in the world. */
  readonly position = new THREE.Vector3();
  /** Whether the agent turns in place to face the viewer as they move. */
  faceViewer: boolean;
  /** Whether the agent follows the viewer instead of staying where it was placed. */
  followViewer: boolean;

  private placed_ = false;
  private heading = 0;
  private distance: number;
  private height: number;
  private viewAngle: number;
  private maxDistance: number;

  constructor({
    distance = DEFAULT_DISTANCE_M,
    height = DEFAULT_HEIGHT_M,
    viewAngle = DEFAULT_VIEW_ANGLE,
    maxDistance = DEFAULT_MAX_DISTANCE_M,
    faceViewer = false,
    followViewer = false,
  }: AgentAnchorOptions = {}) {
    this.distance = distance;
    this.height = height;
    this.viewAngle = viewAngle;
    this.maxDistance = maxDistance;
    this.faceViewer = faceViewer;
    this.followViewer = followViewer;
  }

  /** Whether the agent has been placed yet. */
  get placed() {
    return this.placed_;
  }

  /**
   * Forgets the placement, for example when an XR session starts and the
   * camera jumps. The next `update()` or `comeIntoView()` places the agent
   * again.
   */
  reset() {
    this.placed_ = false;
  }

  /**
   * Places the agent in front of the viewer the first time, and on every call
   * while `followViewer` is on. Call it once per frame.
   * @returns Whether the agent was placed.
   */
  update(viewer: THREE.Object3D) {
    if (this.placed_ && !this.followViewer) return false;
    this.placeInFront(viewer);
    return true;
  }

  /**
   * Whether the agent is placed, within `viewAngle` of where the viewer is
   * heading, and no further than `maxDistance` from it.
   */
  isInView(viewer: THREE.Object3D) {
    if (!this.placed_) return false;
    viewer.getWorldPosition(scratchEye);
    if (scratchEye.distanceTo(this.position) > this.maxDistance) return false;
    const dx = this.position.x - scratchEye.x;
    const dz = this.position.z - scratchEye.z;
    if (Math.hypot(dx, dz) < MIN_HORIZONTAL_DISTANCE_M) return false;
    // The heading the viewer would have looking at the agent.
    const toAgent = Math.atan2(-dx, -dz);
    return (
      Math.abs(wrapAngle(toAgent - viewerHeading(viewer))) <= this.viewAngle
    );
  }

  /**
   * Places the agent in front of the viewer unless it is already in view.
   * @returns Whether the agent moved.
   */
  comeIntoView(viewer: THREE.Object3D) {
    if (this.isInView(viewer)) return false;
    this.placeInFront(viewer);
    return true;
  }

  /**
   * The heading (yaw, in radians) to turn the agent by: toward the viewer from
   * `from` when `faceViewer` is on, otherwise the heading it was placed with.
   */
  facing(viewer: THREE.Object3D, from: THREE.Vector3 = this.position) {
    if (!this.faceViewer) return this.heading;
    viewer.getWorldPosition(scratchEye);
    return Math.atan2(scratchEye.x - from.x, scratchEye.z - from.z);
  }

  // Places the agent in front of the viewer along its heading, so looking up
  // or down does not tilt the placement.
  private placeInFront(viewer: THREE.Object3D) {
    const yaw = viewerHeading(viewer);
    viewer.getWorldPosition(scratchEye);
    this.position.set(
      scratchEye.x - Math.sin(yaw) * this.distance,
      scratchEye.y + this.height,
      scratchEye.z - Math.cos(yaw) * this.distance
    );
    this.heading = yaw;
    this.placed_ = true;
  }
}

// The viewer's heading (yaw, in radians), ignoring looking up or down.
function viewerHeading(viewer: THREE.Object3D) {
  viewer.getWorldQuaternion(scratchQuat);
  return scratchEuler.setFromQuaternion(scratchQuat, 'YXZ').y;
}

// The same angle, between -PI and PI.
function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Moves `current` a fraction `alpha` of the way to `target` along an arc
 * around `center`, usually the user's head. An agent coming back into view
 * then swings around the user instead of passing through them.
 * @returns `current`, moved.
 */
export function glideAround(
  current: THREE.Vector3,
  target: THREE.Vector3,
  center: THREE.Vector3,
  alpha: number
) {
  const fromX = current.x - center.x;
  const fromZ = current.z - center.z;
  const toX = target.x - center.x;
  const toZ = target.z - center.z;
  const fromRadius = Math.hypot(fromX, fromZ);
  const toRadius = Math.hypot(toX, toZ);
  if (
    fromRadius < MIN_HORIZONTAL_DISTANCE_M ||
    toRadius < MIN_HORIZONTAL_DISTANCE_M
  ) {
    return current.lerp(target, alpha);
  }
  const fromAngle = Math.atan2(fromX, fromZ);
  const angle = fromAngle + wrapAngle(Math.atan2(toX, toZ) - fromAngle) * alpha;
  const radius = fromRadius + (toRadius - fromRadius) * alpha;
  return current.set(
    center.x + Math.sin(angle) * radius,
    current.y + (target.y - current.y) * alpha,
    center.z + Math.cos(angle) * radius
  );
}

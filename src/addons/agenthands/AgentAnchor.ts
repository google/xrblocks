import * as THREE from 'three';

const scratchEye = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchToAgent = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export interface AgentAnchorOptions {
  /** Metres in front of the viewer to place the agent. */
  distance?: number;
  /** Metres above the viewer's eyes to place the agent; negative is below. */
  height?: number;
  /** Radians from where the viewer looks within which the agent is in view. */
  viewAngle?: number;
  /** Metres from the viewer beyond which the agent is out of view. */
  maxDistance?: number;
  /**
   * Whether the agent turns in place to face the viewer as they move. When
   * off, it keeps the heading it was placed with. Defaults to off.
   */
  faceViewer?: boolean;
}

/**
 * Keeps the agent world-locked. It is placed in front of the viewer once and
 * then stays at that spot in the room as the viewer turns and walks. Turn it
 * by `facing()` each frame: it keeps the direction it was placed with, or with
 * `faceViewer` on, turns in place toward the viewer. `comeIntoView()` brings
 * it back in front of the viewer when it is out of view, for example when the
 * user starts talking to it.
 *
 * The viewer is usually the camera and looks down its local -Z axis.
 */
export class AgentAnchor {
  /** Where the agent rests in the world. */
  readonly position = new THREE.Vector3();
  /** Whether the agent turns in place to face the viewer as they move. */
  faceViewer: boolean;

  private placed_ = false;
  private heading_ = 0;
  private distance: number;
  private height: number;
  private viewAngle: number;
  private maxDistance: number;

  constructor({
    distance = 0.7,
    height = -0.35,
    viewAngle = THREE.MathUtils.degToRad(40),
    maxDistance = 3,
    faceViewer = false,
  }: AgentAnchorOptions = {}) {
    this.distance = distance;
    this.height = height;
    this.viewAngle = viewAngle;
    this.maxDistance = maxDistance;
    this.faceViewer = faceViewer;
  }

  /** Whether the agent has been placed yet. */
  get placed() {
    return this.placed_;
  }

  /**
   * The viewer's heading (yaw, in radians) when the agent was placed. Rotate
   * the agent by it to keep the direction it was placed with instead of
   * turning to follow the viewer.
   */
  get heading() {
    return this.heading_;
  }

  /**
   * Forgets the placement, for example when an XR session starts and the
   * camera jumps. The next `placeInFront()` or `comeIntoView()` places the
   * agent again.
   */
  reset() {
    this.placed_ = false;
  }

  /**
   * Places the agent in front of the viewer along its heading, so looking up
   * or down does not tilt the placement.
   */
  placeInFront(viewer: THREE.Object3D) {
    viewer.getWorldPosition(scratchEye);
    viewer.getWorldQuaternion(scratchQuat);
    const yaw = scratchEuler.setFromQuaternion(scratchQuat, 'YXZ').y;
    this.position.set(
      scratchEye.x - Math.sin(yaw) * this.distance,
      scratchEye.y + this.height,
      scratchEye.z - Math.cos(yaw) * this.distance
    );
    this.heading_ = yaw;
    this.placed_ = true;
  }

  /**
   * Whether the agent is placed, within `viewAngle` of where the viewer looks,
   * and no further than `maxDistance` from it.
   */
  isInView(viewer: THREE.Object3D) {
    if (!this.placed_) return false;
    viewer.getWorldPosition(scratchEye);
    scratchToAgent.subVectors(this.position, scratchEye);
    if (scratchToAgent.length() > this.maxDistance) return false;
    viewer.getWorldQuaternion(scratchQuat);
    scratchForward.set(0, 0, -1).applyQuaternion(scratchQuat);
    return scratchForward.angleTo(scratchToAgent) <= this.viewAngle;
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
   * The heading (yaw, in radians) the viewer would have looking straight at
   * `from`, the agent's resting spot by default. Rotate the agent by it to
   * turn it toward the viewer.
   */
  headingFrom(viewer: THREE.Object3D, from: THREE.Vector3 = this.position) {
    viewer.getWorldPosition(scratchEye);
    return Math.atan2(scratchEye.x - from.x, scratchEye.z - from.z);
  }

  /**
   * The heading (yaw, in radians) to turn the agent by: toward the viewer from
   * `from` when `faceViewer` is on, otherwise the heading it was placed with.
   */
  facing(viewer: THREE.Object3D, from: THREE.Vector3 = this.position) {
    return this.faceViewer ? this.headingFrom(viewer, from) : this.heading_;
  }
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
  if (fromRadius < 1e-3 || toRadius < 1e-3) {
    return current.lerp(target, alpha);
  }
  const fromAngle = Math.atan2(fromX, fromZ);
  const turn = Math.atan2(toX, toZ) - fromAngle;
  const angle = fromAngle + Math.atan2(Math.sin(turn), Math.cos(turn)) * alpha;
  const radius = fromRadius + (toRadius - fromRadius) * alpha;
  return current.set(
    center.x + Math.sin(angle) * radius,
    current.y + (target.y - current.y) * alpha,
    center.z + Math.cos(angle) * radius
  );
}

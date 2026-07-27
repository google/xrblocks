import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {
  HAND_JOINT_NAMES,
  Handedness,
  resolveSimulatorHandPoseRotations,
  SimulatorHandPose,
  SIMULATOR_HAND_POSE_ROTATIONS,
  type SimulatorHandPoseJoints,
} from 'xrblocks';

/** Public WebXR generic-hand rig used as the agent's hand mesh. */
export const AGENT_HAND_PROFILE_PATH =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';

// Indices into HAND_JOINT_NAMES used for index-finger aiming.
const WRIST_BONE_INDEX = 0;
const INDEX_TIP_BONE_INDEX = 10;

// How far the hand reaches toward a target it points at: a fraction of the
// distance, capped so it stays a believable arm's reach from its rest spot,
// and always stopping a standoff distance short of the target so the hand
// points from a stable angle instead of crowding (and mis-aiming at) it.
const REACH_FRACTION = 0.45;
const MAX_REACH = 0.35;
const MIN_STANDOFF = 0.55;

// Below this wrist-to-target distance (metres) the aim direction is too
// ill-conditioned to be stable: the wrist sits ~0.1 m off the root, so a target
// this close makes small wrist movements swing the aim wildly. Re-aiming is
// skipped in that regime to avoid a thrash loop.
const MIN_AIM_DISTANCE = 0.2;

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchQuaternionB = new THREE.Quaternion();
const scratchTarget = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchDirB = new THREE.Vector3();
const scratchWrist = new THREE.Vector3();
const scratchTip = new THREE.Vector3();
const scratchGoal = new THREE.Vector3();
const scratchGoalQuat = new THREE.Quaternion();
const scratchPivot = new THREE.Vector3();

// The agent's hands are rendered as semi-transparent blue meshes: the
// AgentHands paper's minimalist, neutral "presence" (deliberately not photoreal
// skin, so the embodiment reads as "hands" while staying neutral on age,
// gender, and ethnicity). The orb carries the drifting-particle aesthetic.
const HAND_COLOR = 0x6aa0ff;
const HAND_EMISSIVE = 0x2b6cff;
const HAND_OPACITY = 0.55;

/**
 * Re-skins every mesh under `root` with the semi-transparent blue agent-hand
 * material. Extracted so it is testable without a GPU or a loaded GLB.
 * @param root - The loaded hand scene to recolor in place.
 */
export function applyAgentHandAppearance(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = new THREE.MeshStandardMaterial({
      color: HAND_COLOR,
      emissive: HAND_EMISSIVE,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: HAND_OPACITY,
      roughness: 0.35,
      metalness: 0,
      depthWrite: false,
    });
    // The agent hands are presentational, never interactive targets, so they
    // must not intercept the UI selection beam reaching panels behind them.
    mesh.raycast = () => {};
  });
}

/**
 * Smoothly moves a hand's bones toward a target set of joint transforms.
 * Extracted as a pure function so the animation step is testable without a GPU
 * or a loaded mesh.
 * @param bones - The hand's bones, aligned to {@link HAND_JOINT_NAMES}. Missing
 *     bones (undefined) are skipped.
 * @param joints - Target per-joint transforms (translation + rotation).
 * @param lerp - Interpolation factor in [0, 1]; 1 snaps to the target.
 */
export function lerpBonesToJoints(
  bones: ReadonlyArray<THREE.Object3D | undefined>,
  joints: Readonly<SimulatorHandPoseJoints>,
  lerp: number
) {
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    const joint = joints[i];
    if (!bone || !joint) continue;
    scratchPosition.fromArray(joint.t);
    scratchQuaternion.fromArray(joint.r);
    bone.position.lerp(scratchPosition, lerp);
    bone.quaternion.slerp(scratchQuaternion, lerp);
  }
}

/**
 * A single, free-standing animatable hand (not tied to the user's tracked
 * input). Loads the WebXR generic-hand rig, then poses it each frame toward the
 * current {@link SimulatorHandPose} using the simulator pose library.
 */
export class AgentHand {
  /** Container to position/orient the whole hand in the scene. */
  readonly root = new THREE.Group();

  /** Whether the mesh has finished loading. */
  loaded = false;

  private readonly bones: Array<THREE.Object3D | undefined> = [];
  private pose: SimulatorHandPose = SimulatorHandPose.RELAXED;
  /** Orientation the root smoothly slerps toward (identity = resting). */
  private readonly targetQuaternion = new THREE.Quaternion();
  /** Resting position (group-local), captured the first time the hand reaches. */
  private readonly homePosition = new THREE.Vector3();
  private homeCaptured = false;
  /** Position the root smoothly lerps toward (defaults to home). */
  private readonly reachPosition = new THREE.Vector3();
  private reaching = false;

  /**
   * Additive, parent-frame motion offset layered on top of the rest/reach
   * position (e.g. a beat bob or a size spread). Set externally each frame.
   */
  readonly motionOffset = new THREE.Vector3();
  /**
   * Additive, parent-frame motion rotation layered on top of the rest/aim
   * orientation (e.g. a wave oscillation). Set externally each frame.
   */
  readonly motionQuaternion = new THREE.Quaternion();

  constructor(readonly handedness: Handedness) {}

  /**
   * Loads the hand mesh and collects its bones.
   * @param loader - Optional GLTFLoader to reuse.
   */
  async load(loader = new GLTFLoader()): Promise<void> {
    loader.setPath(AGENT_HAND_PROFILE_PATH);
    const file = this.handedness === Handedness.LEFT ? 'left.glb' : 'right.glb';
    const gltf = await loader.loadAsync(file);
    this.root.add(gltf.scene);
    for (const name of HAND_JOINT_NAMES) {
      this.bones.push(gltf.scene.getObjectByName(name));
    }
    // The semi-transparent blue look, per the paper's minimalist hand
    // embodiment.
    applyAgentHandAppearance(gltf.scene);
    this.loaded = true;
  }

  /** Sets the gesture the hand animates toward. */
  setPose(pose: SimulatorHandPose) {
    this.pose = pose;
  }

  /** The gesture the hand is currently animating toward. */
  get currentPose(): SimulatorHandPose {
    return this.pose;
  }

  /**
   * Advances the hand one animation step toward its current pose.
   * @param lerp - Interpolation factor in [0, 1].
   */
  animate(lerp = 0.2) {
    if (!this.loaded) return;
    const joints = resolveSimulatorHandPoseRotations(
      this.handedness,
      SIMULATOR_HAND_POSE_ROTATIONS[this.pose]
    );
    lerpBonesToJoints(this.bones, joints, lerp);

    // Capture the rest position on the first animated frame (after the app has
    // placed the hand), so motions and reach measure from a stable home.
    if (!this.homeCaptured) {
      this.homePosition.copy(this.root.position);
      this.reachPosition.copy(this.homePosition);
      this.homeCaptured = true;
    }

    // Lerp toward (rest-or-reach + motion offset) and (aim * motion rotation),
    // so beat/wave/size layer cleanly on top of the pose and pointing.
    const base = this.reaching ? this.reachPosition : this.homePosition;
    scratchGoal.copy(base).add(this.motionOffset);
    this.root.position.lerp(scratchGoal, lerp);
    scratchGoalQuat.copy(this.targetQuaternion).multiply(this.motionQuaternion);
    this.root.quaternion.slerp(scratchGoalQuat, lerp);
  }

  /**
   * Orients the hand so its index finger points at a world-space position,
   * reaches partway toward it, and switches to the pointing pose. The hand
   * smoothly turns and extends toward the target on subsequent
   * {@link animate} calls.
   * @param targetWorld - The world-space point to aim the index finger at.
   */
  aimAt(targetWorld: THREE.Vector3) {
    const parent = this.root.parent;
    if (!this.loaded || !parent) return;
    this.setPose(SimulatorHandPose.POINTING);
    this.captureHome_();

    // Target in the parent frame, and the reach position toward it. Reach a
    // fraction of the way (capped), but always stop `MIN_STANDOFF` short of the
    // target so the finger points from a stable distance rather than crowding
    // the object (which makes the aim direction ill-conditioned).
    parent.worldToLocal(scratchTarget.copy(targetWorld));
    scratchDir.copy(scratchTarget).sub(this.homePosition);
    const distance = scratchDir.length();
    if (distance > 1e-4) {
      const reach = Math.max(
        0,
        Math.min(REACH_FRACTION * distance, MAX_REACH, distance - MIN_STANDOFF)
      );
      scratchDir.multiplyScalar(reach / distance);
    } else {
      scratchDir.set(0, 0, 0);
    }
    this.reachPosition.copy(this.homePosition).add(scratchDir);
    this.reaching = true;

    // The finger pivots at the wrist, which is offset ~0.1 m from the root.
    // For close targets that offset dominates the aim angle, so compute the
    // direction from the wrist's current world position (re-aimed each frame,
    // it converges) rather than from the root/reach position.
    const wrist = this.bones[WRIST_BONE_INDEX];
    if (wrist) {
      wrist.getWorldPosition(scratchPivot);
      parent.worldToLocal(scratchPivot);
    } else {
      scratchPivot.copy(this.reachPosition);
    }

    // Direction the posed index finger points, with the root un-rotated.
    const localDir = this.measurePointDirection_();
    // Aim the finger from the wrist toward the target. If the target is almost
    // on top of the wrist the direction is ill-conditioned (normalizing a
    // near-zero vector), which makes the per-frame re-aim thrash, so keep the
    // current orientation instead of aiming at a degenerate direction.
    scratchDir.copy(scratchTarget).sub(scratchPivot);
    if (scratchDir.lengthSq() < MIN_AIM_DISTANCE * MIN_AIM_DISTANCE) return;
    scratchDir.normalize();
    this.targetQuaternion.setFromUnitVectors(localDir, scratchDir);
  }

  /** Returns the hand to its resting position and orientation. */
  clearAim() {
    this.targetQuaternion.identity();
    this.reaching = false;
  }

  /**
   * Orients the hand toward an explicit parent-frame quaternion and stops
   * reaching, e.g. to present an emblematic gesture (thumbs up, victory)
   * upright by cancelling a resting tilt baked into the parent container.
   * Persists until {@link clearAim} or a subsequent {@link aimAt}/orient call.
   * @param parentQuaternion - Target orientation in the root's parent frame.
   */
  orient(parentQuaternion: THREE.Quaternion) {
    this.targetQuaternion.copy(parentQuaternion);
    this.reaching = false;
  }

  /**
   * Writes the world-space position of the index fingertip into `out` (falls
   * back to the hand root if the bone is missing). Useful for drawing a pointer
   * ray from the fingertip.
   * @param out - Vector to write into.
   * @returns The same `out` vector.
   */
  getIndexTipWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const tip = this.bones[INDEX_TIP_BONE_INDEX];
    if (tip) tip.getWorldPosition(out);
    else this.root.getWorldPosition(out);
    return out;
  }

  // Captures the current root position as "home" the first time it is needed.
  private captureHome_() {
    if (this.homeCaptured) return;
    this.homePosition.copy(this.root.position);
    this.reachPosition.copy(this.homePosition);
    this.homeCaptured = true;
  }

  // Snaps the bones to the pointing pose (with the root un-rotated) and returns
  // the wrist-to-index-tip direction in the parent frame. The world positions
  // are read while the root is still identity so the measured direction is
  // independent of any current aim (otherwise re-aiming becomes a delta from
  // the previous target rather than an absolute orientation).
  private measurePointDirection_(): THREE.Vector3 {
    const parent = this.root.parent!;
    const savedQuaternion = scratchQuaternionB.copy(this.root.quaternion);
    this.root.quaternion.identity();
    const pointingJoints = resolveSimulatorHandPoseRotations(
      this.handedness,
      SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.POINTING]
    );
    lerpBonesToJoints(this.bones, pointingJoints, 1);
    this.root.updateWorldMatrix(true, true);

    const wrist = this.bones[WRIST_BONE_INDEX];
    const tip = this.bones[INDEX_TIP_BONE_INDEX];
    if (!wrist || !tip) {
      this.root.quaternion.copy(savedQuaternion);
      return scratchDirB.set(0, 0, -1);
    }
    // Read positions while the root is still un-rotated, then restore.
    wrist.getWorldPosition(scratchWrist);
    tip.getWorldPosition(scratchTip);
    this.root.quaternion.copy(savedQuaternion);

    parent.worldToLocal(scratchWrist);
    parent.worldToLocal(scratchTip);
    return scratchDirB.copy(scratchTip).sub(scratchWrist).normalize();
  }
}

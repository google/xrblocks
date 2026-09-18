/**
 * VRMAvatarScript.js
 *
 * xb.Script subclass that owns the scene lifecycle for the VRM avatar.
 * Handles:
 *   - Loading the VRM + animations in init()
 *   - Walking the avatar to a floor point on controller selectend
 *
 * Options (passed to constructor):
 *   vrmUrl        {string}  URL to the .vrm file
 *   idleUrl       {string}  URL to the idle GLB
 *   walkUrl       {string}  URL to the walk GLB
 *   walkSpeed     {number}  m/s avatar walking speed; default 1.0
 *   arrivalDist   {number}  metres from target to count as arrived; default 0.25
 *   rotateLerp    {number}  slerp factor per frame for turning; default 0.08
 *   spawnDistance {number}  metres in front of the user (on the ground) at init; default 1.8
 */

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {VRMAvatar} from './VRMAvatar.js';
import {applyOcclusionToAvatar} from './VRMOcclusion.js';

export class VRMAvatarScript extends xb.Script {
  static dependencies = {
    camera: THREE.Camera,
    depth: xb.Depth,
    timer: THREE.Timer,
  };

  /**
   * Constructs a new VRMAvatarScript.
   * @param {object} [opts={}] Initialization options.
   * @param {string} [opts.vrmUrl=''] URL to the .vrm file.
   * @param {string} [opts.idleUrl=''] URL to the idle GLB.
   * @param {string} [opts.walkUrl=''] URL to the walk GLB.
   * @param {string} [opts.tposeUrl=''] URL to the Tpose GLB.
   * @param {number} [opts.walkSpeed=1.0] Avatar walking speed in m/s.
   * @param {number} [opts.arrivalDist=0.25] Metres from target to count as arrived.
   * @param {number} [opts.rotateLerp=0.08] Slerp factor per frame for turning.
   * @param {number} [opts.spawnDistance=1.8] Metres in front of the user (on the ground) at init.
   */
  constructor(opts = {}) {
    super();

    this._vrmUrl = opts.vrmUrl ?? '';
    this._idleUrl = opts.idleUrl ?? '';
    this._walkUrl = opts.walkUrl ?? '';
    this._tposeUrl = opts.tposeUrl ?? '';

    this._walkSpeed = opts.walkSpeed ?? 0.6; // m/s
    this._arrivalDist = opts.arrivalDist ?? 0.25; // m
    this._rotateLerp = opts.rotateLerp ?? 0.08;
    this._spawnDistance = opts.spawnDistance ?? 1.8; // m ahead of user at spawn

    // Internal state
    this._avatar = new VRMAvatar();
    this._loaded = false;
    this._walkToTarget = null; // THREE.Vector3 world pos, or null when idle

    // Reusable temporaries
    this._walkDir = new THREE.Vector3();
    this._walkFaceQuat = new THREE.Quaternion();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._planeHit = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();

    // Height of the floor the avatar stands on. In XR the reference space is
    // floor-relative, so it is 0. The desktop simulator's environment is not
    // built around y = 0 (its living-room floor sits ~0.3 m up), so there it
    // is found by casting down into the simulator scene once that has loaded.
    this._floorY = 0;
    this._floorResolved = false;
    this._floorProbeFrame = 0;
  }

  // -------------------------------------------------------------------------
  // XRBlocks lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initializes the avatar and loads necessary resources.
   * @returns {Promise<void>}
   */
  async init({camera, depth, timer}) {
    this._camera = camera;
    this._depth = depth;
    this._timer = timer;

    if (!this._vrmUrl) {
      console.error('[VRMAvatarScript] vrmUrl is required.');
      return;
    }
    if (!this._tposeUrl) {
      console.error('[VRMAvatarScript] tposeUrl is required.');
      return;
    }

    console.log('[VRMAvatarScript] Loading VRM…');
    await this._avatar.load(this._vrmUrl);

    if (this._idleUrl) {
      console.log('[VRMAvatarScript] Loading idle animation…');
      await this._avatar.loadGLBAnimation(
        'idle',
        this._idleUrl,
        this._tposeUrl
      );
    }
    if (this._walkUrl) {
      console.log('[VRMAvatarScript] Loading walk animation…');
      await this._avatar.loadGLBAnimation(
        'walk',
        this._walkUrl,
        this._tposeUrl
      );
    }

    this.add(this._avatar.root);

    // Pixel-level passthrough occlusion (real-world geometry hides the
    // avatar). Runs after load so VRMUtils.combineSkeletons has already
    // replaced the meshes; inert unless occlusion is enabled in options.
    if (xb.core.options.depth?.occlusion?.enabled) {
      applyOcclusionToAvatar(this._avatar.root);
    }

    this._resolveFloor();
    this._placeAvatarFacingUser();

    this._avatar.play(this._idleUrl ? 'idle' : 'walk');

    this._loaded = true;
    console.log('[VRMAvatarScript] Ready.');
  }

  // -------------------------------------------------------------------------
  // XR input events
  // -------------------------------------------------------------------------

  /**
   * Handles the XR select end event to set a walk target.
   * @param {xb.SelectEndEvent} event The select end event.
   * @returns {void}
   */
  onSelectEnd(event) {
    if (!this._loaded) return;

    const depthMesh = this._depth.depthMesh;
    let hit =
      event.surface === depthMesh && event.intersection
        ? event.intersection.point.clone()
        : null;

    // Fallback: intersect the y=0 ground plane (simulator / no depth)
    if (!hit) {
      this._raycaster.setFromXRController(event.source.controller);
      const planeHit = this._raycaster.ray.intersectPlane(
        this._groundPlane,
        this._planeHit
      );
      if (planeHit) hit = planeHit.clone();
    }

    if (!hit) return;
    hit.y = this._floorY;

    this._walkToTarget = hit;
    this._avatar.play('walk');
  }

  /**
   * Called every frame by XRBlocks.
   * @param {number} time Elapsed time in seconds.
   * @param {XRFrame} [frame] XR frame (may be null on desktop).
   * @returns {void}
   */
  update() {
    if (!this._loaded) return;

    // The simulator environment loads after init; keep probing for its floor
    // (cheaply, every 30th frame) until it answers, then re-seat the avatar.
    if (!this._floorResolved && this._floorProbeFrame++ % 30 === 0) {
      if (this._resolveFloor() && !this._walkToTarget) {
        this._placeAvatarFacingUser();
      }
    }

    const delta = this._timer.getDelta();

    if (this._walkToTarget) this._updateWalkTo(delta);
    this._avatar.update(delta);
  }

  /** Current user-facing state for sample UI. */
  get state() {
    if (!this._loaded) return 'Loading avatar';
    return this._walkToTarget ? 'Walking' : 'Ready';
  }

  /** Returns the companion to its initial position in front of the user. */
  resetPosition() {
    if (!this._loaded) return;
    this._walkToTarget = null;
    this._placeAvatarFacingUser();
    this._avatar.play(this._idleUrl ? 'idle' : 'walk');
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _getUserPosition() {
    const p = this._camera.position.clone();
    p.y = this._floorY;
    return p;
  }

  /**
   * Determines the floor height under the user.
   * @returns {boolean} True once the floor is known.
   */
  _resolveFloor() {
    if (xb.core.renderer.xr.isPresenting) {
      // XR reference space is floor-relative.
      this._floorY = 0;
    } else {
      // Desktop: wait for the simulator and its environment to exist, then
      // cast down from the eye. (Before entering XR on a headset the
      // simulator never appears; the avatar is re-seated once presenting.)
      const scene = xb.core.simulator?.simulatorScene;
      if (!scene) return false;
      const eye = this._camera.getWorldPosition(new THREE.Vector3());
      this._raycaster.set(eye, new THREE.Vector3(0, -1, 0));
      this._raycaster.far = 3;
      const hits = this._raycaster.intersectObject(scene, true);
      this._raycaster.far = Infinity;
      // Lowest surface within standing height below the eye: skips furniture
      // tops the ray passes through on the way down.
      let floorY = null;
      for (const hit of hits) {
        if (
          hit.point.y > eye.y - 2.2 &&
          (floorY === null || hit.point.y < floorY)
        ) {
          floorY = hit.point.y;
        }
      }
      if (floorY === null) return false; // environment not loaded yet
      this._floorY = floorY;
    }
    this._floorResolved = true;
    this._groundPlane.constant = -this._floorY;
    return true;
  }

  /**
   * Puts the avatar on the ground in front of the camera and rotates so +Z faces the user.
   */
  _placeAvatarFacingUser() {
    const userPos = this._getUserPosition();
    const forward = new THREE.Vector3();
    this._camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-10) forward.set(0, 0, -1);
    forward.normalize();

    const root = this._avatar.root;
    root.position.copy(userPos).addScaledVector(forward, this._spawnDistance);
    root.position.y = this._floorY;

    this._walkDir.subVectors(userPos, root.position);
    this._walkDir.y = 0;
    if (this._walkDir.lengthSq() < 1e-10) {
      this._walkDir.set(0, 0, 1);
    } else {
      this._walkDir.normalize();
    }
    this._walkFaceQuat.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      this._walkDir
    );
    root.quaternion.copy(this._walkFaceQuat);
  }

  _updateWalkTo(delta) {
    const pos = this._avatar.root.position;

    this._walkDir.subVectors(this._walkToTarget, pos);
    this._walkDir.y = 0;
    const dist = this._walkDir.length();

    if (dist < this._arrivalDist) {
      this._walkToTarget = null;
      this._avatar.play('idle');
      return;
    }

    this._walkDir.normalize();

    const step = Math.min(this._walkSpeed * delta, dist);
    pos.addScaledVector(this._walkDir, step);

    this._walkFaceQuat.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      this._walkDir
    );
    this._avatar.root.quaternion.slerp(this._walkFaceQuat, this._rotateLerp);
  }
}

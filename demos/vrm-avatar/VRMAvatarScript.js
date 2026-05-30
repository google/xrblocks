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

export class VRMAvatarScript extends xb.Script {
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
    this._prevUserPos = new THREE.Vector3();
    this._userPosNow = new THREE.Vector3();
    this._deltaPos = new THREE.Vector3();
    this._walkDir = new THREE.Vector3();
    this._walkFaceQuat = new THREE.Quaternion();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._planeHit = new THREE.Vector3();
  }

  // -------------------------------------------------------------------------
  // XRBlocks lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initializes the avatar and loads necessary resources.
   * @returns {Promise<void>}
   */
  async init() {
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

    this._placeAvatarFacingUser();

    this._prevUserPos.copy(this._getUserPosition());

    this._avatar.play(this._idleUrl ? 'idle' : 'walk');

    this._loaded = true;
    console.log('[VRMAvatarScript] Ready.');
  }

  // -------------------------------------------------------------------------
  // XR input events
  // -------------------------------------------------------------------------

  /**
   * Handles the XR select end event to set a walk target.
   * @param {Event} event The select end event.
   * @returns {void}
   */
  onSelectEnd(event) {
    console.log('onSelectEnd triggered');
    if (!this._loaded) return;

    let hit = null;

    // Prefer depth mesh (real XR environment)
    const depthMesh = xb.core.depth?.depthMesh;
    if (depthMesh) {
      const hits = xb.core.input.intersectObjectByEvent(event, depthMesh);
      if (hits.length > 0) hit = hits[0].point.clone();
    }

    // Fallback: intersect the y=0 ground plane (simulator / no depth)
    if (!hit) {
      xb.core.input.setRaycasterFromController(event.target);
      const planeHit = xb.core.input.raycaster.ray.intersectPlane(
        this._groundPlane,
        this._planeHit
      );
      if (planeHit) hit = planeHit.clone();
    }

    if (!hit) return;
    hit.y = 0;

    this._walkToTarget = hit;
    this._avatar.play('walk');
  }

  /**
   * Called every frame by XRBlocks.
   * @param {number} time Elapsed time in seconds.
   * @param {XRFrame} [frame] XR frame (may be null on desktop).
   * @returns {void}
   */
  update(time, frame) {
    if (!this._loaded) return;

    const delta = xb.core.timer.getDelta();

    this._updateMovement(delta);
    if (this._walkToTarget) this._updateWalkTo(delta);
    this._avatar.update(delta);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _getUserPosition() {
    const p = xb.core.camera.position.clone();
    p.y = 0;
    return p;
  }

  /**
   * Puts the avatar on the ground in front of the camera and rotates so +Z faces the user.
   */
  _placeAvatarFacingUser() {
    const userPos = this._getUserPosition();
    const forward = new THREE.Vector3();
    xb.core.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-10) forward.set(0, 0, -1);
    forward.normalize();

    const root = this._avatar.root;
    root.position.copy(userPos).addScaledVector(forward, this._spawnDistance);
    root.position.y = 0;

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

  _updateMovement(delta) {
    this._userPosNow.copy(this._getUserPosition());
    this._deltaPos.subVectors(this._userPosNow, this._prevUserPos);
    this._prevUserPos.copy(this._userPosNow);
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

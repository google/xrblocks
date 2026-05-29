import * as THREE from 'three';
import * as xb from 'xrblocks';

import {CosmicImmersive} from './CosmicImmersive.js';
import {CyberpunkImmersive} from './CyberpunkImmersive.js';
import {ForestImmersive} from './ForestImmersive.js';
import {LavaImmersive} from './LavaImmersive.js';
import {Portal} from './Portal.js';
import {CosmicScene} from './scenes/CosmicScene.js';
import {CyberpunkScene} from './scenes/CyberpunkScene.js';
import {ForestScene} from './scenes/ForestScene.js';
import {LavaScene} from './scenes/LavaScene.js';
import {UnderwaterScene} from './scenes/UnderwaterScene.js';
import {UnderwaterImmersive} from './UnderwaterImmersive.js';

const SCENES = [
  UnderwaterScene,
  ForestScene,
  CosmicScene,
  LavaScene,
  CyberpunkScene,
];

// Map scene name → walk-in immersive class. Scenes without an entry
// behave as decorative portals only (no walk-in).
const IMMERSIVE_BY_NAME = {
  Cosmic: CosmicImmersive,
  Forest: ForestImmersive,
  Underwater: UnderwaterImmersive,
  Volcano: LavaImmersive,
  Cyberpunk: CyberpunkImmersive,
};

const ARC_RADIUS = 2.2; // distance from user to each portal (meters)
const ARC_SPAN = Math.PI * 0.85; // total arc span (~150°)

const ENTRY_THRESHOLD = 0.9; // Portal radius * factor for plane-crossing check.
const TRANSITION_COOLDOWN_MS = 600; // Lock new transitions briefly after each
// fade so the very-next frame doesn't reverse-cross and snap us back.

/**
 * A gallery of 5 portals arranged in a gentle arc in front of the user.
 * Each portal renders a fully different cinematic world.
 *
 * UX:
 *   1. Click a portal disc to "pick it up" (its ring spins faster + scales).
 *   2. Click anywhere on the depth mesh to drop it there, snapped to the
 *      surface normal.
 *   3. Click the held portal again (or click empty space twice) to cancel.
 *   4. Walk through the Cosmic portal to enter immersive space mode.
 */
export class PortalGalleryScene extends xb.Script {
  portals = [];
  labels = [];
  immersives = []; // index -> ImmersiveInstance | null
  _held = null;
  _activeIndex = -1; // Portal index user has walked into, or -1.
  _activeImmersive = null;
  _insidePortal = false;
  _prevCamLocalZ = 1.0; // Positive = in front of portal.
  _exitReady = false; // True once user is clearly behind portal after entry.
  _exitRT = null; // Render target for exit portal view.
  _exitMat = null; // Material showing the room texture on the disc.
  _origDiscMat = null; // Original disc material to restore on exit.
  _exitCam = null; // Virtual camera for exit portal rendering.
  _fadeSphere = null; // Transition fade overlay.
  _fadeTarget = 0; // Target opacity (0 = transparent, 1 = opaque).
  _fadeCallback = null; // Called when fade reaches 1.0 (fully opaque).
  _transitionCooldownUntil = 0; // performance.now() timestamp; before this, no transitions fire.
  _exitFrameTick = 0; // Counter to throttle exit-snapshot RT renders.
  _tmpV1 = new THREE.Vector3();
  _tmpV2 = new THREE.Vector3();
  _tmpV3 = new THREE.Vector3();
  _tmpV4 = new THREE.Vector3();

  init() {
    const userY = xb.user?.height ?? 1.6;
    const n = SCENES.length;

    // Place each portal along an arc centered at (0, userY, 0).
    for (let i = 0; i < n; i++) {
      const scene = SCENES[i];
      const portal = new Portal({scene, label: scene.name});
      this.add(portal);

      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = -ARC_SPAN / 2 + ARC_SPAN * t;
      const x = Math.sin(ang) * ARC_RADIUS;
      const z = -Math.cos(ang) * ARC_RADIUS;
      portal.position.set(x, userY, z);
      portal.lookAt(0, userY, 0);
      portal._bobBaseY = userY;

      this.portals.push(portal);

      // Floating label above the portal.
      const label = new xb.SpatialPanel({
        width: 0.5,
        height: 0.14,
        backgroundColor: '#1e2533cc',
        draggable: false,
        useBorderlessShader: true,
      });
      const grid = label.addGrid();
      grid.addRow({weight: 0.15});
      grid.addRow({weight: 0.7}).addText({
        text: scene.name,
        fontColor: '#ffffff',
        fontSize: 0.09,
        textAlign: 'center',
      });
      grid.addRow({weight: 0.15});
      label.position.set(x, userY + Portal.RADIUS + 0.12, z);
      label.lookAt(0, userY, 0);
      this.add(label);
      this.labels.push(label);
    }

    this.add(new THREE.AmbientLight(0x223355, 0.6));
    xb.showReticleOnDepthMesh?.(true);

    // Exit label shown above cosmic portal in immersive mode.
    this._exitLabel = new xb.SpatialPanel({
      width: 0.7,
      height: 0.22,
      backgroundColor: '#44ff88cc',
      draggable: false,
      useBorderlessShader: true,
    });
    const exitGrid = this._exitLabel.addGrid();
    exitGrid.addRow({weight: 0.15});
    exitGrid.addRow({weight: 0.7}).addText({
      text: '↩ EXIT',
      fontColor: '#ffffff',
      fontSize: 0.16,
      textAlign: 'center',
    });
    exitGrid.addRow({weight: 0.15});
    this._exitLabel.visible = false;
    this.add(this._exitLabel);

    // Render target for exit portal view (shows the room the user came from).
    this._exitRT = new THREE.WebGLRenderTarget(256, 256);
    this._exitMat = new THREE.MeshBasicMaterial({
      map: this._exitRT.texture,
      side: THREE.DoubleSide,
    });
    this._exitCam = new THREE.PerspectiveCamera(110, 1, 0.1, 100);

    // Fade sphere for teleport transition.
    const fadeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      side: THREE.BackSide,
    });
    this._fadeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      fadeMat
    );
    this._fadeSphere.renderOrder = 9999;
    this._fadeSphere.frustumCulled = false;
    this._fadeSphere.raycast = () => {}; // Don't intercept clicks.
    this.add(this._fadeSphere);

    // Immersive worlds (one per scene that supports walk-in).
    for (let i = 0; i < SCENES.length; i++) {
      const ImmersiveClass = IMMERSIVE_BY_NAME[SCENES[i].name];
      if (ImmersiveClass) {
        const inst = new ImmersiveClass();
        this.add(inst);
        this.immersives.push(inst);
      } else {
        this.immersives.push(null);
      }
    }
  }

  onSelectStart(event) {
    // In immersive mode, clicks should not interact with portals.
    if (this._insidePortal) return;

    const controller = event.target;

    // If a portal is already held, this click places it on the depth mesh
    // (or, if you click the same portal again, drops it without moving).
    if (this._held) {
      // Cancel hold if you re-click any portal.
      for (const p of this.portals) {
        if (xb.user?.select?.(p._disc, controller)) {
          this._held.setHeld(false);
          this._held = null;
          return;
        }
      }
      const depthMesh = xb.core.depth?.depthMesh;
      const intersection =
        depthMesh && xb.user?.select?.(depthMesh, controller);
      if (intersection) {
        this._held.placeAt(
          intersection.point,
          intersection.face?.normal,
          intersection.object?.matrixWorld
        );
        this._held.setHeld(false);
        this._held = null;
      }
      return;
    }

    // Nothing held: clicking a portal picks it up.
    for (const p of this.portals) {
      if (xb.user?.select?.(p._disc, controller)) {
        this._held = p;
        p.setHeld(true);
        return;
      }
    }
    // Click on empty space / depth mesh with nothing held = no-op.
  }

  update() {
    const dt = Math.min(xb.getDeltaTime(), 0.05);
    const cam = xb.core.camera;

    // Animate fade transition and keep it centered on camera.
    if (cam && this._fadeSphere) {
      this._fadeSphere.position.copy(cam.position);
      const mat = this._fadeSphere.material;
      if (mat.opacity !== this._fadeTarget) {
        const speed = 26.0; // Fade speed (higher = faster).
        mat.opacity = THREE.MathUtils.lerp(
          mat.opacity,
          this._fadeTarget,
          dt * speed
        );
        if (Math.abs(mat.opacity - this._fadeTarget) < 0.02) {
          mat.opacity = this._fadeTarget;
          if (this._fadeTarget === 1 && this._fadeCallback) {
            this._fadeCallback();
            this._fadeCallback = null;
            this._fadeTarget = 0; // Fade back out.
          }
        }
      }
    }

    // Immersive mode: update sky sphere and check for exit.
    if (this._insidePortal) {
      this._activeImmersive.update(dt, cam);
      if (cam) {
        // Real-time render of the room into exit portal (parallax as user moves).
        // Only needed while in immersive mode — the disc shows the room snapshot
        // here. In gallery mode the disc shows its scene shader, so the snapshot
        // would be a wasted render pass.
        this._captureExitSnapshot(cam, this.portals[this._activeIndex]);
        this._checkExit(cam);
        if (!this._insidePortal) return; // Exit just triggered, skip rest.
        // Billboard exit label toward camera.
        const portal = this.portals[this._activeIndex];
        this._exitLabel.position.set(
          portal.position.x,
          portal.position.y + Portal.RADIUS + 0.18,
          portal.position.z
        );
        this._exitLabel.lookAt(cam.position);
        // Keep the active portal's ring animating.
        portal.update(dt, cam);
      }
      return;
    }

    for (const p of this.portals) p.update(dt, cam);

    // Check if user walks through any walk-in capable portal.
    if (cam) {
      this._checkEntry(cam);
    }

    // Make labels face the camera (billboard) and follow their portal's bob.
    if (cam) {
      for (let i = 0; i < this.portals.length; i++) {
        const p = this.portals[i];
        const l = this.labels[i];
        l.position.y = p.position.y + Portal.RADIUS + 0.18;
        l.position.x = p.position.x;
        l.position.z = p.position.z;
        l.lookAt(cam.position);
      }
    }
  }

  _checkEntry(cam) {
    if (this._fadeTarget === 1) return; // Fade in progress.
    if (performance.now() < this._transitionCooldownUntil) return;
    const camWorld = cam.getWorldPosition(this._tmpV1);

    // Check each walk-in capable portal. First crossing wins.
    // Crossing in EITHER direction triggers entry; fromSide tells the
    // immersive which way the user was facing so it can spawn them
    // pointing into the scene rather than at the back wall.
    for (let i = 0; i < this.portals.length; i++) {
      if (!this.immersives[i]) continue;
      const portal = this.portals[i];
      const local = portal.worldToLocal(this._tmpV2.copy(camWorld));
      const radialDist = Math.hypot(local.x, local.y);
      const curZ = local.z;
      const prevZ = portal._prevCamLocalZ ?? curZ;

      const crossedFront = prevZ > 0 && curZ <= 0;
      const crossedBack = prevZ < 0 && curZ >= 0;
      if (
        (crossedFront || crossedBack) &&
        radialDist < Portal.RADIUS * ENTRY_THRESHOLD
      ) {
        portal._prevCamLocalZ = curZ;
        const fromSide = crossedFront ? 'front' : 'back';
        this._enterImmersive(portal, i, fromSide);
        return;
      }
      portal._prevCamLocalZ = curZ;
    }
  }

  _checkExit(cam) {
    if (performance.now() < this._transitionCooldownUntil) return;
    const portal = this.portals[this._activeIndex];
    const camWorld = cam.getWorldPosition(this._tmpV1);
    const local = portal.worldToLocal(this._tmpV2.copy(camWorld));

    const radialDist = Math.hypot(local.x, local.y);
    const curZ = local.z;

    // After entry, wait until user is clearly off the portal plane (either
    // side) before arming exit. This avoids firing on the entry transition
    // itself.
    if (!this._exitReady) {
      if (Math.abs(curZ) > 0.05) this._exitReady = true;
      this._prevCamLocalZ = curZ;
      return;
    }

    // Any zero-crossing in z (front↔back, either direction) within a
    // generous radius triggers exit.
    const crossed =
      (this._prevCamLocalZ > 0 && curZ <= 0) ||
      (this._prevCamLocalZ < 0 && curZ >= 0);
    if (crossed && radialDist < Portal.RADIUS * 1.5) {
      this._exitImmersive();
    }

    this._prevCamLocalZ = curZ;
  }

  _enterImmersive(portal, index, fromSide) {
    // Fade to white, then switch to immersive, then fade back.
    this._fadeTarget = 1;
    this._fadeCallback = () => {
      this._insidePortal = true;
      this._activeIndex = index;
      this._activeImmersive = this.immersives[index];
      this._activeImmersive.show(portal.matrixWorld, fromSide);
      this._exitReady = false;
      this._prevCamLocalZ = fromSide === 'front' ? -1 : 1;
      this._transitionCooldownUntil =
        performance.now() + TRANSITION_COOLDOWN_MS;

      // Swap active portal's disc to show the room render target.
      this._origDiscMat = portal._disc.material;
      portal._disc.material = this._exitMat;
      portal._disc.visible = true;
      portal._disc.renderOrder = -1;

      // Hide other portals and all labels.
      for (let i = 0; i < this.portals.length; i++) {
        if (i !== index) {
          this.portals[i].visible = false;
        }
        this.labels[i].visible = false;
      }
      this._exitLabel.visible = true;
    };
  }

  _exitImmersive() {
    // Fade to white, then switch back to gallery, then fade back.
    this._fadeTarget = 1;
    this._fadeCallback = () => {
      this._insidePortal = false;
      this._activeImmersive.hide();
      this._exitLabel.visible = false;
      this._transitionCooldownUntil =
        performance.now() + TRANSITION_COOLDOWN_MS;

      // Restore original disc material and render order (matches the value
      // set in Portal._buildDisc — must be 1, not 0, or the disc sorts
      // behind other portals' rings/halos after the first cycle).
      const portal = this.portals[this._activeIndex];
      portal._disc.material = this._origDiscMat;
      portal._disc.renderOrder = 1;
      // Reset crossing state on every portal so the user can immediately
      // re-enter without a phantom prevZ from before entry firing.
      for (const p of this.portals) p._prevCamLocalZ = undefined;

      this._activeIndex = -1;
      this._activeImmersive = null;

      // Show gallery.
      for (const p of this.portals) p.visible = true;
      for (const l of this.labels) l.visible = true;
    };
  }

  /** Render the simulator room into the exit portal texture with dampened parallax. */
  _captureExitSnapshot(cam, portal) {
    // Throttle to every other frame — the room behind the user is mostly
    // static so a half-rate update is visually indistinguishable.
    this._exitFrameTick = (this._exitFrameTick + 1) % 2;
    if (this._exitFrameTick !== 0) return;

    const renderer = xb.core.renderer;
    if (!renderer) return;

    const simScene = xb.core.simulator?.simulatorScene;
    if (!simScene) return;

    const portalPos = portal.getWorldPosition(this._tmpV1);
    const camPos = cam.getWorldPosition(this._tmpV2);

    // Place exit camera in front of portal (room side), offset slightly by user movement.
    // Portal local +Z points toward room center, so step forward from portal.
    const forward = this._tmpV3.set(0, 0, 1).applyQuaternion(portal.quaternion);
    const roomCamBase = this._tmpV4
      .copy(portalPos)
      .addScaledVector(forward, 0.3);

    const PARALLAX_FACTOR = 0.15;
    this._exitCam.position.set(
      roomCamBase.x + (camPos.x - portalPos.x) * PARALLAX_FACTOR,
      roomCamBase.y + (camPos.y - portalPos.y) * PARALLAX_FACTOR,
      roomCamBase.z
    );
    // Look in the same direction (deeper into room).
    this._exitCam.lookAt(
      this._exitCam.position.x + forward.x,
      this._exitCam.position.y + forward.y,
      this._exitCam.position.z + forward.z
    );

    const oldRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this._exitRT);
    renderer.clear();
    renderer.render(simScene, this._exitCam);
    renderer.setRenderTarget(oldRT);
  }
}

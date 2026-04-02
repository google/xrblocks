import {LongSelectHandler} from 'xrblocks/addons/ui/LongSelectHandler.js';

import {SplatMesh, SparkRenderer} from '@sparkjsdev/spark';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

const SPLAT_ASSETS = [
  {
    url: PROPRIETARY_ASSETS_BASE_URL + '3dgs_scenes/nyc.spz',
    scale: new THREE.Vector3(1.3, 1.3, 1.3),
    position: new THREE.Vector3(0, -0.15, 0),
    quaternion: new THREE.Quaternion(1, 0, 0, 0),
  },
  {
    url: PROPRIETARY_ASSETS_BASE_URL + '3dgs_scenes/alameda.spz',
    scale: new THREE.Vector3(1.3, 1.3, 1.3),
    position: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(1, 0, 0, 0),
  },
];

const FADE_DURATION_S = 1.0; // seconds
const MOVE_SPEED = 0.05;

function easeInOutSine(x) {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDirection = new THREE.Vector3();

/**
 * An XR-Blocks demo that displays room-scale 3DGS models, allowing smooth
 * transitions via number keys (1, 2) or a 1.5 s long-pinch.
 */
class WalkthroughManager extends xb.Script {
  async init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    // Load all splat meshes in parallel.
    this.splatMeshes = await Promise.all(
      SPLAT_ASSETS.map(async (asset) => {
        const mesh = new SplatMesh({url: asset.url});
        await mesh.initialized;
        mesh.position.copy(asset.position);
        mesh.quaternion.copy(asset.quaternion);
        mesh.scale.copy(asset.scale);
        return mesh;
      })
    );

    // Create a SparkRenderer for gaussian splat rendering and register it so
    // the simulator can toggle encodeLinear for correct color space.
    const sparkRenderer = new SparkRenderer({
      renderer: xb.core.renderer,
      maxStdDev: Math.sqrt(5),
    });
    xb.core.registry.register(new xb.SparkRendererHolder(sparkRenderer));
    xb.add(sparkRenderer);

    // Show the first splat.
    this.currentIndex = 0;
    xb.add(this.splatMeshes[this.currentIndex]);

    // fadeProgress tracks animation time: null = idle, 0‥FADE_DURATION_S =
    // fading out, FADE_DURATION_S‥2×FADE_DURATION_S = fading in.
    this.fadeProgress = null;
    this.nextIndex = null;

    // Locomotion state.
    this.locomotionOffset = new THREE.Vector3();
    this.baseReferenceSpace = null;
    this.keys = {w: false, a: false, s: false, d: false};

    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('keyup', this.onKeyUp.bind(this));

    xb.add(
      new LongSelectHandler(this.cycleSplat.bind(this), {
        triggerDelay: 1500,
        triggerCooldownDuration: 1500,
      })
    );
  }

  /** Starts a crossfade to the next splat (wrapping around). */
  cycleSplat() {
    if (this.fadeProgress !== null) return;
    this.nextIndex = (this.currentIndex + 1) % this.splatMeshes.length;
    this.fadeProgress = 0;
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in this.keys) this.keys[key] = true;

    // Number key → jump to that splat (1-indexed).
    const idx = parseInt(key, 10) - 1;
    if (
      idx >= 0 &&
      idx < this.splatMeshes.length &&
      idx !== this.currentIndex &&
      this.fadeProgress === null
    ) {
      this.nextIndex = idx;
      this.fadeProgress = 0;
    }
  }

  onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in this.keys) this.keys[key] = false;
  }

  onXRSessionEnded() {
    super.onXRSessionEnded();
    this.baseReferenceSpace = null;
    this.locomotionOffset.set(0, 0, 0);
  }

  update() {
    super.update();
    const dt = xb.getDeltaTime();

    this.updateFade(dt);
    this.updateLocomotion();
  }

  /** Handles the fade-out → fade-in crossfade between splats. */
  updateFade(dt) {
    if (this.fadeProgress === null) return;

    this.fadeProgress += dt;
    const currentMesh = this.splatMeshes[this.currentIndex];

    if (this.fadeProgress < FADE_DURATION_S) {
      // Fading out the current splat.
      currentMesh.opacity =
        1 - easeInOutSine(this.fadeProgress / FADE_DURATION_S);
    } else if (this.fadeProgress < 2 * FADE_DURATION_S) {
      // Swap on the first frame of the fade-in phase.
      if (currentMesh.parent) {
        xb.scene.remove(currentMesh);
        this.currentIndex = this.nextIndex;
        const nextMesh = this.splatMeshes[this.currentIndex];
        nextMesh.opacity = 0;
        xb.add(nextMesh);
      }
      // Fading in the new splat.
      const inProgress =
        (this.fadeProgress - FADE_DURATION_S) / FADE_DURATION_S;
      this.splatMeshes[this.currentIndex].opacity = easeInOutSine(inProgress);
    } else {
      // Fade complete.
      this.splatMeshes[this.currentIndex].opacity = 1;
      this.fadeProgress = null;
      this.nextIndex = null;
    }
  }

  /** WASD locomotion via XR reference space offset. */
  updateLocomotion() {
    const xr = xb.core.renderer?.xr;
    if (!xr?.isPresenting) return;

    const camera = xr.getCamera();
    if (!camera) return;

    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

    moveDirection.set(0, 0, 0);
    if (this.keys.w) moveDirection.add(forward);
    if (this.keys.s) moveDirection.sub(forward);
    if (this.keys.a) moveDirection.sub(right);
    if (this.keys.d) moveDirection.add(right);
    if (moveDirection.lengthSq() === 0) return;
    moveDirection.normalize();

    if (!this.baseReferenceSpace) {
      this.baseReferenceSpace = xr.getReferenceSpace();
    }

    this.locomotionOffset.addScaledVector(moveDirection, -MOVE_SPEED);
    const transform = new XRRigidTransform(this.locomotionOffset);
    xr.setReferenceSpace(
      this.baseReferenceSpace.getOffsetReferenceSpace(transform)
    );
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.reticles.enabled = false;
  options.hands.enabled = true;
  options.hands.visualization = true;
  options.hands.visualizeMeshes = true;
  options.simulator.scenePath = null; // Prevent simulator scene from loading.

  xb.add(new WalkthroughManager());
  xb.init(options);
});

import {SplatMesh, SparkRenderer} from '@sparkjsdev/spark';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

const SPLAT_ASSETS = [
  {
    name: 'New York City',
    url: PROPRIETARY_ASSETS_BASE_URL + '3dgs_scenes/nyc.spz',
    scale: new THREE.Vector3(1.3, 1.3, 1.3),
    position: new THREE.Vector3(0, -0.15, 0),
    quaternion: new THREE.Quaternion(1, 0, 0, 0),
  },
  {
    name: 'Alameda',
    url: PROPRIETARY_ASSETS_BASE_URL + '3dgs_scenes/alameda.spz',
    scale: new THREE.Vector3(1.3, 1.3, 1.3),
    position: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(1, 0, 0, 0),
  },
];

const FADE_DURATION_S = 1;
const LONG_SELECT_DELAY_MS = 1500;
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
    xb.core.transition?.toVR({color: 0x000000});

    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    this.sceneText = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {fontSize: 24, fontWeight: 'bold', textAlign: 'right'},
    });
    this.add(this.createInstructions());

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

    const sparkRenderer = new SparkRenderer({
      renderer: xb.core.renderer,
      maxStdDev: Math.sqrt(4),
    });
    xb.core.registry.register(new xb.SparkRendererHolder(sparkRenderer));
    xb.add(sparkRenderer);

    this.currentIndex = 0;
    this.updateSceneText();
    xb.add(this.splatMeshes[this.currentIndex]);

    this.fadeProgress = null;
    this.nextIndex = null;
    this.locomotionOffset = new THREE.Vector3();
    this.baseReferenceSpace = null;
    this.keys = {w: false, a: false, s: false, d: false};
    this.longSelectTimeout = null;

    this.keyDownHandler = this.onKeyDown.bind(this);
    this.keyUpHandler = this.onKeyUp.bind(this);
    document.addEventListener('keydown', this.keyDownHandler);
    document.addEventListener('keyup', this.keyUpHandler);
  }

  onSelectStart() {
    this.cancelLongSelect();
    this.longSelectTimeout = setTimeout(() => {
      this.longSelectTimeout = null;
      this.cycleSplat();
    }, LONG_SELECT_DELAY_MS);
  }

  onSelectEnd() {
    this.cancelLongSelect();
  }

  cancelLongSelect() {
    if (this.longSelectTimeout === null) return;
    clearTimeout(this.longSelectTimeout);
    this.longSelectTimeout = null;
  }

  dispose() {
    this.cancelLongSelect();
    if (this.keyDownHandler) {
      document.removeEventListener('keydown', this.keyDownHandler);
    }
    if (this.keyUpHandler) {
      document.removeEventListener('keyup', this.keyUpHandler);
    }
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

    const idx = Number.parseInt(key, 10) - 1;
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
    this.baseReferenceSpace = null;
    this.locomotionOffset.set(0, 0, 0);
  }

  update() {
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
      currentMesh.opacity =
        1 - easeInOutSine(this.fadeProgress / FADE_DURATION_S);
    } else if (this.fadeProgress < 2 * FADE_DURATION_S) {
      if (currentMesh.parent) {
        xb.scene.remove(currentMesh);
        this.currentIndex = this.nextIndex;
        this.updateSceneText();
        const nextMesh = this.splatMeshes[this.currentIndex];
        nextMesh.opacity = 0;
        xb.add(nextMesh);
      }
      const inProgress =
        (this.fadeProgress - FADE_DURATION_S) / FADE_DURATION_S;
      this.splatMeshes[this.currentIndex].opacity = easeInOutSine(inProgress);
    } else {
      this.splatMeshes[this.currentIndex].opacity = 1;
      this.fadeProgress = null;
      this.nextIndex = null;
    }
  }

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

  updateSceneText() {
    const scene = SPLAT_ASSETS[this.currentIndex];
    this.sceneText.text = `${this.currentIndex + 1}/${SPLAT_ASSETS.length} - ${scene.name}`;
  }

  createInstructions() {
    const overlay = new xb.UIOverlay({
      pointerEvents: 'none',
      style: {
        width: 680,
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: {translateX: '-50%'},
      },
      children: [
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            new xb.UIText({
              text: '3DGS WALKTHROUGH',
              pointerEvents: 'none',
              style: {fontSize: 24, fontWeight: 'bold'},
            }),
            this.sceneText,
          ],
        }),
        new xb.UIText({
          text: 'Hold trigger, pinch, or click to change scenes. Press 1 or 2 to jump. Use WASD to move in XR.',
          pointerEvents: 'none',
          style: {fontSize: 20, lineHeight: 1.4, textAlign: 'center'},
        }),
      ],
    });
    overlay.name = 'Walkthrough instructions';
    return overlay;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.enableXRTransitions();
  options.transition.defaultBackgroundColor = 0x000000;
  options.reticles.enabled = false;
  options.hands.enabled = true;
  options.hands.visualization = true;
  options.hands.visualizeMeshes = true;

  xb.add(new WalkthroughManager());
  xb.init(options);
});

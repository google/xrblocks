import * as THREE from 'three';
import * as xb from 'xrblocks';

import {TestCard} from './TestCard.js';

const QUAD_WIDTH_M = 1.2;
const ASPECT = 16 / 9;
const LEFT = new THREE.Vector3(-0.7, 1.4, -2);
const RIGHT = new THREE.Vector3(0.7, 1.4, -2);
const AUTO_SWAP_SECONDS = 3;

/**
 * Shows the same video twice so the two paths can be compared directly.
 *
 * The right copy is always drawn into the scene, which means it goes into the
 * eye buffer and is warped again by the compositor, so it is sampled twice and
 * the first of those is into a buffer already lower resolution than the panel.
 *
 * The left copy becomes a composition layer where the platform can present
 * one, sampled once at its own resolution. Where it cannot, the left copy is
 * drawn into the scene as well, so there are always two videos and the readout
 * says which is which rather than leaving a blank space.
 */
export class LayersScene extends xb.Script {
  static dependencies = {renderer: THREE.WebGLRenderer};

  manager = new xb.LayerManager();
  videoLayer = new xb.VideoLayer(this.manager);
  attached = false;
  layerOnLeft = true;
  // Set once a layer has presented this session. Gating the timer on the live
  // `attached` flag instead would mean a single failed re-attach stopped the
  // comparison for good, with nothing to say why.
  everAttached = false;
  sinceSwap = 0;

  init({renderer}) {
    this.renderer = renderer;

    // Quest has both bindings and would always take the media path, so the
    // WebGL one has nowhere to run without being asked for. Same flag lets a
    // Quest stand in for Android XR, which only has the WebGL path.
    this.requestedWebGL = xb.getUrlParamBool('webglLayer', false);
    this.manager.setPreferWebGL(this.requestedWebGL);

    // One generated card feeding both copies, so the only variable is which
    // path the content takes to the display.
    this.card = new TestCard();
    this.layerVideo = this.card.start();
    this.sceneVideo = this.card.start();

    // Left: stands in for the layer until one can actually be created.
    this.leftMesh = makeVideoMesh(this.layerVideo);
    this.leftMesh.position.copy(LEFT);
    this.add(this.leftMesh);

    // Right: always the ordinary in-scene path, the thing to compare against.
    this.rightMesh = makeVideoMesh(this.sceneVideo);
    this.rightMesh.position.copy(RIGHT);
    this.add(this.rightMesh);

    const state = this.describe();
    report(state);
    reportInWorld(this, state);
  }

  onXRSessionStarted() {
    const session = this.renderer.xr.getSession();
    const space = this.renderer.xr.getReferenceSpace();
    if (!session || !space) return;

    // three.js owns the projection layer, so hand it over before adding
    // anything. Replacing the layer array without it would blank the scene.
    let binding = null;
    try {
      binding = this.renderer.xr.getBinding();
    } catch {
      // A browser without the binding is exactly the fallback case.
      binding = null;
    }
    this.manager.setSession(session, binding, this.renderer.getContext());
    this.manager.setBaseLayer(this.renderer.xr.getBaseLayer());

    this.layerVideo.play().catch(() => {});
    this.sceneVideo.play().catch(() => {});

    this.attached = this.videoLayer.attach(this.layerVideo, session, space, {
      position: LEFT,
      width: QUAD_WIDTH_M,
    });
    this.everAttached ||= this.attached;
    this.sinceSwap = 0;
    // Only hide the stand-in once something is presenting in its place,
    // otherwise the comparison quietly loses a side.
    this.leftMesh.visible = !this.attached;
    const state = this.describe();
    report(state);
    reportInWorld(this, state);
  }

  onXRSessionEnded() {
    this.videoLayer.detach();
    this.manager.setSession(null);
    this.attached = false;
    this.everAttached = false;
    this.leftMesh.visible = true;
    const state = this.describe();
    report(state);
    reportInWorld(this, state);
  }

  /**
   * Swaps which side the layer is on.
   *
   * Lenses are sharpest in the middle and you look at one panel at a time, so
   * a fixed left/right comparison cannot tell "the layer is sharper" apart
   * from "that side happened to be in the sweet spot". Swapping separates
   * them: a difference that follows the path is real, one that follows the
   * side is the optics.
   */
  swap() {
    this.layerOnLeft = !this.layerOnLeft;
    const layerPos = this.layerOnLeft ? LEFT : RIGHT;
    const meshPos = this.layerOnLeft ? RIGHT : LEFT;

    this.rightMesh.position.copy(meshPos);
    this.leftMesh.position.copy(layerPos);

    const session = this.renderer?.xr?.getSession?.();
    const space = this.renderer?.xr?.getReferenceSpace?.();
    if (session && space) {
      this.videoLayer.detach();
      this.attached = this.videoLayer.attach(this.layerVideo, session, space, {
        position: layerPos,
        width: QUAD_WIDTH_M,
      });
      this.everAttached ||= this.attached;
      this.leftMesh.visible = !this.attached;
    }
    this.sinceSwap = 0;
    const state = this.describe();
    report(state);
    reportInWorld(this, state);
  }

  onSelectEnd() {
    // Swaps early and restarts the timer rather than switching the timer off.
    // Squeeze is bound to select end as well, so a grip press while holding
    // the controller would otherwise silently end the comparison.
    this.swap();
  }

  /**
   * Alternates the two sides on a timer.
   *
   * Recording through the lens takes both hands, so the comparison has to keep
   * moving on its own. Select swaps early if you would rather drive it.
   */
  update() {
    // The WebGL path needs the frame drawn into the layer; the media path
    // ignores this. Runs before the swap check so the layer stays fed.
    const frame = this.renderer?.xr?.getFrame?.();
    if (frame) {
      this.videoLayer.update(frame);
      this.uploads = this.videoLayer.getUploadCount();
    }

    // A canvas stream reports no dimensions for the first frames, and the
    // WebGL path needs them to size its texture. Retry until it takes,
    // otherwise a failed first attach leaves the timer below switched off and
    // nothing ever tries again.
    if (!this.attached && this.renderer?.xr?.isPresenting) {
      this.retryAttach();
    }

    if (!this.everAttached) return;
    this.sinceSwap += xb.getDeltaTime();
    // Uploads tick every frame, so the readout has to refresh between swaps or
    // it looks stuck at whatever it said when the layer was last re-attached.
    if (this.readout && frame) {
      reportInWorld(this, this.describe());
    }
    if (this.sinceSwap >= AUTO_SWAP_SECONDS) {
      this.swap();
    }
  }

  /** Tries again to present the layer once the video has real dimensions. */
  retryAttach() {
    if (!this.layerVideo.videoWidth) return;
    const session = this.renderer.xr.getSession();
    const space = this.renderer.xr.getReferenceSpace();
    if (!session || !space) return;

    this.attached = this.videoLayer.attach(this.layerVideo, session, space, {
      position: this.layerOnLeft ? LEFT : RIGHT,
      width: QUAD_WIDTH_M,
    });
    if (!this.attached) return;
    this.everAttached = true;
    this.leftMesh.visible = false;
    const state = this.describe();
    report(state);
    reportInWorld(this, state);
  }

  /** @returns {object} What the platform offered and what got used. */
  describe() {
    // getBinding() constructs an XRWebGLBinding on first call, which throws
    // when there is no session yet, so it can only be asked once one exists.
    const inSession = !!this.renderer?.xr?.getSession?.();
    let hasWebGLQuadLayer = false;
    if (inSession) {
      try {
        const binding = this.renderer.xr.getBinding();
        hasWebGLQuadLayer = typeof binding?.createQuadLayer === 'function';
      } catch {
        hasWebGLQuadLayer = false;
      }
    }
    return {
      capability: this.manager.getCapability(),
      hasMediaBinding: typeof globalThis.XRMediaBinding === 'function',
      hasWebGLQuadLayer,
      inSession,
      layerAttached: this.attached,
      requestedWebGL: this.requestedWebGL,
      layerPath: this.videoLayer.getPath(),
      uploads: this.uploads ?? 0,
      sourcePixels: `${this.layerVideo?.videoWidth ?? 0}x${this.layerVideo?.videoHeight ?? 0}`,
      layerOnLeft: this.layerOnLeft,
      autoSwapping: this.everAttached,
      left: this.attached ? 'composition layer' : 'scene texture (fallback)',
      right: 'scene texture',
    };
  }
}

/**
 * Writes the diagnosis into the page, so it is readable without a headset and
 * turns up in a screenshot.
 *
 * @param {object} state - Result of describe().
 */
function report(state) {
  let el = document.getElementById('layer-report');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'layer-report';
    el.style.cssText =
      'position:fixed;left:12px;top:12px;z-index:9999;margin:0;padding:10px 14px;' +
      'background:rgba(0,0,0,.78);color:#0f0;font:13px/1.5 monospace;border-radius:8px;';
    document.body.appendChild(el);
  }
  el.textContent = Object.entries(state)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  console.log('[layers]', state);
}

/**
 * Shows the readout inside the session too, since a DOM overlay is only
 * visible on the 2D page and disappears the moment you enter XR.
 *
 * @param {xb.Script} owner - Script to parent the panel to.
 * @param {object} state - Result of describe().
 */
function reportInWorld(owner, state) {
  if (!owner.readout) {
    const panel = new xb.SpatialPanel({
      width: 1.6,
      height: 0.24,
      backgroundColor: '#000000cc',
      useDefaultPosition: false,
    });
    panel.position.set(0, 0.75, -2);
    owner.readout = panel.addGrid().addRow({weight: 1}).addText({
      text: '',
      fontColor: '#7CFC7C',
      fontSize: 0.05,
    });
    owner.add(panel);
  }
  owner.readout.setText(
    `${state.layerPath}${state.requestedWebGL ? ' (webgl asked for)' : ''} | ` +
      `attached: ${state.layerAttached} | uploads: ${state.uploads} | ` +
      `${state.layerOnLeft ? 'layer LEFT' : 'layer RIGHT'}`
  );
}

/**
 * Builds a plane showing a video.
 *
 * @param {HTMLVideoElement} video - Source to display.
 * @returns {THREE.Mesh} The mesh.
 */
function makeVideoMesh(video) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(QUAD_WIDTH_M, QUAD_WIDTH_M / ASPECT),
    new THREE.MeshBasicMaterial({map: texture})
  );
}

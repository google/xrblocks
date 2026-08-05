import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

// Spatial anchors demo: drop a marker in the room, reload, and it comes back
// where you left it.
//
// On a headset the platform re-localises each anchor, so markers survive
// leaving and re-entering the session. On desktop there is no tracking system
// to anchor against, so the simulator fallback holds the poses instead. That
// path proves the app wiring only, never that a device can re-localise, and
// the status line says which one is in use.

const MARKER_RADIUS = 0.06;
const MARKER_COLOR = 0x8a7bff;
const RESTORED_COLOR = 0x4ec9a0;

class AnchorsDemo extends xb.Script {
  constructor() {
    super();
    this.markers = new Map();
    this.restored = false;
    this.scratchPosition = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.6, 1, 0.8);
    xb.core.scene.add(key);

    document
      .getElementById('drop')
      ?.addEventListener('click', () => this.dropMarker());
    document
      .getElementById('forget')
      ?.addEventListener('click', () => this.forgetAll());

    // Exposed so the demo can be inspected from the console while iterating.
    window.anchorsDemo = this;
    this.setStatus('waiting for the first update…');
  }

  get anchors() {
    return xb.core.world?.anchors;
  }

  /** Places a marker a little in front of the user. */
  async dropMarker() {
    const anchors = this.anchors;
    if (!anchors) return;
    const camera = xb.core.camera;
    if (!camera) return;

    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    const forward = new THREE.Vector3(0, 0, -0.8).applyQuaternion(
      this.scratchQuaternion
    );
    // Dropping twice from the same spot would stack markers exactly, so fan
    // them out enough to stay individually visible.
    const index = this.markers.size;
    const spread = new THREE.Vector3(
      ((index % 3) - 1) * 0.32,
      Math.floor(index / 3) * -0.24,
      0
    ).applyQuaternion(this.scratchQuaternion);
    const target = this.scratchPosition.clone().add(forward).add(spread);

    const pose = new XRRigidTransform(
      {x: target.x, y: target.y, z: target.z},
      {x: 0, y: 0, z: 0, w: 1}
    );
    const label = `marker ${this.markers.size + 1}`;
    const tracked = await anchors.create(pose, label);
    if (!tracked) {
      this.setStatus('could not create an anchor here');
      return;
    }
    // Persisting is what makes the marker outlive the session.
    const saved = await anchors.persist(tracked.id);
    this.addMarkerMesh(tracked, MARKER_COLOR, target);
    this.setStatus(
      saved
        ? `dropped ${label} and saved it`
        : `dropped ${label}, but it will not survive a reload`
    );
  }

  /** Rebuilds meshes for anchors restored from a previous session. */
  async restoreSaved() {
    const anchors = this.anchors;
    if (!anchors) return;
    const results = await anchors.restoreAll();
    if (results.length === 0) {
      this.setStatus(this.describeCapability('nothing saved yet'));
      return;
    }
    let restored = 0;
    for (const result of results) {
      if (result.status !== 'restored' || !result.anchor) continue;
      restored++;
      this.addMarkerMesh(result.anchor, RESTORED_COLOR);
    }
    const missing = results.length - restored;
    this.setStatus(
      this.describeCapability(
        `restored ${restored} of ${results.length} saved markers` +
          (missing > 0 ? `, ${missing} could not be found here` : '')
      )
    );
  }

  /**
   * Adds a sphere for a tracked anchor.
   * @param tracked - The anchor to visualise.
   * @param color - Marker colour.
   * @param at - Optional initial position, before the first pose read.
   */
  addMarkerMesh(tracked, color, at) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(MARKER_RADIUS, 20, 16),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      })
    );
    if (at) mesh.position.copy(at);
    xb.core.scene.add(mesh);
    this.markers.set(tracked.id, mesh);
  }

  /** Clears every saved handle and removes the markers. */
  forgetAll() {
    const anchors = this.anchors;
    if (!anchors) return;
    for (const id of [...this.markers.keys()]) {
      anchors.delete(id);
      const mesh = this.markers.get(id);
      if (mesh) xb.core.scene.remove(mesh);
      this.markers.delete(id);
    }
    anchors.forgetAll();
    this.setStatus('forgot every saved marker');
  }

  update(_time, frame) {
    const anchors = this.anchors;
    if (!anchors) return;

    // Restore once, after the first update has established capability. There
    // is no XRFrame on desktop, so this must not wait for one.
    if (!this.restored) {
      this.restored = true;
      this.restoreSaved();
    }

    // The manager resolves the reference space itself, and simulated anchors
    // report their own pose, so this works with or without a live frame.
    for (const [id, mesh] of this.markers) {
      const pose = anchors.getPose(id);
      if (!pose) continue;
      mesh.position.set(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
    }
  }

  /**
   * Prefixes a message with which anchor backing is in use.
   * @param message - Message to prefix.
   * @returns The decorated message.
   */
  describeCapability(message) {
    const capability = this.anchors?.capability ?? 'unsupported';
    const prefix = {
      persistent: 'real anchors, saved across sessions',
      'session-only': 'real anchors, but this platform cannot save them',
      simulated: 'simulated anchors (desktop) — not really pinned to a room',
      unsupported: 'no anchor support on this platform',
    }[capability];
    return `${prefix}. ${message}`;
  }

  setStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message;
    console.log(`[anchors demo] ${message}`);
  }
}

const options = new xb.Options({antialias: true, reticles: {enabled: true}});
options.world.enableAnchorPersistence();
// Desktop has no tracking system to anchor against; opt into locally held
// poses so the demo is usable without a headset.
options.world.anchors.simulatorFallback = true;
options.world.anchors.debugging = true;

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new AnchorsDemo());
  options.setAppTitle('Spatial Anchors');
  xb.init(options);
});

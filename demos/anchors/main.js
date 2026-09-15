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
/** How far in front of the user a new marker is placed, in metres. */
const MARKER_DISTANCE = 0.8;
/**
 * How close two markers may be before the new one is nudged aside, in metres.
 * A marker goes exactly where you are looking; this only stops one landing
 * invisibly inside another when you drop twice without moving.
 */
const MARKER_MIN_SEPARATION = 0.14;
/**
 * Button label size in retained UI layout units.
 */
const BUTTON_FONT_SIZE = 38;
const MARKER_COLOR = 0x8a7bff;
/** The same colour as a CSS string, for the panel's title text. */
const MARKER_COLOR_CSS = '#8a7bff';
const RESTORED_COLOR = 0x4ec9a0;

class AnchorsDemo extends xb.Script {
  constructor() {
    super();
    this.markers = new Map();
    this.statusText = null;
    this.panel = null;
    this.restoredUnder = new Set();
    this.scratchPosition = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.6, 1, 0.8);
    xb.core.scene.add(key);

    this.createPanel();

    // The DOM controls only exist outside an immersive session. xrblocks does
    // not request dom-overlay, so once the headset or phone enters XR the page
    // is gone and the spatial panel above is the only way to reach the demo.
    document
      .getElementById('drop')
      ?.addEventListener('click', () => this.dropMarker());
    document
      .getElementById('forget')
      ?.addEventListener('click', () => this.forgetAll());

    // Exposed so the demo can be inspected from the console while iterating.
    window.anchorsDemo = this;
    this.setStatus('Waiting for the first update…');
  }

  get anchors() {
    return xb.core.world?.anchors;
  }

  /** Builds the in-headset controls. */
  createPanel() {
    this.statusText = new xb.UIText({
      text: 'Starting…',
      style: {
        flexGrow: 1,
        fontSize: 34,
        lineHeight: 1.25,
        color: '#d7d2ea',
        textAlign: 'center',
        verticalAlign: 'middle',
      },
    });

    const panel = new xb.UICard({
      size: {width: 1.2, height: 0.7},
      manipulation: true,
      edge: {translateFromSurface: true},
      style: {
        flexDirection: 'column',
        gap: 28,
        padding: 40,
        backgroundColor: '#1a1a1a',
      },
      children: [
        new xb.UIText({
          text: 'Spatial Anchors',
          style: {
            fontSize: 64,
            fontWeight: 'bold',
            color: MARKER_COLOR_CSS,
            textAlign: 'center',
          },
        }),
        this.statusText,
        new xb.UIPanel({
          style: {width: '100%', height: 120, flexDirection: 'row', gap: 20},
          children: [
            new xb.UIButton({
              label: 'Drop',
              onClick: () => this.dropMarker(),
              style: {
                flexGrow: 1,
                fontSize: BUTTON_FONT_SIZE,
                backgroundColor: '#6a5acd',
              },
            }),
            new xb.UIButton({
              label: 'Clear',
              onClick: () => this.forgetAll(),
              style: {
                flexGrow: 1,
                fontSize: BUTTON_FONT_SIZE,
                backgroundColor: '#3a3550',
              },
            }),
            new xb.UIButton({
              label: 'Release',
              onClick: () => this.releaseEverything(),
              style: {
                flexGrow: 1,
                fontSize: BUTTON_FONT_SIZE,
                backgroundColor: '#7a3b46',
              },
            }),
          ],
        }),
      ],
    });
    panel.position.set(0, xb.user.height, -xb.user.panelDistance);
    this.add(panel);

    this.panel = panel;
  }

  /** Places a marker a little in front of the user. */
  async dropMarker() {
    const anchors = this.anchors;
    if (!anchors) return;
    const camera = xb.core.camera;
    if (!camera) return;

    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    const forward = new THREE.Vector3(0, 0, -MARKER_DISTANCE).applyQuaternion(
      this.scratchQuaternion
    );
    const target = this.scratchPosition.clone().add(forward);
    this.separate(target, this.scratchQuaternion);

    const pose = new XRRigidTransform(
      {x: target.x, y: target.y, z: target.z},
      {x: 0, y: 0, z: 0, w: 1}
    );
    const label = `marker ${this.markers.size + 1}`;
    const tracked = await anchors.create(pose, label);
    if (!tracked) {
      this.setStatus('Could not create an anchor here');
      return;
    }
    // Persisting is what makes the marker outlive the session.
    const saved = await anchors.persist(tracked.id);
    this.addMarkerMesh(tracked, MARKER_COLOR, target);
    this.setStatus(
      saved
        ? `Dropped ${label} and saved it`
        : `Dropped ${label}, but ${this.whyNotSaved()}`
    );
  }

  /**
   * Nudges a target sideways until it is not inside an existing marker.
   *
   * Placement follows where you are looking, so two drops from the same spot
   * would otherwise leave one marker hidden inside another.
   *
   * @param target - Position to adjust in place.
   * @param facing - The head orientation, so the nudge is sideways on screen.
   */
  separate(target, facing) {
    const step = new THREE.Vector3(MARKER_MIN_SEPARATION, 0, 0).applyQuaternion(
      facing
    );
    // Bounded so a crowded spot cannot spin here forever.
    for (let i = 0; i < this.markers.size + 1; i++) {
      const clash = [...this.markers.values()].some(
        (m) => m.position.distanceTo(target) < MARKER_MIN_SEPARATION
      );
      if (!clash) return;
      target.add(step);
    }
  }

  /**
   * Explains why a marker could not be saved.
   *
   * `persist()` returns a plain false, which cannot distinguish "this platform
   * has no way to save anchors" from "the write was refused". The capability
   * says which, and the difference matters: one is worth retrying, the other
   * never will be.
   *
   * @returns A human-readable reason.
   */
  whyNotSaved() {
    switch (this.anchors?.capability) {
      case 'session-only':
        return 'this browser only supports non-persistent anchors';
      case 'unsupported':
        return 'this browser has no anchor support';
      default: {
        // The platform can refuse a handle for its own reasons, and it says
        // why. Reporting that beats blaming storage, which is usually not the
        // thing that said no.
        const error = this.anchors?.lastError;
        const detail = error
          ? String(error.message ?? error).slice(0, 120)
          : 'no reason given';
        return `the save was refused: ${detail}`;
      }
    }
  }

  /** Rebuilds meshes for anchors restored from a previous session. */
  async restoreSaved() {
    const anchors = this.anchors;
    if (!anchors) return;
    const results = await anchors.restoreAll();
    if (results.length === 0) {
      this.setStatus(this.describeCapability('Nothing saved yet'));
      return;
    }
    let restored = 0;
    for (const result of results) {
      if (result.status !== 'restored' || !result.anchor) continue;
      restored++;
      this.addMarkerMesh(result.anchor, RESTORED_COLOR);
    }
    const missing = results.length - restored;
    // Origin wide, so this counts the other anchor demos' handles too. Shown
    // as a total rather than as anything owed to this page.
    const held = anchors.platformHandles().length;
    this.setStatus(
      this.describeCapability(
        `Restored ${restored} of ${results.length} saved markers` +
          (missing > 0 ? `, ${missing} could not be found here` : '') +
          (held > 0 ? `. the device holds ${held} for this site` : '')
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

  /**
   * Releases every handle the device holds for this site.
   *
   * Deliberately separate from Clear: it reaches handles no record names any
   * more, and it is origin wide, so the other anchor demos lose theirs too.
   */
  async releaseEverything() {
    const anchors = this.anchors;
    if (!anchors) return;
    const before = anchors.platformHandles().length;
    this.setStatus(`releasing ${before} handles the device holds…`);
    const released = await anchors.releaseAllPlatformHandles();
    for (const id of [...this.markers.keys()]) {
      const mesh = this.markers.get(id);
      if (mesh) {
        xb.core.scene.remove(mesh);
        mesh.traverse(xb.disposeRenderableResources);
      }
      this.markers.delete(id);
    }
    // The platform's list does not shrink as handles go, so reading it back
    // here would suggest nothing happened. The accepted count is the truth.
    this.setStatus(
      released === before
        ? `Released all ${released}. Leave and re-enter the session to use them.`
        : `Released ${released} of ${before}. Leave and re-enter, then try again.`
    );
  }

  /** Clears every saved handle and removes the markers. */
  forgetAll() {
    const anchors = this.anchors;
    if (!anchors) return;
    for (const id of [...this.markers.keys()]) {
      anchors.delete(id);
      const mesh = this.markers.get(id);
      if (mesh) {
        xb.core.scene.remove(mesh);
        mesh.traverse(xb.disposeRenderableResources);
      }
      this.markers.delete(id);
    }
    anchors.forgetAll();
    this.setStatus('Cleared every saved marker');
  }

  update() {
    const anchors = this.anchors;
    if (!anchors) return;

    // Restore once per backing. Before entering XR the capability is
    // 'simulated', and records saved by a real headset have no pose to rebuild
    // from, so a single attempt at startup would leave them lost forever.
    // Retrying on the upgrade to real anchors is what makes them come back.
    if (!this.restoredUnder.has(anchors.capability)) {
      this.restoredUnder.add(anchors.capability);
      this.restoreSaved();
    }

    // The manager resolves the reference space itself, and simulated anchors
    // report their own pose, so this works with or without a live frame.
    for (const [id, mesh] of this.markers) {
      const pose = anchors.getPose(id);
      if (!pose) {
        THREE.warnOnce('could not get pose for anchor', id);
        continue;
      }
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
      persistent: 'Real anchors, saved across sessions',
      'session-only': 'Real anchors, but this platform cannot save them',
      simulated: 'Simulated anchors (desktop), not really pinned to a room',
      unsupported: 'No anchor support on this platform',
    }[capability];
    return `${prefix}. ${message}`;
  }

  setStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message;
    // The panel is the only readable surface once the session starts.
    if (this.statusText) this.statusText.text = message;
    console.log(`[anchors demo] ${message}`);
  }
}

const options = new xb.Options({antialias: true, reticles: {enabled: true}});
options.controllers.visualizeRays = true;
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

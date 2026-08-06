import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

// Anchored gallery: leave a few objects around the room and find them where
// you left them.
//
// The other anchors demos talk to the anchor subsystem directly and keep their
// own map from anchor to mesh. This one hands that job to AnchoredObjects,
// which owns the map and copies poses across every frame, so the app only says
// what to place and what to rebuild.
//
// It also restores orientation, not just position. The marker demo copies a
// position onto a sphere, where facing is invisible and does not matter. Here
// a piece is placed at the angle you were looking and comes back at it, which
// is what the helper is doing on the app's behalf every frame.

/**
 * Shapes cycle in this order so repeated placements stay distinguishable.
 *
 * Each one has to read differently from every angle, since the whole point
 * here is that a piece comes back facing the way it was left. A sphere shows
 * nothing, and a cone or a torus is symmetric about its own axis, so spinning
 * one looks identical. These are not.
 */
const SHAPES = ['arrow', 'knot', 'cube'];
/** How far in front of the user a new piece is placed, in metres. */
const PLACE_DISTANCE = 0.9;
/**
 * How close two pieces may be before the new one is nudged aside, in metres.
 * A piece goes exactly where you are looking; this only stops one landing
 * invisibly inside another when you place twice without moving.
 */
const PIECE_MIN_SEPARATION = 0.22;
/** Edge length of a placed piece, in metres. */
const PIECE_SIZE = 0.09;
/** Colour of a freshly placed piece, and of one rebuilt from storage. */
const FRESH_COLOR = 0xffa657;
const RESTORED_COLOR = 0x4ec9a0;
/**
 * Button label size. Much larger than the default 0.05, which is legible on a
 * monitor but not at panel distance in a headset. Labels are single words so
 * they fit on one line at this size.
 */
const BUTTON_FONT_SIZE = 0.25;

/**
 * Builds the mesh for a piece.
 *
 * @param shape - Which shape to build.
 * @param color - Colour to give it.
 * @returns The mesh.
 */
function makeShape(shape, color) {
  const s = PIECE_SIZE;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.3,
    roughness: 0.45,
  });

  if (shape === 'arrow') {
    // Reads unambiguously from any angle, which a single primitive does not.
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.28, s * 0.28, s * 1.8, 16),
      material
    );
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(s * 0.6, s * 1.1, 20),
      material
    );
    head.rotation.x = -Math.PI / 2;
    head.position.z = -s * 1.4;
    // A fin, so rolling the arrow about its own length is visible too.
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(s * 0.12, s * 0.9, s * 0.7),
      material
    );
    fin.position.set(0, s * 0.55, s * 0.7);
    group.add(shaft, head, fin);
    return group;
  }

  const geometry =
    shape === 'knot'
      ? new THREE.TorusKnotGeometry(s * 0.7, s * 0.25, 64, 12)
      : new THREE.BoxGeometry(s * 1.6, s * 1.6, s * 1.6);
  return new THREE.Mesh(geometry, material);
}

class AnchoredGalleryDemo extends xb.Script {
  constructor() {
    super();
    this.gallery = null;
    this.placed = 0;
    this.restoredUnder = new Set();
    this.statusText = null;
    this.scratchPosition = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.6, 1, 0.8);
    xb.core.scene.add(key);

    this.createPanel();

    document
      .getElementById('drop')
      ?.addEventListener('click', () => this.placeShape());
    document
      .getElementById('forget')
      ?.addEventListener('click', () => this.clearGallery());

    window.anchorGalleryDemo = this;
    this.setStatus('Waiting for the first update…');
  }

  get anchors() {
    return xb.core.world?.anchors;
  }

  /** Builds the in-headset controls. */
  createPanel() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#141322F0',
      useDefaultPosition: false,
      showEdge: true,
      width: 1.2,
      height: 0.7,
    });
    panel.isRoot = true;
    panel.position.set(0, xb.user.height, -xb.user.panelDistance);
    this.add(panel);

    const grid = panel.addGrid();
    grid.addRow({weight: 0.22}).addText({
      text: 'Anchored Gallery',
      fontSize: 0.08,
      fontColor: '#ffa657',
    });
    this.statusText = grid.addRow({weight: 0.3}).addText({
      text: 'Starting…',
      fontSize: 0.04,
      fontColor: '#d7d2ea',
    });

    const buttons = grid.addRow({weight: 0.4});
    const place = buttons.addCol({weight: 0.5}).addTextButton({
      text: 'Place',
      fontSize: BUTTON_FONT_SIZE,
      backgroundColor: '#c2703bE0',
    });
    place.onTriggered = () => this.placeShape();

    const clear = buttons.addCol({weight: 0.5}).addTextButton({
      text: 'Clear',
      fontSize: BUTTON_FONT_SIZE,
      backgroundColor: '#3a3550E0',
    });
    clear.onTriggered = () => this.clearGallery();

    this.panel = panel;
  }

  /** Places the next shape a little in front of the user and anchors it. */
  async placeShape() {
    const gallery = this.gallery;
    const camera = xb.core.camera;
    if (!gallery || !camera) return;

    const shape = SHAPES[this.placed % SHAPES.length];
    const mesh = makeShape(shape, FRESH_COLOR);

    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    const forward = new THREE.Vector3(0, 0, -PLACE_DISTANCE).applyQuaternion(
      this.scratchQuaternion
    );
    mesh.position.copy(this.scratchPosition).add(forward);
    this.separate(mesh.position, this.scratchQuaternion);
    mesh.quaternion.copy(this.scratchQuaternion);

    // One call anchors it, saves it, and adopts the mesh. There is no map to
    // keep in step here, which is the whole point of AnchoredObjects.
    const tracked = await gallery.anchor(mesh, shape);
    if (!tracked) {
      this.setStatus('Could not anchor a piece here');
      return;
    }
    this.placed++;
    this.setStatus(`Placed a ${shape} facing the way you are looking`);
  }

  /**
   * Nudges a target sideways until it is not inside an existing piece.
   *
   * @param target - Position to adjust in place.
   * @param facing - The head orientation, so the nudge is sideways on screen.
   */
  separate(target, facing) {
    const step = new THREE.Vector3(PIECE_MIN_SEPARATION, 0, 0).applyQuaternion(
      facing
    );
    const placed = [...(this.gallery?.getAll().values() ?? [])];
    for (let i = 0; i < placed.length + 1; i++) {
      const clash = placed.some(
        (o) => o.position.distanceTo(target) < PIECE_MIN_SEPARATION
      );
      if (!clash) return;
      target.add(step);
    }
  }

  /** Rebuilds the pieces saved in a previous session. */
  async restoreGallery() {
    const gallery = this.gallery;
    if (!gallery) return;
    const restored = await gallery.restore((label) =>
      makeShape(SHAPES.includes(label) ? label : 'cube', RESTORED_COLOR)
    );
    this.placed = Math.max(this.placed, gallery.getAll().size);
    this.setStatus(
      this.describeCapability(
        restored > 0
          ? `Rebuilt ${restored} pieces at the angles they were left`
          : 'Nothing saved yet'
      )
    );
  }

  /** Removes every piece and forgets the anchors behind them. */
  clearGallery() {
    if (!this.gallery) return;
    this.gallery.clear();
    this.placed = 0;
    this.setStatus('Cleared every saved piece');
  }

  update() {
    const anchors = this.anchors;
    if (!anchors) return;
    if (!this.gallery) {
      this.gallery = new xb.AnchoredObjects(anchors, xb.core.scene);
    }

    // Restore once per backing. Before entering XR the capability is
    // 'simulated', and records saved by a headset have no pose to rebuild
    // from, so a single attempt at startup would leave them lost forever.
    if (!this.restoredUnder.has(anchors.capability)) {
      this.restoredUnder.add(anchors.capability);
      this.restoreGallery();
    }

    // Everything placed stays glued to its anchor from here.
    this.gallery.update();
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
    if (this.statusText) this.statusText.text = message;
  }
}

const options = new xb.Options({antialias: true, reticles: {enabled: true}});
options.controllers.visualizeRays = true;
options.world.enableAnchorPersistence();
// Desktop has no tracking system to anchor against; opt into locally held
// poses so the demo is usable without a headset.
options.world.anchors.simulatorFallback = true;
// Its own store, so this demo and the other anchor demos never rebuild each
// other's content.
options.world.anchors.storageKey = 'xrblocks.anchors.gallery';

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new AnchoredGalleryDemo());
  options.setAppTitle('Anchored Gallery');
  xb.init(options);
});

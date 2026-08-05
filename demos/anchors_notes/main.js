import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {Text} from 'troika-three-text';
import * as xb from 'xrblocks';

// Anchored notes demo: type a note, pin it in space where you are looking, and
// the notes come back the next time you load the page.
//
// This is a different take on the marker demo. Here the anchor label carries
// real user content, so persisting a note round-trips the actual text through
// storage, not just a generated name. Each note is drawn as readable 3D text
// on a card that faces the user.
//
// On a headset the platform re-localises each anchor, so notes survive leaving
// and re-entering the session. On desktop there is no tracking system to
// anchor against, so the simulator fallback holds the poses instead. That path
// proves the app wiring only, never that a device can re-localise, and the
// capability line says which one is in use.

const CARD_WIDTH = 0.42;
const CARD_HEIGHT = 0.26;
const CARD_DISTANCE = 0.9;
const FRESH_COLOR = 0x6a5acd;
const RESTORED_COLOR = 0x2f7d63;

/**
 * Releases the GPU resources an object holds before it is dropped.
 *
 * three.js does not free buffers or programs when an object leaves the scene
 * graph, so deleting anchors in a long session would otherwise grow VRAM use
 * without bound.
 *
 * @param object - The object being discarded.
 */
function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
    else material?.dispose?.();
  });
}

class AnchorNotesDemo extends xb.Script {
  constructor() {
    super();
    // id -> {group, text, restored} so poses can be refreshed and the DOM list
    // can be kept in step with what is in the scene.
    this.notes = new Map();
    this.restoredUnder = new Set();
    this.scratchPosition = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
    this.cameraPosition = new THREE.Vector3();
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.6, 1, 0.8);
    xb.core.scene.add(key);

    const input = document.getElementById('note-input');
    document
      .getElementById('pin')
      ?.addEventListener('click', () => this.pinNote());
    // Enter is the natural way to commit a note once the caret is in the box.
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.pinNote();
    });
    document
      .getElementById('forget')
      ?.addEventListener('click', () => this.forgetAll());

    // Exposed so the demo can be inspected from the console while iterating.
    window.anchorNotesDemo = this;
    this.setStatus('waiting for the first update…');
  }

  get anchors() {
    return xb.core.world?.anchors;
  }

  /** Pins the text currently in the input a little in front of the user. */
  async pinNote() {
    const anchors = this.anchors;
    if (!anchors) return;
    const input = document.getElementById('note-input');
    const text = (input?.value ?? '').trim();
    if (!text) {
      this.setStatus('type something before pinning a note');
      return;
    }
    const camera = xb.core.camera;
    if (!camera) return;

    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    // Pinning twice without moving would put both notes at the same point and
    // render them on top of each other, so fan them out across the view.
    const index = this.notes.size;
    const spread = new THREE.Vector3(
      ((index % 3) - 1) * 0.42,
      Math.floor(index / 3) * -0.3,
      0
    ).applyQuaternion(this.scratchQuaternion);
    const forward = new THREE.Vector3(0, 0, -CARD_DISTANCE).applyQuaternion(
      this.scratchQuaternion
    );
    const target = this.scratchPosition.clone().add(forward).add(spread);

    const pose = new XRRigidTransform(
      {x: target.x, y: target.y, z: target.z},
      {x: 0, y: 0, z: 0, w: 1}
    );
    // The note text is the anchor label, so it is what persistence saves and
    // restores. This is the whole point of the demo.
    const tracked = await anchors.create(pose, text);
    if (!tracked) {
      this.setStatus('could not anchor a note here');
      return;
    }
    // Persisting is what makes the note outlive the session.
    const saved = await anchors.persist(tracked.id);
    this.addNoteCard(tracked, FRESH_COLOR, false, target);
    if (input) input.value = '';
    this.setStatus(
      saved
        ? `pinned "${this.short(text)}" and saved it`
        : `pinned "${this.short(text)}", but it will not survive a reload`
    );
  }

  /** Rebuilds cards for notes restored from a previous session. */
  async restoreSaved() {
    const anchors = this.anchors;
    if (!anchors) return;
    const results = await anchors.restoreAll();
    if (results.length === 0) {
      this.setStatus('no saved notes yet, write one above');
      return;
    }
    let restored = 0;
    for (const result of results) {
      if (result.status !== 'restored' || !result.anchor) continue;
      restored++;
      // The label came back through storage, so restored cards show the text
      // exactly as it was typed in the earlier session.
      this.addNoteCard(result.anchor, RESTORED_COLOR, true);
    }
    const missing = results.length - restored;
    this.setStatus(
      `restored ${restored} of ${results.length} saved notes` +
        (missing > 0 ? `, ${missing} could not be found here` : '')
    );
  }

  /**
   * Builds a card for a tracked anchor and registers it.
   * @param tracked - The anchor to visualise.
   * @param color - Card colour.
   * @param restored - Whether this note came back from a previous session.
   * @param at - Optional initial position, before the first pose read.
   */
  addNoteCard(tracked, color, restored, at) {
    const group = new THREE.Group();

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
        side: THREE.DoubleSide,
      })
    );
    group.add(card);

    const label = new Text();
    label.text = tracked.label;
    label.fontSize = 0.028;
    label.maxWidth = CARD_WIDTH * 0.86;
    label.lineHeight = 1.3;
    label.color = 0xffffff;
    label.anchorX = 'center';
    label.anchorY = 'middle';
    label.textAlign = 'center';
    // Lift the text just off the card so it never z-fights with the panel.
    label.position.set(0, 0, 0.002);
    label.sync();
    group.add(label);

    if (at) group.position.copy(at);
    xb.core.scene.add(group);
    this.notes.set(tracked.id, {group, text: label, restored});
    this.refreshList();
  }

  /**
   * Removes one note and forgets its saved handle.
   * @param id - Id of the note to delete.
   */
  deleteNote(id) {
    const anchors = this.anchors;
    const entry = this.notes.get(id);
    if (!entry) return;
    anchors?.delete(id);
    xb.core.scene.remove(entry.group);
    // troika Text holds GPU resources, so release them rather than leaking on
    // every delete. The card behind it holds its own geometry and material.
    entry.text.dispose?.();
    disposeObject(entry.group);
    this.notes.delete(id);
    this.refreshList();
    this.setStatus('deleted a note');
  }

  /** Clears every saved handle and removes the cards. */
  forgetAll() {
    const anchors = this.anchors;
    if (!anchors) return;
    for (const id of [...this.notes.keys()]) {
      anchors.delete(id);
      const entry = this.notes.get(id);
      if (entry) {
        xb.core.scene.remove(entry.group);
        entry.text.dispose?.();
        disposeObject(entry.group);
      }
      this.notes.delete(id);
    }
    anchors.forgetAll();
    this.refreshList();
    this.setStatus('forgot every saved note');
  }

  update(_time, frame) {
    const anchors = this.anchors;
    if (!anchors) return;

    // Restore once per backing. Before entering XR the capability is
    // 'simulated', and records saved by a real headset have no pose to rebuild
    // from, so a single attempt at startup would leave them lost forever.
    // Retrying on the upgrade to real anchors is what makes them come back.
    if (!this.restoredUnder.has(anchors.capability)) {
      this.restoredUnder.add(anchors.capability);
      this.refreshCapability();
      this.restoreSaved();
    }
    this.refreshCapability();

    const camera = xb.core.camera;
    if (camera) camera.getWorldPosition(this.cameraPosition);

    // Simulated anchors report their own pose, so this works with or without
    // a live frame.
    const referenceSpace = frame
      ? (xb.core.renderer.xr.getReferenceSpace() ?? undefined)
      : undefined;
    for (const [id, entry] of this.notes) {
      const pose = anchors.getPose(id, referenceSpace);
      if (!pose) continue;
      entry.group.position.set(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
      // Billboard toward the viewer so a note stays legible from wherever it
      // is read, rather than facing whichever way it was pinned.
      if (camera) entry.group.lookAt(this.cameraPosition);
    }
  }

  /** Rebuilds the DOM list so it mirrors the pinned notes. */
  refreshList() {
    const list = document.getElementById('note-list');
    if (!list) return;
    list.textContent = '';
    for (const [id, entry] of this.notes) {
      const item = document.createElement('li');

      const text = document.createElement('span');
      text.className = entry.restored ? 'note-text note-restored' : 'note-text';
      text.textContent = entry.text.text;
      text.title = entry.text.text;
      item.appendChild(text);

      const remove = document.createElement('button');
      remove.className = 'note-delete';
      remove.textContent = '\u00d7';
      remove.title = 'Delete this note';
      remove.addEventListener('click', () => this.deleteNote(id));
      item.appendChild(remove);

      list.appendChild(item);
    }
  }

  /** Shows the current anchor backing plainly in the UI. */
  refreshCapability() {
    const el = document.getElementById('capability');
    if (!el) return;
    const capability = this.anchors?.capability ?? 'unsupported';
    el.textContent = {
      persistent: 'Real anchors: notes are saved across sessions.',
      'session-only':
        'Real anchors, but this platform cannot save them across sessions.',
      simulated:
        'Simulated anchors (desktop): nothing is really pinned to the room, ' +
        'poses are held locally so the demo still works.',
      unsupported: 'No anchor support on this platform.',
    }[capability];
  }

  /**
   * Trims a note to a short form for one-line status messages.
   * @param text - The full note text.
   * @returns A shortened, single-line version.
   */
  short(text) {
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > 32 ? `${flat.slice(0, 31)}\u2026` : flat;
  }

  setStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message;
    console.log(`[anchor notes demo] ${message}`);
  }
}

const options = new xb.Options({antialias: true, reticles: {enabled: true}});
options.world.enableAnchorPersistence();
// Desktop has no tracking system to anchor against; opt into locally held
// poses so the demo is usable without a headset.
options.world.anchors.simulatorFallback = true;
options.world.anchors.debugging = true;
// Keep notes in their own store so this demo and the marker demo, which share
// the default key, never restore each other's content.
options.world.anchors.storageKey = 'xrblocks.anchors.notes';

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new AnchorNotesDemo());
  options.setAppTitle('Anchored Notes');
  xb.init(options);
});

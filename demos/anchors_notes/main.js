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
/**
 * How close two notes may be before the new one is nudged aside, in metres.
 * A note goes exactly where you are looking; this only stops one landing
 * invisibly inside another when you pin twice without moving.
 */
const NOTE_MIN_SEPARATION = 0.46;
/**
 * Button label size in retained UI layout units.
 */
const BUTTON_FONT_SIZE = 38;
const FRESH_COLOR = 0x6a5acd;
const RESTORED_COLOR = 0x2f7d63;

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
    // Keep a copy of the browser input because the page is not visible inside
    // an immersive session.
    this.draftText = '';
    this.statusText = null;
    this.draftView = null;
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.6, 1, 0.8);
    xb.core.scene.add(key);

    this.createPanel();

    // The DOM controls below only exist outside an immersive session, since
    // xrblocks never requests dom-overlay. Type the note before entering XR;
    // the spatial panel remains available to pin it inside the session.
    const input = document.getElementById('note-input');
    input?.addEventListener('input', () => this.setDraft(input.value));
    document
      .getElementById('pin')
      ?.addEventListener('click', () => this.pinNote());
    // Enter is the natural way to commit a note once the caret is in the box.
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.pinNote();
    });
    // The simulator walks the camera on WASD, so writing a note containing any
    // of those letters would otherwise carry you across the room while you
    // type. Resolved on each event rather than once here, since the simulator
    // may not exist yet when this runs.
    input?.addEventListener('focus', () => this.setSimulatorControls(false));
    input?.addEventListener('blur', () => this.setSimulatorControls(true));
    document
      .getElementById('forget')
      ?.addEventListener('click', () => this.forgetAll());

    // Exposed so the demo can be inspected from the console while iterating.
    window.anchorNotesDemo = this;
    this.setStatus('Waiting for the first update…');
  }

  get anchors() {
    return xb.core.world?.anchors;
  }

  /**
   * Turns the simulator's keyboard movement on or off.
   *
   * @param enabled - Whether WASD should drive the camera.
   */
  setSimulatorControls(enabled) {
    const controls = xb.core?.simulator?.controls;
    if (controls) controls.enabled = enabled;
  }

  /** Builds the in-headset controls. */
  createPanel() {
    this.draftView = new xb.UIText({
      text: 'Type a note in the browser before entering XR',
      style: {
        fontSize: 40,
        color: '#ffffff',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      },
    });
    this.statusText = new xb.UIText({
      text: 'Starting…',
      style: {
        flexGrow: 1,
        fontSize: 32,
        lineHeight: 1.2,
        color: '#b9b3d0',
        textAlign: 'center',
        verticalAlign: 'middle',
      },
    });

    const panel = new xb.UICard({
      size: {width: 1.2, height: 0.75},
      manipulation: true,
      edge: {translateFromSurface: true},
      style: {
        flexDirection: 'column',
        gap: 22,
        padding: 36,
        backgroundColor: '#141322',
      },
      children: [
        new xb.UIText({
          text: 'Anchored Notes',
          style: {
            fontSize: 60,
            fontWeight: 'bold',
            color: '#ffb877',
            textAlign: 'center',
          },
        }),
        this.draftView,
        this.statusText,
        new xb.UIPanel({
          style: {width: '100%', height: 112, flexDirection: 'row', gap: 20},
          children: [
            new xb.UIButton({
              label: 'Pin',
              onClick: () => this.pinNote(),
              style: {
                flexGrow: 1,
                fontSize: BUTTON_FONT_SIZE,
                backgroundColor: '#c2703b',
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
    panel.position.set(0, xb.user.height + 0.25, -xb.user.panelDistance);
    this.add(panel);

    this.panel = panel;
  }

  /**
   * Records what the browser input holds and shows it on the panel.
   * @param text - The current note draft.
   */
  setDraft(text) {
    this.draftText = text;
    if (this.draftView) {
      this.draftView.text =
        text.trim() || 'Type a note in the browser before entering XR';
    }
  }

  /** Pins the text currently in the input a little in front of the user. */
  async pinNote() {
    const anchors = this.anchors;
    if (!anchors) return;
    const input = document.getElementById('note-input');
    // The draft remains available after the DOM box disappears in XR.
    const text = ((input?.value || this.draftText) ?? '').trim();
    if (!text) {
      this.setStatus('Type something before pinning a note');
      return;
    }
    const camera = xb.core.camera;
    if (!camera) return;

    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    // Pinning twice without moving would put both notes at the same point and
    // render them on top of each other, so fan them out across the view.
    const forward = new THREE.Vector3(0, 0, -CARD_DISTANCE).applyQuaternion(
      this.scratchQuaternion
    );
    const target = this.scratchPosition.clone().add(forward);
    this.separate(target, this.scratchQuaternion);

    const pose = new XRRigidTransform(
      {x: target.x, y: target.y, z: target.z},
      {x: 0, y: 0, z: 0, w: 1}
    );
    // The note text is the anchor label, so it is what persistence saves and
    // restores. This is the whole point of the demo.
    const tracked = await anchors.create(pose, text);
    if (!tracked) {
      this.setStatus('Could not anchor a note here');
      return;
    }
    // Persisting is what makes the note outlive the session.
    const saved = await anchors.persist(tracked.id);
    this.addNoteCard(tracked, FRESH_COLOR, false, target);
    if (input) input.value = '';
    this.setDraft('');
    this.setStatus(
      saved
        ? `Pinned "${this.short(text)}" and saved it`
        : `Pinned "${this.short(text)}", but ${this.whyNotSaved()}`
    );
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
        return 'created session-only anchor';
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

  /**
   * Nudges a target sideways until it is not inside an existing note.
   *
   * @param target - Position to adjust in place.
   * @param facing - The head orientation, so the nudge is sideways on screen.
   */
  separate(target, facing) {
    const step = new THREE.Vector3(NOTE_MIN_SEPARATION, 0, 0).applyQuaternion(
      facing
    );
    for (let i = 0; i < this.notes.size + 1; i++) {
      const clash = [...this.notes.values()].some(
        (n) => n.group.position.distanceTo(target) < NOTE_MIN_SEPARATION
      );
      if (!clash) return;
      target.add(step);
    }
  }

  /** Rebuilds cards for notes restored from a previous session. */
  async restoreSaved() {
    const anchors = this.anchors;
    if (!anchors) return;
    const results = await anchors.restoreAll();
    if (results.length === 0) {
      this.setStatus(this.describeCapability('No saved notes yet'));
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
      this.describeCapability(
        `Restored ${restored} of ${results.length} saved notes` +
          (missing > 0 ? `, ${missing} could not be found here` : '')
      )
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
   * Releases every handle the device holds for this site.
   *
   * Separate from Clear: it reaches handles no record names any more, and it
   * is origin wide, so the other anchor demos lose theirs too.
   */
  async releaseEverything() {
    const anchors = this.anchors;
    if (!anchors) return;
    const before = anchors.platformHandles().length;
    this.setStatus(`Releasing ${before} handles the device holds…`);
    const released = await anchors.releaseAllPlatformHandles();
    for (const id of [...this.notes.keys()]) {
      const entry = this.notes.get(id);
      if (entry) {
        xb.core.scene.remove(entry.group);
        entry.text.dispose?.();
        entry.group.traverse(xb.disposeRenderableResources);
      }
      this.notes.delete(id);
    }
    this.refreshList();
    // The platform's list does not shrink as handles go, so reading it back
    // would suggest nothing happened. The accepted count is the truth.
    this.setStatus(
      released === before
        ? `Released all ${released}. Leave and re-enter the session to use them.`
        : `Released ${released} of ${before}. Leave and re-enter, then try again.`
    );
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
    entry.group.traverse(xb.disposeRenderableResources);
    this.notes.delete(id);
    this.refreshList();
    this.setStatus('Deleted a note');
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
        entry.group.traverse(xb.disposeRenderableResources);
      }
      this.notes.delete(id);
    }
    anchors.forgetAll();
    this.refreshList();
    this.setStatus('Cleared every saved note');
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

  /**
   * Prefixes a message with which anchor backing is in use.
   *
   * The capability line next to it is DOM, so it disappears the moment the
   * session starts. This is what carries the same information into the panel.
   *
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
    // The panel is the only readable surface once the session starts.
    if (this.statusText) this.statusText.text = message;
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

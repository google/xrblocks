import * as THREE from 'three';
import * as xb from 'xrblocks';
import type {SelectEvent} from 'xrblocks';

import type {SceneInstance, SceneManager} from './SceneManager';
import type {TransformGizmo} from './TransformGizmo';

const HIGHLIGHT_COLOR = 0xfacc15;
const FRAME_PADDING = 1.3;
const MIN_FRAME_DISTANCE = 0.4;

export type ToolMode = 'select' | 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';

/**
 * Tracks which spawned instance(s) are selected (multi-select via
 * Shift+click, both in the 3D scene and the hierarchy panel), shows a
 * per-object bounding-box highlight, and exposes the active gizmo tool
 * mode + coordinate space via keyboard shortcuts (digits 1-4, Esc, F,
 * Ctrl+A). Desktop mouse only -- real XR controller selection is
 * permanently out of scope for this addon.
 */
export class SelectionManager extends xb.Script {
  sceneManager: SceneManager;
  selectedSet = new Set<SceneInstance>();
  primary: SceneInstance | null = null;
  mode: ToolMode = 'translate';
  space: TransformSpace = 'world';
  shiftHeld = false;
  onSelectionChange: ((selected: SceneInstance[]) => void) | null = null;
  // Set post-construction (see SceneEditor) once TransformGizmo exists --
  // onSelectStart defers to it below.
  transformGizmo: TransformGizmo | null = null;

  /** Set every frame by SceneEditor: true only while the simulator is
   * running, its interaction mode is Editor, and no real XR session is
   * active. Gates 3D-click selection, keyboard shortcuts, and highlight
   * visibility -- false doesn't clear the selection (so switching back to
   * Editor mode restores exactly where you left off), it just makes the
   * editor visually and interactively inert everywhere else. */
  editorActive = true;

  highlights = new Map<SceneInstance, THREE.Box3Helper>();

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
  }

  selectedList(): SceneInstance[] {
    return [...this.selectedSet];
  }

  isSelected(instance: SceneInstance) {
    return this.selectedSet.has(instance);
  }

  select(
    instance: SceneInstance | null,
    {additive = false}: {additive?: boolean} = {}
  ) {
    if (!instance) {
      if (!additive) this.clearSelection();
      return;
    }

    if (additive) {
      if (this.selectedSet.has(instance)) {
        this.selectedSet.delete(instance);
        if (this.primary === instance) {
          const remaining = this.selectedList();
          this.primary = remaining[remaining.length - 1] ?? null;
        }
      } else {
        this.selectedSet.add(instance);
        this.primary = instance;
      }
    } else {
      this.selectedSet.clear();
      this.selectedSet.add(instance);
      this.primary = instance;
    }

    this.syncHighlights();
    this.onSelectionChange?.(this.selectedList());
  }

  clearSelection() {
    if (this.selectedSet.size === 0) return;
    this.selectedSet.clear();
    this.primary = null;
    this.syncHighlights();
    this.onSelectionChange?.(this.selectedList());
  }

  syncHighlights() {
    for (const [instance, helper] of this.highlights) {
      if (!this.selectedSet.has(instance)) {
        helper.parent?.remove(helper);
        this.highlights.delete(instance);
      }
    }
    for (const instance of this.selectedSet) {
      let helper = this.highlights.get(instance);
      if (!helper) {
        helper = new THREE.Box3Helper(new THREE.Box3(), HIGHLIGHT_COLOR);
        helper.raycast = () => {};
        this.highlights.set(instance, helper);
        this.add(helper);
      }
      helper.box.setFromObject(instance.object);
    }
  }

  override update() {
    // Reflects editorActive (set every frame by SceneEditor) onto the
    // highlight boxes -- a selection made in Editor mode stays intact
    // when switching to another simulator mode, it just stops rendering
    // and stops being interactive, so returning to Editor mode restores
    // exactly where you left off.
    for (const helper of this.highlights.values()) {
      helper.visible = this.editorActive;
    }
    for (const [instance, helper] of this.highlights) {
      if (this.selectedSet.has(instance))
        helper.box.setFromObject(instance.object);
    }

    let changed = false;
    for (const instance of this.selectedList()) {
      // Also drop an instance that got locked while selected -- locking
      // is meant to prevent editing, and a still-selected locked object
      // would otherwise keep responding to the gizmo/inspector.
      if (!this.sceneManager.has(instance.id) || instance.locked) {
        this.selectedSet.delete(instance);
        if (this.primary === instance) this.primary = null;
        changed = true;
      }
    }
    if (changed) {
      if (!this.primary) {
        const remaining = this.selectedList();
        this.primary = remaining[remaining.length - 1] ?? null;
      }
      this.syncHighlights();
      this.onSelectionChange?.(this.selectedList());
    }
  }

  override onSelectStart(event: SelectEvent) {
    if (!this.editorActive) return;
    const controller = event.target;
    if (controller !== xb.core.input.mouseController) return;

    // Defer to the gizmo's own scoped handle raycast before running our
    // whole-scene one at all -- a whole-scene raycast can't reliably tell
    // "clicked the handle" from "clicked the object it's sitting on"
    // (handles render with depthTest:false so they always look like
    // they're on top, but true ray distance doesn't know that), so asking
    // the gizmo directly instead of inferring it from our own closest-hit
    // avoids stealing clicks meant to start a drag.
    if (this.transformGizmo?.hitTestActiveHandle(controller)) return;

    xb.core.input.setRaycasterFromController(controller);
    const hit = xb.core.input.raycaster.intersectObjects(
      this.sceneManager.list().map((candidate) => candidate.object),
      true
    )[0];
    let instance = hit
      ? this.sceneManager.getInstanceForObject(hit.object)
      : undefined;
    // Hidden objects don't have a visible surface to click, and locked
    // objects are meant to resist selection entirely -- neither should be
    // pickable in the 3D scene. Hidden (but unlocked) objects are still
    // selectable from the hierarchy panel, e.g. to re-show them; locked
    // ones are excluded there too (see HierarchyPanel's row click guard).
    if (instance && (instance.locked || !instance.object.visible))
      instance = undefined;
    this.select(instance ?? null, {additive: this.shiftHeld});
  }

  frameSelected() {
    const instances = this.selectedList();
    if (instances.length === 0) return;

    const box = new THREE.Box3();
    for (const instance of instances) {
      instance.object.updateWorldMatrix(true, true);
      box.union(new THREE.Box3().setFromObject(instance.object));
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const distance = Math.max(
      size.length() * FRAME_PADDING,
      MIN_FRAME_DISTANCE
    );

    const camera = xb.core.camera;
    const facing = new THREE.Vector3();
    camera.getWorldDirection(facing);
    camera.position.copy(center).addScaledVector(facing, -distance);
    camera.lookAt(center);
  }

  selectAll() {
    const candidates = this.sceneManager
      .list()
      .filter((instance) => !instance.locked);
    if (candidates.length === 0) return;
    this.selectedSet = new Set(candidates);
    this.primary = candidates[candidates.length - 1];
    this.syncHighlights();
    this.onSelectionChange?.(this.selectedList());
  }

  override onKeyDown(event: KeyboardEvent) {
    if (!this.editorActive) return;
    if (
      event.code === xb.Keycodes.LEFT_SHIFT_CODE ||
      event.code === xb.Keycodes.RIGHT_SHIFT_CODE
    ) {
      this.shiftHeld = true;
    }

    // Typing into the 2D inspector's number inputs (e.g. "3" in a position
    // field) would otherwise also fire the tool-mode shortcuts below.
    const targetTag = (event.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

    if (event.code === xb.Keycodes.ESCAPE_CODE) {
      this.clearSelection();
      return;
    }
    if (event.code === xb.Keycodes.F_CODE) {
      this.frameSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === xb.Keycodes.A_CODE) {
      event.preventDefault();
      this.selectAll();
      return;
    }
    // Q/W/E/R collide with the simulator's default WASDQE camera-movement
    // bindings (Q/E = vertical, W = forward), so tool switching uses the
    // number row instead.
    const modeByKey: Record<string, ToolMode> = {
      [xb.Keycodes.DIGIT_1]: 'select',
      [xb.Keycodes.DIGIT_2]: 'translate',
      [xb.Keycodes.DIGIT_3]: 'rotate',
      [xb.Keycodes.DIGIT_4]: 'scale',
    };
    const mode = modeByKey[event.code];
    if (mode) {
      this.mode = mode;
      console.log(`[SelectionManager] Tool mode: ${mode}`);
    }
  }

  override onKeyUp(event: KeyboardEvent) {
    if (
      event.code === xb.Keycodes.LEFT_SHIFT_CODE ||
      event.code === xb.Keycodes.RIGHT_SHIFT_CODE
    ) {
      this.shiftHeld = false;
    }
  }

  override dispose() {
    for (const helper of this.highlights.values()) {
      helper.geometry.dispose();
      const materials = Array.isArray(helper.material)
        ? helper.material
        : [helper.material];
      for (const material of materials) material.dispose();
      helper.removeFromParent();
    }
    this.highlights.clear();
    this.selectedSet.clear();
    this.primary = null;
  }
}

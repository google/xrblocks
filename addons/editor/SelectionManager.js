import * as THREE from "three";
import * as xb from "xrblocks";
//#region src/addons/editor/SelectionManager.ts
const HIGHLIGHT_COLOR = 16436245;
const FRAME_PADDING = 1.3;
const MIN_FRAME_DISTANCE = .4;
/**
* Tracks which spawned instance(s) are selected (multi-select via
* Shift+click, both in the 3D scene and the hierarchy panel), shows a
* per-object bounding-box highlight, and exposes the active gizmo tool
* mode + coordinate space via keyboard shortcuts (digits 1-4, Esc, F,
* Ctrl+A). Desktop mouse only -- real XR controller selection is
* permanently out of scope for this addon.
*/
var SelectionManager = class extends xb.Script {
	constructor(sceneManager) {
		super();
		this.raycaster = new THREE.Raycaster();
		this.selectedSet = /* @__PURE__ */ new Set();
		this.primary = null;
		this.mode = "translate";
		this.space = "world";
		this.shiftHeld = false;
		this.onSelectionChange = null;
		this.transformGizmo = null;
		this.editorActive = true;
		this.highlights = /* @__PURE__ */ new Map();
		this.sceneManager = sceneManager;
	}
	selectedList() {
		return [...this.selectedSet];
	}
	isSelected(instance) {
		return this.selectedSet.has(instance);
	}
	select(instance, { additive = false } = {}) {
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
		for (const [instance, helper] of this.highlights) if (!this.selectedSet.has(instance)) {
			helper.parent?.remove(helper);
			this.highlights.delete(instance);
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
	update() {
		for (const helper of this.highlights.values()) helper.visible = this.editorActive;
		for (const [instance, helper] of this.highlights) if (this.selectedSet.has(instance)) helper.box.setFromObject(instance.object);
		let changed = false;
		for (const instance of this.selectedList()) if (!this.sceneManager.has(instance.id) || instance.locked) {
			this.selectedSet.delete(instance);
			if (this.primary === instance) this.primary = null;
			changed = true;
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
	onSelectStart(event) {
		if (!this.editorActive) return;
		const controller = event.source.controller;
		if (controller !== xb.core.input.mouseController) return;
		if (this.transformGizmo?.hitTestActiveHandle(controller)) return;
		this.raycaster.setFromXRController(controller);
		this.raycaster.camera = xb.core.camera;
		const hit = this.raycaster.intersectObjects(this.sceneManager.list().map((candidate) => candidate.object), true)[0];
		let instance = hit ? this.sceneManager.getInstanceForObject(hit.object) : void 0;
		if (instance && (instance.locked || !instance.object.visible)) instance = void 0;
		this.select(instance ?? null, { additive: this.shiftHeld });
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
		const distance = Math.max(size.length() * FRAME_PADDING, MIN_FRAME_DISTANCE);
		const camera = xb.core.camera;
		const facing = new THREE.Vector3();
		camera.getWorldDirection(facing);
		camera.position.copy(center).addScaledVector(facing, -distance);
		camera.lookAt(center);
	}
	selectAll() {
		const candidates = this.sceneManager.list().filter((instance) => !instance.locked);
		if (candidates.length === 0) return;
		this.selectedSet = new Set(candidates);
		this.primary = candidates[candidates.length - 1];
		this.syncHighlights();
		this.onSelectionChange?.(this.selectedList());
	}
	onKeyDown(event) {
		if (!this.editorActive) return;
		if (event.code === xb.Keycodes.LEFT_SHIFT_CODE || event.code === xb.Keycodes.RIGHT_SHIFT_CODE) this.shiftHeld = true;
		const targetTag = event.target?.tagName;
		if (targetTag === "INPUT" || targetTag === "TEXTAREA") return;
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
		const mode = {
			[xb.Keycodes.DIGIT_1]: "select",
			[xb.Keycodes.DIGIT_2]: "translate",
			[xb.Keycodes.DIGIT_3]: "rotate",
			[xb.Keycodes.DIGIT_4]: "scale"
		}[event.code];
		if (mode) {
			this.mode = mode;
			console.log(`[SelectionManager] Tool mode: ${mode}`);
		}
	}
	onKeyUp(event) {
		if (event.code === xb.Keycodes.LEFT_SHIFT_CODE || event.code === xb.Keycodes.RIGHT_SHIFT_CODE) this.shiftHeld = false;
	}
	dispose() {
		for (const helper of this.highlights.values()) {
			helper.geometry.dispose();
			const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
			for (const material of materials) material.dispose();
			helper.removeFromParent();
		}
		this.highlights.clear();
		this.selectedSet.clear();
		this.primary = null;
	}
};
//#endregion
export { SelectionManager };

/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*
* @file xrblocks.js
* @version v0.24.0
* @commitid 4f62670
* @builddate 2026-11-20T09:03:28.002Z
* @description XR Blocks SDK, built from source with the above commit ID.
* @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
* and follow rules below:
* 1. Include the following importmap for maximum compatibility:
"three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
"@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.77/dist/index.min.js",
"@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.77/dist/index.min.js",
"@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/index.min.js",
"@pmndrs/msdfonts/inter": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/inter.js",
"@pmndrs/msdfonts/": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.77/dist/",
"zod": "https://cdn.jsdelivr.net/npm/zod@4.4.3/+esm",
"@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
"yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
"lit": "https://esm.sh/lit@3.3.1",
"lit/": "https://esm.sh/lit@3.3.1/",
"three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
2. If the app focus on standalone objects, spawn it in front of the user in
WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
and make sure users can drag the platform to move it around in XR.
3. When rendering a large scene, remember users may navigate the scene in a
physical world space, also add locomotion methods like pinch to teleport.
4. Do not halluciate mode files --- use either public high-quality assets,
or generate from primitive shapes of use vox formats for voxels or
lego-styles.
*/
import * as THREE from "three";
//#region src/core/ScriptHooks.ts
const defaultScriptMethods = /* @__PURE__ */ new WeakSet();
/** Records the no-op methods supplied by one ScriptMixin base class. */
function markDefaultScriptMethods(prototype) {
	for (const name of Object.getOwnPropertyNames(prototype)) {
		if (name === "constructor") continue;
		const method = Reflect.get(prototype, name);
		if (typeof method === "function") defaultScriptMethods.add(method);
	}
}
/** Returns whether a Script method is supplied by ScriptMixin unchanged. */
function isDefaultScriptMethod(method) {
	return typeof method !== "function" || defaultScriptMethods.has(method);
}
//#endregion
//#region src/core/Script.ts
/**
* The Script class facilities development by providing useful life cycle
* functions similar to MonoBehaviors in Unity.
*
* Each Script object is an independent THREE.Object3D entity within the
* scene graph.
*
* See /docs/manual/Scripts.md for the full documentation.
*
* It manages user, objects, and interaction between user and objects.
* See `/templates/00_basic/` for an example to start with.
* # Supported interaction functions to extend:
*
* onSelectStart(event)
* onSelectEnd(event)
*
*/
function ScriptMixin(base) {
	class MixedScript extends base {
		constructor(..._args) {
			super(..._args);
			this.isXRScript = true;
		}
		/**
		* Initializes an instance with XR controllers, grips, hands, and default
		* options. We allow all scripts to quickly access its user (e.g.,
		* user.isSelecting(), user.hands), world (e.g., physical depth mesh,
		* lighting estimation, and recognized objects), and scene (the root of
		* three.js's scene graph). If this returns a promise, we will wait for it.
		*/
		init(_) {}
		/**
		* Runs per frame.
		*/
		update(_time, _frame) {}
		/**
		* Enables depth-aware interactions with physics. See /samples/advanced/ballpit
		*/
		initPhysics(_physics) {}
		physicsStep() {}
		onXRSessionStarted(_session) {}
		onXRSessionEnded() {}
		onSimulatorStarted() {}
		/**
		* Called whenever pinch / mouse click starts, globally.
		* @param _event - The interaction source and optional captured target.
		*/
		onSelectStart(_event) {}
		/**
		* Called whenever pinch / mouse click discontinues, globally.
		* @param _event - The completed state and end reason.
		*/
		onSelectEnd(_event) {}
		/**
		* Called whenever pinch / mouse click successfully completes, globally.
		* @param _event - The interaction source and completed target.
		*/
		onSelect(_event) {}
		/**
		* Called whenever pinch / mouse click is happening, globally.
		*/
		onSelecting(_event) {}
		/** Called when an object selection reaches the long-select delay. */
		onLongSelect(_event) {}
		/**
		* Called on keyboard keypress.
		* @param _event - Event containing `.code` to read the keyboard key.
		*/
		onKeyDown(_event) {}
		onKeyUp(_event) {}
		/**
		* Called whenever gamepad trigger starts, globally.
		* @param _event - `event.source.controller` identifies the controller.
		*/
		onSqueezeStart(_event) {}
		/**
		* Called whenever gamepad trigger stops, globally.
		* @param _event - `event.source.controller` identifies the controller.
		*/
		onSqueezeEnd(_event) {}
		/**
		* Called whenever gamepad is being triggered, globally.
		*/
		onSqueezing(_event) {}
		/**
		* Called whenever gamepad trigger successfully completes, globally.
		* @param _event - `event.source.controller` identifies the controller.
		*/
		onSqueeze(_event) {}
		/**
		* Called when a source starts selecting the object this Script represents.
		* @param _event - `event.target` is the logical object and
		* `event.source.controller` identifies the controller.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		* Call `event.stopGlobalPropagation()` to suppress global selection callbacks
		* for the rest of this capture
		*/
		onObjectSelectStart(_event) {}
		/**
		* Called when a source stops selecting the object this Script represents.
		* @param _event - The completed state and end reason.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		* Call `event.stopGlobalPropagation()` to suppress global selection callbacks
		* for the rest of this capture
		*/
		onObjectSelectEnd(_event) {}
		/**
		* Called once when a captured selection is held for the long-select delay.
		* Manipulation captures do not emit this callback.
		* @param _event - The controller and completed hold duration.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		* Call `event.stopGlobalPropagation()` to suppress global selection callbacks
		* for the rest of this capture
		*/
		onObjectLongSelect(_event) {}
		/**
		* Called for each phase of an automatic object manipulation. Call
		* `event.stopPropagation()` to stop bubbling. Calling `preventDefault()`
		* on a start event suppresses the automatic action.
		*/
		onObjectManipulate(_event) {}
		/**
		* Called when a source starts hovering over this object.
		* @param _event - The hover source, target, surface, and intersection.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		*/
		onHoverEnter(_event) {}
		/**
		* Called when a source stops hovering over this object.
		* @param _event - The hover source, target, surface, and intersection.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		*/
		onHoverExit(_event) {}
		/**
		* Called while a source hovers over this object.
		* @param _event - The hover source, target, surface, and intersection.
		* Call `event.stopPropagation()` to stop bubbling to ancestor Scripts.
		*/
		onHovering(_event) {}
		/**
		* Called when a hand's index finger starts touching this object.
		* Direct touch starts the object's selection lifecycle by default. Call
		* `event.preventDefault()` to handle contact without selecting.
		*/
		onObjectTouchStart(_event) {}
		/**
		* Called every frame that a hand's index finger is touching this object.
		* The object remains selected during these frames unless touch selection
		* was prevented when contact started.
		*/
		onObjectTouching(_event) {}
		/**
		* Called when a hand's index finger stops touching this object.
		* This ends the default selection lifecycle after the touch callback.
		*/
		onObjectTouchEnd(_event) {}
		/**
		* Called when a hand starts grabbing this object (touching + pinching).
		* A grab starts built-in direct-touch manipulation when enabled.
		*/
		onObjectGrabStart(_event) {}
		/**
		* Called every frame a hand is grabbing this object.
		*/
		onObjectGrabbing(_event) {}
		/**
		* Called when a hand stops grabbing this object.
		* This ends built-in direct-touch manipulation without ending contact.
		*/
		onObjectGrabEnd(_event) {}
		/**
		* Called when the script is removed from the scene. Opposite of init.
		*/
		dispose() {
			super.dispose();
		}
	}
	markDefaultScriptMethods(MixedScript.prototype);
	return MixedScript;
}
/**
* Script manages app logic or interaction between user and objects.
*/
const ScriptMixinObject3D = ScriptMixin(THREE.Object3D);
var Script = class extends ScriptMixinObject3D {};
/**
* MeshScript can be constructed with geometry and materials, with
* `super(geometry, material)`; for direct access to its geometry.
* MeshScripts hold geometry and materials while using the Script lifecycle.
*/
const ScriptMixinMeshScript = ScriptMixin(THREE.Mesh);
var MeshScript = class extends ScriptMixinMeshScript {
	/**
	* {@inheritDoc}
	*/
	constructor(geometry, material) {
		super(geometry, material);
	}
};
//#endregion
//#region src/placement/TransformScript.ts
/** Base class for built-in scripts that continuously change their parent. */
var TransformScript = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.suspended = false;
	}
	/** Stops transform updates while the parent is manipulated. */
	suspend() {
		this.suspended = true;
	}
	/** Rebases the script on the parent's current pose and resumes updates. */
	resume() {
		this.rebase();
		this.suspended = false;
	}
	get canUpdate() {
		return !this.suspended && this.parent !== null;
	}
	/** Captures a new baseline from the parent transform. */
	rebase() {}
};
function suspendTransformScripts(owner) {
	for (const child of owner.children) if (child instanceof TransformScript) child.suspend();
}
function resumeTransformScripts(owner) {
	for (const child of owner.children) if (child instanceof TransformScript) child.resume();
}
//#endregion
//#region src/ui/constants/GradientPanelConstants.ts
const DEFAULT_GRADIENT_PANEL_PROPS = {
	cornerRadius: 0,
	fillColor: "rgba(0,0,0,0)",
	innerShadowColor: "rgba(0,0,0,0)",
	innerShadowBlur: 0,
	innerShadowPosition: new THREE.Vector2(0, 0),
	innerShadowSpread: 0,
	innerShadowFalloff: 1,
	dropShadowColor: "rgba(0,0,0,0)",
	dropShadowBlur: 0,
	dropShadowPosition: new THREE.Vector2(0, 0),
	dropShadowSpread: 0,
	dropShadowFalloff: 1,
	strokeColor: "rgba(0,0,0,0)",
	strokeWidth: 0,
	strokeAlign: "center"
};
//#endregion
//#region src/ui/UIElement.ts
const STYLE_KEYS = /* @__PURE__ */ new Set([
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"flexDirection",
	"justifyContent",
	"alignItems",
	"alignSelf",
	"flexGrow",
	"flexShrink",
	"flexBasis",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"transform",
	"zIndex",
	"gap",
	"rowGap",
	"columnGap",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"margin",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"backgroundColor",
	"color",
	"opacity",
	"borderColor",
	"borderWidth",
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomRightRadius",
	"borderBottomLeftRadius",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"textAlign",
	"verticalAlign",
	"innerShadowColor",
	"innerShadowBlur",
	"innerShadowPosition",
	"innerShadowSpread",
	"innerShadowFalloff",
	"dropShadowColor",
	"dropShadowBlur",
	"dropShadowPosition",
	"dropShadowSpread",
	"dropShadowFalloff",
	"borderAlign",
	"display",
	"overflow",
	"objectFit",
	"whiteSpace",
	"textOverflow",
	":hover",
	":active",
	":disabled",
	":focus",
	":checked"
]);
const STATE_STYLE_KEYS = /* @__PURE__ */ new Set([
	"backgroundColor",
	"color",
	"opacity",
	"borderColor",
	"borderWidth",
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomRightRadius",
	"borderBottomLeftRadius"
]);
const NUMBER_KEYS = /* @__PURE__ */ new Set([
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"flexGrow",
	"flexShrink",
	"zIndex",
	"gap",
	"rowGap",
	"columnGap",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"margin",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"opacity",
	"borderWidth",
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomRightRadius",
	"borderBottomLeftRadius",
	"fontSize",
	"innerShadowBlur",
	"innerShadowSpread",
	"innerShadowFalloff",
	"dropShadowBlur",
	"dropShadowSpread",
	"dropShadowFalloff"
]);
const POSITION_KEYS = /* @__PURE__ */ new Set([
	"top",
	"right",
	"bottom",
	"left"
]);
const PAINT_KEYS = /* @__PURE__ */ new Set([
	"backgroundColor",
	"borderColor",
	"innerShadowColor",
	"dropShadowColor"
]);
const COLOR_KEYS = /* @__PURE__ */ new Set(["color"]);
const NONNEGATIVE_KEYS = /* @__PURE__ */ new Set([
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"flexGrow",
	"flexShrink",
	"flexBasis",
	"gap",
	"rowGap",
	"columnGap",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"borderWidth",
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomRightRadius",
	"borderBottomLeftRadius",
	"fontSize",
	"lineHeight",
	"innerShadowBlur",
	"dropShadowBlur"
]);
const ENUM_VALUES = {
	flexDirection: ["row", "column"],
	justifyContent: [
		"flex-start",
		"center",
		"flex-end",
		"space-between"
	],
	alignItems: [
		"flex-start",
		"center",
		"flex-end",
		"stretch"
	],
	alignSelf: [
		"auto",
		"flex-start",
		"center",
		"flex-end",
		"stretch"
	],
	position: ["relative", "absolute"],
	borderAlign: [
		"inside",
		"center",
		"outside"
	],
	display: ["flex", "none"],
	fontWeight: [
		"normal",
		"medium",
		"bold"
	],
	textAlign: [
		"left",
		"center",
		"right"
	],
	verticalAlign: [
		"top",
		"middle",
		"bottom"
	],
	overflow: ["visible", "hidden"],
	objectFit: [
		"contain",
		"cover",
		"fill"
	],
	whiteSpace: [
		"normal",
		"nowrap",
		"pre-line"
	],
	textOverflow: ["clip", "ellipsis"]
};
const states$1 = /* @__PURE__ */ new WeakMap();
const presentationObjects = /* @__PURE__ */ new WeakMap();
const presentationOwners = /* @__PURE__ */ new WeakMap();
const presentationBounds = /* @__PURE__ */ new WeakMap();
const rootReferences = /* @__PURE__ */ new Set();
var UIElement = class extends Script {
	constructor(kind, options = {}) {
		super();
		this.isUI = true;
		this.styleTarget = {};
		this.markUIDirty = () => {
			const state = states$1.get(this);
			if (state) state.revision++;
		};
		this.markUIContentDirty = () => {
			this.markUIDirty();
		};
		this.markUIStructureDirty = () => {
			markRootStructureDirty(findUIRoot(this));
		};
		this.markUIStyleDirty = (_property, _previous, _next) => {
			this.markUIDirty();
		};
		this.assertPlacement = () => {
			const parent = this.parent;
			if (!parent) return;
			const isRoot = isUIRootKind(getUIElementKind(this));
			if (isRoot && isUIElement(parent)) {
				this.removeFromParent();
				throw new Error("Nested UICard and UIOverlay roots are not allowed.");
			}
			if (!isRoot && !isUIElement(parent)) {
				this.removeFromParent();
				throw new Error("Every UI element must be below one UICard or UIOverlay root.");
			}
		};
		states$1.set(this, {
			kind,
			revision: 0,
			structureRevision: 0
		});
		this.addEventListener("added", this.assertPlacement);
		this.addEventListener("childadded", this.markUIStructureDirty);
		this.addEventListener("childremoved", this.markUIStructureDirty);
		if (isUIRootKind(kind)) rootReferences.add(new WeakRef(this));
		this.styleProxy = createStyleProxy(this.styleTarget, false, this.markUIStyleDirty);
		this.style = options.style ?? {};
		this.visible = options.visible ?? true;
		this.xb = {
			pointerEvents: options.pointerEvents ?? "auto",
			interactionEnabled: options.interactionEnabled ?? true
		};
		if (options.reticleMode !== void 0) this.xb.reticleMode = options.reticleMode;
		if (options.children) this.add(...options.children);
	}
	add(...objects) {
		for (const object of objects) validateUIChild(this, object);
		for (const object of objects) super.add(object);
		return this;
	}
	attach(object) {
		validateUIChild(this, object);
		return super.attach(object);
	}
	getWorldPosition(target) {
		const presentation = presentationObjects.get(this);
		return presentation ? presentation.getWorldPosition(target) : super.getWorldPosition(target);
	}
	get style() {
		return this.styleProxy;
	}
	set style(style) {
		const entries = Object.entries(cloneUIStyle(style));
		for (const key of Object.keys(this.styleTarget)) Reflect.deleteProperty(this.styleProxy, key);
		for (const [key, value] of entries) Reflect.set(this.styleProxy, key, value);
	}
};
function isUIElement(object) {
	return states$1.has(object);
}
function getUIElementKind(element) {
	return states$1.get(element).kind;
}
/** Returns the rendered object that owns an element's calculated layout. */
function getUIPresentationObject(element) {
	return presentationObjects.get(element);
}
/** Returns whether an object renders a semantic UI element. */
function isUIPresentationObject(object) {
	return presentationOwners.has(object);
}
/** Registers one rendered object for world-space UI queries. */
function registerUIPresentationObject(element, presentation, bounds) {
	presentationObjects.set(element, presentation);
	presentationOwners.set(presentation, element);
	if (bounds) presentationBounds.set(element, bounds);
	return () => {
		if (presentationObjects.get(element) === presentation) {
			presentationObjects.delete(element);
			presentationBounds.delete(element);
		}
		if (presentationOwners.get(presentation) === element) presentationOwners.delete(presentation);
	};
}
/** Undefined means no clipping-aware presentation is registered. */
function getUIPresentationBounds(object, target) {
	const element = presentationOwners.get(object) ?? object;
	return presentationBounds.get(element)?.(target);
}
function getUIRevision(element) {
	return states$1.get(element).revision;
}
/** Returns the revision that changes only when the physical UI tree changes. */
function getUIStructureRevision(element) {
	return states$1.get(element).structureRevision;
}
/** Collects public UI roots without retaining their application lifetime. */
function collectUIRoots(target) {
	target.length = 0;
	for (const reference of rootReferences) {
		const root = reference.deref();
		if (root) target.push(root);
		else rootReferences.delete(reference);
	}
}
/** Validates and detaches a style from caller-owned mutable values. */
function cloneUIStyle(style) {
	if (!style || typeof style !== "object" || Array.isArray(style)) throw new Error("UI style must be an object.");
	for (const [key, value] of Object.entries(style)) validateStyle(key, value, false);
	return Object.fromEntries(Object.entries(style).map(([key, value]) => [key, cloneStyleValue(value)]));
}
function createStyleProxy(target, stateOnly, onChange) {
	return new Proxy(target, {
		set(object, property, value) {
			if (typeof property !== "string") return false;
			validateStyle(property, value, stateOnly);
			if (value === void 0) {
				if (!Reflect.has(object, property)) return true;
				const previous = Reflect.get(object, property);
				Reflect.deleteProperty(object, property);
				onChange(property, previous, void 0);
				return true;
			}
			const next = createNestedStyleValue(property, value, onChange);
			const previous = Reflect.get(object, property);
			if (previous === next) return true;
			Reflect.set(object, property, next);
			onChange(property, previous, next);
			return true;
		},
		deleteProperty(object, property) {
			if (!Reflect.has(object, property)) return true;
			const previous = Reflect.get(object, property);
			Reflect.deleteProperty(object, property);
			if (typeof property === "string") onChange(property, previous, void 0);
			return true;
		}
	});
}
function createNestedStyleValue(property, value, onChange) {
	if (!value || typeof value !== "object") return value;
	if (isStateStyleKey(property)) return createStyleProxy(cloneStyleValue(value), true, onChange);
	if (property === "transform") return createTransformProxy(cloneStyleValue(value), onChange);
	return value;
}
function createTransformProxy(transform, onChange) {
	return new Proxy(transform, {
		set(object, property, value) {
			if (property !== "translateX" && property !== "translateY") return false;
			validateTransformValue(property, value);
			const previous = Reflect.get(object, property);
			if (value === void 0) Reflect.deleteProperty(object, property);
			else Reflect.set(object, property, value);
			onChange("transform", previous, value);
			return true;
		},
		deleteProperty(object, property) {
			if (property !== "translateX" && property !== "translateY") return false;
			const previous = Reflect.get(object, property);
			if (!Reflect.deleteProperty(object, property)) return false;
			onChange("transform", previous, void 0);
			return true;
		}
	});
}
function validateUIChild(parent, child) {
	if (child === parent) throw new Error("A UI element cannot be added to itself.");
	if (isUIElement(child)) {
		if (isUIRootKind(getUIElementKind(child))) throw new Error("Nested UICard and UIOverlay roots are not allowed.");
		return;
	}
	if (getUIElementKind(parent) === "card" && child instanceof TransformScript) return;
	throw new Error("UI elements accept UI children. UICard also accepts TransformScript children.");
}
function findUIRoot(object) {
	let current = object;
	while (current) {
		if (isUIElement(current) && isUIRootKind(getUIElementKind(current))) return current;
		current = current.parent;
	}
}
function markRootStructureDirty(root) {
	if (!root) return;
	states$1.get(root).structureRevision++;
}
function isUIRootKind(kind) {
	return kind === "card" || kind === "overlay";
}
function validateStyle(property, value, stateOnly) {
	if (!(stateOnly ? STATE_STYLE_KEYS : STYLE_KEYS).has(property)) throw new Error(`Unknown UI style property "${property}".`);
	if (value === void 0) return;
	if (stateOnly && !STATE_STYLE_KEYS.has(property)) throw new Error(`UI state styles cannot change "${property}".`);
	if (isStateStyleKey(property)) {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`UI style "${property}" must be an object.`);
		for (const [key, nested] of Object.entries(value)) validateStyle(key, nested, true);
		return;
	}
	if (property === "transform") {
		validateTransform(value);
		return;
	}
	if (NUMBER_KEYS.has(property) && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`UI style "${property}" must be a finite number.`);
	if (PAINT_KEYS.has(property) && !isPaint(value)) throw new Error(`UI style "${property}" must be a valid paint.`);
	if ((property === "innerShadowPosition" || property === "dropShadowPosition") && !isVector2Like(value)) throw new Error(`UI style "${property}" must be a finite 2D vector.`);
	if (COLOR_KEYS.has(property)) {
		if (!isSolidColor(value) || value === "transparent") throw new Error(`UI style "${property}" must be a valid color.`);
	}
	if (property === "flexBasis" && value !== "auto") {
		if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("UI style \"flexBasis\" must be finite or \"auto\".");
	}
	if (property === "fontWeight" && typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) throw new Error("UI style \"fontWeight\" must be positive and finite.");
	}
	if (property === "lineHeight" && !isLineHeight(value)) throw new Error("UI style \"lineHeight\" must be a nonnegative number, pixel value, or percentage.");
	if (POSITION_KEYS.has(property) && !isUIPosition(value)) throw new Error(`UI style "${property}" must be a finite number or percentage.`);
	const enumValues = ENUM_VALUES[property];
	if (enumValues && !(property === "fontWeight" && typeof value === "number") && !enumValues.includes(value)) throw new Error(`Invalid value for UI style "${property}".`);
	if ((property === "width" || property === "height") && !isUIUnit(value)) throw new Error(`UI style "${property}" must be a finite number, percentage, or "auto".`);
	if (NONNEGATIVE_KEYS.has(property) && typeof value === "number" && value < 0) throw new Error(`UI style "${property}" cannot be negative.`);
	if ((property === "width" || property === "height") && typeof value === "string" && value.startsWith("-")) throw new Error(`UI style "${property}" cannot be negative.`);
	if (property === "opacity" && typeof value === "number" && (value < 0 || value > 1)) throw new Error("UI style \"opacity\" must be between 0 and 1.");
	if ((property === "innerShadowFalloff" || property === "dropShadowFalloff") && typeof value === "number" && value <= 0) throw new Error(`UI style "${property}" must be positive.`);
}
function isStateStyleKey(property) {
	return property === ":hover" || property === ":active" || property === ":disabled" || property === ":focus" || property === ":checked";
}
function isUIUnit(value) {
	return typeof value === "number" && Number.isFinite(value) || value === "auto" || typeof value === "string" && /^-?\d+(?:\.\d+)?%$/.test(value);
}
function isUIPosition(value) {
	return typeof value === "number" && Number.isFinite(value) || typeof value === "string" && /^-?\d+(?:\.\d+)?%$/.test(value);
}
function isLineHeight(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 || typeof value === "string" && /^\d+(?:\.\d+)?(?:px|%)$/.test(value);
}
function validateTransform(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("UI style \"transform\" must be an object.");
	for (const [property, nested] of Object.entries(value)) {
		if (property !== "translateX" && property !== "translateY") throw new Error(`Unknown UI transform property "${property}".`);
		validateTransformValue(property, nested);
	}
}
function validateTransformValue(property, value) {
	if (value !== void 0 && !isUIPosition(value)) throw new Error(`UI transform "${property}" must be a finite number or percentage.`);
}
function isPaint(value) {
	if (isSolidColor(value)) return true;
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const gradient = value;
	if (![
		"linear",
		"radial",
		"angular",
		"diamond"
	].includes(gradient.gradientType ?? "") || !Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 4 || gradient.rotation !== void 0 && (!Number.isFinite(gradient.rotation) || typeof gradient.rotation !== "number") || !isVector2Like(gradient.center) || !isVector2Like(gradient.scale)) return false;
	let previousPosition = -Infinity;
	return gradient.stops.every((stop) => {
		const valid = !!stop && typeof stop === "object" && typeof stop.position === "number" && Number.isFinite(stop.position) && stop.position >= 0 && stop.position <= 1 && stop.position >= previousPosition && isSolidColor(stop.color);
		previousPosition = stop?.position ?? previousPosition;
		return valid;
	});
}
function isSolidColor(value) {
	return value instanceof THREE.Color || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.trim().length > 0;
}
function isVector2Like(value) {
	if (value === void 0 || value instanceof THREE.Vector2) return true;
	return Array.isArray(value) && value.length === 2 && value.every((component) => typeof component === "number" ? Number.isFinite(component) : false);
}
function cloneStyleValue(value) {
	if (value instanceof THREE.Color) return value.clone();
	if (value instanceof THREE.Vector2) return value.clone();
	if (Array.isArray(value)) return value.map(cloneStyleValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneStyleValue(nested)]));
}
//#endregion
//#region src/utils/SceneGraphUtils.ts
/**
* Checks if a given object is a descendant of another object in the scene
* graph. This function is useful for determining if an interaction (like a
* raycast hit) has occurred on a component that is part of a larger, complex
* entity.
*
* It uses an iterative approach to traverse up the hierarchy from the child.
*
* @param child - The potential descendant object.
* @param parent - The potential ancestor object.
* @returns True if `child` is the same as `parent` or is a descendant of
*     `parent`.
*/
function objectIsDescendantOf(child, parent) {
	let currentNode = child;
	while (currentNode) {
		if (currentNode === parent) return true;
		currentNode = currentNode.parent;
	}
	return false;
}
/**
* Traverses the scene graph from a given node, calling a callback function for
* each node. The traversal stops if the callback returns true.
*
* This function is similar to THREE.Object3D.traverse, but allows for early
* exit from the traversal based on the callback's return value.
*
* @param node - The starting node for the traversal.
* @param callback - The function to call for each node. It receives the current
*     node as an argument. If the callback returns `true`, the traversal will
*     stop.
* @returns Whether the callback returned true for any node.
*/
function traverseUtil(node, callback) {
	if (callback(node)) return true;
	for (const child of node.children) if (traverseUtil(child, callback)) return true;
	return false;
}
/**
* Gets a world-space point on an object's rendered geometry near a reference
* position. Falls back to the object's world position when it has no mesh
* triangles. `closest` measures from `from`; `center` measures from the
* object's world bounding-box center.
* UI elements use the center of their rendered bounds.
*/
function getObjectTargetPoint(object, from, out, mode = "closest") {
	const presentation = getUIPresentationObject(object);
	const renderedObject = presentation ?? object;
	renderedObject.updateWorldMatrix(true, true);
	if (presentation || isUIPresentationObject(object)) {
		const bounds = new THREE.Box3();
		const clippedBounds = getUIPresentationBounds(object, bounds);
		if (clippedBounds === null) return renderedObject.getWorldPosition(out);
		if (clippedBounds === void 0) bounds.setFromObject(renderedObject, true);
		if (!bounds.isEmpty()) return bounds.getCenter(out);
	}
	const reference = mode === "center" ? new THREE.Box3().setFromObject(renderedObject, true).getCenter(new THREE.Vector3()) : from;
	let closestDistanceSquared = Infinity;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	const centroid = new THREE.Vector3();
	renderedObject.traverse((child) => {
		if (!(child instanceof THREE.Mesh) || !child.visible) return;
		const position = child.geometry.getAttribute("position");
		if (!position) return;
		const index = child.geometry.index;
		const vertexCount = index?.count ?? position.count;
		for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
			child.getVertexPosition(index?.getX(offset) ?? offset, a);
			child.getVertexPosition(index?.getX(offset + 1) ?? offset + 1, b);
			child.getVertexPosition(index?.getX(offset + 2) ?? offset + 2, c);
			a.applyMatrix4(child.matrixWorld);
			b.applyMatrix4(child.matrixWorld);
			c.applyMatrix4(child.matrixWorld);
			centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
			const distanceSquared = centroid.distanceToSquared(reference);
			if (distanceSquared < closestDistanceSquared) {
				closestDistanceSquared = distanceSquared;
				out.copy(centroid);
			}
		}
	});
	return closestDistanceSquared < Infinity ? out : object.getWorldPosition(out);
}
//#endregion
//#region src/interaction/manipulation/ManipulationTypes.ts
const ManipulationAction = {
	Translate: "translate",
	Rotate: "rotate",
	Scale: "scale",
	Resize: "resize",
	None: "none"
};
//#endregion
//#region src/interaction/manipulation/ManipulationConfig.ts
const EPSILON = 1e-8;
function normalizeManipulationConfig(value) {
	if (!value) return void 0;
	if (value === true) return {
		translate: {},
		scale: {},
		handle: ManipulationAction.Translate
	};
	const translate = normalizeAction(value.actions?.translate);
	const rotate = normalizeAction(value.actions?.rotate);
	const scale = normalizeAction(value.actions?.scale);
	const resize = normalizeAction(value.actions?.resize);
	const handle = value.handle?.action;
	if (handle !== void 0 && !isHandleAction(handle)) return void 0;
	if (!translate && !rotate && !scale && !resize) return void 0;
	return {
		translate,
		rotate,
		scale,
		resize,
		handle
	};
}
function isManipulationActionEnabled(config, action) {
	if (action === ManipulationAction.Translate) return !!config.translate;
	if (action === ManipulationAction.Rotate) return !!config.rotate;
	if (action === ManipulationAction.Scale) return !!config.scale;
	if (action === ManipulationAction.Resize) return !!config.resize;
	return false;
}
function isHandleAction(value) {
	return value === ManipulationAction.None || isManipulationAction(value);
}
function normalizeRotationAxis(axis) {
	const vector = axis === void 0 || axis === "y" ? new THREE.Vector3(0, 1, 0) : axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(axis.x, axis.y, axis.z);
	if (!isFiniteVector(vector) || vector.lengthSq() < EPSILON) return void 0;
	return vector.normalize();
}
function cloneScaleOptions(options) {
	const cloneLimit = (value) => typeof value === "object" && value !== null ? {
		x: value.x,
		y: value.y,
		z: value.z
	} : value;
	return {
		minScale: cloneLimit(options?.minScale),
		maxScale: cloneLimit(options?.maxScale)
	};
}
function normalizeAction(value) {
	return value === true ? {} : value || void 0;
}
function isManipulationAction(value) {
	return value === ManipulationAction.Translate || value === ManipulationAction.Rotate || value === ManipulationAction.Scale || value === ManipulationAction.Resize;
}
function isFiniteVector(value) {
	return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
//#endregion
//#region src/interaction/SemanticControl.ts
const CONTROLS = /* @__PURE__ */ new WeakMap();
/** Registers one built-in semantic control without exposing UI internals. */
function registerSemanticControl(object, state) {
	CONTROLS.set(object, state);
}
function isSemanticControl(object) {
	return CONTROLS.has(object);
}
function isSemanticControlDisabled(object) {
	return CONTROLS.get(object)?.isDisabled() ?? true;
}
function getSemanticControl(object) {
	return CONTROLS.get(object);
}
//#endregion
//#region src/ui/UIAppearance.ts
function validateUIAppearance(value) {
	if (value !== "surface" && value !== "none") throw new Error(`Invalid UI appearance "${String(value)}".`);
}
//#endregion
//#region src/ui/components/UICard.ts
/** The only world-transform root in a spatial UI tree. */
var UICard = class extends UIElement {
	constructor({ size = {}, pixelSize = .001, anchorX = "center", anchorY = "center", appearance = "surface", manipulation, edge = false, ...options } = {}) {
		const normalizedSize = normalizeSize(size);
		validatePixelSize(pixelSize);
		validateAnchor(anchorX, [
			"left",
			"center",
			"right"
		], "anchorX");
		validateAnchor(anchorY, [
			"bottom",
			"center",
			"top"
		], "anchorY");
		validateUIAppearance(appearance);
		super("card", options);
		this.name = "UICard";
		this.edgeTarget = { translateFromSurface: false };
		this.edgeEnabled = false;
		this.pixelSize = pixelSize;
		this.anchorX = anchorX;
		this.anchorY = anchorY;
		this.appearance = appearance;
		this.sizeTarget = normalizedSize;
		this.sizeProxy = new Proxy(this.sizeTarget, { set: (target, property, value) => {
			if (property === "width" || property === "height") validateDimension(value);
			else throw new Error(`Unknown UICard size property "${String(property)}".`);
			Reflect.set(target, property, value);
			resolvedSizes.delete(this);
			this.markUIDirty();
			return true;
		} });
		this.edgeProxy = new Proxy(this.edgeTarget, { set: (target, property, value) => {
			if (property !== "translateFromSurface" || typeof value !== "boolean") throw new Error(`Unknown or invalid UICard edge option "${String(property)}".`);
			const previous = Reflect.get(target, property);
			Reflect.set(target, property, value);
			try {
				this.validateEdge();
			} catch (error) {
				Reflect.set(target, property, previous);
				throw error;
			}
			this.markUIDirty();
			return true;
		} });
		this.manipulation = manipulation;
		this.edge = edge;
	}
	get size() {
		return this.sizeProxy;
	}
	set size(value) {
		const normalized = normalizeSize(value);
		this.sizeProxy.width = normalized.width;
		this.sizeProxy.height = normalized.height;
	}
	get manipulation() {
		return this.xb?.manipulation;
	}
	set manipulation(value) {
		const normalized = normalizeCardManipulation(value);
		this.validateEdge(this.edgeEnabled, normalized);
		this.xb ??= {};
		this.xb.manipulation = normalized;
		this.markUIDirty();
	}
	get edge() {
		return this.edgeEnabled ? this.edgeProxy : false;
	}
	set edge(value) {
		const enabled = value !== false;
		const next = { translateFromSurface: (value && value !== true ? value : {}).translateFromSurface ?? false };
		this.validateEdge(enabled, this.xb?.manipulation);
		this.edgeEnabled = enabled;
		this.edgeTarget.translateFromSurface = next.translateFromSurface;
		this.markUIDirty();
	}
	validateEdge(enabled = this.edgeEnabled, manipulation = this.xb?.manipulation) {
		if (!enabled) return;
		const config = normalizeManipulationConfig(manipulation);
		if (!config?.translate && !config?.resize) throw new Error("UICard edge requires Translate or Resize manipulation.");
	}
};
function getUICardEdgeOptions(card) {
	return card.edge || void 0;
}
const resolvedSizes = /* @__PURE__ */ new WeakMap();
/** Returns the current physical card size after layout resolves. */
function getResolvedUICardSize(card) {
	if (card.size.width !== "auto" && card.size.height !== "auto") return {
		width: card.size.width,
		height: card.size.height
	};
	return resolvedSizes.get(card);
}
/** Stores a backend-calculated physical size for an automatically sized card. */
function setResolvedUICardSize(card, size) {
	if (card.size.width !== "auto" && card.size.height !== "auto") return;
	resolvedSizes.set(card, size);
}
const contentMeasurers = /* @__PURE__ */ new WeakMap();
/** Registers the backend that measures a card's content. */
function setUICardContentMeasurer(card, measurer) {
	if (measurer) contentMeasurers.set(card, measurer);
	else contentMeasurers.delete(card);
}
/**
* Returns the height in meters that the card's content needs at `width`, or
* undefined before the card has a layout.
*/
function measureUICardContentHeight(card, width) {
	return contentMeasurers.get(card)?.height(width);
}
/**
* Returns the narrowest width in meters at which the card's content does not
* overflow, or undefined before the card has a layout.
*/
function measureUICardMinContentWidth(card) {
	return contentMeasurers.get(card)?.minWidth();
}
/**
* Closest and farthest a card moves from the viewer, in meters.
*/
const CARD_MIN_DISTANCE = .75;
const CARD_MAX_DISTANCE = 5;
/**
* Face-camera smoothing while moving, high enough that the card keeps facing
* the viewer instead of turning behind the move.
*/
const CARD_FACE_CAMERA_SMOOTHING = 1;
function cardTranslateDefaults() {
	return {
		faceCamera: true,
		smoothing: CARD_FACE_CAMERA_SMOOTHING,
		scaleWithDistance: true,
		pushPull: true,
		minDistance: CARD_MIN_DISTANCE,
		maxDistance: CARD_MAX_DISTANCE,
		raySmoothing: true
	};
}
function cardResizeDefaults() {
	return {
		smoothing: true,
		overshoot: true
	};
}
function normalizeCardManipulation(value) {
	if (value === void 0 || value === false) return value;
	if (value === true) return {
		actions: {
			translate: cardTranslateDefaults(),
			scale: true,
			resize: cardResizeDefaults()
		},
		handle: { action: "translate" }
	};
	const actions = value.actions ? { ...value.actions } : void 0;
	if (actions?.translate === true) actions.translate = cardTranslateDefaults();
	else if (actions?.translate && typeof actions.translate === "object") actions.translate = {
		...cardTranslateDefaults(),
		...actions.translate
	};
	if (actions?.rotate && typeof actions.rotate === "object") actions.rotate = {
		...actions.rotate,
		axis: actions.rotate.axis && typeof actions.rotate.axis === "object" ? { ...actions.rotate.axis } : actions.rotate.axis
	};
	if (actions?.scale && typeof actions.scale === "object") actions.scale = {
		...actions.scale,
		minScale: actions.scale.minScale && typeof actions.scale.minScale === "object" ? { ...actions.scale.minScale } : actions.scale.minScale,
		maxScale: actions.scale.maxScale && typeof actions.scale.maxScale === "object" ? { ...actions.scale.maxScale } : actions.scale.maxScale
	};
	if (actions?.resize === true) actions.resize = cardResizeDefaults();
	else if (actions?.resize && typeof actions.resize === "object") actions.resize = {
		...cardResizeDefaults(),
		...actions.resize,
		minSize: actions.resize.minSize ? { ...actions.resize.minSize } : void 0,
		maxSize: actions.resize.maxSize ? { ...actions.resize.maxSize } : void 0
	};
	return {
		...value,
		actions,
		handle: value.handle ? { ...value.handle } : void 0
	};
}
function normalizeSize(size) {
	if (!size || typeof size !== "object") throw new Error("UICard size must be an object with optional width and height.");
	const { width = "auto", height = "auto" } = size;
	validateDimension(width);
	validateDimension(height);
	return {
		width,
		height
	};
}
function validateFixedSize(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("UICard size dimensions must be 'auto' or finite, nonnegative numbers.");
}
function validateDimension(value) {
	if (value === "auto") return;
	validateFixedSize(value);
}
function validatePixelSize(pixelSize) {
	if (!Number.isFinite(pixelSize) || pixelSize <= 0) throw new Error("UICard pixelSize must be positive and finite.");
}
function validateAnchor(value, allowed, property) {
	if (!allowed.includes(value)) throw new Error(`UICard ${property} has an invalid value.`);
}
//#endregion
//#region src/ui/components/UIScrollView.ts
const DEFAULT_VIEWPORT_HEIGHT = 240;
const states = /* @__PURE__ */ new WeakMap();
/** A vertical viewport for ordinary retained UI children. Offsets use UI units. */
var UIScrollView = class extends UIElement {
	constructor({ ariaLabel = "Scroll view", scrollTop = 0, onScroll, style, ...options } = {}) {
		validateOffset(scrollTop);
		if (!ariaLabel) throw new Error("UIScrollView requires an accessible name.");
		super("scroll", {
			...options,
			style: {
				width: "100%",
				height: DEFAULT_VIEWPORT_HEIGHT,
				...style
			}
		});
		this.name = "UIScrollView";
		this._clientHeight = 0;
		this._scrollHeight = 0;
		this.measured = false;
		this.ariaLabel = ariaLabel;
		this._scrollTop = Math.max(0, scrollTop);
		this.onScroll = onScroll;
		states.set(this, {
			updateLayout: (height, contentHeight) => {
				this._clientHeight = height;
				this._scrollHeight = contentHeight;
				this.measured = true;
				this.scrollTo(this._scrollTop);
			},
			clearLayout: () => {
				this.measured = false;
				this._clientHeight = 0;
				this._scrollHeight = 0;
			}
		});
		registerSemanticControl(this, {
			kind: "scroll",
			isDisabled: () => !this.ready,
			activate: () => {},
			scroll: {
				getOffset: () => this.scrollTop,
				getViewportHeight: () => this.clientHeight,
				projectPoint: (point) => states.get(this)?.binding?.projectPoint(point),
				scrollBy: (delta) => this.scrollBy(delta),
				scrollbarHit: (point) => states.get(this)?.binding?.scrollbarHit?.(point)
			}
		});
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	get ready() {
		return this.measured && states.get(this)?.binding !== void 0;
	}
	get scrollTop() {
		return this._scrollTop;
	}
	set scrollTop(offset) {
		this.scrollTo(offset);
	}
	get clientHeight() {
		return this._clientHeight;
	}
	get scrollHeight() {
		return this._scrollHeight;
	}
	get maxScrollTop() {
		return Math.max(0, this.scrollHeight - this.clientHeight);
	}
	/** Sets a clamped offset. Before layout, retains the requested initial offset. */
	scrollTo(offset) {
		validateOffset(offset);
		const next = this.measured ? Math.min(this.maxScrollTop, Math.max(0, offset)) : Math.max(0, offset);
		states.get(this)?.binding?.applyOffset(next);
		if (next === this._scrollTop) return;
		this._scrollTop = next;
		this.markUIDirty();
		this.onScroll?.(next);
	}
	/** Returns whether a measured viewport actually moved. */
	scrollBy(delta) {
		validateOffset(delta);
		if (!this.ready) return false;
		const previous = this.scrollTop;
		this.scrollTo(previous + delta);
		return previous !== this.scrollTop;
	}
	/** Minimally reveals a descendant after its mounted layout is ready. */
	reveal(child) {
		let parent = child.parent;
		while (parent && parent !== this) parent = parent.parent;
		if (parent !== this) throw new Error("UIScrollView.reveal requires a descendant UI element.");
		const binding = states.get(this)?.binding;
		if (!this.ready || !binding) throw new Error("UIScrollView.reveal requires a mounted layout.");
		binding.reveal(child);
	}
};
function bindScrollView(view, binding) {
	const state = states.get(view);
	state.binding = binding;
	return () => {
		if (state.binding !== binding) return;
		state.binding = void 0;
		state.clearLayout();
	};
}
function updateScrollViewLayout(view, height, contentHeight) {
	if (!Number.isFinite(height) || !Number.isFinite(contentHeight) || height < 0 || contentHeight < 0) throw new Error("UIScrollView requires finite, nonnegative layout extents.");
	states.get(view).updateLayout(height, Math.max(height, contentHeight));
}
function validateOffset(offset) {
	if (!Number.isFinite(offset)) throw new Error("UIScrollView offsets must be finite.");
}
//#endregion
//#region src/ui/components/UIDropdown.ts
/** List height in UI units before a long option list scrolls. */
const LIST_MAX_HEIGHT = 320;
const openDropdowns = /* @__PURE__ */ new Map();
/**
* Closes every open dropdown that does not contain `target`. The UI runtime
* calls this when any source starts a selection, so pressing another control,
* a scene object, or empty space closes the list without choosing an option.
*/
function closeDropdownsOutside(target) {
	for (const [dropdown, close] of openDropdowns) if (!objectIsDescendantOf(target, dropdown)) close();
}
/**
* A button that shows the selected option and opens a list of options below
* or above itself. Picking an enabled option selects it and closes the list.
*/
var UIDropdown = class extends UIElement {
	constructor({ ariaLabel, options, value, placeholder = "", disabled = false, onChange, ...elementOptions }) {
		if (!ariaLabel) throw new Error("UIDropdown requires ariaLabel.");
		const choices = validateChoices(options);
		validateValue(choices, value);
		if (typeof placeholder !== "string") throw new Error("UIDropdown placeholder must be a string.");
		validateDisabled(disabled);
		super("dropdown", elementOptions);
		this.name = "UIDropdown";
		this._open = false;
		this.revealPending = false;
		this.close = () => this.setOpen(false);
		this.ariaLabel = ariaLabel;
		this.options = choices;
		this.placeholder = placeholder;
		this._value = value;
		this._disabled = disabled;
		this.onChange = onChange;
		this.rows = choices.map((choice) => new UIDropdownOption(choice, () => this._value === choice.value, () => this.pick(choice.value)));
		this.list = new UIScrollView({
			ariaLabel,
			visible: false,
			style: {
				height: "auto",
				maxHeight: LIST_MAX_HEIGHT,
				gap: 0
			},
			children: [...this.rows]
		});
		super.add(this.list);
		this.addEventListener("removed", this.close);
		registerSemanticControl(this, {
			kind: "button",
			isDisabled: () => this._disabled,
			activate: () => this.setOpen(!this._open)
		});
	}
	get value() {
		return this._value;
	}
	set value(value) {
		validateValue(this.options, value);
		if (value === this._value) return;
		this._value = value;
		this.markUIDirty();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		validateDisabled(value);
		if (value === this._disabled) return;
		this._disabled = value;
		if (value) this.close();
		this.markUIDirty();
	}
	/** Whether the option list is showing. */
	get open() {
		return this._open;
	}
	add(..._objects) {
		throw new Error("UIDropdown does not accept children.");
	}
	attach(_object) {
		throw new Error("UIDropdown does not accept children.");
	}
	/** Closes a hidden list and scrolls an open one to the chosen option. */
	update() {
		if (!this._open) return;
		if (!isVisibleInTree(this)) this.close();
		else this.revealChosen();
	}
	dispose() {
		this.close();
		super.dispose();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	setOpen(open) {
		if (open === this._open) return;
		this._open = open;
		this.list.visible = open;
		this.revealPending = open;
		this.revealChosen();
		if (open) openDropdowns.set(this, this.close);
		else openDropdowns.delete(this);
		this.markUIDirty();
	}
	/** Scrolls the chosen option into view once the open list has a layout. */
	revealChosen() {
		if (!this.revealPending || !this.list.ready) return;
		this.revealPending = false;
		const row = this.rows.find((row) => row.value === this._value);
		if (row) this.list.reveal(row);
	}
	pick(value) {
		const changed = value !== this._value;
		this._value = value;
		this.close();
		if (!changed) return;
		this.markUIDirty();
		this.onChange?.(value);
	}
};
/** One option row inside a UIDropdown list. Created by the dropdown. */
var UIDropdownOption = class extends UIElement {
	constructor(choice, isChosen, pick) {
		super("dropdownOption");
		this.isChosen = isChosen;
		this.name = "UIDropdownOption";
		this.value = choice.value;
		this.label = choice.label;
		this.disabled = choice.disabled ?? false;
		registerSemanticControl(this, {
			kind: "button",
			isDisabled: () => this.disabled,
			activate: pick
		});
	}
	/** Whether this option is the dropdown's current value. */
	get checked() {
		return this.isChosen();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
};
function validateChoices(options) {
	if (!Array.isArray(options) || options.length === 0) throw new Error("UIDropdown options must be a non-empty array.");
	const values = /* @__PURE__ */ new Set();
	return Object.freeze(options.map((option) => {
		const { value, label, disabled } = option ?? {};
		if (typeof value !== "string") throw new Error("UIDropdown option values must be strings.");
		if (typeof label !== "string" || !label) throw new Error("UIDropdown option labels must be non-empty strings.");
		if (disabled !== void 0 && typeof disabled !== "boolean") throw new Error("UIDropdown option disabled must be a boolean.");
		if (values.has(value)) throw new Error("UIDropdown option values must be unique.");
		values.add(value);
		return Object.freeze(disabled === void 0 ? {
			value,
			label
		} : {
			value,
			label,
			disabled
		});
	}));
}
function validateValue(choices, value) {
	if (value !== void 0 && !choices.some((choice) => choice.value === value)) throw new Error("UIDropdown value must be one of its option values.");
}
function validateDisabled(value) {
	if (typeof value !== "boolean") throw new Error("UIDropdown disabled must be a boolean.");
}
function isVisibleInTree(object) {
	for (let node = object; node; node = node.parent) if (!node.visible) return false;
	return true;
}
//#endregion
//#region src/ui/internal/PanelBackfaceVisibility.ts
/**
* Marks a mesh as a panel back-face layer (rendered with `THREE.BackSide`) so
* it can be skipped while the camera cannot see it. See `GradientPanel`.
*/
const PANEL_BACKFACE_MARKER = "xrblocksPanelBackface";
/**
* Whether the camera is on the side of the panel's front face (the side its
* local +z normal points toward).
*
* This matches three's culling exactly: a `FrontSide` plane draws when the
* camera faces its normal and a `BackSide` plane draws when it does not,
* including for mirrored (negative-determinant) `matrixWorld` — three flips
* the rasterized front face to compensate for the mirrored winding.
*/
function isCameraFacingPanelFront(panel, camera) {
	const panelMatrix = panel.matrixWorld.elements;
	const cameraMatrix = camera.matrixWorld.elements;
	const dx = cameraMatrix[12] - panelMatrix[12];
	const dy = cameraMatrix[13] - panelMatrix[13];
	const dz = cameraMatrix[14] - panelMatrix[14];
	return panelMatrix[8] * dx + panelMatrix[9] * dy + panelMatrix[10] * dz > 0;
}
/**
* Hides panel back-face layers while the camera is in front of their panel.
* From the front they are backface-culled at raster time (0 px painted) but
* still cost a draw call per view; from behind they draw as usual.
*/
function updatePanelBackfaceVisibility(root, camera) {
	root.traverse((object) => {
		if (object.userData["xrblocksPanelBackface"]) object.visible = !isCameraFacingPanelFront(object, camera);
	});
}
//#endregion
export { UIElement as A, DEFAULT_GRADIENT_PANEL_PROPS as B, isManipulationActionEnabled as C, getObjectTargetPoint as D, ManipulationAction as E, getUIPresentationObject as F, Script as G, resumeTransformScripts as H, getUIRevision as I, ScriptMixin as K, getUIStructureRevision as L, collectUIRoots as M, getUIElementKind as N, objectIsDescendantOf as O, getUIPresentationBounds as P, isUIElement as R, isHandleAction as S, normalizeRotationAxis as T, suspendTransformScripts as U, TransformScript as V, MeshScript as W, getSemanticControl as _, closeDropdownsOutside as a, registerSemanticControl as b, updateScrollViewLayout as c, getUICardEdgeOptions as d, measureUICardContentHeight as f, validateUIAppearance as g, setUICardContentMeasurer as h, UIDropdownOption as i, cloneUIStyle as j, traverseUtil as k, UICard as l, setResolvedUICardSize as m, updatePanelBackfaceVisibility as n, UIScrollView as o, measureUICardMinContentWidth as p, isDefaultScriptMethod as q, UIDropdown as r, bindScrollView as s, PANEL_BACKFACE_MARKER as t, getResolvedUICardSize as u, isSemanticControl as v, normalizeManipulationConfig as w, cloneScaleOptions as x, isSemanticControlDisabled as y, registerUIPresentationObject as z };

//# sourceMappingURL=PanelBackfaceVisibility.js.map
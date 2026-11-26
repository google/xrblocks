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
* @version v0.25.0
* @commitid 1b29031
* @builddate 2026-11-26T03:18:46.659Z
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
import { A as UIElement, R as isUIElement, b as registerSemanticControl, g as validateUIAppearance, z as markUIElementDirty } from "./PanelBackfaceVisibility.js";
//#region src/ui/components/UIOverlay.ts
/** A view-space UI root. World transforms have no rendering effect. */
var UIOverlay = class extends UIElement {
	constructor({ appearance = "surface", ...options } = {}) {
		validateUIAppearance(appearance);
		super("overlay", options);
		this.name = "UIOverlay";
		this.appearance = appearance;
	}
};
//#endregion
//#region src/ui/components/UIButton.ts
/** A semantic button that activates after a valid captured press and release. */
var UIButton = class extends UIElement {
	constructor({ label, icon, ariaLabel, disabled = false, onClick, children, ...options } = {}) {
		if (typeof disabled !== "boolean") throw new Error("UIButton disabled must be a boolean.");
		if (children?.length && (label !== void 0 || icon !== void 0)) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
		if (!ariaLabel && !label) throw new Error("UIButton requires ariaLabel when it has no text label.");
		super("button", {
			...options,
			children
		});
		this.name = "UIButton";
		this._disabled = false;
		this._label = label;
		this._icon = icon;
		this._ariaLabel = ariaLabel;
		this._disabled = disabled;
		this.onClick = onClick;
		registerSemanticControl(this, {
			kind: "button",
			isDisabled: () => this._disabled,
			activate: () => this.onClick?.()
		});
	}
	get label() {
		return this._label;
	}
	set label(value) {
		this.assertConvenienceContent(value);
		const previous = this._label;
		this._label = value;
		try {
			this.assertAccessibleName();
		} catch (error) {
			this._label = previous;
			throw error;
		}
		this.markUIDirty();
	}
	get icon() {
		return this._icon;
	}
	set icon(value) {
		this.assertConvenienceContent(value);
		this._icon = value;
		this.assertAccessibleName();
		this.markUIDirty();
	}
	get ariaLabel() {
		return this._ariaLabel ?? this._label;
	}
	set ariaLabel(value) {
		const previous = this._ariaLabel;
		this._ariaLabel = value;
		try {
			this.assertAccessibleName();
		} catch (error) {
			this._ariaLabel = previous;
			throw error;
		}
		this.markUIDirty();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		if (typeof value !== "boolean") throw new Error("UIButton disabled must be a boolean.");
		if (value === this._disabled) return;
		this._disabled = value;
		this.markUIDirty();
	}
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	add(...objects) {
		if (objects.some(isUIElement) && (this._label !== void 0 || this._icon !== void 0)) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
		return super.add(...objects);
	}
	assertConvenienceContent(value) {
		if (this.children.some(isUIElement) && value !== void 0) throw new Error("UIButton convenience label/icon content cannot be combined with children.");
	}
	assertAccessibleName() {
		if (!this._ariaLabel && !this._label) throw new Error("UIButton requires an accessible name.");
	}
};
//#endregion
//#region src/ui/components/UIPanel.ts
/** A passive flex-layout and visual grouping element. */
var UIPanel = class extends UIElement {
	constructor({ appearance = "none", ...options } = {}) {
		validateUIPanelAppearance(appearance);
		super("panel", options);
		this.name = "UIPanel";
		this._appearance = appearance;
	}
	get appearance() {
		return this._appearance;
	}
	set appearance(value) {
		validateUIPanelAppearance(value);
		if (value === this._appearance) return;
		this._appearance = value;
		this.markUIDirty();
		for (const child of this.children) if (isUIElement(child)) markUIElementDirty(child);
	}
};
function validateUIPanelAppearance(value) {
	if (value !== "none" && value !== "raised" && value !== "cluster") throw new Error(`Invalid UI panel appearance "${String(value)}".`);
}
//#endregion
//#region src/ui/components/UIText.ts
/** Text content in a card or overlay layout. */
var UIText = class extends UIElement {
	constructor({ text, ...options }) {
		if (typeof text !== "string") throw new Error("UIText requires text.");
		super("text", options);
		this.name = "UIText";
		this._text = text;
	}
	get text() {
		return this._text;
	}
	set text(value) {
		if (typeof value !== "string") throw new Error("UIText.text must be a string.");
		if (value === this._text) return;
		this._text = value;
		this.markUIContentDirty();
	}
};
//#endregion
//#region src/ui/components/UITextInput.ts
const DEFAULT_SINGLE_LINE_HEIGHT = 56;
const DEFAULT_MULTILINE_HEIGHT = 120;
const states = /* @__PURE__ */ new WeakMap();
/** A single-line or multiline text field backed by native browser editing. */
var UITextInput = class extends UIElement {
	constructor({ ariaLabel, value = "", placeholder = "", multiline = false, disabled = false, readOnly = false, maxLength, onInput, onChange, onSubmit, onFocus, onBlur, style, ...options }) {
		if (!ariaLabel) throw new Error("UITextInput requires ariaLabel.");
		validateText(value, "value");
		validateText(placeholder, "placeholder");
		validateFlag(multiline, "multiline");
		validateFlag(disabled, "disabled");
		validateFlag(readOnly, "readOnly");
		validateMaxLength(maxLength);
		super("input", {
			...options,
			style: {
				width: "100%",
				minHeight: multiline ? DEFAULT_MULTILINE_HEIGHT : DEFAULT_SINGLE_LINE_HEIGHT,
				...style
			}
		});
		this.name = "UITextInput";
		this.ariaLabel = ariaLabel;
		this.multiline = multiline;
		this._value = normalizeTextInputValue(value, multiline);
		this._placeholder = placeholder;
		this._disabled = disabled;
		this._readOnly = readOnly;
		this._maxLength = maxLength;
		this.onInput = onInput;
		this.onChange = onChange;
		this.onSubmit = onSubmit;
		this.onFocus = onFocus;
		this.onBlur = onBlur;
		states.set(this, {
			baseline: this._value,
			focused: false,
			nativeKeyboardRequests: /* @__PURE__ */ new Set(),
			internals: {
				notifyInput: (next) => this.handleNativeInput(next),
				notifyFocus: () => this.handleNativeFocus(),
				notifyBlur: () => this.handleNativeBlur(),
				notifySubmit: () => this.onSubmit?.(this._value)
			}
		});
		const scrollOwner = states.get(this);
		registerSemanticControl(this, {
			kind: "input",
			isDisabled: () => this._disabled || !this.ready,
			activate: () => {
				if (this.ready && !this._disabled) this.binding.focus();
			},
			begin: (input) => this.binding?.begin?.(input),
			update: (input) => this.binding?.update?.(input),
			complete: () => this.binding?.complete?.(),
			cancel: () => this.binding?.cancel?.(),
			get scroll() {
				return scrollOwner.binding?.getScroll?.();
			}
		});
	}
	/** Whether a mounted backend can currently accept editing operations. */
	onObjectSelectStart(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	onObjectSelectEnd(event) {
		event.stopPropagation();
		event.stopGlobalPropagation();
	}
	get ready() {
		return this.binding?.isReady() ?? false;
	}
	/** A module or text-rendering failure reported by the mounted backend. */
	get error() {
		return this.binding?.getError?.();
	}
	get focused() {
		return states.get(this).focused;
	}
	/** Whether a custom keyboard currently owns software-keyboard suppression. */
	get nativeKeyboardSuppressed() {
		return states.get(this).nativeKeyboardRequests.size > 0;
	}
	/**
	* Requests that the browser's software keyboard stay hidden while a custom
	* keyboard is active. Call the returned function to release this request.
	* Native text editing remains enabled; support depends on the browser.
	*/
	suppressNativeKeyboard() {
		const state = states.get(this);
		const token = {};
		const wasSuppressed = state.nativeKeyboardRequests.size > 0;
		state.nativeKeyboardRequests.add(token);
		if (!wasSuppressed) state.binding?.applyOptions();
		return () => {
			if (!state.nativeKeyboardRequests.delete(token)) return;
			if (state.nativeKeyboardRequests.size === 0) state.binding?.applyOptions();
		};
	}
	get value() {
		return this._value;
	}
	/** Programmatic assignment never emits onInput and rebases onChange. */
	set value(value) {
		validateText(value, "value");
		value = normalizeTextInputValue(value, this.multiline);
		const changed = value !== this._value;
		const state = states.get(this);
		this._value = value;
		state.baseline = value;
		state.binding?.applyValue(value);
		if (changed) this.markUIContentDirty();
	}
	get placeholder() {
		return this._placeholder;
	}
	set placeholder(value) {
		validateText(value, "placeholder");
		if (value === this._placeholder) return;
		this._placeholder = value;
		this.binding?.applyOptions();
		this.markUIContentDirty();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		validateFlag(value, "disabled");
		if (value === this._disabled) return;
		this._disabled = value;
		this.binding?.applyOptions();
		this.markUIDirty();
	}
	get readOnly() {
		return this._readOnly;
	}
	set readOnly(value) {
		validateFlag(value, "readOnly");
		if (value === this._readOnly) return;
		this._readOnly = value;
		this.binding?.applyOptions();
		this.markUIDirty();
	}
	get maxLength() {
		return this._maxLength;
	}
	set maxLength(value) {
		validateMaxLength(value);
		if (value === this._maxLength) return;
		this._maxLength = value;
		this.binding?.applyOptions();
	}
	get selectionStart() {
		return this.binding?.getSelection()?.start;
	}
	get selectionEnd() {
		return this.binding?.getSelection()?.end;
	}
	get selectionDirection() {
		return this.binding?.getSelection()?.direction;
	}
	/** UTF-16 code unit offsets, matching browser text field indexing. */
	get selection() {
		return this.binding?.getSelection();
	}
	setSelectionRange(start, end, direction = "none") {
		if (!Number.isInteger(start) || !Number.isInteger(end)) throw new Error("UITextInput selection offsets must be integers.");
		if (![
			"forward",
			"backward",
			"none"
		].includes(direction)) throw new Error("UITextInput selection direction must be forward, backward, or none.");
		this.requireBinding("setSelectionRange").setSelectionRange(Math.max(0, start), Math.max(0, end), direction);
	}
	focus() {
		const binding = this.requireBinding("focus");
		if (this._disabled) return;
		binding.focus();
	}
	blur() {
		this.binding?.blur();
	}
	/** Replaces the current selection, honoring maxLength like typed input. */
	insertText(text) {
		validateText(text, "insertText");
		const binding = this.requireBinding("insertText");
		if (this._disabled || this._readOnly) return;
		binding.insertText(text);
	}
	/**
	* Applies one KeyboardEvent.key name from a virtual keyboard or automation.
	*
	* Returns whether the key was applied. Physical keyboards and IME go through
	* the native element instead of this narrow path.
	*/
	pressKey(key, modifiers) {
		if (typeof key !== "string" || key.length === 0) throw new Error("UITextInput.pressKey requires a key name.");
		if (!this.ready || this._disabled) return false;
		return this.binding.pressKey(key, modifiers);
	}
	get binding() {
		return states.get(this).binding;
	}
	handleNativeInput(value) {
		value = normalizeTextInputValue(value, this.multiline);
		if (value === this._value) return;
		this._value = value;
		this.markUIContentDirty();
		this.onInput?.(value);
	}
	handleNativeFocus() {
		const state = states.get(this);
		if (state.focused) return;
		state.focused = true;
		state.baseline = this._value;
		this.markUIDirty();
		this.onFocus?.();
	}
	handleNativeBlur() {
		const state = states.get(this);
		if (!state.focused) return;
		state.focused = false;
		this.markUIDirty();
		const edited = this._value !== state.baseline;
		state.baseline = this._value;
		try {
			if (edited) this.onChange?.(this._value);
		} finally {
			this.onBlur?.();
		}
	}
	requireBinding(operation) {
		const binding = this.binding;
		if (!binding || !binding.isReady()) throw new Error(`UITextInput.${operation} requires a mounted, ready text field.`);
		return binding;
	}
};
/** Uses the same line-ending rules as native input and textarea values. */
function normalizeTextInputValue(value, multiline) {
	return multiline ? value.replace(/\r\n?/g, "\n") : value.replace(/[\r\n]/g, "");
}
/** Attaches one native editing backend and returns its reporting callbacks. */
function bindTextInput(field, binding) {
	const state = states.get(field);
	if (state.binding && state.binding !== binding) throw new Error("UITextInput already has a native editing backend.");
	state.binding = binding;
	const internals = state.internals;
	return {
		field,
		notifyInput: (value) => internals.notifyInput(value),
		notifyFocus: () => internals.notifyFocus(),
		notifyBlur: () => internals.notifyBlur(),
		notifySubmit: () => internals.notifySubmit(),
		unbind: () => {
			if (state.binding !== binding) return;
			state.binding = void 0;
			internals.notifyBlur();
		}
	};
}
function validateText(value, property) {
	if (typeof value !== "string") throw new Error(`UITextInput ${property} must be a string.`);
}
function validateFlag(value, property) {
	if (typeof value !== "boolean") throw new Error(`UITextInput ${property} must be a boolean.`);
}
function validateMaxLength(value) {
	if (value === void 0) return;
	if (!Number.isInteger(value) || value < 0) throw new Error("UITextInput maxLength must be a nonnegative integer or undefined.");
}
//#endregion
export { UIPanel as a, UIText as i, bindTextInput as n, UIButton as o, normalizeTextInputValue as r, UIOverlay as s, UITextInput as t };

//# sourceMappingURL=UITextInput.js.map
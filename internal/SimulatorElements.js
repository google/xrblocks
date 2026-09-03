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
 * @version v0.21.1
 * @commitid 7cbc644
 * @builddate 2026-09-03T16:10:50.389Z
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
    "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
    "@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
    "@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
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
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import { J as XR_BLOCKS_ASSETS_PATH, S as SimulatorHandPose, e as SimulatorHandPoseChangeRequestEvent, L as SIMULATOR_HAND_POSE_NAMES, b as SimulatorMode, i as SetSimulatorEnvironmentEvent, c as SetSimulatorModeEvent, k as SetSimulatorHandPhysicsEvent, j as ShowSimulatorInstructionsEvent } from './entry.js';
import { state } from 'lit/decorators/state.js';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, ref } from 'lit/directives/ref.js';
import 'three';
import 'three/addons/postprocessing/Pass.js';
import 'three/addons/webxr/XRControllerModelFactory.js';
import 'three/addons/webxr/XRHandModelFactory.js';
import 'three/addons/webxr/XREstimatedLight.js';
import 'three/addons/loaders/FontLoader.js';
import 'three/addons/geometries/TextGeometry.js';
import 'three/addons/loaders/DRACOLoader.js';
import 'three/addons/loaders/GLTFLoader.js';
import 'three/addons/loaders/KTX2Loader.js';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

class SimulatorInstructionsNextEvent extends Event {
    static { this.type = 'simulatorInstructionsNextEvent'; }
    constructor() {
        super(SimulatorInstructionsNextEvent.type, { bubbles: true, composed: true });
    }
}
class SimulatorInstructionsCloseEvent extends Event {
    static { this.type = 'simulatorInstructionsCloseEvent'; }
    constructor() {
        super(SimulatorInstructionsCloseEvent.type, {
            bubbles: true,
            composed: true,
        });
    }
}

let SimulatorInstructionsCard = class SimulatorInstructionsCard extends LitElement {
    static { this.styles = css `
    :host {
      position: relative;
      box-sizing: border-box;
      background: #ffffff;
      display: flex;
      max-height: 100%;
      overflow-y: auto;
      height: 40rem;
      width: min-content;
      min-width: 30rem;
      border-radius: 1.6rem;
      color: #000000;
      padding: 1.5rem;
      flex-direction: column;
    }

    h1 {
      margin-top: 0px;
      font-size: 1.375rem;
    }

    h2 {
      margin-top: 0px;
      margin-bottom: 0px;
      font-size: 1.125rem;
    }

    ul {
      margin-top: 0px;
      margin-bottom: 0px;
    }

    .image-div {
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .description-div {
      flex-grow: 1;
    }

    .close-button {
      position: absolute;
      right: 1.3rem;
      top: 1.3rem;
    }

    button {
      align-self: flex-end;
      width: min-content;
      height: min-content;
      font-size: 0.75rem;
      background: rgb(48, 40, 34);
      color: white;
      border-radius: 1rem;
      padding: 0.5rem 0.7rem;
      border: none;
    }

    video {
      max-width: 100%;
      aspect-ratio: 16/9;
    }

    p {
      margin-top: 0px;
      margin-bottom: 0px;
    }
  `; }
    continueButtonClicked() {
        this.dispatchEvent(new SimulatorInstructionsNextEvent());
    }
    closeButtonClicked() {
        this.dispatchEvent(new SimulatorInstructionsCloseEvent());
    }
    getHeaderContents() {
        return html ` <h1>Welcome to XR Blocks!</h1> `;
    }
    getImageContents() {
        return html ``;
    }
    getDescriptionContents() {
        return html ``;
    }
    render() {
        return html `
      <button class="close-button" @click=${this.closeButtonClicked}>X</button>
      <div class="header-div">${this.getHeaderContents()}</div>
      <div class="image-div">${this.getImageContents()}</div>
      <div class="description-div">${this.getDescriptionContents()}</div>
      <button type="button" @click=${this.continueButtonClicked}>
        Continue
      </button>
    `;
    }
};
SimulatorInstructionsCard = __decorate([
    customElement('xrblocks-simulator-instructions-card')
], SimulatorInstructionsCard);

let CustomInstruction = class CustomInstruction extends SimulatorInstructionsCard {
    getHeaderContents() {
        return html `<h1>${this.customInstruction.header}</h1>`;
    }
    getImageContents() {
        return this.customInstruction.videoSrc
            ? html `
          <video playsinline autoplay muted loop>
            <source src=${this.customInstruction.videoSrc} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        `
            : html ``;
    }
    getDescriptionContents() {
        return html `<p>${this.customInstruction.description}</p>`;
    }
    render() {
        return super.render();
    }
};
__decorate([
    property()
], CustomInstruction.prototype, "customInstruction", void 0);
CustomInstruction = __decorate([
    customElement('xrblocks-simulator-custom-instruction')
], CustomInstruction);

const SIMULATOR_HANDS_VIDEO_PATH = XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_hands.webm';
let HandsInstructions = class HandsInstructions extends SimulatorInstructionsCard {
    getImageContents() {
        return html `
      <video playsinline autoplay muted loop>
        <source src="${SIMULATOR_HANDS_VIDEO_PATH}" type="video/webm" />
        Your browser does not support the video tag.
      </video>
    `;
    }
    getDescriptionContents() {
        return html `
      <h2>Hands Mode</h2>
      <p>
        From Navigation Mode, press <strong>Left Shift</strong> to enter
        <strong>Hands Mode</strong>. This mode allows for precise manipulation
        of virtual hands.
      </p>
      <ul>
        <li>
          <strong>Move Hand:</strong> Use the W, A, S, D keys to move it
          forward, left, backward, and right.
        </li>
        <li>
          <strong>Elevate Hand:</strong> Use the Q (up) and E (down) keys.
        </li>
        <li>
          <strong>Switch Active Hand:</strong> Press the T key to toggle between
          hands.
        </li>
        <li><strong>Simulate Pinch:</strong> Press the Spacebar.</li>
      </ul>
    `;
    }
};
HandsInstructions = __decorate([
    customElement('xrblocks-simulator-hands-instructions')
], HandsInstructions);

const SIMULATOR_NAVIGATION_VIDEO_PATH = XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_navigation.webm';
let NavigationInstructions = class NavigationInstructions extends SimulatorInstructionsCard {
    getImageContents() {
        return html `
      <video playsinline autoplay muted loop>
        <source src=${SIMULATOR_NAVIGATION_VIDEO_PATH} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    `;
    }
    getDescriptionContents() {
        return html `
      <h2>Navigation Mode</h2>
      <p>
        Press <strong>Left Shift</strong> to toggle Navigation Mode. In this
        mode, virtual hands appear and the mouse controls the camera view.
      </p>
      <ul>
        <li>
          <strong>Move Forward/Backward/Sideways:</strong> Use the W, A, S, D
          keys.
        </li>
        <li><strong>Move Up/Down:</strong> Use the Q and E keys.</li>
        <li><strong>Rotate Camera:</strong> Click and drag the mouse.</li>
      </ul>
    `;
    }
};
NavigationInstructions = __decorate([
    customElement('xrblocks-simulator-navigation-instructions')
], NavigationInstructions);

const SIMULATOR_USER_VIDEO_PATH = XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_user.webm';
let UserInstructions = class UserInstructions extends SimulatorInstructionsCard {
    getImageContents() {
        return html `
      <video playsinline autoplay muted loop>
        <source src=${SIMULATOR_USER_VIDEO_PATH} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    `;
    }
    getDescriptionContents() {
        return html `
      <h2>User Mode</h2>
      <p>
        The simulator starts in <strong>User Mode</strong> by default. This mode
        is for moving the camera and interacting directly with scene objects.
      </p>
      <ul>
        <li>
          <strong>Move Forward/Backward/Sideways:</strong> Use the W, A, S, D
          keys.
        </li>
        <li><strong>Move Up/Down:</strong> Use the Q and E keys.</li>
        <li>
          <strong>Rotate Camera:</strong> Hold the right mouse button and drag.
        </li>
        <li>
          <strong>Scale a ModelViewer:</strong> Point at it and use the mouse
          wheel.
        </li>
        <li><strong>Select Object:</strong> Left-click the mouse.</li>
      </ul>
    `;
    }
};
UserInstructions = __decorate([
    customElement('xrblocks-simulator-user-instructions')
], UserInstructions);

let SimulatorInstructions = class SimulatorInstructions extends LitElement {
    static { this.styles = css `
    :host {
      background: #000000aa;
      position: absolute;
      top: 0;
      left: 0;
      display: flex;
      height: 100%;
      width: 100%;
      justify-content: center;
      align-items: center;
    }
  `; }
    constructor() {
        super();
        this.steps = [
            html ` <xrblocks-simulator-user-instructions />`,
            html ` <xrblocks-simulator-navigation-instructions />`,
            html ` <xrblocks-simulator-hands-instructions />`,
        ];
        this.customInstructions = [];
        this.step = 0;
        this.addEventListener(SimulatorInstructionsNextEvent.type, this.continueButtonClicked.bind(this));
        this.addEventListener(SimulatorInstructionsCloseEvent.type, this.closeInstructions.bind(this));
    }
    closeInstructions() {
        this.remove();
    }
    continueButtonClicked() {
        if (this.step + 1 >= this.steps.length + this.customInstructions.length) {
            this.closeInstructions();
            return;
        }
        this.step++;
    }
    render() {
        return this.step < this.steps.length
            ? this.steps[this.step]
            : html `<xrblocks-simulator-custom-instruction
          .customInstruction=${this.customInstructions[this.step - this.steps.length]}
        />`;
    }
};
__decorate([
    property()
], SimulatorInstructions.prototype, "customInstructions", void 0);
__decorate([
    property()
], SimulatorInstructions.prototype, "step", void 0);
SimulatorInstructions = __decorate([
    customElement('xrblocks-simulator-instructions')
], SimulatorInstructions);

const BUTTON_NAMES = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Back',
    9: 'Start',
    10: 'L3',
    11: 'R3',
    12: 'D-Up',
    13: 'D-Down',
    14: 'D-Left',
    15: 'D-Right',
};
function buttonName(index) {
    return BUTTON_NAMES[index] ?? `Btn ${index}`;
}
let GamepadToast = class GamepadToast extends LitElement {
    constructor() {
        super(...arguments);
        this.visible = false;
        this._timer = null;
        /** Map of button label → action description. */
        this.controls = {};
        this._flashMessage = '';
    }
    static { this.styles = css `
    :host {
      position: fixed;
      top: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      pointer-events: none;
    }

    .toast {
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      border-radius: 1rem;
      padding: 1rem 1.5rem;
      font-family: system-ui, sans-serif;
      font-size: 0.9rem;
      backdrop-filter: blur(8px);
      opacity: 1;
      transition: opacity 0.4s ease-out;
      pointer-events: auto;
      cursor: pointer;
      max-width: 28rem;
    }

    .toast.hidden {
      opacity: 0;
    }

    h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }

    .controls {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.2rem 0.8rem;
    }

    .key {
      font-weight: 600;
      color: #8cf;
      text-align: right;
    }

    .action {
      color: #ccc;
    }
  `; }
    show(controls, duration = 5000) {
        this.controls = controls;
        this._flashMessage = '';
        this.visible = true;
        if (this._timer)
            clearTimeout(this._timer);
        this._timer = setTimeout(() => this.dismiss(), duration);
    }
    /** Show a brief single-line message (e.g. "Active Hand: Right"). */
    flash(message, duration = 1500) {
        this._flashMessage = message;
        this.controls = {};
        this.visible = true;
        if (this._timer)
            clearTimeout(this._timer);
        this._timer = setTimeout(() => this.dismiss(), duration);
    }
    dismiss() {
        this.visible = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }
    render() {
        if (this._flashMessage) {
            return html `
        <div
          class="toast ${this.visible ? '' : 'hidden'}"
          @click=${this.dismiss}
        >
          <span class="action">${this._flashMessage}</span>
        </div>
      `;
        }
        return html `
      <div class="toast ${this.visible ? '' : 'hidden'}" @click=${this.dismiss}>
        <h3>🎮 Gamepad Connected</h3>
        <div class="controls">
          ${Object.entries(this.controls).map(([key, action]) => html `
              <span class="key">${key}</span>
              <span class="action">${action}</span>
            `)}
        </div>
      </div>
    `;
    }
};
__decorate([
    property({ type: Boolean })
], GamepadToast.prototype, "visible", void 0);
__decorate([
    property({ type: Object })
], GamepadToast.prototype, "controls", void 0);
__decorate([
    property({ type: String })
], GamepadToast.prototype, "_flashMessage", void 0);
GamepadToast = __decorate([
    customElement('xrblocks-gamepad-toast')
], GamepadToast);

const ACTION_LABELS = {
    select: 'Select / Interact',
    cycleHandPoseLeft: 'Previous Hand Pose',
    cycleHandPoseRight: 'Next Hand Pose',
    cycleSimulatorMode: 'Cycle Simulator Mode',
    toggleUI: 'Toggle UI',
    toggleHand: 'Swap Active Hand',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    openSettings: 'Open Settings',
};
// Actions hidden from the rebind list. openSettings must always stay bound
// so users can never lock themselves out of the menu.
const REBINDABLE_ACTIONS = Object.keys(ACTION_LABELS).filter((a) => a !== 'openSettings');
let GamepadSettingsPanel = class GamepadSettingsPanel extends LitElement {
    constructor() {
        super(...arguments);
        this._listeningAction = null;
        this._bindingSnapshot = {};
        this._focusedIndex = 0;
        this._rafId = null;
        this._prevStickY = 0;
        this._navPrevButtons = [];
    }
    static { this.styles = css `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    :host([hidden]) {
      display: none;
    }

    .backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      pointer-events: auto;
    }

    .panel {
      position: relative;
      background: rgba(20, 20, 30, 0.95);
      color: #fff;
      border-radius: 1rem;
      padding: 1.5rem;
      font-family: system-ui, sans-serif;
      min-width: 20rem;
      max-width: 28rem;
      backdrop-filter: blur(12px);
      pointer-events: auto;
      z-index: 1;
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .binding-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .binding-row:last-of-type {
      border-bottom: none;
    }

    .action-label {
      color: #ccc;
      font-size: 0.9rem;
    }

    .bind-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #8cf;
      border-radius: 0.5rem;
      padding: 0.3rem 0.8rem;
      font-size: 0.85rem;
      cursor: pointer;
      min-width: 4rem;
      text-align: center;
      font-family: inherit;
    }

    .bind-btn:hover,
    .bind-btn.focused {
      background: rgba(255, 255, 255, 0.2);
      outline: 2px solid #8cf;
      outline-offset: 2px;
    }

    .bind-btn.listening {
      color: #fc4;
      border-color: #fc4;
      animation: pulse 1s infinite alternate;
    }

    @keyframes pulse {
      from {
        opacity: 0.6;
      }
      to {
        opacity: 1;
      }
    }

    .footer {
      display: flex;
      justify-content: space-between;
      margin-top: 1rem;
      gap: 0.5rem;
    }

    .footer button {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      border-radius: 0.5rem;
      padding: 0.4rem 1rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-family: inherit;
    }

    .footer button:hover,
    .footer button.focused {
      background: rgba(255, 255, 255, 0.2);
      outline: 2px solid #8cf;
      outline-offset: 2px;
    }

    .hint {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: #888;
      text-align: center;
    }
  `; }
    _navJustPressed(gp, index) {
        const down = gp.activeGamepad?.buttons[index]?.pressed ?? false;
        const wasDown = this._navPrevButtons[index] ?? false;
        return down && !wasDown;
    }
    _navUpdatePrev(gp) {
        const buttons = gp.activeGamepad?.buttons;
        if (!buttons)
            return;
        for (let i = 0; i < buttons.length; i++) {
            this._navPrevButtons[i] = buttons[i]?.pressed ?? false;
        }
    }
    get _totalItems() {
        return REBINDABLE_ACTIONS.length + 2; // bindings + reset + close
    }
    show() {
        this.hidden = false;
        this._refreshSnapshot();
        this._focusedIndex = 0;
        this._prevStickY = 0;
        this._navPrevButtons = [];
        if (this.gamepadController) {
            this.gamepadController.menuActive = true;
            this._navUpdatePrev(this.gamepadController);
        }
        this._startNavLoop();
    }
    hide() {
        this.hidden = true;
        if (this._listeningAction) {
            this.gamepadController?.cancelCapture();
            this._listeningAction = null;
        }
        if (this.gamepadController) {
            this.gamepadController.menuActive = false;
        }
        this._stopNavLoop();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopNavLoop();
        if (this.gamepadController) {
            this.gamepadController.menuActive = false;
        }
    }
    _startNavLoop() {
        if (this._rafId !== null)
            return;
        const loop = () => {
            this._rafId = requestAnimationFrame(loop);
            this._pollNavigation();
        };
        this._rafId = requestAnimationFrame(loop);
    }
    _stopNavLoop() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
    _pollNavigation() {
        const gp = this.gamepadController;
        if (!gp || !gp.userData.connected)
            return;
        // While listening for a rebind, the next button press is consumed by the
        // capture callback — don't double-handle navigation. Still update prev
        // button state so we don't fire a stale rising edge on the next frame.
        if (this._listeningAction !== null) {
            this._navUpdatePrev(gp);
            return;
        }
        // Left stick Y for focus movement (rising-edge debounced).
        const [, ly] = gp.getAxes();
        const THRESH = 0.5;
        if (ly < -THRESH && this._prevStickY >= -THRESH) {
            this._moveFocus(-1);
        }
        else if (ly > THRESH && this._prevStickY <= THRESH) {
            this._moveFocus(1);
        }
        this._prevStickY = ly;
        // D-pad up/down for focus movement.
        if (this._navJustPressed(gp, 12))
            this._moveFocus(-1);
        if (this._navJustPressed(gp, 13))
            this._moveFocus(1);
        // Triggers as alternate up/down.
        if (this._navJustPressed(gp, 6))
            this._moveFocus(-1);
        if (this._navJustPressed(gp, 7))
            this._moveFocus(1);
        // A button (button 0) — activate focused item.
        if (this._navJustPressed(gp, 0))
            this._activateFocused();
        // B button (button 1) — close panel.
        if (this._navJustPressed(gp, 1))
            this.hide();
        // Settings button (whichever is bound to openSettings) — also closes.
        const settingsBtn = this.bindings?.getBinding('openSettings') ?? -1;
        if (settingsBtn >= 0 &&
            settingsBtn !== 0 &&
            settingsBtn !== 1 &&
            this._navJustPressed(gp, settingsBtn)) {
            this.hide();
        }
        this._navUpdatePrev(gp);
    }
    _moveFocus(delta) {
        const max = this._totalItems - 1;
        this._focusedIndex = Math.max(0, Math.min(max, this._focusedIndex + delta));
    }
    _activateFocused() {
        const actions = REBINDABLE_ACTIONS;
        if (this._focusedIndex < actions.length) {
            this._startListening(actions[this._focusedIndex]);
        }
        else if (this._focusedIndex === actions.length) {
            this._resetDefaults();
        }
        else {
            this.hide();
        }
    }
    _refreshSnapshot() {
        if (this.bindings) {
            this._bindingSnapshot = { ...this.bindings.getAllBindings() };
        }
    }
    _startListening(action) {
        this._listeningAction = action;
        this.gamepadController?.captureNextButtonPress((buttonIndex) => {
            this.bindings?.setBinding(action, buttonIndex);
            this._listeningAction = null;
            this._refreshSnapshot();
            // Sync nav prev-buttons to current state so the just-captured press
            // isn't seen as a fresh rising edge by the next nav poll (which would
            // e.g. close the menu when B is bound).
            if (this.gamepadController) {
                this._navUpdatePrev(this.gamepadController);
            }
        });
    }
    _resetDefaults() {
        this.bindings?.resetDefaults();
        this._refreshSnapshot();
    }
    render() {
        const actions = REBINDABLE_ACTIONS;
        const resetIdx = actions.length;
        const closeIdx = actions.length + 1;
        return html `
      <div class="backdrop" @click=${this.hide}></div>
      <div class="panel">
        <h2>🎮 Gamepad Settings</h2>
        ${actions.map((action, i) => {
            const btnIdx = this._bindingSnapshot[action] ?? -1;
            const isListening = this._listeningAction === action;
            const isFocused = this._focusedIndex === i;
            return html `
            <div class="binding-row">
              <span class="action-label">${ACTION_LABELS[action]}</span>
              <button
                class="bind-btn ${isListening ? 'listening' : ''} ${isFocused
                ? 'focused'
                : ''}"
                @click=${() => isListening ? null : this._startListening(action)}
              >
                ${isListening
                ? 'Press button...'
                : btnIdx >= 0
                    ? buttonName(btnIdx)
                    : 'Unbound'}
              </button>
            </div>
          `;
        })}
        <div class="footer">
          <button
            class=${this._focusedIndex === resetIdx ? 'focused' : ''}
            @click=${this._resetDefaults}
          >
            Reset Defaults
          </button>
          <button
            class=${this._focusedIndex === closeIdx ? 'focused' : ''}
            @click=${this.hide}
          >
            Close
          </button>
        </div>
        <div class="hint">
          Stick / D-pad / LT-RT: Navigate · A: Select · B: Close
        </div>
      </div>
    `;
    }
};
__decorate([
    property({ type: Object })
], GamepadSettingsPanel.prototype, "bindings", void 0);
__decorate([
    property({ type: Object })
], GamepadSettingsPanel.prototype, "gamepadController", void 0);
__decorate([
    state()
], GamepadSettingsPanel.prototype, "_listeningAction", void 0);
__decorate([
    state()
], GamepadSettingsPanel.prototype, "_bindingSnapshot", void 0);
__decorate([
    state()
], GamepadSettingsPanel.prototype, "_focusedIndex", void 0);
GamepadSettingsPanel = __decorate([
    customElement('xrblocks-gamepad-settings')
], GamepadSettingsPanel);

let HandPosePanel = class HandPosePanel extends LitElement {
    constructor() {
        super(...arguments);
        this.posePanelRef = createRef();
        // Default to the first hand pose
        this.handPose = Object.values(SimulatorHandPose)[0];
        this.visible = true;
    }
    static { this.styles = css `
    :host {
      position: absolute;
      bottom: 0;
      left: 50%;
      -webkit-transform: translateX(-50%);
      transform: translateX(-50%);
      max-width: calc(100% - 24rem);
      width: fit-content;
    }

    .hand-pose-panel {
      box-sizing: border-box;
      border: none;
      margin: 1rem 0px;
      border-radius: 5rem;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      max-width: 100%;
      width: fit-content;
      height: 3rem;
      text-align: center;
      vertical-align: middle;
      padding-left: 1rem;
      padding-right: 1rem;
      white-space: nowrap;
      overflow-y: hidden;
      overflow-x: scroll;
    }

    .hand-pose-panel::-webkit-scrollbar {
      display: none;
    }

    .hand-pose-button {
      color: #ffffff44;
      font-size: 1.2em;
      line-height: 3rem;
      background: transparent;
      text-align: center;
      vertical-align: middle;
      border: none;
    }

    .hand-pose-button.selected {
      color: #ffffffff;
    }
  `; }
    update(changedProperties) {
        if (changedProperties.has('handPose')) {
            this.onHandPoseChanged();
        }
        super.update(changedProperties);
    }
    sendHandPoseRequest(pose) {
        this.dispatchEvent(new SimulatorHandPoseChangeRequestEvent(pose));
    }
    /**
     * @returns An array of `TemplateResult` objects, one for each hand pose.
     */
    getHandPoseButtons() {
        const buttons = [];
        for (const pose of Object.values(SimulatorHandPose)) {
            const poseName = SIMULATOR_HAND_POSE_NAMES[pose];
            const classes = {
                'hand-pose-button': true,
                selected: this.handPose === pose,
            };
            const clickCall = () => this.sendHandPoseRequest(pose);
            buttons.push(html `
        <button
          class=${classMap(classes)}
          @click=${clickCall}
          data-pose=${pose}
        >
          ${poseName}
        </button>
      `);
        }
        return buttons;
    }
    onHandPoseChanged() {
        this.scrollToCurrentHandPose();
    }
    scrollToCurrentHandPose() {
        const handPosePanel = this.posePanelRef.value;
        if (!handPosePanel)
            return;
        const selectedButton = handPosePanel.querySelector(`.hand-pose-button[data-pose=${this.handPose}]`);
        if (selectedButton) {
            selectedButton.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
            });
        }
    }
    render() {
        if (!this.visible) {
            return html ``;
        }
        const handPoseButtons = this.getHandPoseButtons();
        return html `
      <div class="hand-pose-panel" ${ref(this.posePanelRef)}>
        ${handPoseButtons}
      </div>
    `;
    }
};
__decorate([
    property({ type: String })
], HandPosePanel.prototype, "handPose", void 0);
__decorate([
    property({ type: Boolean })
], HandPosePanel.prototype, "visible", void 0);
HandPosePanel = __decorate([
    customElement('xrblocks-simulator-hand-pose-panel')
], HandPosePanel);

let SimulatorSettingsPanel = class SimulatorSettingsPanel extends LitElement {
    constructor() {
        super(...arguments);
        this.environments = [];
        this.activeEnvironmentIndex = 0;
        this.simulatorMode = SimulatorMode.USER;
        this.instructionsEnabled = false;
        this.handPhysicsAvailable = false;
        this.handPhysicsEnabled = false;
        this._isOpen = false;
    }
    static { this.styles = css `
    :host {
      position: fixed;
      bottom: 0;
      left: 0;
      z-index: 10000;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
    }

    .settings-btn {
      border: none;
      margin: 1rem;
      width: 3rem;
      height: 3rem;
      border-radius: 5rem;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .settings-btn:hover {
      background: rgba(0, 0, 0, 0.7);
    }

    .settings-btn svg {
      width: 1.5rem;
      height: 1.5rem;
      fill: currentColor;
      transition: transform 0.3s ease;
    }

    .settings-btn.open svg {
      transform: rotate(45deg);
    }

    .panel {
      position: absolute;
      bottom: 4.5rem;
      left: 1rem;
      background: rgba(0, 0, 0, 0.7);
      border: none;
      border-radius: 1.5rem;
      padding: 1.5rem;
      min-width: 16rem;
      color: #fff;
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: all 0.3s ease;
      backdrop-filter: blur(8px);
    }

    .panel.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    h3 {
      margin: 0 0 1rem;
      font-size: 1.1rem;
      font-weight: 500;
      color: #fff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 0.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-group:last-of-type {
      margin-bottom: 0;
    }

    label {
      font-size: 0.85rem;
      color: #ccc;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      cursor: pointer;
    }

    .checkbox-label:has(input:disabled) {
      cursor: not-allowed;
      opacity: 0.5;
    }

    input[type='checkbox'] {
      width: 1rem;
      height: 1rem;
      margin: 0;
      accent-color: #8ab4f8;
      cursor: inherit;
    }

    select {
      appearance: none;
      -webkit-appearance: none;
      background: rgba(0, 0, 0, 0.5)
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")
        no-repeat right 0.5rem center;
      background-size: 1rem;
      border: none;
      color: #fff;
      padding: 0.5rem 2.2rem 0.5rem 1.2rem;
      border-radius: 5rem;
      font-size: 0.9rem;
      outline: none;
      cursor: pointer;
    }

    select:hover,
    select:focus {
      background-color: rgba(0, 0, 0, 0.8);
    }

    option {
      background: #222;
      color: #fff;
    }

    .instructions-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      padding: 0.6rem 1.2rem;
      border-radius: 5rem;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition:
        background-color 0.2s ease,
        border-color 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .instructions-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .instructions-btn:active {
      background: rgba(255, 255, 255, 0.15);
    }
  `; }
    _togglePanel() {
        this._isOpen = !this._isOpen;
    }
    _onEnvironmentChange(e) {
        const select = e.target;
        const idx = parseInt(select.value, 10);
        this.activeEnvironmentIndex = idx;
        this.dispatchEvent(new SetSimulatorEnvironmentEvent(idx));
    }
    _onModeChange(e) {
        const select = e.target;
        const newMode = select.value;
        this.simulatorMode = newMode;
        this.dispatchEvent(new SetSimulatorModeEvent(newMode));
    }
    _onHandPhysicsChange(e) {
        const input = e.target;
        this.handPhysicsEnabled = input.checked;
        this.dispatchEvent(new SetSimulatorHandPhysicsEvent(this.handPhysicsEnabled));
    }
    _onShowInstructions() {
        this._isOpen = false;
        this.dispatchEvent(new ShowSimulatorInstructionsEvent());
    }
    render() {
        const modes = [
            { label: 'User', value: SimulatorMode.USER },
            { label: 'Navigation', value: SimulatorMode.POSE },
            { label: 'Hands', value: SimulatorMode.CONTROLLER },
            { label: 'Pointer Lock', value: SimulatorMode.POINTER_LOCK },
            { label: 'Editor', value: SimulatorMode.EDITOR },
        ];
        return html `
      <button
        class="settings-btn ${this._isOpen ? 'open' : ''}"
        @click=${this._togglePanel}
        title="Simulator Settings"
      >
        <svg viewBox="0 0 24 24">
          <path
            d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
          />
        </svg>
      </button>

      <div class="panel ${this._isOpen ? 'open' : ''}">
        <h3>Simulator Settings</h3>

        <div class="form-group">
          <label>AR Simulation Environment</label>
          <select @change=${this._onEnvironmentChange}>
            ${this.environments.map((env, idx) => html `
                <option
                  value=${idx}
                  ?selected=${idx === this.activeEnvironmentIndex}
                >
                  ${env.name ?? env.manifestPath.split('/').pop()}
                </option>
              `)}
          </select>
        </div>

        <div class="form-group">
          <label>Interaction Mode</label>
          <select @change=${this._onModeChange}>
            ${modes.map((mode) => html `
                <option
                  value=${mode.value}
                  ?selected=${mode.value === this.simulatorMode}
                >
                  ${mode.label}
                </option>
              `)}
          </select>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <span>Hand Physics</span>
            <input
              type="checkbox"
              .checked=${this.handPhysicsEnabled}
              ?disabled=${!this.handPhysicsAvailable}
              @change=${this._onHandPhysicsChange}
            />
          </label>
        </div>

        ${this.instructionsEnabled
            ? html `
              <div class="form-group">
                <button
                  class="instructions-btn"
                  @click=${this._onShowInstructions}
                >
                  View Simulator Instructions
                </button>
              </div>
            `
            : ''}
      </div>
    `;
    }
};
__decorate([
    property({ type: Array })
], SimulatorSettingsPanel.prototype, "environments", void 0);
__decorate([
    property({ type: Number })
], SimulatorSettingsPanel.prototype, "activeEnvironmentIndex", void 0);
__decorate([
    property({ type: String })
], SimulatorSettingsPanel.prototype, "simulatorMode", void 0);
__decorate([
    property({ type: Boolean })
], SimulatorSettingsPanel.prototype, "instructionsEnabled", void 0);
__decorate([
    property({ type: Boolean })
], SimulatorSettingsPanel.prototype, "handPhysicsAvailable", void 0);
__decorate([
    property({ type: Boolean })
], SimulatorSettingsPanel.prototype, "handPhysicsEnabled", void 0);
__decorate([
    state()
], SimulatorSettingsPanel.prototype, "_isOpen", void 0);
SimulatorSettingsPanel = __decorate([
    customElement('xrblocks-simulator-settings')
], SimulatorSettingsPanel);
//# sourceMappingURL=SimulatorElements.js.map

import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import { state } from 'lit/decorators/state.js';
import { buttonName } from './GamepadToast.js';

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

export { GamepadSettingsPanel };

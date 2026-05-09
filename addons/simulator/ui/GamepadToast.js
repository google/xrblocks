import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';

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

export { GamepadToast, buttonName };

import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import * as xb from 'xrblocks';

let SimulatorModeIndicator = class SimulatorModeIndicator extends LitElement {
    constructor() {
        super(...arguments);
        this.simulatorMode = xb.SimulatorMode.USER;
    }
    static { this.styles = css `
    :host {
        position: absolute;
        bottom: 0;
        right: 0;
    }

    .mode-name-container {
        border: none;
        margin: 1rem;
        border-radius: 5rem;
        background:rgba(0, 0, 0, 0.5);
        color: #FFF;
        width: 10rem;
        height: 3rem;
        text-align: center;
        vertical-align: middle;
        line-height: 3rem;
        font-size: 1.2em;
    }
  `; }
    getModeName() {
        return this.simulatorMode;
    }
    setSimulatorMode(newMode) {
        this.dispatchEvent(new xb.SetSimulatorModeEvent(newMode));
    }
    onClick() {
        this.setSimulatorMode(xb.NEXT_SIMULATOR_MODE[this.simulatorMode]);
        this.blur(); // Removes focus from the button after click
    }
    render() {
        return html `
        <button class="mode-name-container" @click=${this.onClick.bind(this)}>
            ${this.getModeName()}
        </button>
    `;
    }
};
__decorate([
    property({ type: String })
], SimulatorModeIndicator.prototype, "simulatorMode", void 0);
SimulatorModeIndicator = __decorate([
    customElement('xrblocks-simulator-mode-indicator')
], SimulatorModeIndicator);

export { SimulatorModeIndicator };

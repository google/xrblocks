import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import './CustomInstruction.js';
import './HandsInstructions.js';
import './NavigationInstructions.js';
import './UserInstructions.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import { SimulatorInstructionsNextEvent, SimulatorInstructionsCloseEvent } from './SimulatorInstructionsEvents.js';
import './SimulatorInstructionsCard.js';
import 'xrblocks';

let SimulatorInstructions = class SimulatorInstructions extends LitElement {
    static { this.styles = css `
    :host {
        background: #000000AA;
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
            html `
      <xrblocks-simulator-user-instructions />`,
            html `
      <xrblocks-simulator-navigation-instructions />`,
            html `
      <xrblocks-simulator-hands-instructions />`
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
        return this.step < this.steps.length ?
            this.steps[this.step] :
            html `<xrblocks-simulator-custom-instruction .customInstruction=${this.customInstructions[this.step - this.steps.length]} />`;
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

export { SimulatorInstructions };

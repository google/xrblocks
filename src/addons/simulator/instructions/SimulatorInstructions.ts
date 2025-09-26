import './CustomInstruction.js';
import './HandsInstructions.js';
import './NavigationInstructions.js';
import './UserInstructions.js';

import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';

import type {SimulatorCustomInstruction} from '../../../simulator/SimulatorOptions.js';

import {SimulatorInstructionsCloseEvent, SimulatorInstructionsNextEvent} from './SimulatorInstructionsEvents.js';

@customElement('xrblocks-simulator-instructions')
export class SimulatorInstructions extends LitElement {
  static styles = css`
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
  `;

  steps = [
    html`
      <xrblocks-simulator-user-instructions />`,
    html`
      <xrblocks-simulator-navigation-instructions />`,
    html`
      <xrblocks-simulator-hands-instructions />`
  ];

  @property() customInstructions: SimulatorCustomInstruction[] = [];

  @property() step = 0;

  constructor() {
    super();
    this.addEventListener(
        SimulatorInstructionsNextEvent.type,
        this.continueButtonClicked.bind(this));
    this.addEventListener(
        SimulatorInstructionsCloseEvent.type,
        this.closeInstructions.bind(this));
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
        html`<xrblocks-simulator-custom-instruction .customInstruction=${
            this.customInstructions[this.step - this.steps.length]} />`;
  }
}

import './CustomInstruction.js';
import './HandsInstructions.js';
import './NavigationInstructions.js';
import './UserInstructions.js';

import {css, html, LitElement, type TemplateResult} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';
import {
  SimulatorMode,
  type SimulatorCustomInstruction,
} from '../../../SimulatorOptions.js';

import {
  SimulatorInstructionsCloseEvent,
  SimulatorInstructionsNextEvent,
} from './SimulatorInstructionsEvents.js';

@customElement('xrblocks-simulator-instructions')
export class SimulatorInstructions extends LitElement {
  static styles = css`
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
  `;

  @property() simulatorMode?: SimulatorMode;

  @property() customInstructions: SimulatorCustomInstruction[] = [];

  @property() step = 0;

  getSteps(): TemplateResult[] {
    const isSinglePage = this.customInstructions.length === 0;
    const buttonText = isSinglePage ? 'Close' : 'Continue';

    if (this.simulatorMode) {
      switch (this.simulatorMode) {
        case SimulatorMode.USER:
        case SimulatorMode.EDITOR:
        case SimulatorMode.POINTER_LOCK:
          return [
            html`<xrblocks-simulator-user-instructions
              .continueButtonText=${buttonText}
            />`,
          ];
        case SimulatorMode.POSE:
          return [
            html`<xrblocks-simulator-navigation-instructions
              .continueButtonText=${buttonText}
            />`,
          ];
        case SimulatorMode.CONTROLLER:
          return [
            html`<xrblocks-simulator-hands-instructions
              .continueButtonText=${buttonText}
            />`,
          ];
      }
    }

    return [
      html`<xrblocks-simulator-user-instructions />`,
      html`<xrblocks-simulator-navigation-instructions />`,
      html`<xrblocks-simulator-hands-instructions
        .continueButtonText=${buttonText}
      />`,
    ];
  }

  constructor() {
    super();
    this.addEventListener(
      SimulatorInstructionsNextEvent.type,
      this.continueButtonClicked.bind(this)
    );
    this.addEventListener(
      SimulatorInstructionsCloseEvent.type,
      this.closeInstructions.bind(this)
    );
  }

  closeInstructions() {
    this.remove();
  }

  continueButtonClicked() {
    const steps = this.getSteps();
    if (this.step + 1 >= steps.length + this.customInstructions.length) {
      this.closeInstructions();
      return;
    }
    this.step++;
  }

  render() {
    const steps = this.getSteps();
    return this.step < steps.length
      ? steps[this.step]
      : html`<xrblocks-simulator-custom-instruction
          .customInstruction=${this.customInstructions[
            this.step - steps.length
          ]}
        />`;
  }
}

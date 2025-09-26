import {html} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';

import type {SimulatorCustomInstruction} from '../../../simulator/SimulatorOptions.js';

import {SimulatorInstructionsCard} from './SimulatorInstructionsCard.js';

@customElement('xrblocks-simulator-custom-instruction')
export class CustomInstruction extends SimulatorInstructionsCard {
  @property() customInstruction!: SimulatorCustomInstruction;

  getHeaderContents() {
    return html`${this.customInstruction.header}`;
  }

  getImageContents() {
    return this.customInstruction.videoSrc ? html`
      <video playsinline autoplay muted loop>
          <source
            src=${this.customInstruction.videoSrc}
            type="video/webm">
          Your browser does not support the video tag.
      </video>
    ` :
                                             html``;
  }

  getDescriptionContents() {
    return html`${this.customInstruction.description}`;
  }

  render() {
    return super.render();
  }
}

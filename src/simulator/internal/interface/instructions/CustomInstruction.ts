import {html} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';
import type {SimulatorCustomInstruction} from '../../../SimulatorOptions.js';

import {SimulatorInstructionsCard} from './SimulatorInstructionsCard.js';

@customElement('xrblocks-simulator-custom-instruction')
export class CustomInstruction extends SimulatorInstructionsCard {
  @property() customInstruction!: SimulatorCustomInstruction;

  getHeaderContents() {
    return html`<h1>${this.customInstruction.header}</h1>`;
  }

  getImageContents() {
    return this.customInstruction.videoSrc
      ? html`
          <video playsinline autoplay muted loop>
            <source src=${this.customInstruction.videoSrc} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        `
      : html``;
  }

  getDescriptionContents() {
    return html`<p>${this.customInstruction.description}</p>`;
  }

  render() {
    return super.render();
  }
}

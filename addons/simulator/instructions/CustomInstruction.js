import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { property } from 'lit/decorators/property.js';
import { SimulatorInstructionsCard } from './SimulatorInstructionsCard.js';
import './SimulatorInstructionsEvents.js';

let CustomInstruction = class CustomInstruction extends SimulatorInstructionsCard {
    getHeaderContents() {
        return html `${this.customInstruction.header}`;
    }
    getImageContents() {
        return this.customInstruction.videoSrc ? html `
      <video playsinline autoplay muted loop>
          <source
            src=${this.customInstruction.videoSrc}
            type="video/webm">
          Your browser does not support the video tag.
      </video>
    ` :
            html ``;
    }
    getDescriptionContents() {
        return html `${this.customInstruction.description}`;
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

export { CustomInstruction };

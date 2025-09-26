import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import { SimulatorInstructionsNextEvent, SimulatorInstructionsCloseEvent } from './SimulatorInstructionsEvents.js';

let SimulatorInstructionsCard = class SimulatorInstructionsCard extends LitElement {
    static { this.styles = css `
      :host {
          position: relative;
          box-sizing: border-box;
          background: #FFFFFF;
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
        return html `
            <h1>Welcome to XR Blocks!</h1>
        `;
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
        <div class="header-div">
          ${this.getHeaderContents()}
        </div>
        <div class="image-div">
          ${this.getImageContents()}
        </div>
        <div class="description-div">
          ${this.getDescriptionContents()}
        </div>
        <button type="button" @click=${this.continueButtonClicked}>Continue</button>
      `;
    }
};
SimulatorInstructionsCard = __decorate([
    customElement('xrblocks-simulator-instructions-card')
], SimulatorInstructionsCard);

export { SimulatorInstructionsCard };

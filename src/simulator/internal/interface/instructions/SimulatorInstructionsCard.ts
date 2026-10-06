import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';

import {
  SimulatorInstructionsCloseEvent,
  SimulatorInstructionsNextEvent,
} from './SimulatorInstructionsEvents.js';

@customElement('xrblocks-simulator-instructions-card')
export class SimulatorInstructionsCard extends LitElement {
  @property({type: String}) continueButtonText = 'Continue';

  static styles = css`
    :host {
      position: relative;
      box-sizing: border-box;
      background: #ffffff;
      display: flex;
      /* Fixed popup size shared by every instruction card, sized to fit the
         tallest card's content without a scrollbar; scrolling remains only
         as a fallback for very short windows. */
      height: 36rem;
      width: 30rem;
      max-height: 100%;
      overflow-y: auto;
      overflow-wrap: break-word;
      border-radius: 1.6rem;
      color: #000000;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      font-size: 0.875rem;
      line-height: 1.35;
      padding: 1.25rem;
      flex-direction: column;
    }

    h1 {
      margin-top: 0px;
      font-size: 1.25rem;
    }

    h2 {
      margin-top: 0px;
      margin-bottom: 0px;
      font-size: 1rem;
    }

    ul {
      margin-top: 0.2rem;
      margin-bottom: 0px;
      padding-left: 1.25rem;
    }

    .image-div {
      margin-top: 0.4rem;
      margin-bottom: 0.4rem;
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
      font-family: inherit;
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
      display: block;
      /* Fixed demo-video size shared by every instruction card. */
      width: 20.25rem;
      height: auto;
      margin: 0 auto;
      max-width: 100%;
      aspect-ratio: 16/9;
    }

    p {
      margin-top: 0px;
      margin-bottom: 0px;
    }
  `;

  continueButtonClicked() {
    this.dispatchEvent(new SimulatorInstructionsNextEvent());
  }

  closeButtonClicked() {
    this.dispatchEvent(new SimulatorInstructionsCloseEvent());
  }

  getHeaderContents() {
    return html` <h1>Welcome to XR Blocks!</h1> `;
  }

  getImageContents() {
    return html``;
  }

  getDescriptionContents() {
    return html``;
  }

  render() {
    return html`
      <button class="close-button" @click=${this.closeButtonClicked}>X</button>
      <div class="header-div">${this.getHeaderContents()}</div>
      <div class="image-div">${this.getImageContents()}</div>
      <div class="description-div">${this.getDescriptionContents()}</div>
      <button type="button" @click=${this.continueButtonClicked}>
        ${this.continueButtonText}
      </button>
    `;
  }
}

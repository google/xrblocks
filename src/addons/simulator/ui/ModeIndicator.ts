import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import {property} from 'lit/decorators/property.js';
import * as xb from 'xrblocks';

@customElement('xrblocks-simulator-mode-indicator')
export class SimulatorModeIndicator extends LitElement {
  static styles = css`
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
  `;

  @property({type: String}) simulatorMode = xb.SimulatorMode.USER;

  getModeName() {
    return this.simulatorMode;
  }

  setSimulatorMode(newMode: xb.SimulatorMode) {
    this.dispatchEvent(new xb.SetSimulatorModeEvent(newMode))
  }

  onClick() {
    this.setSimulatorMode(xb.NEXT_SIMULATOR_MODE[this.simulatorMode]);
    this.blur();  // Removes focus from the button after click
  }

  render() {
    return html`
        <button class="mode-name-container" @click=${this.onClick.bind(this)}>
            ${this.getModeName()}
        </button>
    `;
  }
}

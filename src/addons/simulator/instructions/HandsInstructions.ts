import {html} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';
import * as xb from 'xrblocks';

import {SimulatorInstructionsCard} from './SimulatorInstructionsCard.js';

const SIMULATOR_HANDS_VIDEO_PATH = xb.XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_hands.webm';

@customElement('xrblocks-simulator-hands-instructions')
export class HandsInstructions extends SimulatorInstructionsCard {
  getImageContents() {
    return html`
      <video playsinline autoplay muted loop>
          <source
            src="${SIMULATOR_HANDS_VIDEO_PATH}"
            type="video/webm">
          Your browser does not support the video tag.
      </video>
    `;
  }

  getDescriptionContents() {
    return html`
      <h2>Hands Mode</h2>
      <p>
        From Navigation Mode, press <strong>Left Shift</strong> to enter <strong>Hands Mode</strong>.
        This mode allows for precise manipulation of virtual hands.
      </p>
      <ul>
          <li><strong>Move Hand:</strong> Use the W, A, S, D keys to move it forward, left, backward, and right.</li>
          <li><strong>Elevate Hand:</strong> Use the Q (up) and E (down) keys.</li>
          <li><strong>Switch Active Hand:</strong> Press the T key to toggle between hands.</li>
          <li><strong>Simulate Pinch:</strong> Press the Spacebar.</li>
      </ul>
    `;
  }
}

import {html} from 'lit';
import {customElement} from 'lit/decorators/custom-element.js';

import {XR_BLOCKS_ASSETS_PATH} from '../../../../constants.js';

import {SimulatorInstructionsCard} from './SimulatorInstructionsCard.js';

const SIMULATOR_HANDS_VIDEO_PATH =
  XR_BLOCKS_ASSETS_PATH +
  'simulator/instructions/xr_blocks_simulator_hands.webm';

@customElement('xrblocks-simulator-hands-instructions')
export class HandsInstructions extends SimulatorInstructionsCard {
  getImageContents() {
    return html`
      <video playsinline autoplay muted loop>
        <source src="${SIMULATOR_HANDS_VIDEO_PATH}" type="video/webm" />
        Your browser does not support the video tag.
      </video>
    `;
  }

  getDescriptionContents() {
    return html`
      <h2>Hands Mode</h2>
      <p>
        Hands Mode allows for precise manipulation of virtual hands while
        navigating the environment.
      </p>
      <ul>
        <li>
          <strong>Move Around:</strong> Hold Left Shift and use the W, A, S, D
          keys to navigate.
        </li>
        <li><strong>Look Around:</strong> Right-click and drag the mouse.</li>
        <li><strong>Rotate Hand:</strong> Left-click and drag the mouse.</li>
        <li><strong>Move Hand:</strong> Use the W, A, S, D keys.</li>
        <li>
          <strong>Elevate Hand:</strong> Use the Q (up) and E (down) keys.
        </li>
        <li>
          <strong>Switch Active Hand:</strong> Press the T key to toggle between
          hands.
        </li>
        <li><strong>Simulate Pinch:</strong> Press the Spacebar.</li>
      </ul>
    `;
  }
}

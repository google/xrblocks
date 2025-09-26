import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import * as xb from 'xrblocks';
import { SimulatorInstructionsCard } from './SimulatorInstructionsCard.js';
import './SimulatorInstructionsEvents.js';

const SIMULATOR_NAVIGATION_VIDEO_PATH = xb.XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_navigation.webm';
let NavigationInstructions = class NavigationInstructions extends SimulatorInstructionsCard {
    getImageContents() {
        return html `
      <video playsinline autoplay muted loop>
          <source
            src=${SIMULATOR_NAVIGATION_VIDEO_PATH}
            type="video/webm">
          Your browser does not support the video tag.
      </video>
    `;
    }
    getDescriptionContents() {
        return html `
      <h2>Navigation Mode</h2>
      <p>
        Press <strong>Left Shift</strong> to toggle Navigation Mode.
        In this mode, virtual hands appear and the mouse controls the camera view.
      </p>
      <ul>
          <li><strong>Move Forward/Backward/Sideways:</strong> Use the W, A, S, D keys.</li>
          <li><strong>Move Up/Down:</strong> Use the Q and E keys.</li>
          <li><strong>Rotate Camera:</strong> Click and drag the mouse.</li>
      </ul>
    `;
    }
};
NavigationInstructions = __decorate([
    customElement('xrblocks-simulator-navigation-instructions')
], NavigationInstructions);

export { NavigationInstructions };

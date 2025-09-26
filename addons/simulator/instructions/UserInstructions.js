import { _ as __decorate } from '../../../tslib.es6--gQC4x5c.js';
import { html } from 'lit';
import { customElement } from 'lit/decorators/custom-element.js';
import * as xb from 'xrblocks';
import { SimulatorInstructionsCard } from './SimulatorInstructionsCard.js';
import './SimulatorInstructionsEvents.js';

const SIMULATOR_USER_VIDEO_PATH = xb.XR_BLOCKS_ASSETS_PATH +
    'simulator/instructions/xr_blocks_simulator_user.webm';
let UserInstructions = class UserInstructions extends SimulatorInstructionsCard {
    getImageContents() {
        return html `
      <video playsinline autoplay muted loop>
          <source
            src=${SIMULATOR_USER_VIDEO_PATH}
            type="video/webm">
          Your browser does not support the video tag.
      </video>
    `;
    }
    getDescriptionContents() {
        return html `
        <h2>User Mode</h2>
        <p>
          The simulator starts in <strong>User Mode</strong> by default.
          This mode is for moving the camera and interacting directly with scene objects.
        </p>
        <ul>
            <li><strong>Move Forward/Backward/Sideways:</strong> Use the W, A, S, D keys.</li>
            <li><strong>Move Up/Down:</strong> Use the Q and E keys.</li>
            <li><strong>Rotate Camera:</strong> Hold the right mouse button and drag.</li>
            <li><strong>Select Object:</strong> Left-click the mouse.</li>
        </ul>
    `;
    }
};
UserInstructions = __decorate([
    customElement('xrblocks-simulator-user-instructions')
], UserInstructions);

export { UserInstructions };

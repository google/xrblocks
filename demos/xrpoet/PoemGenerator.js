import * as xb from 'xrblocks';
import {TorusKnotLoadingAnimation} from './TorusKnotLoadingAnimation.js';

export class PoemGenerator extends xb.Script {
  constructor() {
    super();
    this.panel = null;
    this.isProcessing = false;
    this.responseDisplay = null;
    this.button = null;
    this.loadingSpinner = null;
    this.poemGenerated = false;
    this.hasError = false;
  }

  init() {
    this.ai = xb.core.ai;
    this.deviceCamera = xb.core.deviceCamera;

    this.createPanel();
  }

  createPanel() {
    this.panel = new xb.SpatialPanel({
      width: 2.0,
      height: 1.25,
      backgroundColor: '#1a1a1abb',
    });
    this.panel.position.set(0, 1.6, -2);
    this.add(this.panel);

    const grid = this.panel.addGrid();

    const responseRow = grid.addRow({weight: 0.9});
    this.responseDisplay = new xb.ScrollingTroikaTextView({
      text: '',
      fontSize: 0.03,
    });
    responseRow.add(this.responseDisplay);

    const buttonRow = grid.addRow({weight: 0.2});

    const videoRow = grid.addRow({weight: 0.7});
    this.videoView = new xb.VideoView({
      width: 1.0,
      height: 1.0,
      mode: 'stretch',
    });
    videoRow.add(this.videoView);

    const buttonPanel = buttonRow.addPanel({
      backgroundColor: '#00000000',
      showEdge: false,
    });
    this.button = buttonPanel.addGrid().addIconButton({
      text: 'photo_camera',
      fontSize: 0.6,
      backgroundColor: '#FFFFFF',
      defaultOpacity: 0.2,
      hoverOpacity: 0.8,
      selectedOpacity: 1.0,
    });
    this.button.onTriggered = () => this.captureAndGeneratePoem();

    if (this.deviceCamera) {
      this.videoView.load(this.deviceCamera);
    }

    // Create 3D loading spinner
    this.loadingSpinner = new TorusKnotLoadingAnimation();
    this.panel.add(this.loadingSpinner);
  }

  async captureAndGeneratePoem() {
    if (this.isProcessing || !this.ai?.isAvailable()) return;

    this.isProcessing = true;
    this.hasError = false;

    // Disable button
    if (this.button) {
      this.button.disabled = true;
    }

    // Show loading spinner
    if (this.loadingSpinner) {
      this.loadingSpinner.show();
    }

    try {
      const snapshot = await this.deviceCamera.getSnapshot({
        outputFormat: 'base64',
      });
      if (!snapshot) {
        throw new Error('Failed to capture video snapshot.');
      }
      const {strippedBase64, mimeType} = xb.parseBase64DataURL(snapshot);
      const image = {inlineData: {mimeType: mimeType, data: strippedBase64}};
      const question =
        'Can you write a 12 lined, lighthearted poem about what you see?';
      const parts = [image, {text: question}];

      const response = await this.ai.query({
        type: 'multiPart',
        parts: parts,
      });
      this.responseDisplay.setText(`${response.text}\n\n`);
      this.poemGenerated = true;
    } catch (error) {
      this.responseDisplay.setText(`Error: ${error.message}\n\n`);
      this.hasError = true;
    } finally {
      this.isProcessing = false;
      // Re-enable button
      if (this.button) {
        this.button.disabled = false;
        this.button.update();
      }
    }
  }

  update() {
    if (this.loadingSpinner) {
      this.loadingSpinner.update(this.isProcessing);
    }
  }
}

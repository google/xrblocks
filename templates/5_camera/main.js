import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

/**
 * A class that provides UI to display and cycle through device cameras.
 */
export class CameraViewManager extends xb.Script {
  /** @private {XRDeviceCamera|null} */
  cameraStream_ = null;

  constructor() {
    super();
    this.panel = new xb.SpatialPanel(
        {backgroundColor: '#2b2b2baa', useDefaultPosition: true});
    const grid = this.panel.addGrid();
    this.videoView = grid.addRow({weight: 0.7}).addVideo();
    const txtRow = grid.addRow({weight: 0.15});
    this.cameraLabel =
        txtRow.addCol({weight: 1})
            .addText({text: 'Camera', fontColor: '#ffffff', fontSize: 0.05});
    const ctrlRow = grid.addRow({weight: 0.2});
    this.prevCameraButton = ctrlRow.addCol({weight: 0.5}).addIconButton({
      text: 'skip_previous',
      fontSize: 0.5
    });
    this.nextCameraButton = ctrlRow.addCol({weight: 0.5}).addIconButton({
      text: 'skip_next',
      fontSize: 0.5
    });

    this.prevCameraButton.onTriggered = () => this.cycleCamera_(-1);
    this.nextCameraButton.onTriggered = () => this.cycleCamera_(1);

    this.add(this.panel);
  }

  async init() {
    this.cameraStream_ = xb.core.deviceCamera;

    // Listen for camera state changes to update UI
    this.cameraStream_.addEventListener('statechange', (event) => {
      this.cameraLabel.setText(event.device?.label || event.state || 'Camera');
      if (event.state === 'streaming') {
        this.videoView.load(this.cameraStream_);
      }
    });
    this.cameraLabel.setText(
        this.cameraStream_.getCurrentDevice()?.label || 'Camera');
    this.videoView.load(this.cameraStream_);
  }

  /**
   * Cycle to the next or previous device.
   * @param {number} offset - The direction to cycle (-1 for prev, 1 for next).
   */
  async cycleCamera_(offset) {
    const devices = this.cameraStream_.getAvailableDevices();
    if (devices.length <= 1) return;
    const newIndex =
        (this.cameraStream_.getCurrentDeviceIndex() + offset + devices.length) %
        devices.length;
    await this.cameraStream_.setDeviceId(devices[newIndex].deviceId);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const options = new xb.Options()
  options.enableUI();
  options.enableCamera();
  xb.add(new CameraViewManager());
  xb.init(options);
});

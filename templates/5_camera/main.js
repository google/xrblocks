import * as xb from 'xrblocks';

/**
 * A class that provides UI to display and cycle through device cameras.
 */
export class CameraViewManager extends xb.Script {
  /** @private {XRDeviceCamera|null} */
  cameraStream_ = null;

  constructor() {
    super();
    this.cameraLabel = new xb.UIText({
      text: 'Initializing camera...',
      style: {
        fontSize: 24,
        color: '#ffffff',
        textAlign: 'center',
      },
    });
    this.videoView = new xb.UIImage({
      src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      ariaLabel: 'Live device camera preview',
      style: {
        width: '100%',
        flexGrow: 1,
        minHeight: 180,
        objectFit: 'contain',
        backgroundColor: '#111111',
        borderRadius: 16,
      },
    });
    const controls = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 16},
      children: [
        new xb.UIButton({
          icon: 'skip_previous',
          ariaLabel: 'Use previous camera',
          onClick: () => this.cycleCamera_(-1),
          style: {flexGrow: 1, padding: 14},
        }),
        new xb.UIButton({
          icon: 'skip_next',
          ariaLabel: 'Use next camera',
          onClick: () => this.cycleCamera_(1),
          style: {flexGrow: 1, padding: 14},
        }),
      ],
    });
    this.panel = new xb.UICard({
      size: {width: 0.8, height: 0.68},
      manipulation: true,
      edge: {scale: true},
      style: {
        flexDirection: 'column',
        gap: 16,
        padding: 20,
        backgroundColor: '#2b2b2baa',
        borderRadius: 24,
      },
      children: [this.videoView, this.cameraLabel, controls],
    });
    this.panel.position.set(0, 1.45, -1.2);
    this.add(this.panel);
  }

  async init() {
    this.cameraStream_ = xb.core.deviceCamera;

    // Listen for camera state changes to update UI
    this.onCameraStateChange_ = (event) => {
      const cameraStateLabel = {
        initializing: 'Initializing camera...',
        no_devices_found: 'Camera unsupported on this browser/device',
        error: 'Camera failed to start',
      };
      this.cameraLabel.text =
        event.device?.label || cameraStateLabel[event.state] || 'Camera';
      if (event.state === 'streaming') {
        this.videoView.src = this.cameraStream_.texture;
      }
    };
    this.cameraStream_.addEventListener(
      'statechange',
      this.onCameraStateChange_
    );
    this.cameraLabel.text =
      this.cameraStream_.getCurrentDevice()?.label || 'Camera';
    this.videoView.src = this.cameraStream_.texture;
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

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.enableCamera();
  xb.add(new CameraViewManager());
  xb.init(options);
});

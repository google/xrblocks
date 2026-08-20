import * as xb from 'xrblocks';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

class CameraView extends xb.Script {
  init() {
    this.preview = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Live device camera preview',
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: '#111111',
        borderRadius: 16,
      },
    });
    this.cameraLabel = new xb.UIText({
      text: 'Camera',
      style: {fontSize: 18, textAlign: 'center'},
    });
    this.previousButton = new xb.UIButton({
      icon: 'skip_previous',
      ariaLabel: 'Previous camera',
      style: {flexGrow: 1},
      onClick: () => void this.cycleCamera(-1),
    });
    this.nextButton = new xb.UIButton({
      icon: 'skip_next',
      ariaLabel: 'Next camera',
      style: {flexGrow: 1},
      onClick: () => void this.cycleCamera(1),
    });
    const controls = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        borderRadius: 12,
        backgroundColor: '#111111aa',
        zIndex: 1,
      },
      children: [
        this.cameraLabel,
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'row', gap: 8},
          children: [this.previousButton, this.nextButton],
        }),
      ],
    });
    const card = new xb.UICard({
      size: {width: 0.5, height: 0.6},
      manipulation: true,
      style: {
        justifyContent: 'flex-end',
        padding: 16,
        overflow: 'hidden',
        borderRadius: 16,
      },
      children: [this.preview, controls],
    });
    card.position.set(0, 1.45, -1.2);
    this.add(card);

    this.camera = xb.core.deviceCamera;
    this.onStateChange = (event) => this.updateState(event);
    this.camera.addEventListener('statechange', this.onStateChange);
    this.cameraLabel.text = this.camera.getCurrentDevice()?.label || 'Camera';
    if (this.camera.state === 'streaming')
      this.preview.src = this.camera.texture;
  }

  updateState(event) {
    const stateLabels = {
      initializing: 'Initializing camera…',
      no_devices_found: 'Camera unavailable',
      error: 'Camera failed to start',
    };
    this.cameraLabel.text =
      event.device?.label || stateLabels[event.state] || 'Camera';
    if (event.state === 'streaming') this.preview.src = this.camera.texture;
  }

  async cycleCamera(offset) {
    const devices = this.camera.getAvailableDevices();
    if (devices.length <= 1) return;

    const nextIndex =
      (this.camera.getCurrentDeviceIndex() + offset + devices.length) %
      devices.length;
    await this.camera.setDeviceId(devices[nextIndex].deviceId);
  }

  dispose() {
    this.camera?.removeEventListener('statechange', this.onStateChange);
  }
}

const options = new xb.Options();
options.enableCamera();

xb.add(new CameraView());
xb.init(options);

import * as xb from 'xrblocks';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

class CameraView extends xb.Script {
  init() {
    this.preview = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Live device camera preview',
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: '#111111',
        borderRadius: 16,
      },
    });
    const card = new xb.UICard({
      size: {width: 0.8, height: 0.5},
      manipulation: true,
      style: {
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderRadius: 16,
      },
      children: [this.preview],
    });
    card.position.set(0, 1.45, -1.2);
    this.add(card);

    this.camera = xb.core.deviceCamera;
    this.onStateChange = (event) => this.updateState(event);
    this.camera.addEventListener('statechange', this.onStateChange);
    if (this.camera.state === 'streaming')
      this.preview.src = this.camera.texture;
  }

  updateState(event) {
    if (event.state === 'streaming') this.preview.src = this.camera.texture;
  }

  dispose() {
    this.camera?.removeEventListener('statechange', this.onStateChange);
  }
}

const options = new xb.Options();
options.enableCamera();

xb.add(new CameraView());
xb.init(options);

import * as xb from 'xrblocks';

import {MagicWindow} from '../../../demos/magic_window/MagicWindow.js';

class SegmentationControls extends xb.Script {
  constructor(windowView) {
    super();
    this.windowView = windowView;
    this.lastStatus = '';
  }

  init() {
    this.backdrop = new xb.UIText({
      text: `Backdrop · ${this.windowView.backdropName}`,
      style: {fontSize: 18, textAlign: 'center'},
    });
    this.status = new xb.UIText({
      text: 'Waiting for the camera and segmentation model…',
      style: {
        fontSize: 15,
        lineHeight: 1.35,
        textAlign: 'center',
      },
    });

    const card = new xb.UICard({
      size: {width: 0.58, height: 0.37},
      manipulation: true,
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'Person segmentation',
          style: {
            fontSize: 27,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        new xb.UIText({
          text: 'Camera pixels classified as a person remain visible. Background pixels use the selected backdrop.',
          style: {
            fontSize: 14,
            lineHeight: 1.3,
            textAlign: 'center',
          },
        }),
        this.status,
        this.backdrop,
        new xb.UIButton({
          label: 'Change backdrop',
          icon: 'image',
          onClick: () => this.cycleBackdrop(),
        }),
      ],
    });
    card.position.set(0, 0.92, -1.0);
    this.add(card);
  }

  cycleBackdrop() {
    this.windowView.cycleBackdrop();
    this.backdrop.text = `Backdrop · ${this.windowView.backdropName}`;
  }

  update() {
    const mask = xb.core.world?.segmentation?.latestMask;
    const nextStatus = mask
      ? `Live mask · ${mask.width} × ${mask.height}`
      : 'Waiting for the camera and segmentation model…';
    if (nextStatus === this.lastStatus) return;
    this.lastStatus = nextStatus;
    this.status.text = nextStatus;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const windowView = new MagicWindow();
  xb.add(windowView);
  xb.add(new SegmentationControls(windowView));

  const options = new xb.Options();
  options.enableSegmentation();
  options.enableCamera('user');
  options.enableReticles();
  options.setAppTitle('Avatar Lab · Person Segmentation');
  options.setAppDescription(
    'Segment a person from the camera feed and composite a new background.'
  );
  options.xrButton.showEnterSimulatorButton = true;
  await xb.init(options);
});

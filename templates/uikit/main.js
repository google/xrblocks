import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as uikit from '@pmndrs/uikit';
import * as xb from 'xrblocks';

import {MaterialSymbolsIcon} from './MaterialSymbolsIcon.js';

class UikitPanel extends xb.Script {
  dragFacingCamera = true;
  draggable = true;
  draggingMode = xb.DragMode.TRANSLATING;
  container;

  constructor() {
    super();
    const panelSize = 0.5;
    this.container = new uikit.Container({
      sizeX: (panelSize * 16) / 9,
      sizeY: panelSize,
      pixelSize: panelSize / 512,
      flexDirection: 'column',
      textAlign: 'center',
      color: 'white',
      fontSize: 64,
      backgroundColor: 'gray',
      borderRadius: 64,
      padding: 16,
    });
    this.add(this.container);
  }

  update() {
    this.container?.update(xb.getDeltaTime());
  }

  onObjectSelectStart(event) {
    this.dispatchEventRecursively(event.target, 'click', this.container);
  }

  dispatchEventRecursively(controller, eventType, object) {
    const intersections = xb.core.input.intersectObjectByController(
      controller,
      object
    );
    if (intersections.length == 0 || !(object instanceof uikit.Component)) {
      return;
    }
    for (const child of object.children) {
      this.dispatchEventRecursively(controller, eventType, child);
    }
    const intersection = intersections[0];
    object.dispatchEvent({
      type: 'click',
      distance: intersection.distance,
      nativeEvent: {},
      object: intersection.object,
      point: intersection.point,
      pointerId: controller.userData.id,
    });
  }
}

/**
 * UIKit Template
 */
class UikitTemplate extends xb.Script {
  constructor() {
    super();

    const spatialPanel = new UikitPanel();
    spatialPanel.position.set(0, 1.5, -1);
    this.add(spatialPanel);

    const topRow = new uikit.Text({
      text: 'XR Blocks x @pmndrs/uikit',
      flexGrow: 2,
    });
    spatialPanel.container.add(topRow);

    const bottomRow = new uikit.Container({
      flexDirection: 'row',
      flexGrow: 1,
      justifyContent: 'space-evenly',
      gap: 64,
    });
    spatialPanel.container.add(bottomRow);

    const yesButton = new MaterialSymbolsIcon({
      icon: 'check_circle',
    });
    yesButton.addEventListener('click', () => {
      console.log('yes button clicked');
    });
    bottomRow.add(yesButton);

    const noButton = new MaterialSymbolsIcon({
      icon: 'x_circle',
    });
    noButton.addEventListener('click', () => {
      console.log('no button clicked');
    });
    bottomRow.add(noButton);
  }
}

const options = new xb.Options();
options.enableUI();

document.addEventListener('DOMContentLoaded', async function () {
  xb.add(new UikitTemplate());
  options.simulator.instructions.enabled = false;
  await xb.init(options);
  const renderer = xb.core.renderer;
  renderer.localClippingEnabled = true;
  renderer.setTransparentSort(uikit.reversePainterSortStable);
});

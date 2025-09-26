import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {TubePainter} from 'three/addons/misc/TubePainter.js';
import * as xb from 'xrblocks';

/**
 * A remixed version of three.js's examples/webxr_xr_paint.html in XR Blocks.
 * PaintDemo is an example script for using pinch to paint in Android XR and
 * using clicks to draw in desktop simulated environments.
 */
class PaintDemo extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, /*intensity=*/ 3));

    // Painting setup.
    this.painters = [];
    this.user = xb.core.user;

    for (let i = 0; i < this.user.controllers.length; ++i) {
      const painter = new TubePainter();
      this.painters.push(painter);
      this.add(painter.mesh);
    }

    // Adds pivotal points to indicate user's intents.
    this.user.enablePivots();
  }

  /**
   * Moves the painter to the pivot position when select starts.
   * @param {XRInputSourceEvent} event
   */
  onSelectStart(event) {
    const id = event.target.userData.id;
    const painter = this.painters[id];
    const cursor = this.user.getPivotPosition(id);
    painter.moveTo(cursor);
  }

  /**
   * Updates the painter's line to the current pivot position during selection.
   * @param {XRInputSourceEvent} event
   */
  onSelecting(event) {
    const id = event.target.userData.id;
    const painter = this.painters[id];
    const cursor = this.user.getPivotPosition(id);
    painter.lineTo(cursor);
    painter.update();
  }

  /**
   * Stores the initial position and scale of the controller when squeeze
   * starts.
   * @param {XRInputSourceEvent} event
   */
  onSqueezeStart(event) {
    const controller = event.target;
    const id = controller.userData.id;
    const data = this.user.data[id].squeeze;

    data.positionOnStart = controller.position.y;
    data.scaleOnStart = controller.position.y;
  }

  /**
   * Updates the scale of the controller's pivot based on the squeeze amount.
   * @param {XRInputSourceEvent} event
   */
  onSqueezing(event) {
    const controller = event.target;
    const id = controller.userData.id;
    const pivot = this.user.getPivot(id);
    const data = this.user.data[id].squeeze;

    const delta = (controller.position.y - data.positionOnStart) * 5;
    const scale = Math.max(0.1, data.scaleOnStart + delta);
    pivot.scale.setScalar(scale);
  }
}

/**
 * Entry point for the application.
 */
function start() {
  const options = new xb.Options();

  xb.add(new PaintDemo());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);

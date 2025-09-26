import * as xb from 'xrblocks';
import {TextBillboard} from 'xrblocks/addons/ui/TextBillboard.js';

class ReticleVisualizer extends xb.Script {
  activeControllerToBillboardMap = new Map();

  init() {
    xb.showReticleOnDepthMesh(true);
  }

  onSelectStart(event) {
    const controller = event.target;
    const intersection =
        xb.core.user.select(xb.core.depth.depthMesh, controller);
    if (!intersection) return;
    const billboard = new TextBillboard();
    this.add(billboard);
    this.activeControllerToBillboardMap.set(controller, billboard);
    this.updateBillboard(controller, billboard);
  }

  onSelectEnd(event) {
    this.activeControllerToBillboardMap.delete(event.target);
  }

  update() {
    this.activeControllerToBillboardMap.forEach((billboard, controller) => {
      this.updateBillboard(controller, billboard);
    });
  }

  updateBillboard(controller, billboard) {
    const intersection =
        xb.core.user.select(xb.core.depth.depthMesh, controller);
    if (intersection) {
      const reticleHeight = intersection.point.y;
      billboard.position.copy(intersection.point);
      billboard.lookAt(xb.core.camera.position);
      billboard.updateText(
          `Distance: ${intersection.distance.toFixed(2)} m\n` +
          `Height: ${reticleHeight.toFixed(2)} m`);
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const options = new xb.Options();
  options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
  xb.add(new ReticleVisualizer());
  xb.init(options)
});

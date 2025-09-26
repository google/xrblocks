import * as THREE from 'three';
import * as xb from 'xrblocks';

import {DepthVisualizationPass} from './DepthVisualizationPass.js';

export class DepthMapScene extends xb.Script {
  init() {
    if (xb.core.effects) {
      this.depthVisualizationPass =
          new DepthVisualizationPass(xb.scene, xb.core.camera);
      xb.core.effects.addPass(this.depthVisualizationPass);
    } else {
      console.error(
          'This sample needs post processing for adding the depth visualization pass. Please enable options.usePostprocessing');
    }

    this.depthMeshAlphaSlider = new xb.FreestandingSlider(1.0, 0.0, 1.0, 10);
    // Which controller is currently controlling depthMeshAlphaSlider.
    this.currentSliderController = null;

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    this.add(light);
  }

  onSelectStart(event) {
    const controller = event.target;
    controller.userData.selected = true;
    this.currentSliderController = controller;
    this.depthMeshAlphaSlider.setInitialPose(
        controller.position, controller.quaternion);
  }

  onSelectEnd(event) {
    const controller = event.target;
    controller.userData.selected = false;
    if (this.currentSliderController == controller) {
      this.depthMeshAlphaSlider.updateValue(
          this.depthMeshAlphaSlider.getValue(controller.position));
    }
    this.currentSliderController = null;
  }

  update() {
    if (this.currentSliderController) {
      const opacity = this.depthMeshAlphaSlider.getValueFromController(
          this.currentSliderController);
      this.depthVisualizationPass.setAlpha(opacity);
    }
    this.depthVisualizationPass.updateEnvironmentalDepthTexture(xb.core.depth);
  }
}

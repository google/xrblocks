import * as THREE from 'three';
import * as xb from 'xrblocks';

class DepthMeshVisualizer extends xb.Script {
  currentSliderController = null;
  depthMeshAlphaSlider = new xb.FreestandingSlider(1.0, 0.0, 1.0, 10);

  constructor() {
    super();
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    this.add(light);
  }

  init() {
    xb.core.depth.depthMesh.material.uniforms.uOpacity.value =
        this.depthMeshAlphaSlider.startingValue;
  }

  onSelectStart(event) {
    this.currentSliderController = event.target;
    this.depthMeshAlphaSlider.setInitialPoseFromController(
        this.currentSliderController);
  }

  onSelectEnd(event) {
    const controller = event.target;
    if (this.currentSliderController == controller) {
      this.depthMeshAlphaSlider.updateValue(
          this.depthMeshAlphaSlider.getValueFromController(controller));
    }
    this.currentSliderController = null;
  }

  update() {
    if (this.currentSliderController) {
      const opacity = this.depthMeshAlphaSlider.getValueFromController(
          this.currentSliderController);
      xb.core.depth.depthMesh.material.uniforms.uOpacity.value = opacity;
      console.log('opacity:' + opacity);
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const options = new xb.Options();
  options.depth = new xb.DepthOptions(xb.xrDepthMeshVisualizationOptions);
  xb.add(new DepthMeshVisualizer());
  xb.init(options)
});

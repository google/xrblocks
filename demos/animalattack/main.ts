import * as xb from 'xrblocks';
import {AnimalOcclusionScene} from './animal_occlusion_scene.js';
async function startApp() {
  const options = new xb.Options().enableDepth().enableReticles();
  const {depthMesh, depthTexture, occlusion} = options.depth;

  depthMesh.updateFullResolutionGeometry = true;
  depthMesh.renderShadow = true;
  depthTexture.enabled = true;
  occlusion.enabled = true;
  options.reticles.projectOnDepthMesh = true;
  options.xrButton.appTitle = 'Animal Attack';
  options.xrButton.appDescription =
    'Place playful animals in your space or clear them with effects.';
  xb.add(new AnimalOcclusionScene());
  await xb.init(options);
}
document.addEventListener('DOMContentLoaded', startApp);

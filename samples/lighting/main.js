import * as xb from 'xrblocks';

import {LightingScene} from './LightingScene.js';

// Set up depth mesh optinos. Need depth mesh to render shadows to.
let options = new xb.Options();
options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
options.depth.enabled = true;
options.depth.depthMesh.enabled = true;
options.depth.depthTexture.enabled = true;
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthMesh.shadowOpacity = 0.6
options.depth.occlusion.enabled = true;

// Set up lighting options.
options.lighting = new xb.LightingOptions(xb.xrLightingOptions);
options.lighting.enabled = true;
options.lighting.useAmbientSH = true;
options.lighting.useDirectionalLight = true;
options.lighting.castDirectionalLightShadow = true;
options.lighting.useDynamicSoftShadow = false;

options.xrButton = {
  ...options.xrButton,
  startText: '<i id="xrlogo"></i> BRING IT TO LIFE',
  endText: '<i id="xrlogo"></i> MISSION COMPLETE'
};
async function start() {
  const lightingScene = new LightingScene();
  await xb.init(options);
  xb.add(lightingScene);
  window.addEventListener(
      'pointerdown', lightingScene.onPointerDown.bind(lightingScene));
}
document.addEventListener('DOMContentLoaded', function() {
  start();
});

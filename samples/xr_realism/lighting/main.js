import * as xb from 'xrblocks';

import {LightingScene} from './LightingScene.js';

// The depth mesh receives the estimated light's shadows and occludes the model.
const options = new xb.Options();
options.reticles.enabled = true;
options.reticles.projectOnDepthMesh = true;
options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthMesh.shadowOpacity = 0.6;
options.depth.depthTexture.enabled = true;
options.depth.occlusion.enabled = true;

// Set up lighting options.
options.lighting = new xb.LightingOptions();
options.lighting.enabled = true;
options.lighting.useAmbientSH = true;
options.lighting.useDirectionalLight = true;
options.lighting.castDirectionalLightShadow = true;
options.lighting.useDynamicSoftShadow = false;

options.setAppTitle('Lighting Estimation');

async function start() {
  const lightingScene = new LightingScene();
  xb.add(lightingScene);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});

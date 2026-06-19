import 'xrblocks/addons/simulator/SimulatorAddons.js';

import {html} from 'lit';
import * as xb from 'xrblocks';

import {ModelViewerScene} from './ModelViewerScene.js';

document.addEventListener('DOMContentLoaded', async () => {
  const modelViewerScene = new ModelViewerScene();
  xb.add(modelViewerScene);
  const options = new xb.Options();
  options.simulator.instructions.customInstructions = [
    {
      header: html`<h1>Model Viewer</h1>`,
      videoSrc:
        xb.XR_BLOCKS_ASSETS_PATH +
        'samples/modelviewer/model_viewer_simulator_usage.webm',
      description: html`Click or pinch the object to rotate. Drag the platform
      to move.`,
    },
  ];
  options.setAppTitle('Model Viewer');
  options.world.enablePlaneDetection();
  await xb.init(options);
});

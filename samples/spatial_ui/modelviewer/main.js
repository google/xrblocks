import * as xb from 'xrblocks';

import {ModelViewerScene} from './ModelViewerScene.js';

document.addEventListener('DOMContentLoaded', async () => {
  const modelViewerScene = new ModelViewerScene();
  xb.add(modelViewerScene);
  const options = new xb.Options();
  // Default to THREE.WebGLRenderer (@sparkjsdev/spark) so standard Chrome XR
  // retains multiview, foveation, and depth reprojection for the glTF models.
  // With ?rendererBackend=webgpu, THREE.WebGPURenderer runs @sparkjsdev/radix
  // (on native WebGPU or its WebGL2 fallback) with close-range splat budgets.
  if (options.rendererBackend === 'webgpu') {
    options.framebufferScaleFactor ??= 0.75;
    options.enableSplats({
      maxStdDev: 1.45,
      minAlpha: 14 / 255,
      minContribution: 2.25,
      maxPixelRadius: 48,
    });
  }
  options.simulator.instructions.customInstructions = [
    {
      header: 'Model Viewer',
      videoSrc:
        xb.XR_BLOCKS_ASSETS_PATH +
        'samples/modelviewer/model_viewer_simulator_usage.webm',
      description:
        'Click or pinch the object to rotate. Drag the platform to move.',
    },
  ];
  options.setAppTitle('Model Viewer');
  options.world.enablePlaneDetection();
  await xb.init(options);
});

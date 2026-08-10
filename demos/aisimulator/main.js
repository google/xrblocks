import './GeminiLivePanel.js';

import * as xb from 'xrblocks';

import {AISimulator} from './AISimulator.js';

const options = new xb.Options();
options.simulator.geminiLivePanel.enabled = true;
options.depth.enabled = true;
options.depth.depthTexture.enabled = true;
options.depth.occlusion.enabled = true;
options.setAppTitle('AI Simulator');
options.setAppDescription('Ask Gemini questions about objects in the scene.');

document.addEventListener('DOMContentLoaded', function () {
  xb.add(new AISimulator());
  xb.init(options);
});

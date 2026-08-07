import * as xb from 'xrblocks';

import {PoemGenerator} from './PoemGenerator.js';

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;
options.enableCamera();
options.setAppTitle('XR Poet');
options.setAppDescription('Turn a camera view into a short Gemini poem.');

async function start() {
  try {
    xb.add(new PoemGenerator());
    await xb.init(options);
  } catch (error) {
    console.error('Failed to initialize XR app:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => void start());

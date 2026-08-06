import * as xb from 'xrblocks';

import {GeminiIcebreakers} from './GeminiIcebreakers.js';

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;
options.enableCamera();
options.permissions.microphone = true;
options.controllers.visualizeRays = false;
options.setAppTitle('Gemini Icebreakers');
options.setAppDescription('Explore 3D conversation starters with Gemini Live.');

async function start() {
  xb.add(new GeminiIcebreakers());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => void start());

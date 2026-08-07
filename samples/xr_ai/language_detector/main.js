import * as xb from 'xrblocks';

import {LanguageDetectorDemo} from './LanguageDetectorDemo.js';

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;
options.permissions.microphone = true;

options.setAppTitle('Language Detector');
options.setAppDescription(
  'Live transcription with on-device language identification.'
);
options.xrButton.showEnterSimulatorButton = true;

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new LanguageDetectorDemo());
  await xb.init(options);
});

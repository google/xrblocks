import * as xb from 'xrblocks';

import {PoemGenerator} from './PoemGenerator.js';

const options = new xb.Options();
options.enableCamera();
options.setAppTitle('XR Poet');
options.setAppDescription('Turn a camera view into a short Gemini poem.');

async function start() {
  try {
    const google = await xb.createGoogle({promptForApiKey: true});
    xb.add(new PoemGenerator(google('gemini-3.8-flash')));
    await xb.init(options);
  } catch (error) {
    console.error('Failed to initialize XR app:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => void start());

import * as xb from 'xrblocks';
import {GemmaScene} from './GemmaScene.js';

const options = new xb.Options().enableSceneContext().enableHands();
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Gemma 4 on-device';
options.xrButton.appDescription =
  'Ask anything, or select an object and use a scene preset. No API key or cloud inference.';

xb.add(new GemmaScene());
try {
  await xb.init(options);
  document.getElementById('startup').remove();
} catch (error) {
  console.error('Gemma scene initialization failed', error);
  document.getElementById('startup').textContent =
    `Could not start the scene: ${error.message}`;
}

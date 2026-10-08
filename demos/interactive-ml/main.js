import * as xb from 'xrblocks';
import {InteractiveMLDemo} from './InteractiveMLDemo.js';

const options = new xb.Options();
options.enableHands();
options.enableReticles();
// Keep the simulator's normal hands, without the extra black joint markers.
options.hands.visualizeJoints = false;
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.setAppTitle('Interactive ML');
options.setAppDescription('Teach hand poses and sounds on this device.');
const demo = new InteractiveMLDemo();
xb.add(demo);
try {
  await xb.init(options);
  demo.message('Ready. Choose a class and record an example.');
} catch (error) {
  demo.message(`Startup failed: ${error.message}`);
  const fallback = document.getElementById('startup-error');
  fallback.hidden = false;
  fallback.textContent = demo.statusText;
}

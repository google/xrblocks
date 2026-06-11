import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

// Dynamic import with a cache-buster so the browser always fetches the
// latest DietHelper.js while iterating in the simulator. Replace with a
// static `import { DietHelper } from './DietHelper.js'` for production.
const {DietHelper} = await import(`./DietHelper.js?v=${Date.now()}`);

const options = new xb.Options();
options.simulator.defaultMode = xb.SimulatorMode.POSE;
// Enable Gemini (vision) for analyzing food photos. The key is read from
// ./keys.json (gitignored) at runtime — see demos/dietHelper/keys.json.
options.enableAI();
// options.ai.gemini.model = 'gemini-2.0-flash';
// NOTE: we intentionally do NOT call options.enableCamera() here. The
// passthrough camera pipeline doesn't work in the desktop simulator and
// causes the render target to go blank after capturing a screenshot. The
// virtual scene is what we want to analyze anyway during prototyping.
// In an actual XR headset deployment, uncomment the line below to overlay
// the real-world camera feed onto the screenshot.
// options.enableCamera();
options.xrButton = {
  ...options.xrButton,
  startText: '<i id="xrlogo"></i> ENTER DIET HELPER',
  endText: '<i id="xrlogo"></i> EXIT',
};

async function start() {
  xb.add(new DietHelper());
  await xb.init(options);
}

// ES-module scripts are deferred and the CDN imports above can take long
// enough that `DOMContentLoaded` has already fired by the time this body
// executes. We must handle both states or `start()` would silently never run.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

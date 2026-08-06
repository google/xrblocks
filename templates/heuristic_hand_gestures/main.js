import * as xb from 'xrblocks';

const options = new xb.Options();
options.enableReticles();
options.enableGestures();

options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);

options.hands.enabled = true;
options.hands.visualization = true;
options.hands.visualizeJoints = true;
options.hands.visualizeMeshes = true;

options.simulator.defaultMode = xb.SimulatorMode.POSE;

class GestureLogger extends xb.Script {
  init() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) {
      console.warn(
        '[GestureLogger] GestureRecognition is unavailable. ' +
          'Make sure options.enableGestures() is called before xb.init().'
      );
      return;
    }
    this._onGestureStart = (event) => {
      const {hand, name, confidence = 0} = event.detail;
      console.log(
        `[gesture] ${hand} hand started ${name} (${confidence.toFixed(2)})`
      );
    };
    this._onGestureEnd = (event) => {
      const {hand, name} = event.detail;
      console.log(`[gesture] ${hand} hand ended ${name}`);
    };
    gestures.addEventListener('gesturestart', this._onGestureStart);
    gestures.addEventListener('gestureend', this._onGestureEnd);
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;
    if (this._onGestureStart) {
      gestures.removeEventListener('gesturestart', this._onGestureStart);
    }
    if (this._onGestureEnd) {
      gestures.removeEventListener('gestureend', this._onGestureEnd);
    }
  }
}

function start() {
  xb.add(new GestureLogger());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => {
  start();
});

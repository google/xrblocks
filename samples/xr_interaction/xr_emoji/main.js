import * as xb from 'xrblocks';

import {MeetEmoji} from './MeetEmoji.js';

const options = new xb.Options();
options.enableGestures();
options.enableReticles();
options.hands.visualization = true;
options.simulator.defaultMode = xb.SimulatorMode.POSE;

const gestureRecognizer = new xb.HeuristicGestureRecognizer();
gestureRecognizer.registerGesture('victory', detectVictoryGesture, {
  enabled: true,
});
options.gestures.setGestureRecognizer(gestureRecognizer);

function detectVictoryGesture(context) {
  const indexStraight = xb.getFingerStraightness(context, 'index');
  const middleStraight = xb.getFingerStraightness(context, 'middle');
  const ringCurled = xb.getFingerCurl(context, 'ring');
  const pinkyCurled = xb.getFingerCurl(context, 'pinky');
  const indexMiddleSpread = xb.getFingerSpread(context, 'index', 'middle');

  const otherFingersClosed = xb.average([ringCurled, pinkyCurled]);
  const extendedPair = xb.average([indexStraight, middleStraight]);
  const foldedPair = xb.clamp01((otherFingersClosed - 0.15) / 0.65);
  const separatedPair = xb.clamp01(indexMiddleSpread);
  const middleGate = xb.clamp01((middleStraight - 0.2) / 0.55);
  const confidence = xb.clamp01(
    middleGate * (extendedPair * 0.55 + separatedPair * 0.25 + foldedPair * 0.2)
  );

  return {
    confidence,
    data: {extendedPair, foldedPair, separatedPair},
  };
}

async function start() {
  xb.add(new MeetEmoji());
  options.setAppTitle('XR Emoji');
  options.setAppDescription(
    'Show a victory sign or thumbs-up gesture to trigger a reaction.'
  );
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);

import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';
import * as THREE from 'three';

const options = new xb.Options();
options.enableReticles();
options.enableGestures();

const gestureRecognizer = new xb.HeuristicGestureRecognizer();
gestureRecognizer.registerGesture('victory', detectVictoryGesture, {
  enabled: true,
});
options.gestures.setGestureRecognizer(gestureRecognizer);

options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);

options.hands.enabled = true;
options.hands.visualization = true;
options.hands.visualizeJoints = true;
options.hands.visualizeMeshes = true;

options.simulator.defaultMode = xb.SimulatorMode.POSE;

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
    data: {
      indexStraight,
      middleStraight,
      extendedPair,
      foldedPair,
      middleGate,
      otherFingersClosed,
      separatedPair,
    },
  };
}

function createHudElement() {
  const style = document.createElement('style');
  style.textContent = `
    #gesture-hud {
      position: fixed;
      top: 12px;
      right: 12px;
      min-width: 220px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(10, 12, 20, 0.82);
      color: #f4f4f4;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
      z-index: 9999;
    }
    #gesture-hud h2 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    #gesture-hud .hand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      margin-bottom: 6px;
    }
    #gesture-hud .hand-row:last-child {
      margin-bottom: 0;
    }
    #gesture-hud .hand-label {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      opacity: 0.75;
    }
    #gesture-hud .gesture {
      font-weight: 700;
    }
    #gesture-hud .gesture[data-active="false"] {
      opacity: 0.65;
    }
  `;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.id = 'gesture-hud';
  container.innerHTML = `
    <h2>Gestures</h2>
    <div class="hand-row">
      <span class="hand-label">Left</span>
      <span class="gesture" data-hand="left" data-active="false">None</span>
    </div>
    <div class="hand-row">
      <span class="hand-label">Right</span>
      <span class="gesture" data-hand="right" data-active="false">None</span>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

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
    this.add(new THREE.HemisphereLight(0xaaaaaa, 0x666666, 3));
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

class GestureHUD extends xb.Script {
  init() {
    this._container = createHudElement();
    this._active = {
      left: new Map(),
      right: new Map(),
    };
    this._labels = {
      left: this._container.querySelector('[data-hand="left"]'),
      right: this._container.querySelector('[data-hand="right"]'),
    };

    const gestures = xb.core.gestureRecognition;
    if (!gestures) {
      console.warn(
        '[GestureHUD] GestureRecognition is unavailable. ' +
          'Make sure options.enableGestures() is called before xb.init().'
      );
      return;
    }

    const update = (event) => {
      const {name, hand, confidence = 0} = event.detail;
      this._active[hand].set(name, confidence);
      this._refresh(hand);
    };
    const clear = (event) => {
      const {name, hand} = event.detail;
      this._active[hand].delete(name);
      this._refresh(hand);
    };

    this._onGestureStart = update;
    this._onGestureUpdate = update;
    this._onGestureEnd = clear;

    gestures.addEventListener('gesturestart', this._onGestureStart);
    gestures.addEventListener('gestureupdate', this._onGestureUpdate);
    gestures.addEventListener('gestureend', this._onGestureEnd);
  }

  _refresh(hand) {
    const label = this._labels[hand];
    if (!label) return;
    const entries = this._active[hand];
    if (!entries || entries.size === 0) {
      label.dataset.active = 'false';
      label.textContent = 'None';
      return;
    }
    let topGesture = 'None';
    let topConfidence = 0;
    for (const [name, confidence] of entries.entries()) {
      if (confidence >= topConfidence) {
        topGesture = name;
        topConfidence = confidence;
      }
    }
    label.dataset.active = 'true';
    label.textContent = `${topGesture} (${topConfidence.toFixed(2)})`;
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (gestures) {
      if (this._onGestureStart) {
        gestures.removeEventListener('gesturestart', this._onGestureStart);
      }
      if (this._onGestureUpdate) {
        gestures.removeEventListener('gestureupdate', this._onGestureUpdate);
      }
      if (this._onGestureEnd) {
        gestures.removeEventListener('gestureend', this._onGestureEnd);
      }
    }
    if (this._container?.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
  }
}

async function start() {
  options.setAppTitle('Heuristic Gestures');
  xb.add(new GestureLogger());
  xb.add(new GestureHUD());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => {
  start();
});

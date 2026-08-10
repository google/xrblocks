// Imports LiteRt: https://ai.google.dev/edge/litert/web/get_started
import {loadLiteRt, setWebGpuDevice} from '@litertjs/core';
import {runWithTfjsTensors} from '@litertjs/tfjs-interop';
// TensorFlow.js + WebGPU backend
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const GESTURE_LABELS = [
  'OTHER',
  'FIST',
  'THUMB UP',
  'THUMB DOWN',
  'POINT',
  'VICTORY',
  'ROCK',
  'SHAKA',
  'GESTURE_LABEL_MAX_ENUM',
];

const GESTURE_NAMES = [
  'other',
  'fist',
  'thumbs-up',
  'thumbs-down',
  'point',
  'victory',
  'rock',
  'shaka',
  'unknown',
];

const GESTURE_IMAGES = [
  'images/empty.png',
  'images/fist.png',
  'images/thumb.png',
  'images/thumb_down.png',
  'images/point.png',
  'images/victory.png',
  'images/rock.png',
  'images/shaka.png',
  'images/error.png',
];

const UNKNOWN_GESTURE = 8;

export class CustomGestureRecognizer {
  constructor() {
    this.modelPath =
      'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/tflite_models/gestures/xr_emoji.tflite';
    this.modelState = 'None';
    this.model = null;
    this.loadingPromise = null;
  }

  async init() {
    this.loadingPromise ??= this.setBackendAndLoadModel();
  }

  getGestureConfigurations() {
    return {
      fist: {enabled: true},
      'thumbs-up': {enabled: true},
      'thumbs-down': {enabled: true},
      point: {enabled: true},
      victory: {enabled: true},
      rock: {enabled: true},
      shaka: {enabled: true},
    };
  }

  async setBackendAndLoadModel() {
    this.modelState = 'Loading';
    try {
      await tf.setBackend('webgpu');
      await tf.ready();

      const wasmPath = 'https://unpkg.com/@litertjs/core@0.2.1/wasm/';
      const liteRt = await loadLiteRt(wasmPath);
      const backend = tf.backend();
      setWebGpuDevice(backend.device);

      await this.loadModel(liteRt);

      if (!this.model) {
        this.modelState = 'Error';
        return;
      }
      console.log('Model Details: ', this.model.getInputDetails());
      this.modelState = 'Ready';
    } catch (error) {
      this.modelState = 'Error';
      console.error('Failed to load model or backend:', error);
    }
  }

  async loadModel(liteRt) {
    try {
      this.model = await liteRt.loadAndCompile(this.modelPath, {
        accelerator: 'webgpu',
      });
    } catch (error) {
      this.model = null;
      console.error('Error loading model:', error);
    }
  }

  async detectGesture(context) {
    if (!this.model || !context) {
      return UNKNOWN_GESTURE;
    }

    let tensor;
    let tensorReshaped;
    let result;
    try {
      const relativeBoneAngles = xb.getRelativeBoneAngles(context);
      tensor = tf.tensor1d(relativeBoneAngles);
      tensorReshaped = tensor.reshape([1, relativeBoneAngles.length, 1]);
      result = runWithTfjsTensors(this.model, tensorReshaped);

      const scores = result[0].dataSync();
      if (scores.length == 7) {
        let maxScore = scores[0];
        let idx = 0;
        for (let t = 0; t < 7; ++t) {
          if (scores[t] > maxScore) {
            idx = t;
            maxScore = scores[t];
          }
        }
        return idx;
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      tensor?.dispose();
      tensorReshaped?.dispose();
      result?.forEach((output) => output.dispose());
    }
    return UNKNOWN_GESTURE;
  }

  async recognize(context) {
    const scores = {};
    for (const name of Object.keys(this.getGestureConfigurations())) {
      scores[name] = {confidence: 0};
    }

    if (!this.model) return scores;

    let result = await this.detectGesture(context);
    result = this.shiftIndexIfNeeded(context, result);

    const gestureName = GESTURE_NAMES[result];
    if (gestureName && scores[gestureName]) {
      scores[gestureName] = {confidence: 1};
    }
    return scores;
  }

  shiftIndexIfNeeded(context, result) {
    result += result > 2 ? 1 : 0;
    if (result === 2) {
      const thumbDirection = xb.getThumbVerticalDirection(context);
      if (Math.abs(thumbDirection) < 0.25) {
        result = 0;
      } else if (thumbDirection < 0) {
        result += 1;
      }
    }
    return result;
  }
}

/**
 * A demo scene that uses a custom ML model to detect and display static hand
 * gestures for both hands in real-time.
 */
export class HandGestureDemo extends xb.Script {
  constructor(gestureRecognizer) {
    super();
    this.gestureRecognizer = gestureRecognizer;
    this.modelState = gestureRecognizer.modelState;

    const leftHand = this.createHandPanel('Left');
    this.leftHandImage = leftHand.image;
    this.leftHandLabel = leftHand.label;
    const rightHand = this.createHandPanel('Right');
    this.rightHandImage = rightHand.image;
    this.rightHandLabel = rightHand.label;

    const handRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 20,
        alignItems: 'stretch',
      },
      children: [rightHand.panel, leftHand.panel],
    });

    const examples = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
      },
      children: GESTURE_IMAGES.slice(1, 8).map(
        (src, index) =>
          new xb.UIImage({
            src,
            ariaLabel: GESTURE_LABELS[index + 1],
            style: {
              width: 74,
              height: 74,
              objectFit: 'contain',
            },
          })
      ),
    });

    this.modelStatus = new xb.UIText({
      text: 'Loading gesture model...',
      style: {fontSize: 18, textAlign: 'center'},
    });

    this.card = new xb.UICard({
      size: {width: 1.0, height: 0.68},
      manipulation: true,
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'HAND GESTURES',
          style: {
            fontSize: 22,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        }),
        handRow,
        new xb.UIText({
          text: 'Try one of these gestures with either hand',
          style: {fontSize: 22, textAlign: 'center'},
        }),
        examples,
        this.modelStatus,
      ],
    });
    this.card.name = 'Hand gesture recognition card';
    this.add(this.card);

    this.activeGestures = {
      left: new Map(),
      right: new Map(),
    };
  }

  createHandPanel(hand) {
    const image = new xb.UIImage({
      src: GESTURE_IMAGES[0],
      ariaLabel: `${hand} hand gesture`,
      style: {width: 130, height: 130, objectFit: 'contain'},
    });
    const label = new xb.UIText({
      text: 'NONE',
      style: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    const panel = new xb.UIPanel({
      style: {
        flexGrow: 1,
        padding: 18,
        gap: 8,
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: hand.toUpperCase(),
          style: {fontSize: 28, fontWeight: 'bold', textAlign: 'center'},
        }),
        image,
        label,
      ],
    });
    return {panel, image, label};
  }

  init() {
    // Adds light.
    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(0, 4, 0);
    this.add(light);
    this.card.position.set(0, xb.user.height + 0.05, -1.35);

    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;

    this.onGestureUpdate = (event) => {
      const {hand, name, confidence = 0} = event.detail;
      this.activeGestures[hand].set(name, confidence);
      this.refreshHand(hand);
    };
    this.onGestureEnd = (event) => {
      const {hand, name} = event.detail;
      this.activeGestures[hand].delete(name);
      this.refreshHand(hand);
    };

    gestures.addEventListener('gesturestart', this.onGestureUpdate);
    gestures.addEventListener('gestureupdate', this.onGestureUpdate);
    gestures.addEventListener('gestureend', this.onGestureEnd);
  }

  refreshHand(hand) {
    const active = this.activeGestures[hand];
    let bestName = 'other';
    let bestConfidence = 0;
    for (const [name, confidence] of active.entries()) {
      if (confidence >= bestConfidence) {
        bestName = name;
        bestConfidence = confidence;
      }
    }
    const index = GESTURE_NAMES.indexOf(bestName);
    const image = GESTURE_IMAGES[index >= 0 ? index : 0];
    const label = GESTURE_LABELS[index >= 0 ? index : 0];

    if (hand === 'left') {
      this.leftHandImage.src = image;
      this.leftHandLabel.text = label;
    } else {
      this.rightHandImage.src = image;
      this.rightHandLabel.text = label;
    }
  }

  update() {
    if (this.modelState === this.gestureRecognizer.modelState) return;
    this.modelState = this.gestureRecognizer.modelState;
    if (this.modelState === 'Ready') {
      this.modelStatus.text = 'Model ready - Move your hands into view';
      this.modelStatus.style.color = '#5eead4';
    } else if (this.modelState === 'Error') {
      this.modelStatus.text = 'The gesture model could not load';
      this.modelStatus.style.color = '#fb7185';
    }
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;
    if (this.onGestureUpdate) {
      gestures.removeEventListener('gesturestart', this.onGestureUpdate);
      gestures.removeEventListener('gestureupdate', this.onGestureUpdate);
    }
    if (this.onGestureEnd) {
      gestures.removeEventListener('gestureend', this.onGestureEnd);
    }
  }
}

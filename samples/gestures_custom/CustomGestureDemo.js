// Imports LiteRt: https://ai.google.dev/edge/litert/web/get_started
import {loadLiteRt, setWebGpuDevice} from '@litertjs/core';
import {runWithTfjsTensors} from '@litertjs/tfjs-interop';
// TensorFlow.js + WebGPU backend
import * as tf from '@tensorflow/tfjs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {WebGPUBackend} from '@tensorflow/tfjs-backend-webgpu';
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

const LEFT_HAND_INDEX = 0;
const RIGHT_HAND_INDEX = 1;

const UNKNOWN_GESTURE = 8;

/**
 * A demo scene that uses a custom ML model to detect and display static hand
 * gestures for both hands in real-time.
 */
export class CustomGestureDemo extends xb.Script {
  constructor() {
    super();

    // Initializes UI.
    {
      // Make a root panel>grid>row>controlPanel>grid
      const panel = new xb.SpatialPanel({backgroundColor: '#00000000'});
      this.add(panel);

      const grid = panel.addGrid();

      // Show user data
      const dataRow = grid.addRow({weight: 0.3});
      // Left hand image and text
      const leftCol = dataRow.addCol({weight: 0.5});
      const leftHandRow = leftCol.addRow({weight: 0.5});
      // Indentation
      leftHandRow.addCol({weight: 0.4});
      this.leftHandImage = leftHandRow.addCol({weight: 0.2}).addImage({
        src: GESTURE_IMAGES[0],
        scaleFactor: 0.3,
      });
      this.leftHandLabel = leftCol.addRow({weight: 0.5}).addText({
        text: 'Loading...',
        fontColor: '#ffffff',
      });
      const rightCol = dataRow.addCol({weight: 0.5});
      const rightHandRow = rightCol.addRow({weight: 0.5});
      // Indentation
      rightHandRow.addCol({weight: 0.4});
      // Image
      this.rightHandImage = rightHandRow.addCol({weight: 0.2}).addImage({
        src: GESTURE_IMAGES[0],
        scaleFactor: 0.3,
      });
      this.rightHandLabel = rightCol.addRow({weight: 0.4}).addText({
        text: 'Loading...',
        fontColor: '#ffffff',
      });

      // Indentation
      grid.addRow({weight: 0.1});

      // Control row
      const controlRow = grid.addRow({weight: 0.6});
      const ctrlPanel = controlRow.addPanel({backgroundColor: '#00000055'});
      const ctrlGrid = ctrlPanel.addGrid();
      {
        // Left indentation
        ctrlGrid.addCol({weight: 0.1});

        // Middle column
        const midColumn = ctrlGrid.addCol({weight: 0.8});

        midColumn.addRow({weight: 0.1});
        midColumn.addRow({weight: 0.2}).addText({
          text: 'Perform one of these gestures',
          fontColor: '#ffffff',
        });
        midColumn
          .addRow({weight: 0.2})
          .addText({text: '(either hand):', fontColor: '#ffffff'});
        const gesturesRow = midColumn.addRow({weight: 0.5});
        gesturesRow.addCol({weight: 0.1});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/fist.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/thumb.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/thumb_down.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/point.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/victory.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/rock.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/shaka.png', scaleFactor: 0.3});

        // Vertical alignment on the description text element.
        midColumn.addRow({weight: 0.1});

        // Right indentation.
        ctrlGrid.addCol({weight: 0.1});
      }

      const orbiter = ctrlGrid.addOrbiter();
      orbiter.addExitButton();

      panel.updateLayouts();

      this.panel = panel;
    }

    // Model
    this.modelPath = './custom_gestures_model.tflite';
    this.modelState = 'None';

    this.frameId = 0;

    setTimeout(() => {
      this.setBackendAndLoadModel();
    }, 1);
  }

  init() {
    // Adds light.
    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(0, 4, 0);
    this.add(light);
  }

  async setBackendAndLoadModel() {
    this.modelState = 'Loading';
    try {
      await tf.setBackend('webgpu');
      await tf.ready();

      // Initializes LiteRT.js's WASM files.
      const wasmPath = 'https://unpkg.com/@litertjs/core@0.2.1/wasm/';
      const liteRt = await loadLiteRt(wasmPath);

      // Makes LiteRt use the same GPU device as TF.js (for tensor conversion).
      const backend = tf.backend();
      setWebGpuDevice(backend.device);

      // Loads model via LiteRt.
      await this.loadModel(liteRt);

      if (this.model) {
        // Prints model details to the log.
        console.log('Model Details: ', this.model.getInputDetails());
      }
      this.modelState = 'Ready';
    } catch (error) {
      console.error('Failed to load model or backend:', error);
    }
  }

  async loadModel(liteRt) {
    try {
      this.model = await liteRt.loadAndCompile(this.modelPath, {
        // Currently, only 'webgpu' is supported.
        accelerator: 'webgpu',
      });
    } catch (error) {
      this.model = null;
      console.error('Error loading model:', error);
    }
  }

  calculateRelativeHandBoneAngles(jointPositions) {
    // Reshape jointPositions
    let jointPositionsReshaped = [];

    jointPositionsReshaped = jointPositions.reshape([xb.HAND_JOINT_COUNT, 3]);

    // Calculate bone vectors
    const boneVectors = [];
    xb.HAND_JOINT_IDX_CONNECTION_MAP.forEach(([joint1, joint2]) => {
      const boneVector = jointPositionsReshaped
        .slice([joint2, 0], [1, 3])
        .sub(jointPositionsReshaped.slice([joint1, 0], [1, 3]))
        .squeeze();
      const norm = boneVector.norm();
      const normalizedBoneVector = boneVector.div(norm);
      boneVectors.push(normalizedBoneVector);
    });

    // Calculate relative hand bone angles
    const relativeHandBoneAngles = [];
    xb.HAND_BONE_IDX_CONNECTION_MAP.forEach(([bone1, bone2]) => {
      const angle = boneVectors[bone1].dot(boneVectors[bone2]);
      relativeHandBoneAngles.push(angle);
    });

    // Stack the angles into a tensor.
    return tf.stack(relativeHandBoneAngles);
  }

  async detectGesture(handJoints) {
    if (!this.model || !handJoints || handJoints.length !== 25 * 3) {
      console.log('Invalid hand joints or model load error.');
      return UNKNOWN_GESTURE;
    }

    try {
      const tensor = this.calculateRelativeHandBoneAngles(
        tf.tensor1d(handJoints)
      );

      let tensorReshaped = tensor.reshape([
        1,
        xb.HAND_BONE_IDX_CONNECTION_MAP.length,
        1,
      ]);
      var result = -1;

      result = runWithTfjsTensors(this.model, tensorReshaped);

      let integerLabel = result[0].as1D().arraySync();
      if (integerLabel.length == 7) {
        let x = integerLabel[0];
        let idx = 0;
        for (let t = 0; t < 7; ++t) {
          if (integerLabel[t] > x) {
            idx = t;
            x = integerLabel[t];
          }
        }
        return idx;
      }
    } catch (error) {
      console.error('Error:', error);
    }
    return UNKNOWN_GESTURE;
  }

  async #detectHandGestures(joints) {
    if (Object.keys(joints).length !== 25) {
      return UNKNOWN_GESTURE;
    }

    let handJointPositions = [];
    for (const i in joints) {
      handJointPositions.push(joints[i].position.x);
      handJointPositions.push(joints[i].position.y);
      handJointPositions.push(joints[i].position.z);
    }

    if (handJointPositions.length !== 25 * 3) {
      return UNKNOWN_GESTURE;
    }

    let result = await this.detectGesture(handJointPositions);
    return result;
  }

  #shiftIndexIfNeeded(joints, result) {
    // no need to shift before thumb which is 2
    result += result > 2 ? 1 : 0;
    // check thumb direction
    if (result === 2) {
      // console.log(joints["thumb-phalanx-distal"], joints["thumb-tip"]);
      let tmp = this.isThumbUpOrDown(
        joints['thumb-phalanx-distal'].position,
        joints['thumb-tip'].position
      );
      // 1 -up; -1 down; 0 - other
      result = tmp === 0 ? 0 : tmp < 0 ? result + 1 : result;
    }
    return result;
  }

  async update() {
    if (this.frameId % 5 === 0) {
      const hands = xb.user.hands;
      if (hands != null && hands.hands && hands.hands.length == 2) {
        // Left hand.
        const leftJoints = hands.hands[LEFT_HAND_INDEX].joints;
        let leftHandResult = await this.#detectHandGestures(leftJoints);
        leftHandResult = this.#shiftIndexIfNeeded(leftJoints, leftHandResult);

        // Update image and label.
        this.leftHandImage.load(GESTURE_IMAGES[leftHandResult]);
        this.leftHandLabel.setText(GESTURE_LABELS[leftHandResult]);

        // Right hand.
        const rightJoints = hands.hands[RIGHT_HAND_INDEX].joints;
        let rightHandResult = await this.#detectHandGestures(rightJoints);
        rightHandResult = this.#shiftIndexIfNeeded(
          rightJoints,
          rightHandResult
        );

        // Update image and label.
        this.rightHandImage.load(GESTURE_IMAGES[rightHandResult]);
        this.rightHandLabel.setText(GESTURE_LABELS[rightHandResult]);
      }
    }
    this.frameId++;
  }

  isThumbUpOrDown(p1, p2) {
    // Assuming p1 is the base of the thumb and p2 is the tip.

    // Vector from base to tip.
    const vector = {
      x: p2.x - p1.x,
      y: p2.y - p1.y,
      z: p2.z - p1.z,
    };

    // Calculate the magnitude of the vector.
    const magnitude = Math.sqrt(
      vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
    );

    // If the magnitude is very small, it's likely not a significant gesture
    if (magnitude < 0.001) {
      return 0; // Otherwise
    }

    // Normalize the vector to get its direction.
    const normalizedVector = {
      x: vector.x / magnitude,
      y: vector.y / magnitude,
      z: vector.z / magnitude,
    };

    // Define the "up" and "down" direction vectors (positive and negative
    // Y-axis)
    const upVector = {x: 0, y: 1, z: 0};
    const downVector = {x: 0, y: -1, z: 0};

    // Angle threshold (cosine) for "up" (within 45 degrees of vertical)
    const cosUpThreshold = Math.cos((45 * Math.PI) / 180); // Approximately 0.707

    // Angle threshold (cosine) for "down" (within 45 degrees of negative
    // vertical) We need the dot product with the *down* vector to be >= cos(45
    // degrees)
    const dotDownThreshold = cosUpThreshold;

    // Calculates the dot product with the "up" vector.
    const dotUp =
      normalizedVector.x * upVector.x +
      normalizedVector.y * upVector.y +
      normalizedVector.z * upVector.z;

    // Calculates the dot product with the "down" vector (negate the y component
    // of normalized vector).
    const dotDown =
      normalizedVector.x * downVector.x +
      normalizedVector.y * downVector.y +
      normalizedVector.z * downVector.z;

    if (dotUp >= cosUpThreshold) {
      return 1; // Thumb up
    } else if (dotDown >= dotDownThreshold) {
      return -1; // Thumb down
    } else {
      return 0; // Otherwise
    }
  }
}

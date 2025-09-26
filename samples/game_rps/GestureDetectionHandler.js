// LiteRt
import { loadLiteRt, setWebGpuDevice } from '@litertjs/core';
import { runWithTfjsTensors } from '@litertjs/tfjs-interop';
// TensorflowJS + WebGpu backend
import * as tf from '@tensorflow/tfjs';
import {WebGPUBackend} from '@tensorflow/tfjs-backend-webgpu';

//
// Constants for a custom gesture model
//
const HAND_JOINT_COUNT = 25;
const HAND_JOINT_IDX_CONNECTION_MAP = [
  [1, 2],   [2, 3],   [3, 4],              // Thumb has 3 bones
  [5, 6],   [6, 7],   [7, 8],   [8, 9],    // Index finger has 4 bones
  [10, 11], [11, 12], [12, 13], [13, 14],  // Middle finger has 4 bones
  [15, 16], [16, 17], [17, 18], [18, 19],  // Ring finger has 4 bones
  [20, 21], [21, 22], [22, 23], [23, 24],  // Little finger has 4 bones
];

const HAND_BONE_IDX_CONNECTION_MAP = [
  [0, 1], [1, 2],                // Thumb has 2 angles
  [3, 4], [4, 5], [5, 6],        // Index finger has 3 angles
  [7, 8], [8, 9], [9, 10],       // Middle finger has 3 angles
  [11, 12], [12, 13], [13, 14],  // Ring finger has 3 angles
  [15, 16], [16, 17], [17, 18],  // Little finger has 3 angles
];

const GESTURE_LABELS = [
  'OTHER', 'FIST', 'THUMB UP', 'POINT', 'VICTORY', 'ROCK', 'SHAKA',
  'GESTURE_LABEL_MAX_ENUM'
];

const GESTURE_RETURN_LABELS = [
  'OTHER', 'FIST', 'VICTORY', 'PAPER', 'THUMB_UP',
  'GESTURE_RETURN_LABELS_MAX_ENUM'
];

const GESTURE_RETURN_LABELS_MAX_ENUM = 5;

const UNKNOWN_GESTURE = 0;

// Threshold for a dot product to indicate a straight or extended finger
// segment. A dot product of 1 means 0 degrees (perfectly straight). Adjust this
// value based on experimentation. A value of 0.9 means the angle can be up to
// ~25.8 degrees bent.
const STRAIGHT_FINGER_THRESHOLD = 0.9;

// Precisely defined indices in the `relativeHandBoneAngles` tensor.
// These are derived directly from the order in the HAND_BONE_IDX_CONNECTION_MAP
// provided.
const ANGLE_INDICES = {
  // Thumb angles (2 angles for straightness)
  THUMB_SEGMENT_ANGLE_1: 0,
  THUMB_SEGMENT_ANGLE_2: 1,

  // Index finger angles (3 angles for straightness)
  INDEX_SEGMENT_ANGLE_1: 2,
  INDEX_SEGMENT_ANGLE_2: 3,
  INDEX_SEGMENT_ANGLE_3: 4,

  // Middle finger angles (3 angles for straightness)
  MIDDLE_SEGMENT_ANGLE_1: 5,
  MIDDLE_SEGMENT_ANGLE_2: 6,
  MIDDLE_SEGMENT_ANGLE_3: 7,

  // Ring finger angles (3 angles for straightness)
  RING_SEGMENT_ANGLE_1: 8,
  RING_SEGMENT_ANGLE_2: 9,
  RING_SEGMENT_ANGLE_3: 10,

  // Pinky finger angles (3 angles for straightness)
  PINKY_SEGMENT_ANGLE_1: 11,
  PINKY_SEGMENT_ANGLE_2: 12,
  PINKY_SEGMENT_ANGLE_3: 13,
};

class LatestTaskQueue {
  constructor() {
    this.latestTask = null;
    this.isProcessing = false;
  }

  enqueue(task) {
    if (typeof task !== 'function') {
      console.error('Task must be a function.');
      return;
    }
    this.latestTask = task;
    if (!this.isProcessing) {
      this.processLatestTask();
    }
  }

  processLatestTask() {
    if (this.latestTask) {
      this.isProcessing = true;
      const taskToProcess = this.latestTask;
      this.latestTask = null;  // Clear the reference immediately

      // Execute the task asynchronously using setTimeout (or queueMicrotask)
      setTimeout(async () => {
        try {
          await taskToProcess();  // If the task is async
        } catch (error) {
          console.error('Error processing latest task:', error);
        } finally {
          this.isProcessing = false;
          if (this.latestTask) {
            this.processLatestTask();
          }
        }
      }, 0);  // Delay of 0ms puts it in the event queue
    }
  }


  getSize() {
    return this.latestTask === null ? 0 : 1;
  }

  isEmpty() {
    return this.latestTask === null;
  }
}

export class GestureDetectionHandler {
  constructor() {
    // model
    this.modelPath = './custom_gestures_model.tflite';
    this.modelState = 'None';

    // Enable/Disable paper gesture detection
    this.enablePaperDetection = false;

    //
    // left and right hand queues
    this.queue = [];
    this.queue.push(new LatestTaskQueue());
    this.queue.push(new LatestTaskQueue());

    setTimeout(() => {
      this.setBackendAndLoadModel();
    }, 1);
  }

  enablePaperGesture(value) {
    this.enablePaperDetection = value;
  }

  //
  // set TF.js backend and load tflite model
  //
  async setBackendAndLoadModel() {
    this.modelState = 'Loading';
    try {
      await tf.setBackend('webgpu');
      await tf.ready();

      // Initialize LiteRT.js's WASM files
      const wasmPath = 'https://unpkg.com/@litertjs/core/wasm/';
      const liteRt = await loadLiteRt(wasmPath);
            
      // Make LiteRt use the same GPU device as TFJS (for tensor conversion)
      const backend = tf.backend();  // as WebGPUBackend;
      setWebGpuDevice(backend.device);

      // Load model via LiteRt
      await this.loadModel(liteRt);

      if (this.model) {
        // print model details to the log
        console.log('MODEL DETAILS: ', this.model.getInputDetails());
      }
      this.modelState = 'Ready';
    } catch (error) {
      console.error('Failed to load model or backend:', error);
    }
  }

  async loadModel(liteRt) {
    try {
      this.model = await liteRt.loadAndCompile(this.modelPath, {
        // Currently, only 'webgpu' is supported
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

    jointPositionsReshaped = jointPositions.reshape([HAND_JOINT_COUNT, 3]);

    // Calculate bone vectors
    const boneVectors = [];
    HAND_JOINT_IDX_CONNECTION_MAP.forEach(([joint1, joint2]) => {
      const boneVector =
          jointPositionsReshaped.slice([joint2, 0], [1, 3])
              .sub(jointPositionsReshaped.slice([joint1, 0], [1, 3]))
              .squeeze();
      const norm = boneVector.norm();
      const normalizedBoneVector = boneVector.div(norm);
      boneVectors.push(normalizedBoneVector);
    });

    // Calculate relative hand bone angles
    const relativeHandBoneAngles = [];
    HAND_BONE_IDX_CONNECTION_MAP.forEach(([bone1, bone2]) => {
      const angle = boneVectors[bone1].dot(boneVectors[bone2]);
      relativeHandBoneAngles.push(angle);
    });

    // Stack the angles into a tensor
    return tf.stack(relativeHandBoneAngles);
  }

  async detectGesture(handJoints) {
    if (!this.model || !handJoints || handJoints.length !== 25 * 3) {
      console.log('Invalid hand joints or model load error.');
      return GESTURE_RETURN_LABELS_MAX_ENUM;
    }

    try {
      const tensor =
          this.calculateRelativeHandBoneAngles(tf.tensor1d(handJoints));

      //
      // Detect paper gesture for ~3 seconds only
      //
      if (this.enablePaperDetection && this.isPaperGesture(tensor)) {
        // Paper gesture - GESTURE_RETURN_LABELS
        return 3;
      }

      let tensorReshaped =
          tensor.reshape([1, HAND_BONE_IDX_CONNECTION_MAP.length, 1]);
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

        // No need to detect thumb up for a play mode
        if (idx === 2) {
          if (this.enablePaperDetection ||
              !this.isThumbUp(handJoints, 2, 3, 4)) {
            result = 0;
          }
        }

        //
        // Map model result to the return index
        //

        // Thumb up gesture
        if (idx == 2) {
          return 4;
        }

        //
        // FIST GESTURE
        //
        if (idx == 4) {
          // Map to the ROCK gesture
          return 2;
        }

        // VICTORY GESTURE
        else if (idx == 1) {
          // Map to the Scissors gesture
          return 1;
        }

        // OTHER gesture
        return 0;
      }
    } catch (error) {
      console.error('Error:', error);
    }
    return GESTURE_RETURN_LABELS_MAX_ENUM;
  }

  isThumbUp(d1, p1, p2, p3) {
    return this.isThumbUpSimple(d1, p1, p3);
  }

  isThumbUpAdvanced(data, p1, p2, p3) {
    // Assuming p1 is the base of the thumb, p2 is the knuckle, and p3 is the
    // tip.

    // Vector from base to knuckle
    const v1 = {
      x: data[p2 * 3] - data[p1 * 3],
      y: data[p2 * 3 + 1] - data[p1 * 3 + 1],
      z: data[p2 * 3 + 2] - data[p1 * 3 + 2],
    };

    // Vector from knuckle to tip
    const v2 = {
      x: data[p3 * 3] - data[p2 * 3],
      y: data[p3 * 3 + 1] - data[p2 * 3 + 1],
      z: data[p3 * 3 + 2] - data[p2 * 3 + 2],
    };

    // Calculate the angle between the two vectors using the dot product
    const dotProduct = (v1.x * v2.x) + (v1.y * v2.y) + (v1.z * v2.z);

    // Calculate the magnitudes (lengths) of the vectors
    const magnitudeV1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const magnitudeV2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    // Avoid division by zero if either vector has zero length
    if (magnitudeV1 === 0 || magnitudeV2 === 0) {
      return false;  // Cannot determine angle if segments have zero length
    }

    // Calculate the cosine of the angle
    const cosAngle = dotProduct / (magnitudeV1 * magnitudeV2);

    // Get the angle in radians
    const angleRadians = Math.acos(Math.max(
        -1,
        Math.min(
            1, cosAngle)));  // Clamp to handle potential floating-point errors

    // Convert the angle to degrees
    const angleDegrees = angleRadians * (180 / Math.PI);

    // Define a threshold angle for what we consider "thumb up".
    // This value might need adjustment based on your specific application and
    // data.
    const thumbUpThreshold = 90;  // Example: If the angle is greater than 90
                                  // degrees, it's considered "up"

    // In a typical "thumb up" gesture, the angle between the base-knuckle
    // segment and the knuckle-tip segment would be relatively straight or even
    // slightly bent backward. Therefore, we are looking for an angle close to
    // 180 degrees or greater than 90.

    return angleDegrees > thumbUpThreshold;
  }

  /**
   * Detects if the hand is showing a "paper" (open palm) gesture based on bone
   * angles. Assumes `relativeHandBoneAngles` is a tf.Tensor containing dot
   * products (cosines of angles) between connected bone vectors, as generated
   * by `calculateRelativeHandBoneAngles`.
   *
   * @param {tf.Tensor} relativeHandBoneAngles A TensorFlow.js tensor of bone
   *     angles (dot products).
   * @returns {boolean} True if the gesture is "paper", false otherwise.
   */
  isPaperGesture(relativeHandBoneAngles) {
    if (!relativeHandBoneAngles || relativeHandBoneAngles.size === 0) {
      // No angle data, cannot detect gesture
      return false;
    }

    // Convert the tensor to a plain JavaScript array for easier access
    const angles = relativeHandBoneAngles.arraySync();

    // Helper to check if a finger's segments are sufficiently straight
    // All angle values for the segments should be above the threshold
    const areSegmentsStraight = (...angleIndices) => {
      return angleIndices.every(idx => angles[idx] > STRAIGHT_FINGER_THRESHOLD);
    };

    // Check straightness for each finger based on its segment angles
    const isThumbStraight = areSegmentsStraight(
        ANGLE_INDICES.THUMB_SEGMENT_ANGLE_1,
        ANGLE_INDICES.THUMB_SEGMENT_ANGLE_2);

    const isIndexStraight = areSegmentsStraight(
        ANGLE_INDICES.INDEX_SEGMENT_ANGLE_1,
        ANGLE_INDICES.INDEX_SEGMENT_ANGLE_2,
        ANGLE_INDICES.INDEX_SEGMENT_ANGLE_3);

    const isMiddleStraight = areSegmentsStraight(
        ANGLE_INDICES.MIDDLE_SEGMENT_ANGLE_1,
        ANGLE_INDICES.MIDDLE_SEGMENT_ANGLE_2,
        ANGLE_INDICES.MIDDLE_SEGMENT_ANGLE_3);

    const isRingStraight = areSegmentsStraight(
        ANGLE_INDICES.RING_SEGMENT_ANGLE_1, ANGLE_INDICES.RING_SEGMENT_ANGLE_2,
        ANGLE_INDICES.RING_SEGMENT_ANGLE_3);

    const isPinkyStraight = areSegmentsStraight(
        ANGLE_INDICES.PINKY_SEGMENT_ANGLE_1,
        ANGLE_INDICES.PINKY_SEGMENT_ANGLE_2,
        ANGLE_INDICES.PINKY_SEGMENT_ANGLE_3);

    // For a "paper" gesture, all fingers (including the thumb) should be
    // straight. As discussed, explicit thumb abduction isn't provided by your
    // current angle map, so we focus on overall finger extension.
    const isPaper = isThumbStraight && isIndexStraight && isMiddleStraight &&
        isRingStraight && isPinkyStraight;

    return isPaper;
  }

  //
  // Clone joints and post queue task
  //
  postTask(joints, handIndex) {
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

    if (handIndex >= 0 && handIndex < this.queue.length) {
      this.queue[handIndex].enqueue(async () => {
        let result = await this.detectGesture(handJointPositions);

        if (this.observer && this.observer.onGestureDetected) {
          this.observer.onGestureDetected(handIndex, result);
        }
      });
    }
  }

  isThumbUp(d1, p1, p2, p3) {
    return this.isThumbUpSimple(d1, p1, p3);
  }

  isThumbUpAdvanced(data, p1, p2, p3) {
    // Assuming p1 is the base of the thumb, p2 is the knuckle, and p3 is the
    // tip.

    // Vector from base to knuckle
    const v1 = {
      x: data[p2 * 3] - data[p1 * 3],
      y: data[p2 * 3 + 1] - data[p1 * 3 + 1],
      z: data[p2 * 3 + 2] - data[p1 * 3 + 2],
    };

    // Vector from knuckle to tip
    const v2 = {
      x: data[p3 * 3] - data[p2 * 3],
      y: data[p3 * 3 + 1] - data[p2 * 3 + 1],
      z: data[p3 * 3 + 2] - data[p2 * 3 + 2],
    };

    // Calculate the angle between the two vectors using the dot product
    const dotProduct = (v1.x * v2.x) + (v1.y * v2.y) + (v1.z * v2.z);

    // Calculate the magnitudes (lengths) of the vectors
    const magnitudeV1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const magnitudeV2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    // Avoid division by zero if either vector has zero length
    if (magnitudeV1 === 0 || magnitudeV2 === 0) {
      return false;  // Cannot determine angle if segments have zero length
    }

    // Calculate the cosine of the angle
    const cosAngle = dotProduct / (magnitudeV1 * magnitudeV2);

    // Get the angle in radians
    const angleRadians = Math.acos(Math.max(
        -1,
        Math.min(
            1, cosAngle)));  // Clamp to handle potential floating-point errors

    // Convert the angle to degrees
    const angleDegrees = angleRadians * (180 / Math.PI);

    // Define a threshold angle for what we consider "thumb up".
    // This value might need adjustment based on your specific application and
    // data.
    const thumbUpThreshold = 90;  // Example: If the angle is greater than 90
                                  // degrees, it's considered "up"

    // In a typical "thumb up" gesture, the angle between the base-knuckle
    // segment and the knuckle-tip segment would be relatively straight or even
    // slightly bent backward. Therefore, we are looking for an angle close to
    // 180 degrees or greater than 90.

    return angleDegrees > thumbUpThreshold;
  }


  isThumbUpSimple(data, p1, p2) {
    // Assuming p1 is the base of the thumb and p2 is the tip.

    // Vector from base to tip
    const vector = {
      x: data[p2 * 3] - data[p1 * 3],
      y: data[p2 * 3 + 1] - data[p1 * 3 + 1],
      z: data[p2 * 3 + 2] - data[p1 * 3 + 2],
    };

    // Calculate the magnitude of the vector
    const magnitude = Math.sqrt(
        vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

    // If the magnitude is very small, it's likely not a significant gesture
    if (magnitude < 0.001) {
      return false;
    }

    // Normalize the vector to get its direction
    const normalizedVector = {
      x: vector.x / magnitude,
      y: vector.y / magnitude,
      z: vector.z / magnitude,
    };

    // Define the "up" direction vector (positive Y-axis)
    const upVector = {x: 0, y: 1, z: 0};

    // Calculate the dot product between the normalized thumb vector and the up
    // vector
    const dotProduct = (normalizedVector.x * upVector.x) +
        (normalizedVector.y * upVector.y) + (normalizedVector.z * upVector.z);

    // The dot product of two normalized vectors is equal to the cosine of the
    // angle between them. An angle of 45 degrees has a cosine of approximately
    // Math.cos(Math.PI / 4) or ~0.707. We want the angle to be within 45
    // degrees of the vertical "up" direction. This means the cosine of the
    // angle should be greater than or equal to cos(45 degrees).

    const cos45Degrees = Math.cos(45 * Math.PI / 180);  // Approximately 0.707

    return dotProduct >= cos45Degrees;
  }

  registerObserver(observer) {
    this.observer = observer;
  }
}

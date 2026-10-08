import type {JointName} from 'xrblocks';

// Dataset limits
export const MAX_EXAMPLES = 512;
export const MAX_EXAMPLES_PER_CLASS = 64;
export const MIN_CLASSES = 2;
export const MAX_CLASSES = 32;

// Feature and label validation
export const MAX_LABEL_LENGTH = 80;
export const MAX_FEATURE_ID_LENGTH = 512;
export const MAX_FEATURE_DIMENSIONS = 2048;
export const UNKNOWN_LABEL = '(unknown)';
export const RESERVED_LABELS = [
  '__proto__',
  'constructor',
  'prototype',
  UNKNOWN_LABEL,
];

// Training defaults and limits
export const DEFAULT_EPOCHS = 100;
export const MAX_EPOCHS = 500;
export const DEFAULT_THRESHOLD = 0.65;

// Learning parameters
export const MIN_FEATURE_SCALE = 0.01;
export const MIN_CLASS_RADIUS = 1;
export const CLASS_RADIUS_MULTIPLIER = 1.5;
export const LEARNING_RATE_FACTOR = 0.5;
export const WEIGHT_DECAY = 0.001;
export const PROGRESS_INTERVAL_EPOCHS = 5;

// Hand feature layout and palm normalization
export const HAND_FEATURE_ID = 'xr-hand-palm-v1';
export const HAND_JOINTS: JointName[] = [
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  ...(
    ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const
  ).flatMap((finger) =>
    ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(
      (part) => `${finger}-${part}` as JointName
    )
  ),
];
export const HAND_FEATURE_SIZE = HAND_JOINTS.length * 3;
export const PALM_INDEX_JOINT = 4;
export const PALM_MIDDLE_JOINT = 8;
export const PALM_PINKY_JOINT = 16;
export const MIN_PALM_AXIS_LENGTH = 0.005;

export const MAX_HAND_FRAMES = 300;
export const MAX_HAND_CLIP_DURATION_MS = 10000;

// YAMNet model 
export const YAMNET_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';
export const YAMNET_FEATURE_ID = 'google-yamnet-tfjs-1:mono16k-mean-l2-v1';
export const YAMNET_DIMENSIONS = 1024;
export const YAMNET_SAMPLE_RATE = 16000;
export const YAMNET_MIN_SAMPLES = 15600;

// Audio limits
export const MIN_AUDIO_SAMPLE_RATE = 8000;
export const MAX_AUDIO_SAMPLE_RATE = 192000;
export const MIN_AUDIO_DURATION_SECONDS = 0.1;
export const MAX_AUDIO_DURATION_SECONDS = 10;

// Audio resampling parameters
export const RESAMPLE_FILTER_RADIUS = 16;
export const SINC_EPSILON = 1e-8;

// Output format names
export const MODEL_FORMAT = 'xrblocks-interactive-ml';
export const HAND_PROJECT_FORMAT = 'xrblocks-interactive-ml-project';
export const SOUND_PROJECT_FORMAT = 'xrblocks-interactive-ml-sound-project';
export const TFLITE_FORMAT = 'xrblocks-interactive-ml-tflite';
export const ARTIFACT_VERSION = 1;

// TFLite tensor types and operator codes
export const TFLITE_FLOAT32 = 0;
export const TFLITE_INT32 = 2;
export const TFLITE_BOOL = 6;
export const TFLITE_OPS = {
  sub: [41, 28],
  div: [42, 29],
  dense: [9, 8],
  softmax: [25, 9],
  argmax: [56, 40],
  gather: [36, 23],
  max: [82, 27],
  squaredDifference: [99, 76],
  mean: [40, 27],
  sqrt: [75, 0],
  greaterEqual: [62, 45],
  lessEqual: [63, 46],
  and: [86, 62],
  select: [64, 47],
} as const;

// TFLite schema and metadata
export const TFLITE_SCHEMA_VERSION = 3;
export const TFLITE_IDENTIFIER = 'TFL3';
export const TFLITE_METADATA_NAME = MODEL_FORMAT;
export const TFLITE_GRAPH_NAME = 'interactive_ml';
export const TFLITE_SIGNATURE_NAME = 'serving_default';

// TFLite resource limits
export const MAX_TFLITE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TFLITE_TABLES = 128;
export const TFLITE_BUILDER_CAPACITY = 4096;

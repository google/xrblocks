---
sidebar_position: 11
---

# Hand Gestures

XR Blocks gesture recognition is split into two explicit layers:

```txt
PoseEstimator -> HandContext -> GestureRecognizer -> gesture events
```

A `PoseEstimator` converts a source of hand pose data into the SDK's canonical
`HandContext`. A `GestureRecognizer` reads that context and returns confidence
scores for named gestures. `GestureRecognition` handles update timing,
confidence thresholds, and `gesturestart`, `gestureupdate`, and `gestureend`
events.

The default setup is:

```txt
WebXRHandPoseEstimator -> HandContext -> HeuristicGestureRecognizer
```

## Quick Start

```js
import * as xb from 'xrblocks';

const options = new xb.Options();
options.enableGestures();

// Built-in heuristic gestures are registered by default.
options.gestures.minimumConfidence = 0.6;
options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);

await xb.init(options);
```

Listen for events from `xb.core.gestureRecognition`:

```js
class GestureLogger extends xb.Script {
  init() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;

    gestures.addEventListener('gesturestart', (event) => {
      const {hand, name, confidence} = event.detail;
      console.log(`${hand} started ${name}: ${confidence.toFixed(2)}`);
    });

    gestures.addEventListener('gestureend', (event) => {
      console.log(`${event.detail.hand} ended ${event.detail.name}`);
    });
  }
}
```

## Core Interfaces

These are the shapes a custom implementation should follow.

```ts
interface HandContext {
  handedness: xb.Handedness;
  handLabel: 'left' | 'right';
  globalTransform: THREE.Matrix4;
  joints: Map<xb.JointName, THREE.Vector3>;

  getLocalJointPositions(): Float32Array;
  getGlobalJointPositions(): Float32Array;
  getJoint(
    jointName: xb.JointName,
    global?: boolean
  ): THREE.Vector3 | undefined;
}
```

`joints` should contain canonical XR Blocks/WebXR-style joint names from
`xb.HAND_JOINT_NAMES`. For the default WebXR estimator, `joints` aliases global
positions. `getJoint(name)` defaults to global positions. Custom pose estimators
may use the same local and global coordinates if they do not have a separate
world transform.

```ts
interface PoseEstimator {
  init?(dependencies?: {user?: xb.User}): Promise<void>;
  getHandContext(handedness: xb.Handedness): HandContext | null;
  getHandContexts(): Partial<Record<'left' | 'right', HandContext>>;
  dispose?(): void;
}

type GestureScoreMap = Record<
  string,
  {confidence: number; data?: Record<string, unknown>} | undefined
>;

interface GestureRecognizer {
  init?(): Promise<void>;
  recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
  getGestureConfigurations?(): Record<
    string,
    {enabled: boolean; threshold?: number}
  >;
  dispose?(): void;
}
```

`GestureRecognition` calls the configured pose estimator for each hand, passes
each available `HandContext` to the configured gesture recognizer, and emits
events for configured gestures whose confidence is at least
`options.gestures.minimumConfidence`.

## Gesture Options

```js
const options = new xb.Options();
options.enableGestures();

options.gestures.minimumConfidence = 0.7;
options.gestures.updateIntervalMs = 33;

options.gestures.setPoseEstimator(new xb.WebXRHandPoseEstimator());
options.gestures.setGestureRecognizer(new xb.HeuristicGestureRecognizer());

options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureConfig('pinch', {
  enabled: true,
  threshold: 0.025,
});
```

Gesture names are strings. They are not limited to built-ins. The gesture
catalogue is initialized from
`gestureRecognizer.getGestureConfigurations?.()`, then any explicit
`setGestureConfig` or `setGestureEnabled` calls override those defaults.

## Heuristic Gesture Registration

`HeuristicGestureRecognizer` is the simplest way to add a custom gesture. It
accepts detector functions at initialization time:

```js
const recognizer = new xb.HeuristicGestureRecognizer();

recognizer.registerGesture(
  'victory',
  (context, config) => {
    const indexStraight = xb.getFingerStraightness(context, 'index');
    const middleStraight = xb.getFingerStraightness(context, 'middle');
    const ringCurl = xb.getFingerCurl(context, 'ring');
    const pinkyCurl = xb.getFingerCurl(context, 'pinky');
    const spread = xb.getFingerSpread(context, 'index', 'middle');

    const confidence = xb.clamp01(
      xb.average([indexStraight, middleStraight]) *
        xb.average([ringCurl, pinkyCurl, spread])
    );

    return {
      confidence,
      data: {
        indexStraight,
        middleStraight,
        ringCurl,
        pinkyCurl,
        spread,
      },
    };
  },
  {enabled: true}
);

options.gestures.setGestureRecognizer(recognizer);
```

Use `new xb.HeuristicGestureRecognizer(false)` when you want only your custom
registrations and no built-in gestures.

```js
const recognizer = new xb.HeuristicGestureRecognizer(false)
  .registerGesture('wave', detectWave)
  .registerGesture('pinch-ish', detectPinchish);
```

The current built-in heuristic names are:

```txt
pinch
open-palm
fist
thumbs-up
thumbs-down
point
spread
```

`point` and `spread` are registered disabled by default; enable them by name if
you want them emitted.

## Hand Pose Helpers

All helpers are exported from `xrblocks` and operate on `HandContext`.

Joint access and palm pose:

```txt
getJoint(context, jointName)
getFingerJoint(context, finger, suffix)
estimateHandScale(context)
getPalmWidth(context)
getPalmNormal(context)
getPalmRight(context)
getPalmUp(context)
getPalmPose(context)
```

Finger and thumb features:

```txt
getFingerBendAngles(context, finger)
getFingerStraightness(context, finger)
getFingerCurl(context, finger)
getFingerDirection(context, finger)
getFingerPalmAlignment(context, finger)
getFingerSpread(context, fingerA, fingerB)
getAdjacentFingerSpreads(context)
getThumbBendAngles(context)
getThumbStraightness(context)
getThumbCurl(context)
getThumbDirection(context)
getThumbOpposition(context, finger)
getThumbVerticalDirection(context)
getFingertipDistance(context, digitA, digitB)
getFingertipPalmDistance(context, digit)
```

Feature-vector helpers for ML/custom models:

```txt
getBoneVectors(context, global = false)
getRelativeBoneAngles(context, global = false)
```

Utility helpers:

```txt
average(values)
clamp01(value)
```

Finger names are `index`, `middle`, `ring`, and `pinky`. Digit names are
`thumb`, `index`, `middle`, `ring`, and `pinky`.

## Custom Gesture Recognizer

Use a custom `GestureRecognizer` when your recognizer owns its own model or
wants to score several gestures together.

```js
class CustomGestureRecognizer {
  async init() {
    this.model = await loadMyModel();
  }

  getGestureConfigurations() {
    return {
      rock: {enabled: true},
      shaka: {enabled: true},
      victory: {enabled: true},
    };
  }

  recognize(context) {
    const features = xb.getRelativeBoneAngles(context);
    const result = runModel(this.model, features);

    return {
      rock: {confidence: result.rock},
      shaka: {confidence: result.shaka},
      victory: {confidence: result.victory},
    };
  }
}

options.gestures.setGestureRecognizer(new CustomGestureRecognizer());
```

Recognizers may return a `Promise<GestureScoreMap>`. The SDK stores the latest
completed async result for each hand and keeps update frames moving.

## Custom Pose Estimator

Use a custom `PoseEstimator` when your pose data does not come from
`xb.user.hands`. For example, a webcam or ML landmark model can be adapted into
the canonical `HandContext`.

```js
class WebcamPoseEstimator {
  async init() {
    this.video = document.querySelector('video');
    this.detector = await createWebcamHandDetector();
  }

  getHandContext(handedness) {
    if (handedness !== xb.Handedness.RIGHT) return null;

    const landmarks = this.detector.latestLandmarks;
    if (!landmarks) return null;

    const joints = new Map();
    joints.set('wrist', toVector3(landmarks[0]));
    joints.set('thumb-metacarpal', toVector3(landmarks[1]));
    joints.set('thumb-phalanx-proximal', toVector3(landmarks[2]));
    joints.set('thumb-phalanx-distal', toVector3(landmarks[3]));
    joints.set('thumb-tip', toVector3(landmarks[4]));
    // Continue mapping to every name in xb.HAND_JOINT_NAMES.

    return {
      handedness,
      handLabel: 'right',
      globalTransform: new THREE.Matrix4(),
      joints,
      getLocalJointPositions: () => jointMapToArray(joints),
      getGlobalJointPositions: () => jointMapToArray(joints),
      getJoint: (jointName) => joints.get(jointName),
    };
  }

  getHandContexts() {
    return {
      right: this.getHandContext(xb.Handedness.RIGHT) ?? undefined,
    };
  }
}

options.gestures.setPoseEstimator(new WebcamPoseEstimator());
```

When adapting MediaPipe-style 21-landmark hands, map source landmarks into the
XR Blocks joint names. If the source model does not expose a joint exactly,
estimate it consistently. For example, MediaPipe does not separately expose the
four finger metacarpals in the same way WebXR does, so a demo can approximate
them between the wrist and each finger's MCP landmark.

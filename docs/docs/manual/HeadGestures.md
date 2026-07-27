---
sidebar_position: 8
title: Head Gestures
---

# Head Gestures

XR Blocks recognizes completed head nods and shakes from the same camera pose
used by WebXR and the desktop simulator. Head gestures do not require hand or
controller tracking.

## Quick Start

```js
import * as xb from 'xrblocks';

const options = new xb.Options();
options.enableHeadGestures();

await xb.init(options);

xb.input.headGestures?.addEventListener('gesture', (event) => {
  const {name, confidence, data} = event.detail;
  console.log(name, confidence, data);
});
```

The built-in gesture names are `nod`, `shake`, `nod-up`, `nod-down`,
`shake-left`, and `shake-right`. All are enabled by default. A completed motion
emits both its generic and directional gesture; for example, an upward-first nod
emits `nod` and `nod-up`. Each event represents one completed motion rather than
a held pose.

## Configuration

```js
const options = new xb.Options();
options.enableHeadGestures();

options.headGestures.minimumConfidence = 0.65;
options.headGestures.releaseConfidence = 0.4;
options.headGestures.updateIntervalMs = 16;
options.headGestures.historyDurationMs = 1500;

options.headGestures.setGestureEnabled('shake', false);
options.headGestures.setGestureConfig('nod', {
  enabled: true,
  threshold: THREE.MathUtils.degToRad(10),
});
```

For built-in heuristics, `threshold` is the minimum angular amplitude in
radians. Defaults are approximately 12 degrees for nods and 10 degrees for
shakes.

## Recognition Pipeline

```txt
camera pose -> HeadGestureContext -> HeadGestureRecognizer -> gesture event
```

`HeadGestureRecognition` samples the full world-space camera pose every frame
and retains a rolling history. The configured recognizer evaluates that history
at `updateIntervalMs` and returns confidence scores by name. A per-gesture latch
emits once when confidence crosses `minimumConfidence` and rearms below
`releaseConfidence`.

The default `HeuristicHeadGestureRecognizer` measures motion in axes local to a
recent resting orientation. A nod is a pitch excursion and return. A shake is a
yaw excursion and return. The directional variants classify the initial
excursion as up, down, left, or right. The detectors accept either starting
direction and reject excessive off-axis motion.

Built-in gestures are intentionally quick: a completed excursion must take
roughly 200–750 ms and reach a minimum peak angular speed. Slow looks and slow
nods are not recognized as gestures.

Large tracking jumps and timestamp gaps clear recognition history without
emitting. This prevents session entry, tab suspension, or simulator pose resets
from looking like gestures.

## Event Data

```ts
interface HeadGestureEventDetail {
  name: string;
  confidence: number;
  data?: Record<string, unknown>;
}
```

Built-in heuristic events include best-effort diagnostics in `data`:

```txt
amplitudeRadians
durationMs
peakAngularSpeed
initialDirection
```

## Custom Recognizers

A recognizer may be synchronous or asynchronous, leaving room for future ML
implementations without changing event handling:

```ts
interface HeadGestureRecognizer {
  recognize(
    context: HeadGestureContext
  ): HeadGestureScoreMap | Promise<HeadGestureScoreMap>;
}
```

For a custom heuristic, register a detector function:

```js
const recognizer = new xb.HeuristicHeadGestureRecognizer(false);

recognizer.registerGesture(
  'tilt',
  (context, config) => {
    // Inspect context.samples and return a normalized confidence.
    return {confidence: 0.8};
  },
  {enabled: true}
);

options.headGestures.setGestureRecognizer(recognizer);
```

Call `enableHeadGestures()` and select the recognizer before `xb.init()`. The
runtime detector is an optional child, so check `xb.input.headGestures` before
subscribing.

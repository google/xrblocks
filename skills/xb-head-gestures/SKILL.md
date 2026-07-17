---
name: xb-head-gestures
description: >-
  Detect completed head nod and shake gestures in XR Blocks from headset or
  simulator camera motion. Use when triggering actions from head movement
  without hands/controllers. Covers enableHeadGestures(), options.headGestures,
  xb.input.headGestures, completed gesture events, heuristic tuning, and custom
  HeadGestureRecognizer implementations.
---

# xb-head-gestures: completed head motion

Head gestures are optional children of `xb.input` and use the same camera pose
in WebXR and the desktop simulator.

## Setup

```js
const options = new xb.Options();
options.enableHeadGestures();
await xb.init(options);
```

The built-in `nod`, `shake`, `nod-up`, `nod-down`, `shake-left`, and
`shake-right` gestures are enabled by default. A completed motion emits its
generic and directional names, such as `nod` and `nod-down`. They emit once
after a complete motion, unlike held hand-pose gestures.

## Subscribe

```js
class HeadGestureListener extends xb.Script {
  init() {
    this.onGesture = (event) => {
      const {name, confidence, data} = event.detail;
      console.log(name, confidence, data);
    };
    xb.input.headGestures?.addEventListener('gesture', this.onGesture);
  }

  dispose() {
    if (this.onGesture) {
      xb.input.headGestures?.removeEventListener('gesture', this.onGesture);
    }
  }
}
```

## Tune

```js
options.headGestures.minimumConfidence = 0.65;
options.headGestures.releaseConfidence = 0.4;
options.headGestures.setGestureEnabled('shake', false);
options.headGestures.setGestureConfig('nod', {
  enabled: true,
  threshold: THREE.MathUtils.degToRad(10),
});
```

For built-ins, `threshold` is angular amplitude in radians. Event `data` may
include `amplitudeRadians`, `durationMs`, `peakAngularSpeed`, and
`initialDirection`.

## Custom recognition

Use `HeuristicHeadGestureRecognizer.registerGesture()` for custom temporal
heuristics. For other backends, implement `HeadGestureRecognizer`; its
`recognize(context)` method may return a score map synchronously or as a
promise. `HeadGestureContext.samples` contains the recent full 6DoF head pose
window.

Do not invent `xb.core.headGestureRecognition`; the runtime API is the optional
`xb.input.headGestures` child.

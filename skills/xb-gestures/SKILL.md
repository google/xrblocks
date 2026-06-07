---
name: xb-gestures
description: >-
  Detect named hand gestures in an XR Blocks app — pinch, open-palm, fist,
  thumbs-up, point, and spread — and subscribe to gesturestart / gestureupdate /
  gestureend events with per-hand name and confidence. Use when triggering actions
  from poses rather than raw pinch/touch (e.g. point-to-aim, open-palm menu,
  thumbs-up confirm). Covers `enableGestures()`, `options.gestures.setGestureEnabled`,
  and the `xb.core.gestureRecognition` event API. For raw hand joints/touch/grab,
  use xb-hands; for stroke/shape recognition use the strokes API.
---

# xb-gestures: gesture recognition

Builds on hand tracking ([`xb-hands`](../xb-hands/SKILL.md)) to recognize discrete poses and
emit DOM-style events.

## Setup

```js
const options = new xb.Options();
options.enableReticles();
options.enableGestures();

// Opt specific gestures in (names: pinch, open-palm, fist, thumbs-up, point, spread).
options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);

options.hands.enabled = true; // gestures need hands
options.simulator.defaultMode = xb.SimulatorMode.POSE; // pose hands on desktop
xb.init(options);
```

## Subscribe to events

`xb.core.gestureRecognition` is an `EventTarget`. Subscribe in your Script's `init()` and
unsubscribe in `dispose()`:

```js
class GestureLogger extends xb.Script {
  init() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) {
      console.warn('Call options.enableGestures() before xb.init().');
      return;
    }
    this._onStart = (event) => {
      const {hand, name, confidence = 0} = event.detail; // hand: 'left'|'right'
      console.log(`${hand} started ${name} (${confidence.toFixed(2)})`);
    };
    this._onEnd = (event) => {
      const {hand, name} = event.detail;
      console.log(`${hand} ended ${name}`);
    };
    gestures.addEventListener('gesturestart', this._onStart);
    gestures.addEventListener('gestureend', this._onEnd);
    // 'gestureupdate' fires continuously while a gesture is held.
  }
  dispose() {
    const g = xb.core.gestureRecognition;
    if (!g) return;
    g.removeEventListener('gesturestart', this._onStart);
    g.removeEventListener('gestureend', this._onEnd);
  }
}
```

## Notes

- Events: `gesturestart`, `gestureupdate`, `gestureend`; `event.detail = {hand, name, confidence}`.
- Tune providers/thresholds via `options.gestures` (see
  [`src/input/gestures/GestureRecognitionOptions.ts`](../../src/input/gestures/GestureRecognitionOptions.ts)).
- Heuristic detectors ship by default; custom TF-Lite / PyTorch gesture models can be wired in.
- See `templates/heuristic_hand_gestures` and `demos/sim_hand_poses` for full examples.

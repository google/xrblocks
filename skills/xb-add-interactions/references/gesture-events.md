# Gesture events

Use gesture events when a recognized pose or completed motion is the meaning of
the action. Use select/touch/grab instead when the meaning is clicking or
contact.

## Named hand poses

`enableGestures()` also enables hands. The runtime is
`xb.core.gestureRecognition`, an optional `EventTarget` that emits
`gesturestart`, `gestureupdate`, and `gestureend` with
`event.detail = {hand, name, confidence, data?}`. `hand` is `'left'` or
`'right'`.

```js
const options = new xb.Options();
options.enableGestures();
options.gestures.setGestureEnabled('point', true);
options.simulator.defaultMode = xb.SimulatorMode.POSE;

class PoseAction extends xb.Script {
  init() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;
    this._onStart = (event) => {
      if (event.detail.name === 'point') this.beginPointing(event.detail.hand);
    };
    this._onEnd = (event) => {
      if (event.detail.name === 'point') this.endPointing(event.detail.hand);
    };
    gestures.addEventListener('gesturestart', this._onStart);
    gestures.addEventListener('gestureend', this._onEnd);
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;
    gestures.removeEventListener('gesturestart', this._onStart);
    gestures.removeEventListener('gestureend', this._onEnd);
  }
}
```

Built-in heuristic names are `pinch`, `open-palm`, `fist`, `thumbs-up`,
`thumbs-down`, `point`, and `spread`. `point` and `spread` start disabled;
enable them explicitly. Tune recognition with `minimumConfidence`,
`updateIntervalMs`, `setGestureEnabled()`, and `setGestureConfig()` before
`xb.init()`.

Use `gesturestart` for a discrete transition, `gestureupdate` only for a held
pose that continuously drives state, and `gestureend` to release it. The full
custom recognizer and hand-feature API lives in the
[hand gestures manual](../../../docs/docs/manual/HandGestures.md); a verified
starter is
[`templates/heuristic_hand_gestures/main.js`](../../../templates/heuristic_hand_gestures/main.js).

## Completed head motion

Head gestures use the camera pose and require neither hands nor controllers.
The runtime is optional at `xb.input.headGestures`; it emits one `gesture` event
per recognized completed motion:

```js
const options = new xb.Options();
options.enableHeadGestures();

class HeadAction extends xb.Script {
  init() {
    this._onGesture = (event) => this.handleHeadGesture(event.detail);
    xb.input.headGestures?.addEventListener('gesture', this._onGesture);
  }

  dispose() {
    xb.input.headGestures?.removeEventListener('gesture', this._onGesture);
  }
}
```

Built-in names are `nod`, `shake`, `nod-up`, `nod-down`, `shake-left`, and
`shake-right`. One completed motion emits its generic and directional names, so
filter deliberately if the app should transition once. Configure
`minimumConfidence`, `releaseConfidence`, `updateIntervalMs`,
`historyDurationMs`, `setGestureEnabled()`, or `setGestureConfig()` before
initialization.

In the simulator, mouse look drives the same camera-pose recognizer. Tell the
user to make a quick complete excursion and return rather than a slow look. See the
[head gestures manual](../../../docs/docs/manual/HeadGestures.md) for detector
timing and custom recognizers, and
[`samples/head_gestures/main.js`](../../../samples/head_gestures/main.js) for
cleanup and user feedback.

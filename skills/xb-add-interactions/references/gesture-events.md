# Gesture events

Read this reference when a recognized pose or completed motion is the user's
intent. Use selection, touch, or grab when clicking or contact is the intent.

## Hand poses

Call `options.enableGestures()` before initialization. Subscribe to the optional
`xb.core.gestureRecognition` target. It emits `gesturestart`, `gestureupdate`,
and `gestureend` with `{hand, name, confidence, data?}` in `event.detail`.

Use `gesturestart` for one transition, `gestureupdate` only for continuous held
state, and `gestureend` for release. Store listener functions and remove them in
`dispose()`.

Current built-in names and custom-recognizer setup are in the
[Hand Gestures manual](../../../docs/docs/manual/HandGestures.md) and
[`../../../templates/12_hand_gestures/`](../../../templates/12_hand_gestures/).

## Completed head motion

Call `options.enableHeadGestures()` before initialization. Subscribe to the
optional `xb.input.headGestures` target's `gesture` event. Each event describes
one completed motion. A motion can emit both a generic and directional name, so
filter deliberately when the application transition must occur once.

Read the
[Head Gestures manual](../../../docs/docs/manual/HeadGestures.md) for names,
timing, confidence, and custom recognizers. In the simulator, test a quick
complete excursion and return rather than a slow look.

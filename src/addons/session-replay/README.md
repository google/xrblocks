# session-replay

Record XR sessions and replay them in the [xrblocks](https://github.com/google/xrblocks) desktop simulator.

`SessionRecorder` captures the head pose, both controller poses, select state, and all 25 hand joints each frame. It works in a headset and in the simulator. `SessionPlayer` drives the simulator from a recording, so the scene sees the same head motion, hand shapes, and select events that happened when it was recorded.

This makes it possible to capture an interaction once on a headset and then reproduce it on a desktop as many times as needed: to debug a gesture, to show a demo without a headset, or to replay the same input against a change.

---

## Quick start

```ts
import * as xb from 'xrblocks';
import {
  SessionPlayer,
  SessionRecorder,
  downloadSessionRecording,
} from 'xrblocks/addons/session-replay/index.js';

// Add the player first so other scripts see replayed poses in the same frame.
const player = new SessionPlayer();
const recorder = new SessionRecorder();
xb.add(player);
xb.add(recorder);

const options = new xb.Options();
options.enableHands();
xb.init(options);

// Later, for example from a button.
recorder.start();
// ...
const recording = recorder.stop();
downloadSessionRecording(recording);

// In the desktop simulator.
await player.play(recording);
```

`play()` resolves when the recording finishes or `player.stop()` is called. Stopping early releases any held selection so scripts do not see a stuck pinch.

To load a saved file, pass its text to `parseSessionRecording()`. It validates the format and reports the first bad frame by index.

```ts
import {parseSessionRecording} from 'xrblocks/addons/session-replay/index.js';

const recording = parseSessionRecording(await file.text());
await player.play(recording);
```

---

## Recording format

A recording is plain JSON, so it can be saved, diffed, and checked into a repository.

```ts
{
  format: 'xrblocks-session',
  version: 1,
  source: 'xr' | 'simulator' | 'desktop',
  frames: [
    {
      t: 0, // milliseconds since start()
      head: [x, y, z, qx, qy, qz, qw],
      controllers: [left | null, right | null], // {pose, selected}
      hands: [left | null, right | null], // 25 joint poses, WebXR joint order
    },
  ],
}
```

All poses are in world space. Positions are in meters and rounded to five decimal places.

Frames are sampled at 30 Hz by default. A frame is always written when a selection starts or ends, so short pinches are not lost between samples. Playback fires every recorded selection change in order, even when several fall between two rendered frames, and holds each one for at least a frame so interaction sees it. Pass `sampleIntervalMs` to change the rate:

```ts
const recorder = new SessionRecorder({sampleIntervalMs: 1000 / 60});
```

A minute of both hands at 30 Hz is roughly 5 MB of JSON.

During playback, positions are interpolated linearly and rotations with slerp. Select state and hand tracking switch on the earlier frame, so they never change between samples.

Controllers are matched to the left and right slots by `inputSource.handedness`. A hand is recorded only when it is visible and every joint is tracked; otherwise that slot is `null` and the simulator hand is hidden during replay.

---

## Limitations

- Replay runs only in the desktop simulator. In a real XR session the device overwrites the camera and controller poses every frame, so `play()` rejects when the simulator is not running.
- Only select is recorded. Squeeze, mouse, and gamepad input are not part of version 1.
- `SessionPlayer` applies the replayed pose in its `update()`. Scripts added before it see the previous frame, so add the player first. Direct-touch interaction can lag the replay by one frame.
- Recordings store poses, not scene state. Replay reproduces the input, and the scene responds to it the same way only if it starts in the same state.

See `demos/session_replay` for a working example with record, replay, save, and load buttons.

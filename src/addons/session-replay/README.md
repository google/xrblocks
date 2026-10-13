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

### Starting from the same scene

A recording drives input, not the scene. If replaying a pinch toggles something, it toggles it again from wherever the scene is now. Two things decide where the replay starts: the simulator room and your app's own objects.

**The simulator room is restored automatically.** A simulator recording stores the room it was made in as a `{name, manifestPath}` reference, and `play()` loads that room before replaying. Built-in rooms embed their manifest in `manifestPath`, so they work anywhere. A custom room is loaded again from its manifest URL, so that URL must be reachable from the page that replays it. If the room cannot be loaded, `play()` rejects with an error that names it. Pass `{environment: false}` to replay in the current room instead:

```ts
await player.play(recording, {environment: false});
```

Headset recordings store no room, because the room was the real one. They replay in whichever simulator room is loaded.

**Your app's objects are yours to save.** Pass their starting state to `start()` and restore it before playing:

```ts
recorder.start({state: {cubeColors: cubes.map((cube) => cube.colorIndex)}});
// ...
const {cubeColors} = recording.state as {cubeColors: number[]};
cubeColors.forEach((color, i) => cubes[i].setColor(color));
await player.play(recording);
```

`state` can be any JSON value. It is copied when recording starts and saved with the file. The addon never reads it. Apps that already serialize their scene can pass that snapshot directly. For example, a Roomcraft scene stores its objects, transforms, and recipes as `room.layout`:

```ts
recorder.start({state: room.layout});
// ...
await room.applyLayout(recording.state);
await player.play(recording);
```

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
  environment?: {name?: string, manifestPath: string}, // simulator room
  state?: unknown, // whatever was passed to start()
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
- Recordings store input, a reference to the simulator room, and optional app `state`. They do not store meshes, physics, animation progress, or responses from AI calls the app makes during the session, so anything nondeterministic can play out differently.

See `demos/session_replay` for a working example with record, replay, save, and load buttons.

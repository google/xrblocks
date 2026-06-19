# embodied-control

Programmatic embodied-user control for [xrblocks](https://github.com/google/xrblocks).

`embodied-control` lets tests, demos, and agent runners drive an XR Blocks
scene through the same high-level surfaces a user has: locomotion, head/camera
rotation, left hand pose, right hand pose, and WebXR-like select gestures. It is
designed to work locally without networking, and to serve as the action
executor behind the `remote-control` WebSocket addon.

The addon follows the normal XR Blocks script lifecycle: construct it, add it to
the scene before `xb.init()`, and let dependency injection provide `Core`,
`Simulator`, `Input`, and `Camera`.

---

## Quick start

```ts
import * as xb from 'xrblocks';
import {EmbodiedControl} from 'xrblocks/addons/embodied-control/index.js';

const embodied = new EmbodiedControl({
  includeScreenshot: false,
});

xb.add(embodied);
await xb.init();

embodied.applyControl({
  rightHand: {visible: true},
});

await embodied.step({
  durationMs: 250,
  control: {
    locomotion: {move: [0, 0, -0.25]},
    rightHand: {move: [0, 0, -0.12]},
  },
});
```

`applyControl()` applies the control immediately and leaves the normal frame
loop alone. Use it in live apps, scripts, and demos where XR Blocks should keep
rendering normally.

`step()` applies a control over a duration, advances the core frame loop, and
returns an observation. By default, `EmbodiedControl` pauses the core after
initialization so frames advance only when `step()` is called. This is useful
for repeatable tests and agent evaluation.

For visual demos, pass `realTime: true` so the browser paints intermediate
frames while a step is executing:

```ts
const embodied = new EmbodiedControl({
  realTime: true,
  includeScreenshot: false,
});
```

---

## Action schema

Both `applyControl()` and `step()` use the same compound control schema.
Locomotion and both hands can move during the same control.

```ts
await embodied.step({
  id: 'reach-and-grab',
  durationMs: 500,
  control: {
    locomotion: {
      move: [0, 0, -0.2],
      rotate: [0, 15, 0],
    },
    rightHand: {
      move: [0, 0, -0.18],
      selectStart: true,
    },
    leftHand: {
      move: [-0.05, 0, 0],
    },
  },
});
```

### Locomotion

```ts
locomotion: {
  move?: [strafeMeters, riseMeters, forwardMeters];
  rotate?: [pitchDegrees, yawDegrees, rollDegrees];
}
```

Movement is camera-relative and is distributed over the whole step duration.

### Hands

```ts
rightHand: {
  move?: [xMeters, yMeters, zMeters];
  rotate?: [pitchDegrees, yawDegrees, rollDegrees];
  selectStart?: boolean;
  selectEnd?: boolean;
  rotations?: SimulatorHandPoseRotations;
  visible?: boolean;
}
```

Hand `move` and `rotate` are relative to the current simulator controller pose.
`rotations` applies sparse simulator hand joint rotations in radians.

Use `selectStart` and `selectEnd` for WebXR-like hand selection. In the
simulator these call `setLeftHandPinching()` / `setRightHandPinching()`, which
emits the normal XR Blocks `selectstart` / `selectend` events and updates the
controller selected state. This is different from passing raw pinching
`rotations`, which only changes the visual hand pose.

---

## High-level actions

In addition to raw coordinate-relative `step()` controls, `EmbodiedControl` exposes high-level, intent-based methods that perform automatic vector math and frame stepping. These methods are designed for layout-independent testing and semantic agent execution:

```ts
// Teleport directly in front of the yellow cube
await embodied.teleportTo(cube, {distance: 1.2, faceTarget: true});

// Smoothly turn user head to look at target at 1.5 radians/sec
await embodied.lookAtTarget(cube, {velocity: 1.5});

// Smoothly point right controller at target at 1.5 radians/sec
await embodied.pointTo(1, cube, {velocity: 1.5}); // 1 = right hand

// Smoothly extend right hand to cube at 0.5 meters/sec
await embodied.reachTo(1, cube, {velocity: 0.5});

// Perform click (selectStart + selectEnd sequence)
await embodied.click(1);
```

All high-level methods return a `Promise<EmbodiedControlStepResult>` containing the elapsed time and completed observation:

- **`teleportTo(target, options)`**: Teleports the camera to coordinates or facing an object. Options: `distance` (default 1.5m), `faceTarget` (default true), and `snapToGround` (default false; if true, snaps camera Y coordinate to user standing height above closest detected horizontal ground plane).
- **`lookAtTarget(target, options)`**: Rotates the camera to look at the target. Options: `velocity` (radians/second; if omitted, snaps instantly in 1 frame).
- **`pointTo(handIndex, target, options)`**: Rotates the controller locally in camera space to point directly at the target, keeping its position/radius unchanged. Options: `velocity` (radians/second; if omitted, snaps instantly in 1 frame).
- **`reachTo(handIndex, target, options)`**: Moves the controller position towards the target. Options: `velocity` (meters/second; if omitted, moves instantly).
- **`click(handIndex, options)`**: Simulates click gesture press and release. Options: `durationMs` (default 200ms).

---

## Observations

Only `step()` resolves with an observation:

```ts
const result = await embodied.step({control: {rightHand: {selectEnd: true}}});

console.log(result.elapsedMs);
console.log(result.observation.state.camera.position);
console.log(result.observation.state.rightHand.selected);
```

When `includeScreenshot` is enabled, observations include a screenshot data URL
captured after the final frame of the step.

---

## Local tests and agent loops

The addon does not require a WebSocket server. Local test cases can construct
and call `EmbodiedControl` directly:

```ts
await embodied.step({control: {rightHand: {selectStart: true}}});
await embodied.step({control: {rightHand: {move: [0, 0, -0.1]}}});
await embodied.step({control: {rightHand: {selectEnd: true}}});
```

Only one step may run at a time. If a second step is requested while another is
active, `EmbodiedControlBusyError` is thrown.

---

## Live app control

For a normally running app, disable `autoPause` and call `applyControl()` from
your script, UI, or scheduler:

```ts
const embodied = new EmbodiedControl({
  autoPause: false,
  includeScreenshot: false,
});

embodied.applyControl({
  locomotion: {rotate: [0, 10, 0]},
  rightHand: {selectStart: true},
});
```

`applyControl()` does not call `core.stepFrame()`, does not capture a
screenshot, and does not return an observation.

---

## Sample

See `samples/embodied_control/` for a sidebar-driven simulator sample. It
disables manual simulator controls and runs locomotion, hand motion, and
pinch-select steps only through `EmbodiedControl`.

---

## Public surface

- `EmbodiedControl` — XR Blocks `Script` that exposes `applyControl()` and
  `step()`.
- `EmbodiedControlExecutor` — lower-level executor used by the script and by
  tests or custom harnesses.
- `EmbodiedControlStep` / `XRCompoundControl` / `HandControl` /
  `LocomotionControl` — JSON-compatible action types.
- `EmbodiedControlStepResult` / `EmbodiedControlObservation` — observation
  result types.

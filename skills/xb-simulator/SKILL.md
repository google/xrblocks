---
name: xb-simulator
description: >-
  Develop and test XR Blocks apps on the desktop without a headset using the built-in
  simulator — a simulated user, hands, depth, and planes rendered in a normal browser,
  with control modes for moving the user, posing hands, or driving controllers. Use
  when running/iterating locally, reproducing XR interactions on desktop, posing
  hands for gesture work, or adding the optional 2D simulator settings UI. Covers the
  `?formFactor=desktop` autostart, `options.simulator.*`, `xb.SimulatorMode`, the
  `SimulatorAddons` 2D UI import, and the `onSimulatorStarted()` hook.
---

# xb-simulator: desktop XR simulator

The simulator runs the same app in a normal browser so you can iterate without a device. It is
on by default (`options.enableSimulator`).

## Run / autostart

```bash
npm run dev    # serves http://127.0.0.1:8080
```

- Click **Enter Simulator** on the XR button, or
- append `?formFactor=desktop` to the URL to autostart the simulator, or
- set it in code:

```js
const options = new xb.Options();
options.formFactor = 'desktop'; // autostart simulator
// or expose a button: options.xrButton.showEnterSimulatorButton = true;
```

## Optional 2D desktop UI

Import the simulator addon to get on-screen settings/instruction panels (hand-pose picker,
gamepad settings, mic button, etc.) on desktop:

```js
import 'xrblocks/addons/simulator/SimulatorAddons.js';
```

## Control modes

```js
options.simulator.defaultMode = xb.SimulatorMode.POSE; // pose hands (great for gestures/hands)
```

`SimulatorMode.POSE` lets you pose virtual hands; other modes move the user or drive
controllers — see [`src/simulator/SimulatorOptions.ts`](../../src/simulator/SimulatorOptions.ts)
and `src/simulator/controlModes/`.

## Reach limits

You can limit how far each virtual hand controller can travel from the user's shoulder origin (in meters) and restrict their movement to an angular cone (in radians) facing forward from the camera:

```js
options.simulator.reachDistance.enabled = true;
options.simulator.reachDistance.radius = 0.75; // meters from shoulder origin
options.simulator.reachDistance.leftHandOrigin = {x: -0.2, y: -0.2, z: 0};
options.simulator.reachDistance.rightHandOrigin = {x: 0.2, y: -0.2, z: 0};

options.simulator.reachAngle.enabled = true;
options.simulator.reachAngle.angle = Math.PI; // radians (default Math.PI is a front hemisphere)
```

## Lifecycle

`onSimulatorStarted()` fires when the simulator boots — a common pattern is to mirror your XR
startup:

```js
onSimulatorStarted() { this.onXRSessionStarted(); }
```

## Notes

- The simulator provides simulated depth and planes, so [`xb-depth`](../xb-depth/SKILL.md) and
  [`xb-world`](../xb-world/SKILL.md) features work on desktop.
- `demos/sim_hand_poses` is a focused example of posing hands in the simulator.
- `options.enableSimulator = false` (or `formFactor: 'xr'`) disables it for device-only builds.

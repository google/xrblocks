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

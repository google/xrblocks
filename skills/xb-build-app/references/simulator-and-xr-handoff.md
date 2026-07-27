# Simulator and XR handoff

Read the branch selected by the experience contract. Use both when the app must
remain useful across desktop development and a real XR session.

## Desktop simulator branch

The simulator runs the app's real XR Blocks lifecycle in an ordinary browser;
it supplies simulated inputs and world data rather than emulating browser WebXR
APIs.

Use one adaptive startup for the app:

```js
import 'xrblocks/addons/simulator/SimulatorAddons.js';

const options = new xb.Options(); // formFactor defaults to auto
```

`auto` is the primary form factor. XR-capable devices retain the Enter XR flow;
when WebXR is unsupported, XR Blocks starts the simulator. Importing
`SimulatorAddons` registers the settings, instructions, hand-pose, and gamepad
UI used by the simulator without changing the XR session path. A plain
`xb.Options()` also preserves the `?formFactor=...` override parsed by its
constructor.

Use this human-facing URL when the user specifically wants to force the
simulator:

```text
http://127.0.0.1:8080/path/to/app/?formFactor=desktop
```

`?formFactor=desktop` autostarts the simulator. Keep the ordinary simulator UI
visible for a user handoff. `options.enableAutomationMode()` and
`?xrAutomation=1` are external-run presets that hide simulator controls by
default; reserve them for `xb-automate-app` scenarios.

Choose the initial mode before `xb.init(options)`:

```js
options.simulator.defaultMode = xb.SimulatorMode.USER;
```

- `USER`: move the user with WASD and use the mouse as a controller.
- `POSE` (Navigation): move the user with WASD/QE, rotate by dragging, and use
  configured hand poses.
- `CONTROLLER` (Hands): move the active hand with WASD/QE, switch hands with
  `T`, and toggle pinch with Space.
- `POINTER_LOCK`: first-person mouse look and click selection.

Select a simulator environment only when room geometry, planes, depth, objects,
or navigation affect the experience. Declare it before initialization:

```js
options.simulator.environments = [
  {name: 'Test Room', manifestPath: './test-room.json'},
];
options.simulator.activeEnvironmentIndex = 0;
```

The simulator is faithful for app wiring, layout, basic input, simulated hands,
depth, planes, and configured scene objects. Hand the user a device check for
native WebXR availability, real tracking, camera permissions, passthrough,
device depth, lighting, and physical comfort.

## XR device branch

Keep `formFactor: 'auto'` so supported devices receive the Enter XR flow while
other browsers retain the simulator path and its loaded UI. Set
`options.formFactor = 'xr'` only for an explicitly device-only experience.

The default session mode is `immersive-ar`. Call `options.enableVR()` for an
immersive VR experience. Configure required browser permissions before
`xb.init(options)` so XR Blocks can request them before entering the immersive
session:

```js
const options = new xb.Options();
options.permissions.camera = true;
options.permissions.microphone = true;
```

Keep session-specific setup in lifecycle hooks and share domain initialization
when both surfaces need it:

```js
class MainScript extends xb.Script {
  startExperience() {
    // Idempotent transition into the primary experience.
  }

  onSimulatorStarted() {
    this.startExperience();
  }

  onXRSessionStarted() {
    this.startExperience();
  }
}
```

Give the user the served or deployed URL, supported browser/device, session
mode, permission prompts, input gesture, and expected outcome. A simulator URL
is useful supporting evidence, but native sensing and interaction remain an XR
device acceptance check.

## Smoke boundary

The agent owns code completion and the checks its environment can perform:
module loading, initialization, first render, a reachable primary action,
observable feedback, focused existing checks, and relevant console errors.

The user acceptance session owns spatial judgment and hardware evidence:
physical scale, reach, readability in motion, hand/controller tracking,
passthrough and depth alignment, permission UX, frame rate, thermal behavior,
and repeated entry/exit. Report these as a short checklist matched to the app's
actual features.

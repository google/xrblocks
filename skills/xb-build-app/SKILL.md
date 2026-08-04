---
name: xb-build-app
description: >-
  Handoff-ready builder for complete XR Blocks applications. Use when creating
  or repairing an app scaffold, implementing its primary experience flow,
  combining several SDK capabilities, or preparing the result for user testing
  in the desktop simulator or on an XR device.
---

# Build an XR Blocks app

Deliver a **handoff-ready vertical slice**: the smallest complete version of the
primary experience that a user can open, operate, and judge in the simulator or
XR. Own the implementation and smoke checks; package deeper experiential and
device acceptance as a clear user test handoff.

Invoke [`xb-implement`](../xb-implement/SKILL.md) first and apply its shared
grounding, lifecycle, dependency, and implementation rules. Then return here
for app composition, simulator/XR preparation, smoke checks, and user handoff.

Reach for the focused `xb-add-*` skills when the slice needs interaction,
spatial UI, world sensing, or AI.

## 1. Write the experience contract

Resolve from the request and existing files:

- what appears on first load;
- the primary user action and visible or audible response;
- the intended test surface: simulator, XR device, or both;
- the headset input and useful desktop equivalent;
- required capabilities, assets, permissions, and external services;
- the observable state the user should reach.

Choose sensible spatial and interaction details when the request leaves them
open. This step is complete when the slice can be stated as: “On surface S, the
user does X, the app observes Y, and the experience becomes Z.”

## 2. Choose one working foundation

Read [`../../CONTEXT.md`](../../CONTEXT.md). Preserve an existing app's delivery
model and closest working patterns. For a new repo-hosted JavaScript app, start
from [`../../templates/0_basic/`](../../templates/0_basic/); choose a closer
template only when its capability is central. For a bundled TypeScript app,
inspect [`../../templates/typescript/`](../../templates/typescript/).

For browser-native modules, read
[`references/import-maps.md`](references/import-maps.md) before editing HTML.
Its rules are mandatory whenever the app imports an addon or a new
external package.

The foundation is ready when the app has one launch command and entry URL, and
every bare specifier resolves to one intended dependency graph.

## 3. Implement the complete slice

Use the verified API, lifecycle, and dependency foundation established by
`xb-implement`. Copy the experience-specific configuration pattern from the
nearest template, sample, demo, or manual page.

If any API, option, lifecycle, addon setup, or runtime behavior is unclear,
refer to [`../../docs/docs/manual/`](../../docs/docs/manual/) before proceeding.

Use the engine-owned shape:

```js
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    // Create the initial scene and wire the primary action.
  }
}

const options = new xb.Options(); // defaults to auto; URL may select desktop
xb.add(new MainScript());
await xb.init(options);
```

Construct plain `xb.Options` to retain its `formFactor: 'auto'` default and its
constructor-parsed URL override. This lets one entry select XR when supported
and fall back to the simulator otherwise. Load `SimulatorAddons` so the
settings, instructions, and hand-pose UI are registered whenever that simulator
path starts.

Place content in meters using `xb.user.height`, `xb.user.objectDistance`, and
`xb.user.panelDistance`. Use `xb-add-spatial-ui` for
app UI.

This step is complete when the launch entry contains the full first-load →
primary-action → observable-result path with no placeholder branch in that path.

## 4. Prepare the simulator and XR paths

Read [`references/simulator-and-xr-handoff.md`](references/simulator-and-xr-handoff.md),
then follow the selected surface branch.

Keep the app's normal startup on `formFactor: 'auto'` with `SimulatorAddons`
loaded. For a simulator-specific handoff URL, append `?formFactor=desktop` to
force that branch, choose a useful `xb.SimulatorMode`, and preserve visible
simulator controls. Provide a mouse, keyboard, controller, or simulated-hand
route to the primary action.

For an XR handoff, preserve the Enter XR flow, declare camera, microphone, or
geolocation permissions in `Options` before initialization, and use
`enableVR()` only when the experience targets immersive VR rather than AR.
Represent unsupported sensing and unavailable external services as visible app
states. Use shared startup code when `onSimulatorStarted()` and
`onXRSessionStarted()` need the same scene transition.

This step is complete when the selected surface has an exact URL, entry action,
input instructions, expected result, and explicit device-only limitations.

## 5. Bring the app to smoke-ready

Finish the code, then run the checks available in the working environment:

- build or serve the exact app entry;
- run existing focused tests, type checks, lint, or builds that cover changed
  code in proportion to the change;
- load the selected simulator URL when browser access is available;
- confirm module resolution, initialization, first render, visible interaction
  affordances, registered handlers, and a clean relevant console;
- verify the XR launch button, requested session mode, and pre-session
  permission setup from code when a real XR device is unavailable.

Add narrow automated tests when the app already has a test structure or when
pure state logic benefits from one. Keep comfort, ergonomics, tracking quality,
passthrough alignment, device performance, and extended-session behavior in the
user acceptance handoff.

This step is complete when every available smoke check passes, or an
environment-only check is named precisely for the user to run.

## 6. Hand the user a testable app

Return a compact test card containing:

1. launch command and exact simulator or XR URL;
2. target surface and required device/browser;
3. input steps for the primary experience flow;
4. expected visible or audible result;
5. permissions, keys, assets, or services the user must provide;
6. smoke checks completed and their result;
7. remaining simulator or XR acceptance checks.

Finish when the implementation is complete, the available smoke checks pass,
and the user can begin meaningful testing without discovering setup or control
instructions themselves. The user's acceptance session—not this skill—decides
comfort, experiential quality, and device readiness.

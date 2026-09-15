---
name: xb-build-app
description: Build or extend a complete XR Blocks application. Use when the request concerns an app scaffold, a whole experience, several SDK areas, or an end-to-end simulator or XR handoff rather than one focused subsystem.
---

# Build an XR Blocks app

Deliver a **handoff-ready vertical slice**: the smallest complete experience a
user can open, operate, and judge.

## 1. Write the experience contract

Resolve the first visible state, primary user action, observable result, target
surface, headset input, desktop equivalent, permissions, assets, services, and
unsupported states. Make reasonable spatial choices when the request leaves
them open.

Complete this step when the slice can be stated as: “On surface S, the user
does X, the app observes Y, and the experience becomes Z.”

## 2. Choose one executable foundation

Read [`../../CONTEXT.md`](../../CONTEXT.md). Preserve an existing application's
delivery model. For a new browser-module app, start from
[`../../templates/00_basic/`](../../templates/00_basic/). For a bundled
TypeScript app, start from
[`../../templates/13_typescript_vite/`](../../templates/13_typescript_vite/).
Choose a more focused template only when its feature is central.

For browser modules, read
[`references/import-maps.md`](references/import-maps.md) before changing the
import map. Verify every XR Blocks symbol in
[`../../src/xrblocks.ts`](../../src/xrblocks.ts) or an addon's public entry.

Complete this step when the app has one launch command, one entry URL, and one
dependency graph in which every bare import resolves.

## 3. Build the complete slice

Use the engine-owned shape:

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
  }

  dispose() {
    // Release resources this script owns.
  }
}

const options = new xb.Options();
xb.add(new MainScript());
await xb.init(options);
```

Register scripts before initialization. Use engine-created objects only in or
after `init()`. Put frame behavior in `update()` and release owned GPU, media,
listener, timer, worker, and network resources in `dispose()`.

Use the focused skill when the slice needs spatial UI, interaction, world
sensing, or AI. Use the corresponding manual as concept authority and its
linked template or sample as executable evidence. Addon-specific setup comes
from that addon's README and public entry, not from an addon skill.

Complete this step when first load, primary action, observable result, and all
normal unavailable states are implemented without placeholders.

## 4. Prepare simulator and XR paths

Read
[`references/simulator-and-xr-handoff.md`](references/simulator-and-xr-handoff.md).
Keep normal startup on `formFactor: 'auto'`. Supply an exact desktop simulator
route for the primary action. Declare device permissions and session features
before initialization. Share app state and scene setup across simulator and XR
rather than creating separate applications.

Complete this step when each selected surface has an exact URL, entry action,
input instructions, expected result, and named device-only limitations.

## 5. Prove and hand off the slice

Build or type-check the exact entry, run focused tests, and start the simulator
route when the environment permits it. Check module resolution, initialization,
first render, input affordances, handler registration, cleanup, and relevant
console output. Verify intended public imports against the current entry even
when the build is green.

Return the launch command and URL, target surface, input steps, expected result,
required permissions or services, completed checks, and remaining real-device
checks.

Finish when every available check passes and the user can begin meaningful
testing without discovering setup, controls, or expected behavior from code.

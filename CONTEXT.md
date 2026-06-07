# XR Blocks — Agent Context

XR Blocks (`import * as xb from 'xrblocks'`) is a WebXR SDK for building **AI + XR** apps
(Android XR / VR / AR) that also run in a **desktop simulator**. This file is the quick "how
to build with it" context for agents; deep, task-specific guides live in [`skills/`](skills/),
and the full in-tree overview is [`src/SKILL.md`](src/SKILL.md).

## Rules of Engagement

- **Only call APIs that exist.** Verify against [`src/xrblocks.ts`](src/xrblocks.ts) (the full
  public surface) or copy a working pattern from `samples/`, `templates/`, or `demos/`.
  Hallucinated APIs are the most common failure mode.
- **One engine, script-driven.** Subclass `xb.Script`, `xb.add()` it, then `xb.init(options)`.
  Do **not** write your own `requestAnimationFrame` loop, camera, or WebXR session — `Core`
  owns them. Per-frame logic goes in `update(time, frame)`.
- **Enable features through `Options`**, not by poking internals: `options.enableUI()`,
  `enableHands()`, `enableDepth()`, etc. (full list below).
- **Guard AI.** AI needs a key and may be unavailable — wrap calls in
  `if (xb.ai.isAvailable())`.
- **Test in the simulator first.** It runs automatically on desktop browser without WebXR plugins; `?formFactor=desktop`
  forces to start it. Subsystems created during `xb.init()` (e.g. `xb.core.renderer`) are
  undefined in a constructor — use them in/after `init()`.
- **Units & colors.** World/position values are meters; UI sizes use meters or "layout
  pixels"/`fontSize`. Colors are hex strings (`'#ffffff'`) or `THREE.Color`.

## Core Pattern

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({color: 0x4285f4})
    );
    this.cube.position.set(0, xb.user.height - 0.3, -xb.user.objectDistance);
    this.add(this.cube);
  }
  onSelectEnd() {
    // desktop click OR XR pinch
    this.cube.material.color.set(Math.random() * 0xffffff);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new MainScript());
  xb.init(new xb.Options());
});
```

## Enabling Features (`xb.Options`)

```js
const options = new xb.Options();
options.enableUI(); // spatial UI + reticles
options.enableReticles(); // pointing cursor
options.enableHands(); // hand tracking
options.enableGestures(); // pinch/fist/point/spread/thumbs-up/open-palm
options.enableStrokes(); // $1 unistroke recognition
options.enableDepth(); // depth sensing + depth mesh
options.enablePlaneDetection(); // detected planes in xb.world
options.enableObjectDetection(); // object detection (also enables camera permission)
options.enableCamera('environment'); // passthrough device camera
options.enableAI(); // Gemini/OpenAI via xb.ai
options.enableXRTransitions(); // fade transitions
options.enableVR(); // immersive-vr instead of immersive-ar
```

There is **no** `enablePhysics()`:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';
options.physics.RAPIER = RAPIER; // enables physics
```

## Key Globals & Lifecycle

- Globals: `xb.core`, `xb.scene`, `xb.user`, `xb.world`, `xb.ai`, `xb.depth`, `xb.sound`,
  `xb.input`, `xb.camera`; helpers `xb.add()`, `xb.init()`, `xb.getDeltaTime()`.
- Lifecycle hooks: `init`, `update`, `initPhysics`/`physicsStep`, `onSelectStart/End`,
  `onSqueezeStart/End`, `onKeyDown/Up`, `onXRSessionStarted/Ended`, `onSimulatorStarted`.
- Object-targeted hooks (return `true` to stop propagation): `onObjectSelectStart/End`,
  `onObjectTouchStart/Touching/End`, `onObjectGrabStart/Grabbing/End`,
  `onHoverEnter/Hovering/Exit`.

## Build / Run / Simulate

```bash
npm ci && npm run dev     # builds in watch mode + serves http://127.0.0.1:8080
```

Open a sample/template/demo under that URL; add `?formFactor=desktop` to force the simulator.

## Task Recipes -> Skills/

For "how do I do X", use the focused skills in [`skills/`](skills/): `xb-core`, `xb-ui`,
`xb-uiblocks`, `xb-modelviewer`, `xb-hands`, `xb-gestures`, `xb-depth`, `xb-world`, `xb-ai`,
`xb-physics`, `xb-simulator`, `xb-netblocks`, `xb-sound`.

---
name: xrblocks
description: >-
  Guide to building AI + XR applications with the XR Blocks SDK (the `xrblocks`
  package, source in `src/`). Use when writing, editing, or debugging WebXR /
  Android XR / VR / AR / mixed-reality experiences on this framework — authoring
  `xb.Script` classes, configuring `xb.Options`, and wiring spatial UI, hand
  tracking, gestures, depth & occlusion, plane/object detection, physics,
  spatial audio, or Gemini/OpenAI integration — and when running them in the
  desktop simulator or on-device. Covers the canonical app skeleton, the real
  `enable*` option methods, the `Script` lifecycle hooks, the global aliases
  (`xb.core`, `xb.user`, `xb.world`, `xb.ai`...), and the most common
  hallucinated-API mistakes to avoid. Read before generating XR Blocks code.
---

# XR Blocks SDK

XR Blocks (`import * as xb from 'xrblocks'`) is a cross-platform JavaScript/TypeScript
SDK for rapidly prototyping **AI + XR** apps. It is built on [three.js](https://threejs.org),
targets Chrome 136+ with WebXR on Android XR, and ships a **desktop simulator** so the
same code runs in a normal browser. The whole SDK is re-exported from
[`src/xrblocks.ts`](xrblocks.ts) — that barrel is the public API surface; if a symbol is
not exported there it is internal.

> The single most important rule when generating code: **only call APIs that exist.**
> The framework's own evaluation found that hallucinated/inconsistent APIs are the #1
> cause of broken generated apps. When unsure, grep `src/xrblocks.ts` and the relevant
> subfolder, or copy a pattern from a real file in `samples/`, `demos/`, or `templates/`.

## Canonical app skeleton

Every app is one or more `xb.Script` subclasses added before `xb.init()`. This is the
minimal, verified pattern (see [`templates/`](../templates) and the README for full HTML):

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    // called once; may be async
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    const geometry = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 32);
    const material = new THREE.MeshPhongMaterial({color: 0xffffff});
    this.player = new THREE.Mesh(geometry, material);
    // Place it in front of the user at a comfortable height/distance.
    this.player.position.set(0, xb.user.height - 0.5, -xb.user.objectDistance);
    this.add(this.player); // `this` is itself a THREE.Object3D
  }

  onSelectEnd() {
    // desktop click OR XR pinch
    this.player.material.color.set(Math.random() * 0xffffff);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new MainScript()); // register the script
  xb.init(new xb.Options()); // boot the engine + render loop
});
```

`Script` is a `THREE.Object3D`, so `this.add(obj)` puts things in the scene under it.
Do not manage the render loop, WebXR session, or camera yourself — `Core` owns them.

## Mental model

- **`Core` is a singleton** ([`core/Core.ts`](core/Core.ts)). `xb.init()` builds the
  renderer, camera, WebXR session, and every subsystem, then drives the frame loop.
  `Core` is also exposed as `xb.core`, with convenience aliases:
  `xb.scene`, `xb.user`, `xb.world`, `xb.ai`, `xb.depth`, `xb.sound`, `xb.input`,
  `xb.camera`, plus functions `xb.add()`, `xb.init()`, `xb.getDeltaTime()`,
  `xb.getElapsedTime()`.
- **`Script` is your extension point** ([`core/Script.ts`](core/Script.ts)) — Unity
  `MonoBehaviour`-style lifecycle hooks (below).
- **`Options` configures everything** ([`core/Options.ts`](core/Options.ts)) — one
  object with chainable `enable*()` methods and per-subsystem sub-options.
- The conceptual model from the papers is the **Reality Model**: `user`, `world`,
  and AI `agents` as first-class primitives, with an _interaction grammar_ that
  separates explicit events (`onSelectStart`, click, pinch) from implicit intent
  (gesture, gaze, voice).

## Enabling features (`xb.Options`)

These chainable methods **exist** — verified in [`core/Options.ts`](core/Options.ts):

```js
const options = new xb.Options();
options.enableUI(); // spatial UI + reticles
options.enableReticles(); // pointing cursor
options.enableControllers(); // tracked controllers
options.enableHands(); // hand tracking (joints, pinch)
options.enableHandRays(); // visible rays from hands/controllers
options.enableGestures(); // pinch/fist/point/etc. (see input/gestures)
options.enableStrokes(); // $1 unistroke recognition
options.enableDepth(); // WebXR depth sensing + depth mesh
options.enablePlaneDetection(); // detected planes in xb.world
options.enableObjectDetection(); // object detection (also sets camera permission)
options.enableCamera('environment'); // passthrough device camera ('environment'|'user')
options.enableAI(); // Gemini/OpenAI via xb.ai
options.enableXRTransitions(); // fade transitions
options.enableVR(); // immersive-vr instead of immersive-ar
xb.init(options);
```

**There is no `enablePhysics()` or `enableLighting()`** — these are configured directly:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat'; // physics engine
options.physics.RAPIER = RAPIER; // assigning RAPIER enables physics
// ...then implement initPhysics(physics) / physicsStep() in your Script.
```

`options.formFactor = 'desktop'` autostarts the simulator; `?formFactor=desktop` in the
URL does the same. `options.catchScriptExceptions` (default `true`) keeps one buggy
script from crashing the app.

## Script lifecycle hooks

Override only what you need (all verified against `core/Script.ts` and `core/User.ts`):

| Hook                                                  | When                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `init(deps?)`                                         | once, after registration; may return a Promise; receives injected deps |
| `update(time?, frame?)`                               | every frame                                                            |
| `initPhysics(physics)` / `physicsStep()`              | physics setup / per physics step                                       |
| `onSelectStart(e)` / `onSelectEnd(e)`                 | pinch (XR) or click (desktop)                                          |
| `onSqueezeStart(e)` / `onSqueezeEnd(e)`               | grip button                                                            |
| `onKeyDown(e)` / `onKeyUp(e)`                         | keyboard (`e.code`)                                                    |
| `onXRSessionStarted(session?)` / `onXRSessionEnded()` | entering/leaving XR                                                    |
| `onSimulatorStarted()`                                | desktop simulator booted                                               |

**Object-targeted hooks** fire on the Script whose subtree was hit. Return `true` to mark
the event handled and stop it propagating to ancestors:
`onObjectSelectStart/End`, `onObjectTouchStart/Touching/End`,
`onObjectGrabStart/Grabbing/End`, `onHoverEnter/Hovering/Exit`.

## Talking to the user, world, and AI

```js
// User (xb.user — see core/User.ts)
xb.user.height;
xb.user.objectDistance;
xb.user.panelDistance;
xb.user.handedness;
xb.user.isSelecting(); // any controller pinching/clicking? (id optional)
xb.user.isSelectingAt(object); // is the user selecting this object/subtree?
xb.user.isPointingAt(object); // hover test
xb.user.getReticleTarget(0); // object under controller 0's reticle
xb.user.hands; // hand joints when enableHands()

// AI (xb.ai — see ai/AI.ts). Requires a key (?key=... or keys.json) — guard it.
if (xb.ai.isAvailable()) {
  const res = await xb.ai.query({prompt: 'Write a haiku about dust.'});
  // multimodal: xb.ai.query({type: 'multiPart', parts: [{text}, {inlineData:{data,mimeType}}]})
  // res.text holds the answer; xb.ai.startLiveSession(config) for Gemini Live.
}

// World (xb.world) — detected planes / objects / meshes after enabling detection.
// Depth (xb.depth), Sound (xb.sound: spatial audio, speech recog/synth).
```

## Spatial UI (core)

The core UI is a declarative grid built from `xb.SpatialPanel` (see
[`ui/layouts/SpatialPanel.ts`](ui/layouts/SpatialPanel.ts) and `templates/1_ui`):

```js
const panel = new xb.SpatialPanel({
  backgroundColor: '#2b2b2baa',
  width: 2.5,
  height: 1.5,
});
panel.position.set(0, xb.user.height, -xb.user.panelDistance);
this.add(panel);

const grid = panel.addGrid();
grid
  .addRow({weight: 0.7})
  .addText({text: 'Hello XR', fontColor: '#fff', fontSize: 0.08});
const button = grid
  .addRow({weight: 0.3})
  .addCol({weight: 1})
  .addIconButton({text: 'check_circle', fontSize: 0.5}); // `text` = Material icon name
button.onTriggered = () => console.log('clicked/pinched/touched'); // unified select
```

`onTriggered` unifies click / pinch / touch on buttons. For flexbox-rich cards,
gradients, and shadows, use the **uiblocks addon** instead — see
[`addons/uiblocks/SKILL.md`](addons/uiblocks/SKILL.md) and "two UI systems" below.

## Directory map (read deeper on demand)

| Path                                                                                 | What lives there                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`core/`](core)                                                                      | `Core` singleton, `Script`, `Options`, `User`, DI `Registry`, `XRButton`, WebXR session mgmt                                                          |
| [`input/`](input)                                                                    | controllers, hands, gaze, mouse, gamepad; `gestures/`; `strokes/`                                                                                     |
| [`world/`](world)                                                                    | `World` + `planes/`, `mesh/`, `objects/` (Gemini & MediaPipe backends), `sounds/`                                                                     |
| [`depth/`](depth)                                                                    | depth sensing, depth mesh, `occlusion/` shaders & passes                                                                                              |
| [`ai/`](ai)                                                                          | `AI` facade over `Gemini` + `OpenAI` (query / live / image gen)                                                                                       |
| [`agent/`](agent)                                                                    | agent framework: tools, memory, context (WIP — see `agent/README.md`)                                                                                 |
| [`ui/`](ui)                                                                          | core spatial UI: `SpatialPanel`, `Grid`/`Row`/`Col`, views, `ModelViewer`, `Reticle`                                                                  |
| [`ux/`](ux)                                                                          | `DragManager`, reusable interaction behaviors                                                                                                         |
| [`simulator/`](simulator)                                                            | desktop XR simulator (virtual user/hands/depth/planes, control modes)                                                                                 |
| [`sound/`](sound)                                                                    | spatial audio, speech recognizer/synthesizer (see `sound/README.md`)                                                                                  |
| [`physics/`](physics)                                                                | Rapier3D integration                                                                                                                                  |
| [`lighting/`](lighting), [`camera/`](camera), [`video/`](video), [`stereo/`](stereo) | light estimation, device camera, video streams, stereo utils                                                                                          |
| [`utils/`](utils)                                                                    | `ModelLoader`, dependency injection, helpers                                                                                                          |
| [`addons/`](addons)                                                                  | opt-in modules, each often with its own README/skills: `uiblocks`, `netblocks`, `testing`, `glasses`, `volumes`, `virtualkeyboard`, simulator UI, ... |

## Two UI systems — pick deliberately

- **Core UI** (`xb.SpatialPanel` + `.addGrid()/.addRow()/.addCol()/.addText()/.add*Button()`)
  — lightweight, no extra deps, good for HUDs, menus, and quick panels.
- **uiblocks addon** (`UICard`, `UIPanel`, `UIText`, `UIImage`, `UIIcon`) — full flexbox
  layout (`@pmndrs/uikit`), gradients, strokes, drop/inner shadows, and spatial behaviors.
  Import from `xrblocks/addons/uiblocks/src` and call `options.uikit.enable(uikit)`.
  See [`addons/uiblocks/SKILL.md`](addons/uiblocks/SKILL.md).

Don't mix the two on the same panel, and don't import `UIPanel`/`UICard` from `xrblocks`
core — they only exist in the uiblocks addon.

## Common hallucinated-API mistakes to avoid

| ❌ Don't                                                    | ✅ Do                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `options.enablePhysics()`                                   | `options.physics.RAPIER = RAPIER` + implement `initPhysics()`             |
| Use `xb.core.renderer` / `xb.core.physics` in a constructor | They're created during `xb.init()`; use them in/after `init()`            |
| `new xb.UIPanel(...)` / `new xb.UICard(...)`                | Those are the **uiblocks addon**; core uses `xb.SpatialPanel().addGrid()` |
| `xb.ai.query('text')` (bare string)                         | `xb.ai.query({prompt: 'text'})`, and guard with `xb.ai.isAvailable()`     |
| Assume AI works with no key                                 | Provide `?key=...` or `keys.json`; handle the unavailable case            |
| `rgba()`/`hsla()` colors in UI                              | hex strings (`'#ffffff'`) or `THREE.Color`                                |
| Drive your own `requestAnimationFrame` loop                 | Put per-frame logic in `update(time, frame)`                              |
| Forget `xb.add(script)` before `xb.init()`                  | Register every Script first                                               |
| Import bare `three` without the pinned importmap            | Use the importmap from the README / a template                            |

## Design principles (honor these when contributing)

1. **Simplicity & readability** — a `Script` should read like a high-level description of
   the experience. Simple things stay simple; complex logic stays explicit.
2. **Creator experience first** — absorb incidental complexity (sensor fusion, AI, cross-
   platform input) behind ready-to-use primitives.
3. **Pragmatism over completeness** — "worse is better": small, modular, adaptable.
4. **Legible to AI** — favor high-level, semantic, hard-to-misuse APIs; consistent naming;
   export through `src/xrblocks.ts`. The SDK is meant to ground LLM code generation.

## Contributing conventions

- TypeScript throughout; new public symbols must be re-exported from `src/xrblocks.ts`.
- Tests are colocated `*.test.ts` (Vitest): `npm test`.
- `npm run lint` (ESLint) and `npm run format` (Prettier) before a PR.
- Local dev: `npm run dev` (Rollup watch + `http-server` on :8080); `npm run serve` to just
  serve. Build: `npm run build`. Addons build separately into `build/addons/*`.

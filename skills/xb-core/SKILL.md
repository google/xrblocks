---
name: xb-core
description: >-
  Bootstrap and structure an XR Blocks app: the `xb.Script` lifecycle, `xb.Options`
  configuration with chainable `enable*()` methods, the global aliases (`xb.core`,
  `xb.user`, `xb.scene`, `xb.world`, `xb.ai`…), and how to add objects and run the
  app in the desktop simulator or on an XR device. Use this first whenever creating a
  new XR Blocks experience or wiring up the main entry point, the frame loop
  (`update`), or select/pinch/click and key input. Other skills (xb-ui, xb-hands,
  xb-depth, xb-ai, …) build on this foundation.
---

# xb-core: bootstrap an XR Blocks app

Every app is one or more `xb.Script` subclasses registered with `xb.add()` before
`xb.init(options)`. `Core` owns the renderer, camera, WebXR session, and frame loop — never
roll your own. Full overview: [`../../src/SKILL.md`](../../src/SKILL.md).

## Canonical app

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  init() {
    // Runs once after registration; may be async (engine awaits the Promise).
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({color: 0x4285f4})
    );
    // `this` is a THREE.Object3D; place the cube in front of the user.
    this.cube.position.set(0, xb.user.height - 0.3, -xb.user.objectDistance);
    this.add(this.cube);
  }

  update(time, frame) {
    this.cube.rotation.y += xb.getDeltaTime(); // per-frame logic goes here
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

## Configure with Options

```js
const options = new xb.Options();
options.enableUI(); // see xb-ui
options.enableHands(); // see xb-hands
options.enableAI(); // see xb-ai
options.setAppTitle?.('My App');
xb.init(options);
```

Chainable feature toggles: `enableUI`, `enableReticles`, `enableControllers`, `enableHands`,
`enableHandRays`, `enableGestures`, `enableStrokes`, `enableDepth`, `enablePlaneDetection`,
`enableObjectDetection`, `enableCamera`, `enableAI`, `enableXRTransitions`, `enableVR`.
Physics and lighting are configured directly (see `xb-physics`; `options.lighting`).

## Lifecycle hooks

`init(deps?)`, `update(time?, frame?)`, `initPhysics(physics)`/`physicsStep()`,
`onSelectStart/End`, `onSqueezeStart/End`, `onKeyDown/Up` (`e.code`),
`onXRSessionStarted(session?)`/`onXRSessionEnded()`, `onSimulatorStarted()`.

Object-targeted hooks fire on the Script whose subtree was hit; **return `true` to stop
propagation**: `onObjectSelectStart/End`, `onObjectTouchStart/Touching/End`,
`onObjectGrabStart/Grabbing/End`, `onHoverEnter/Hovering/Exit`.

## Globals

`xb.core` (engine), `xb.scene`, `xb.user`, `xb.world`, `xb.ai`, `xb.depth`, `xb.sound`,
`xb.input`, `xb.camera`; helpers `xb.add()`, `xb.init()`, `xb.getDeltaTime()`,
`xb.getElapsedTime()`. Useful `xb.user` members: `height`, `objectDistance`, `panelDistance`,
`isSelecting()`, `isSelectingAt(obj)`, `isPointingAt(obj)`, `getReticleTarget(id)`.

## Run it

```bash
npm ci && npm run dev    # http://localhost:8080
```

Open your sample/template under that URL. The **desktop simulator** lets you develop without a
headset; `?formFactor=desktop` autostarts it (see `xb-simulator`).

> Pitfall: subsystems created during `xb.init()` (e.g. `xb.core.renderer`) are `undefined`
> in a constructor — use them in/after `init()`.

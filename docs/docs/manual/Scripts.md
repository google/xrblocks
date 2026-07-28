---
sidebar_position: 2
---

The [`Script`](/api/classes/Script) class facilities development by providing useful life cycle functions similar to MonoBehaviors in Unity.

Each [`Script`](/api/classes/Script) object is an independent `THREE.Object3D` entity within the scene graph. XR Blocks does not provide an entity component system (ECS).

## Usage

To take advantage of these life cycle functions, simply create a class extending [`Script`](/api/classes/Script) and add it somewhere to the scene graph.
The [`Script`](/api/classes/Core) will iterate over the scene graph each frame to find [`Script`](/api/classes/Script)s and call their corresponding life cycle functions.

```javascript
import * as xb from 'xrblocks';

export class MyClass extends xb.Script {
  async init() {
    // Called when the object is found in the scene.
  }

  update() {
    // Called every frame.
  }

  dispose() {
    // Called when the script is removed from the scene.
  }
}
```

## Life cycle functions

- `init()` - Called when the object is found by `Core`. If `init` is async or returns a promise, other lifecycle functions will be called only after the promise resolves.
- `update()` - Called every frame to update the current object.
- `dispose()` - Called when the script is removed from the scene (or when the application is shutdown). Use this to clean up three.js resources (geometries, materials, textures, etc.).
- `onXRSessionStarted(session)` / `onXRSessionEnded()` - Called when an
  immersive session starts or ends.
- `onSimulatorStarted()` - Called when the desktop simulator starts.
- `onKeyDown(event)` / `onKeyUp(event)` - Called for keyboard input; read
  `event.code`.

## Global controller functions

The following functions are called on every object when the corresponding event is received by any controller.
Each callback receives an event. The `THREE.Group` corresponding to the controller can be retrieved from `event.target`.

- `onSelectStart(event)` - Called when any controller begins selecting.
- `onSelectEnd(event)` - Called when any controller finishes selecting.
- `onSelect(event)` - Called when any controller completes a select action.
- `onSelecting(event)` - Called every frame for each controller that is selecting.

- `onSqueezeStart(event)` - Called when any controller begins squeezing.
- `onSqueezeEnd(event)` - Called when any controller finishes squeezing.
- `onSqueeze(event)` - Called when any controller completes a select action.
- `onSqueezing(event)` - Called every frame for each controller that is squeezing.

See the [WebXR Device API](https://immersive-web.github.io/webxr/input-explainer.html) for more details about each event.

## Object specific controller functions

Object specific callbacks are called only when the action is performed while the user is pointing at a specific object.
Events are propagated up the scene graph from the initial object.

- `onObjectSelectStart(event)` - Called on the current object the controller starts selecting. Return true to prevent propagation.
- `onObjectSelectEnd(event)` - Called on the previously selected object the controller stops selecting. Return true to prevent propagation.

- `onHoverEnter(controller)` - Called when the user hovering over the current object. Always propagates up the scene graph.
- `onHoverExit(controller)` - Called when the user hovers out of the current object. Always propagates up the scene graph.
- `onHovering(controller)` - Called while the controller continues hovering.

Hover callbacks may return `true` to stop propagation, like object-select
callbacks.

Hands also dispatch direct-interaction callbacks on the target script:

- `onObjectTouchStart(event)`, `onObjectTouching(event)`, and
  `onObjectTouchEnd(event)` receive `handIndex` and `touchPosition`.
- `onObjectGrabStart(event)`, `onObjectGrabbing(event)`, and
  `onObjectGrabEnd(event)` receive `handIndex` and the hand object.

## Physics functions

If physics is enabled, the following functions will be called:

- `initPhysics(physics)` - Called with the `Physics` object. Use this to set up colliders and rigidbodies.
- `physicsStep()` - Called at fixed physics timesteps. Use this to propagate poses from the physics engine to your object.

## ScriptMixin

In some cases, you may wish to extend other classes while also extending `Script`.
Since JavaScript does not support multiple inheritance, we provide a mixin: `ScriptMixin`.

To allow your custom class to be recognized as an `Script`, add `ScriptMixin` as follows:

```javascript
import * as THREE from 'three';
import {ScriptMixin} from 'xrblocks';

export const Script = ScriptMixin(THREE.Object3D);
```

To determine whether an object participates in the script lifecycle, check its
`isXRScript` property rather than relying on `instanceof`.

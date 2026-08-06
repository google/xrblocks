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
    await super.init();
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

## Global controller functions

The following functions are called on every object when the corresponding
event is received by any controller. Read the controller from
`event.source.controller`. Ray-based select events also provide the current
`event.surface` and `event.intersection` when that surface is still hit.

- `onSelectStart(event)` - Called when any source begins selecting.
- `onSelectEnd(event)` - Called when any source finishes selecting. Read `completed` and `reason`.
- `onSelect(event)` - Called when any source completes a valid select action.
- `onSelecting(event)` - Called every frame for each controller that is selecting.
- `onLongSelect(event)` - Called once when a captured selection reaches the configured hold delay.

- `onSqueezeStart(event)` - Called when any controller begins squeezing.
- `onSqueezeEnd(event)` - Called when any controller finishes squeezing.
- `onSqueeze(event)` - Called when any controller completes a select action.
- `onSqueezing(event)` - Called every frame for each controller that is squeezing.

See the [WebXR Device API](https://immersive-web.github.io/webxr/input-explainer.html) for more details about each event.

## Object specific controller functions

Object specific callbacks are called only when the action is performed while the user is pointing at a specific object.
Events are propagated up the scene graph from the initial object.

- `onObjectSelectStart(event)` - Called on the current object the controller starts selecting. Return true to prevent propagation.
- `onObjectSelectEnd(event)` - Called on the previously selected object when selection ends. Return true to prevent propagation.
- `onObjectLongSelect(event)` - Called after a held object selection reaches the long-select delay.
- `onObjectManipulate(event)` - Called for automatic manipulation start, move, end, and cancel phases.

- `onHoverEnter(event)` / `onHovering(event)` / `onHoverExit(event)` - Hover lifecycle. Return true to stop propagation.
- `onObjectTouchStart(event)` / `onObjectTouching(event)` / `onObjectTouchEnd(event)` - Direct-touch lifecycle.
- `onObjectGrabStart(event)` / `onObjectGrabbing(event)` / `onObjectGrabEnd(event)` - Touch-plus-pinch grab lifecycle.

`event.target` is the logical object, `event.surface` is the physical hit mesh, and
`event.source.controller` identifies the source controller. See
[Interaction and Manipulation](Interaction.md) for capture, cancellation, touch, and
manipulation rules.

## Physics functions

If physics is enabled, the following functions will be called:

- `initPhysics(physics)` - Called with the `Physics` object. Use this to set up colliders and rigidbodies.
- `physicsStep()` - Called at fixed physics timesteps. Use this to propagate poses from the physics engine to your object.

## ScriptMixin

In some cases, you may wish to extend other classes while also extending `Script`.
Since JavaScript does not support multiple inheritance, we provide a mixin: `ScriptMixin`.

To allow your custom class to be recognized as an `Script`, add `ScriptMixin` as follows:

```javascript
export const Script = ScriptMixin(THREE.Object3D);
```

To determine if an object is an `Script`, check for the `isXRScript` property rather than `instanceof`.

See [Placement scripts](Placement.md) for built-in scripts that follow the
viewer or another object, face the camera, orbit a target, and animate
visibility.

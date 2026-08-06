# Manipulation and physics

Choose movement semantics before adding a dependency.

## Kinematic manipulation

Use XR Blocks' built-in `xb.core.dragManager` for ray-driven translation,
rotation, and two-controller scaling. Mark the moved ancestor as `draggable`
and mark the raycast child as translating or rotating:

```js
const object = new THREE.Group();
object.draggable = true;

const handle = new THREE.Mesh(geometry, material);
handle.draggingMode = xb.DragMode.TRANSLATING;
object.add(handle);
```

The drag manager searches upward from the raycast target for the first drag
mode and draggable ancestor. Selecting a second handle while the first drag is
active enters two-controller scaling automatically. `DragMode.DO_NOT_DRAG`
excludes a handle. `dragFacingCamera = true` on the draggable ancestor keeps
translated panels facing the camera.

Use a custom `onObjectGrab*` transform for direct-hand movement. Preserve the
initial wrist-to-object matrix at grab start, recompute the object world matrix
from the live wrist matrix while grabbing, and convert back through the
object's parent transform. The verified implementation is
[`templates/2_hands/HandsInteraction.js`](../../../templates/2_hands/HandsInteraction.js).

## Dynamic manipulation

Add Rapier only when the contract requires rigid-body behavior such as gravity,
collision, momentum, throwing, or forces:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

const options = new xb.Options();
options.physics.RAPIER = RAPIER;

class DynamicObject extends xb.Script {
  initPhysics(physics) {
    const {RAPIER, blendedWorld: world} = physics;
    // Create this object's body and collider in world.
  }

  physicsStep() {
    this.position.copy(this.body.translation());
    this.quaternion.copy(this.body.rotation());
  }
}
```

Assigning `options.physics.RAPIER` enables physics; `enablePhysics()` does not
exist. Create bodies and colliders in `initPhysics(physics)`, then synchronize
the three.js object during `physicsStep()`. Copy actual body/collider patterns
from [`demos/ballpit`](../../../demos/ballpit) or
[`demos/drone`](../../../demos/drone), and use the
[physics manual](../../../docs/docs/manual/Physics.md) for TypeScript's
`rapier3d` path alias.

If depth sensing is also enabled, XR Blocks automatically creates the enabled
depth mesh's Rapier collider. Depth presets control depth rendering and mesh
patching; they are not the physics switch. Keep simulator hand physics separate:
`options.simulator.handPhysics.enabled = true` makes simulated hands physical
and also requires Rapier, while `options.simulator.physics.enabled` controls the
simulator-owned environment physics world.

Keep dynamics at the fixed physics step rather than copying transforms in the
render loop. Include release velocity, collision layers/events, sleeping, and
reset behavior in the user handoff when the implementation uses them.

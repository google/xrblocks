# Manipulation and physics

Choose kinematic manipulation for direct user transforms. Add physics only when
the result requires dynamics.

## Automatic manipulation

Configure the owner object:

```js
object.xb = {
  manipulation: {
    actions: {
      translate: {faceCamera: true},
      rotate: {axis: 'y'},
      scale: {minScale: 0.5, maxScale: 2},
    },
  },
};
```

`manipulation: true` enables translate and scale with translate as the default
surface action. `UICard` and `ModelViewer` supply their documented defaults and
can expose separate handles.

The manager keeps one session per owner, so separate objects can be manipulated
at the same time. A second source on the same scale-enabled owner changes that
session to two-source scale. Keep state per owner and use
`event.sources` when feedback depends on one versus two active sources.

Observe `start`, `update`, `end`, and `cancel` with
`onObjectManipulate(event)`. Call `event.preventDefault()` during `start` to
replace the proposed automatic transform. Placement scripts attached to the
owner suspend while manipulation is active and resume with a rebased pose.

Read the [Interaction manual](../../../docs/docs/manual/Interaction.md) and
[Placement manual](../../../docs/docs/manual/Placement.md) before composing
these systems.

## Rapier dynamics

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

const options = new xb.Options();
options.physics.RAPIER = RAPIER;
```

There is no `enablePhysics()`. Create bodies and colliders in
`initPhysics(physics)`, keep the rigid body authoritative, and synchronize the
visual object during `physicsStep()`. Read the
[Physics manual](../../../docs/docs/manual/Physics.md) and start from
[`../../../templates/10_environment_physics/`](../../../templates/10_environment_physics/).

Include collision layers, release velocity, sleeping, reset behavior, and
cleanup in the contract when they apply.

---
name: xb-physics
description: >-
  Add rigid-body physics to an XR Blocks app using the Rapier3D engine — gravity,
  collisions, and (with xb-depth) colliders that match real-world geometry so
  virtual objects bounce off the floor and furniture. Use for ball pits, throwing/
  dropping objects, projectiles, or any depth-aware physical interaction. Covers
  enabling physics via `options.physics.RAPIER`, the `initPhysics(physics)` /
  `physicsStep()` Script hooks, and the depth-mesh collider recipe. There is no
  `enablePhysics()` method — assigning `options.physics.RAPIER` is what turns it on.
---

# xb-physics: Rapier rigid-body physics

Physics is enabled by giving `Options` the Rapier module; your `Script` then sets up bodies in
`initPhysics()`. See `demos/ballpit`, `demos/splash`, and `demos/drone`.

## Enable

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

const options = new xb.Options();
options.physics.RAPIER = RAPIER; // assigning RAPIER enables physics
// options.physics.useEventQueue = true;  // opt in to collision events (see demos/splash)
xb.init(options);
```

> There is **no** `options.enablePhysics()`. Assigning `options.physics.RAPIER` is the switch.

## Script hooks

```js
class Balls extends xb.Script {
  // Called once after init() when physics is enabled. `physics` is the xb Physics wrapper
  // around the Rapier world — create rigid bodies/colliders here.
  initPhysics(physics) {
    this.physics = physics;
    // …create RAPIER bodies/colliders; see demos/ballpit/BallPit.js for the full API…
  }

  // Called each physics step — apply forces, sync transforms, read collisions.
  physicsStep() {}
}
```

## Depth-aware collisions

To collide with the real room, combine physics with a depth-mesh collider (see
[`xb-depth`](../xb-depth/SKILL.md)):

```js
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = 5;
options.physics.RAPIER = RAPIER;
```

Now thrown objects bounce off the live depth mesh of the environment.

## Notes

- The exact body/collider API is Rapier's, accessed through the `physics` instance passed to
  `initPhysics()` — copy the patterns in [`demos/ballpit/BallPit.js`](../../demos/ballpit/BallPit.js)
  and [`src/physics/Physics.ts`](../../src/physics/Physics.ts).
- Add the Rapier dependency to your importmap (the repo uses
  `@dimforge/rapier3d-simd-compat`).

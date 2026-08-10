---
sidebar_position: 13
title: Physics
---

# Physics

XR Blocks runs Rapier in the engine lifecycle. The application supplies one
compatible Rapier module before `xb.init()`. XR Blocks then creates and steps
one `xb.core.physics.blendedWorld`.

## Configure Rapier

Use the same package in JavaScript and in the import map or bundler graph. The
in-tree examples use the SIMD-compatible build:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

const options = new xb.Options();
options.physics.RAPIER = RAPIER;

xb.add(new PhysicsScene());
await xb.init(options);
```

The browser import map must also map
`@dimforge/rapier3d-simd-compat`. See
`templates/10_environment_physics/index.html` for an aligned example. Do not
load a second Rapier variant through another URL.

For TypeScript, map the virtual `rapier3d` type import to the installed Rapier
package:

```json
{
  "compilerOptions": {
    "paths": {
      "rapier3d": ["./node_modules/@dimforge/rapier3d-simd-compat/rapier"]
    }
  }
}
```

## Use the script lifecycle

Create bodies and colliders in `initPhysics(physics)`. Copy simulated poses to
Three.js objects in `physicsStep()`. The `physics` argument is the initialized
manager; use its `RAPIER` module and `blendedWorld` instead of creating another
world.

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';

class FallingCube extends xb.Script {
  init() {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({color: 0x4285f4})
    );
    this.mesh.position.set(0, 1.5, -0.8);
    this.add(this.mesh);
  }

  initPhysics(physics) {
    this.physics = physics;
    const {RAPIER, blendedWorld} = physics;

    this.body = blendedWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(
        this.mesh.position.x,
        this.mesh.position.y,
        this.mesh.position.z
      )
    );
    blendedWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 0.1, 0.1),
      this.body
    );
  }

  physicsStep() {
    if (!this.body) return;
    this.mesh.position.copy(this.body.translation());
    this.mesh.quaternion.copy(this.body.rotation());
  }

  dispose() {
    if (this.body) this.physics?.blendedWorld.removeRigidBody(this.body);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
```

Rapier collider half-extents and Three.js geometry dimensions are different:
`BoxGeometry(0.2, 0.2, 0.2)` matches
`ColliderDesc.cuboid(0.1, 0.1, 0.1)`.

## Add a static floor

A fixed body does not move under gravity:

```js
const floorBody = physics.blendedWorld.createRigidBody(
  physics.RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
);
physics.blendedWorld.createCollider(
  physics.RAPIER.ColliderDesc.cuboid(2, 0.05, 2),
  floorBody
);
```

Add a matching Three.js mesh when the floor must be visible. A collider alone
has no rendered surface.

## Physics and manipulation

Automatic manipulation changes the Three.js transform. Rapier changes a rigid
body transform. If both systems own the same object at the same time, they
compete.

Choose one explicit policy:

- Make manipulation move a kinematic body, then return it to the intended body
  mode when manipulation ends.
- Disable automatic manipulation and apply forces or impulses from interaction
  events.
- Use direct-hand collision logic when the hand must physically strike an
  object.

Read `Interaction.md` for manipulation ownership and event phases. A generic
grab callback does not automatically update a Rapier body.

## Options and ownership

`options.physics` defaults are:

```js
options.physics.fps = 45;
options.physics.gravity = {x: 0, y: -9.81, z: 0};
options.physics.worldStep = true;
options.physics.useEventQueue = false;
```

Set `worldStep = false` only when application code will step the world. Set
`useEventQueue = true` before initialization when collision events require a
Rapier event queue.

The engine owns the Rapier world and event queue. Each application script owns
the bodies and colliders it creates and must remove them during `dispose()`.
The script also owns its Three.js geometry and material resources.

## Depth-mesh collision

Depth sensing and physics are separate switches. A depth preset can configure
depth-mesh colliders, but `options.physics.RAPIER` still enables physics. Start
from `templates/10_environment_physics` when virtual projectiles must collide
with reconstructed room geometry.

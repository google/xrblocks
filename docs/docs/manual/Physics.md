---
sidebar_position: 6
---

Physics in XR Blocks is powered by the [Rapier physics engine](https://rapier.rs/).

## Getting started

To use physics in your scene, import the RAPIER physics engine, then pass the RAPIER component into the physics options:
```javascript
import * as xb from 'xrblocks';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-simd-compat@0.17.0';

const options = new xb.Options();
options.physics.RAPIER = RAPIER;
xb.init(options);
```

### TypeScript Setup
The Rapier physics library comes in several different variants such as [@dimforge/rapier3d](https://www.npmjs.com/package/@dimforge/rapier3d) and [@dimforge/rapier3d-simd-compat](https://www.npmjs.com/package/@dimforge/rapier3d-simd-compat).

XR Blocks supports the different 3D variants of RAPIER by using a virtual import `rapier3d` for types instead of directly importing from one of the specific packages. When using TypeScript, you will need to link the virtual import to your installed version of Rapier. For example, when using [@dimforge/rapier3d-simd-compat](https://www.npmjs.com/package/@dimforge/rapier3d-simd-compat):

```json title="tsconfig.json"
{
  "compilerOptions": {
    "paths": {
      "rapier3d": [
        "./node_modules/@dimforge/rapier3d-simd-compat/rapier"
      ],
    }
  },
  //...
}
```


## Physics

The [`Physics`](/api/classes/Physics) controller will initialize `RAPIER`, create a RAPIER world, and call [`world.step`](https://rapier.rs/javascript3d/classes/World.html#step) for every physics step.
Is is accessible from `xb.core.physics` and has the following properties:
1. `RAPIER` - the global `RAPIER` object.
2. `blendedWorld` - the global `RAPIER.world` object.
3. `fps` - the fixed physics update rate.
4. `options` - physics options.

## Adding physics to objects
In the [`Script.initPhysics`](/api/classes/Script#initphysics) method, you can create rigid bodies corresponding to your object.
Then in the [`Script.physicsStep`](/api/classes/Script#physicsStep) method, copy the translation and rotation of the rigid body to your object.

For example:
```js
export class Ball extends xb.Script {
    //...

    initPhysics(physics) {
        const RAPIER = physics.RAPIER;
        const desc = RAPIER.RigidBodyDesc.dynamic()
                       .setTranslation(...this.position);
        const shape = RAPIER.ColliderDesc.ball(this.radius);
        this.body = world.createRigidBody(desc);
        this.collider = world.createCollider(shape, this.body);
    }

    physicsStep() {
        this.position.copy(this.body.translation());
        this.quaternion.copy(this.body.rotation());
    }
}
```

## Physics Options

By default, we uses the following options in [`PhysicsOptions`](/api/classes/PhysicsOptions) in the initial [`xb.init`](/api/functions/init) call:
```js
{
  fps: 45,
  gravity: {x: 0.0, y: -9.81, z: 0.0},
  // Have `Physics` automatically call world.step.
  worldStep: true,
  // Use an event queue when calling world.step.
  useEventQueue: false
};
```

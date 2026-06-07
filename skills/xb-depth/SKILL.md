---
name: xb-depth
description: >-
  Add WebXR depth sensing to an XR Blocks app — a live depth map and depth mesh of
  the room — so virtual content is occluded by real-world geometry and (optionally)
  generates physics colliders that match the environment. Use for realistic
  occlusion (a person walks in front of a virtual object), depth-aware reticles, or
  depth-mesh collision for physics. Covers `enableDepth()`, the `DepthOptions`
  presets (`xrDepthMeshOptions`, `xrDepthMeshPhysicsOptions`), `colliderUpdateFps`,
  and `showReticleOnDepthMesh`. Pair with xb-physics for geometry-aware collisions.
---

# xb-depth: depth sensing & occlusion

Depth gives virtual objects awareness of real-world geometry: occlusion, depth-aware
reticles, and an optional depth-mesh collider for physics. See `samples/depthmap`,
`samples/depthmesh`, and `demos/occlusion`.

## Enable depth (with occlusion)

```js
const options = new xb.Options();
options.enableDepth(); // depth sensing + depth mesh
xb.init(options);
```

`enableDepth()` applies the `xrDepthMeshOptions` preset. For finer control, build
`DepthOptions` yourself:

```js
options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
options.depth.matchDepthView = false;
```

## Depth-mesh colliders for physics

To make real geometry collidable (e.g. balls bounce off the floor/furniture), use the
physics preset and set a collider refresh rate, then enable physics (see
[`xb-physics`](../xb-physics/SKILL.md)):

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = 5; // rebuild colliders 5×/sec
options.physics.RAPIER = RAPIER;
```

(Alternatively, scene-mesh detection: `options.world.enableMeshDetection()` — see
[`xb-world`](../xb-world/SKILL.md).)

## Useful APIs

- `xb.showReticleOnDepthMesh(true)` — let the reticle target the depth mesh.
- `xb.core.depth.depthMesh` — the depth mesh object (e.g. `ignoreReticleRaycast`).
- Occlusion is handled by the depth subsystem ([`src/depth/occlusion/`](../../src/depth/occlusion));
  `demos/occlusion` shows real-people-in-front-of-virtual-objects.

## Notes

- Depth sensing requires a device/runtime that supports the WebXR Depth Sensing API; the
  simulator provides a simulated depth source for desktop testing.
- Depth + physics is the recipe behind `demos/ballpit` and `demos/splash`.

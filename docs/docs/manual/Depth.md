---
sidebar_position: 9
title: Depth & Occlusion
---

# Depth and occlusion

XR Blocks can read WebXR depth data, build a live room mesh, project reticles onto real
surfaces, occlude virtual content, and create optional environment colliders.

## Enable depth

```js
const options = new xb.Options();
options.enableDepth();
await xb.init(options);
```

Each object by access request to enable depth by calling `core.depth.resumeDepth(this)` and request to stop depth with `core.depth.pauseDepth(this)`.
When supported by the browser, `Depth` will automatically pause depth sensing when no objects are using depth.

## Depth

When depth is enabled, a `Depth` controller will be added to `core.depth` and will call `getDepthInformation` and cache the depth array every frame.
If the depth mesh or depth texture are enabled, these will also be updated every frame.

The depth can be accessed using the following properties and methods in `Depth` object available from `core.depth`:

1. `depthData` - An array containing the left and right depth data objects. Each object has `data`, `width`, `height`, and `rawValueToMeters`.
2. `depthArray` - An array containing the left and right depth arrays.
3. `rawValueToMeters` - the factor to convert the depth into meters.
4. `getDepth(u, v)` - Gets the depth value of the left camera from normalized u, v coordinates.

## Depth Mesh

A depth mesh is a 3D mesh created by projecting depth values from the depth texture.
To enable the depth mesh, initiailize `core` with `options.depth` set to `xrDepthMeshOptions` or `xrDepthMeshPhysicsOptions`.
The depth mesh will use the left camera depth and attach itself as a child of the left camera.

By default, the depth will use a downsampled 40x40 mesh for raycasts and collisions.
To disable this behavior and use a 160x160 full resolution mesh for raycasts and collisions, set `useDownsampledGeometry` to `false` in the depth options.
To continuously update the full resolution mesh, set `updateFullResolutionGeometry` to `true` in the depth options.

When physics is enabled, the depth mesh will create a mesh collider in the RAPIER world and update it at a fixed rate.
To configure the collider update rate, set `options.depth.depthMesh.colliderUpdateFps`.

## Depth Texture

A depth texture is a depth array stored on GPU which can be used for shaders such as occlusion or depth visualizations.
To enable the depth mesh, initiailize `core` with `options.depth.depthTexture.enabled = true`;

## Transparency-based Occlusion

Our SDK supports per-object transparency-based occlusion.

Transparency-baesd occlusion works by computing an occlusion map blurring the difference between the depth of virtual contents and the environment depth.
This occlusion map is interpreted by each virtual object to set their transparency value within the fragment shader.

### Other objects

To enable occlusion on other objects, their fragment shader needs to interpret the occlusion map.
For built-in THREE.js materials, XR Blocks provides a helper function to inject the logic using `onBeforeCompile`:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = 5;
options.physics.RAPIER = RAPIER;
```

## Runtime depth data

After initialization, use `xb.depth` or `xb.core.depth`:

- `depthData`: per-view WebXR depth information.
- `depthArray`: decoded depth values.
- `getDepth(u, v)`: read left-view depth at normalized coordinates.
- `depthMesh`: reconstructed real-world geometry.
- `depthTextures`: GPU depth resources for render passes.

Depth sensing is device-dependent. Guard sensor reads and verify them on the target device.
The desktop simulator supplies simulated depth for application and interaction testing.

## Depth-aware reticles

Configure reticle projection before initialization:

```js
options.enableDepth();
options.enableReticles();
options.reticles.projectOnDepthMesh = true;
```

Use `xb.user.getRayIntersection(controllerId)` to read the current resolved hit. Reticle
projection controls where the cursor is drawn; it does not create a second targeting API.

## Model occlusion

Enable depth, then construct a model viewer with occlusion:

```js
const viewer = new xb.ModelViewer({occlusion: true});
this.add(viewer);
await viewer.load('./model.glb');
```

For custom Three.js materials, inject the XR Blocks occlusion shader code in
`material.onBeforeCompile` and add the resulting shader to
`xb.core.depth.occludableShaders`. Copy the full working pattern from
`samples/xr_realism/occlusion`.

## Examples

- `samples/xr_realism/depthmap`: inspect and visualize depth textures.
- `samples/xr_realism/depthmesh`: use reconstructed environment geometry.
- `samples/xr_realism/occlusion`: hide virtual content behind real geometry.
- `samples/advanced/ballpit`: combine depth mesh and physics.

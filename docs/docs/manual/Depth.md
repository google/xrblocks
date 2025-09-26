---
sidebar_position: 5
---

## Getting started
To use depth, initiailize `core` with `options.depth` set to a new `xb.DepthOptions` based on `xrDepthMeshOptions` or `xrDepthMeshPhysicsOptions`:

```js
const options = new xb.Options();
options.depth = new xb.DepthOptions(xrDepthMeshOptions);
xb.init(options);
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

### Model Viewer
Our `ModelViewer` class supports loading GLTF objects and enabling transparency on them. To do this, add `addOcclusionToShader: true` when calling `loadGLTFModel`.

### Other objects
To enable occlusion on other objects, their fragment shader needs to interpret the occlusion map.
For built-in THREE.js materials, XR Blocks provides a helper function to inject the logic using `onBeforeCompile`:
```js
material.onBeforeCompile = (shader) => {
    OcclusionUtils.addOcclusionToShader(shader);
    shader.uniforms.occlusionEnabled.value = true;
    material.userData.shader = shader;
    xb.core.depth.occludableShaders.add(shader);
}
```

Occlusion can be enabled and disabled at runtime by setting the value for the `occlusionEnabled` uniform of the shader.
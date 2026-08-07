---
sidebar_position: 9
title: Depth & Occlusion
---

# Depth and occlusion

XR Blocks can read WebXR depth data, maintain a live environment mesh, project
reticles onto reconstructed surfaces, occlude supported virtual content, and
provide optional environment collision geometry.

Depth is device-dependent. The desktop simulator provides synthetic depth from
its environment so applications can test state and interaction, but native
sensor quality and performance require the target XR device.

## Enable the default depth mesh

```js
const options = new xb.Options();
options.enableDepth();
await xb.init(options);
```

`enableDepth()` installs the current default `xrDepthMeshOptions`. Configure
depth before initialization because it affects requested WebXR session
features. A device can reject or omit required depth support; represent that as
an explicit unsupported or startup-failure state.

Each object by access request to enable depth by calling `core.depth.resumeDepth(this)` and request to stop depth with `core.depth.pauseDepth(this)`.
When supported by the browser, `Depth` will automatically pause depth sensing when no objects are using depth.

Application scripts do not call internal pause/resume ownership methods. XR
Blocks owns sensor acquisition and mesh updates.

## Runtime data

After initialization, use `xb.depth`:

| Member             | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `depthData`        | Per-view WebXR depth information when available      |
| `depthArray`       | Decoded per-view depth values                        |
| `rawValueToMeters` | Conversion factor for raw depth values               |
| `getDepth(u, v)`   | Left-view distance at normalized image coordinates   |
| `depthMesh`        | Live reconstructed environment geometry when enabled |
| `depthTextures`    | GPU depth resources used by supported render paths   |

Guard reads. Missing data during startup, an unsupported session, or a lost
sensor is normal runtime state. Do not keep displaying an old measurement as
if it were current.

## Mesh resolution and update cost

The default depth mesh uses downsampled geometry for raycasts and collision.
Configure the mesh before initialization when the application needs another
trade-off:

```js
options.enableDepth();
options.depth.depthMesh.useDownsampledGeometry = false;
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.depthMeshUpdateFps = 30;
```

Full-resolution geometry and continuous updates increase CPU and GPU work. Use
the lowest fidelity and cadence that satisfy the behavior, then verify the
choice on the target device.

## Depth-aware reticles

Reticles belong to the unified interaction pipeline:

```js
options.enableDepth();
options.enableReticles();
options.reticles.projectOnDepthMesh = true;
```

Projection changes where the reticle is drawn. The reticle does not own target
data. Inside a callback, read `event.intersection`. Outside an event, read the
current resolved hit with `xb.user.getRayIntersection(controllerId)`.

See [Interaction and Manipulation](Interaction.md) for `target`, `surface`,
capture, and event-hit lifetime.

## Model occlusion

Enable depth, then opt a model viewer into the supported occlusion path:

```js
const viewer = new xb.ModelViewer({occlusion: true});
this.add(viewer);
await viewer.load('./model.glb');
```

For supported loaded glTF materials, `ModelViewer` injects XR Blocks occlusion
logic and registers the resulting shaders. Transparency is only one rendering
property: setting `material.transparent = true` does not by itself implement
occlusion, disable depth writes, or disable pointer input.

For a custom Three.js material, use the complete shader-injection and cleanup
pattern from `samples/xr_realism/occlusion`. Custom renderers and splats can
require their own depth integration.

## Environment collision

Depth does not enable physics. Configure Rapier separately:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

const options = new xb.Options();
options.enableDepth();
options.physics.RAPIER = RAPIER;
options.depth.depthMesh.colliderUpdateFps = 5;
```

When physics and the depth mesh are enabled, XR Blocks maintains the configured
environment collider. `xrDepthMeshPhysicsOptions` changes depth mesh rendering
and geometry choices; it is not the physics switch.

Use a low collider update rate unless the application requires faster response.
Native depth noise and incomplete room coverage can make environment collision
unstable, so include a reset or escape behavior for dynamic objects.

## Presets and direct options

- `xrDepthMeshOptions`: normal live depth mesh.
- `xrDepthMeshVisualizationOptions`: diagnostic texture and mesh choices.
- `xrDepthMeshPhysicsOptions`: mesh choices suited to environment collision and
  received shadows; still requires Rapier configuration.

Create or modify `DepthOptions` only for a specific mesh, texture, occlusion,
resolution, or update requirement. Prefer `enableDepth()` for ordinary use.

## Examples

- `samples/xr_realism/depthmap`: depth values and textures.
- `samples/xr_realism/depthmesh`: reconstructed geometry.
- `samples/xr_realism/reticle`: resolved hits and reticle presentation.
- `samples/xr_realism/occlusion`: material occlusion integration.
- `samples/advanced/ballpit`: depth mesh with Rapier physics.

For each feature, test supported, warming-up, missing-data, session-failure, and
sensor-loss states. State which simulator evidence is synthetic and which
native behavior remains for device acceptance.

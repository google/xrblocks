# Mesh detection

`MeshDetector` wraps the experimental
[WebXR Mesh Detection API](https://immersive-web.github.io/real-world-meshing/)
and exposes per-room scene meshes (Floor / Ceiling / Wall / Table / …) to
xrblocks apps. It is the high-fidelity, semantically-labelled counterpart to
the depth-derived mesh in [`src/depth/`](../../depth/).

> Mesh detection is an **experimental** WebXR feature with limited device
> support. Read the requirements below before promising it to users.

## Requirements

- **A device with a `mesh-detection`–capable WebXR runtime** — e.g. Android XR
  (Galaxy XR) or Meta Quest 3 / 3S.
- **On Chrome 148.0.7778.97 or newer:** enable
  `chrome://flags/#webxr-mesh-detection` and relaunch.

## Quick start

```js
import * as xb from 'xrblocks';

const options = new xb.Options();
options.world.enableMeshDetection();
// Optional: render wireframes color-coded by semantic label.
options.world.meshes.showDebugVisualizations = true;

class MyApp extends xb.Script {
  update() {
    const meshDetector = xb.core.world?.meshes;
    if (!meshDetector) return;
    for (const detectedMesh of meshDetector.xrMeshToThreeMesh.values()) {
      // detectedMesh.semanticLabel:
      //   'Floor' | 'Ceiling' | 'Wall' | 'Table' | undefined
    }
  }
}

xb.add(new MyApp());
xb.init(options);
```

`enableMeshDetection()` adds `mesh-detection` to the WebXR session's
`requiredFeatures`. If the device/browser can't grant it, `requestSession`
rejects with `NotSupportedError` at Enter-XR time.

## What you get

Each `XRMesh` reported by the platform becomes a `DetectedMesh` (a
`THREE.Mesh` subclass) added to the `MeshDetector` group:

- **`geometry`** — `BufferGeometry` with positions, indices, and computed
  normals. Rebuilt in place when `XRMesh.lastChangedTime` advances.
- **`semanticLabel`** — `'Floor' | 'Ceiling' | 'Wall' | 'Table' | undefined`.
  Labels come from the platform; not every surface will be labelled.
- **`material`** — defaults to an invisible `MeshBasicMaterial` so detected
  meshes don't paint over passthrough. Setting
  `options.world.meshes.showDebugVisualizations = true` swaps in a wireframe
  material color-coded by label.
- **`initRapierPhysics(RAPIER, world)`** — registers a `trimesh` collider on
  a Rapier world. Called automatically once `Physics` is initialised.

## Demos

- **`demos/ballpit/`** — uses scene meshes as physics colliders
  (`?scenemesh=true`); falls back to a depth-mesh collider with
  `?scenemesh=false`.
- **`samples/scene_mesh_projector/`** (xrlabs) — pins a movable TV-style
  panel onto either the depth-derived mesh or the WebXR scene mesh via
  `?meshType=depth|scene`.

## Falling back when mesh detection is unavailable

There is no public `navigator.xr.isFeatureSupported('mesh-detection')`, so
the safe pattern is a URL/config toggle that routes unsupported devices to
the depth-mesh pipeline:

```js
const useSceneMesh = xb.getUrlParamBool('scenemesh', false);
if (useSceneMesh) {
  options.world.enableMeshDetection();
} else {
  options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
}
```

Spec: <https://immersive-web.github.io/real-world-meshing/>.

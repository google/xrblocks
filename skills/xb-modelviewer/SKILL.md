---
name: xb-modelviewer
description: >-
  Load and display 3D models in an XR Blocks app with `xb.ModelViewer` — GLTF/GLB
  models (static or animated), Gaussian-splat (.spz) models, or your own
  `THREE.Object3D` — wrapped with an optional draggable platform, bounding box, and
  raycast cylinder so users can grab and reposition them in XR. Use when spawning,
  scaling, or placing 3D objects/assets in the scene, putting a model inside a UI
  panel, or auto-placing a model on a real-world horizontal surface. Covers
  `loadGLTFModel`, `loadSplatModel`, `setupPlatform`, and `world.placeOnHorizontalSurface`.
---

# xb-modelviewer: load & display 3D models

`xb.ModelViewer` is a `THREE.Object3D` that holds a model plus optional affordances (platform,
bounding box, raycast cylinder) for grab-and-move interaction. See `samples/modelviewer`.

## From a GLTF/GLB

```js
class Scene extends xb.Script {
  async init() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const model = new xb.ModelViewer({});
    this.add(model);
    await model.loadGLTFModel({
      data: {
        path: 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/',
        model: 'models/Cat/cat.gltf',
        scale: {x: 1, y: 1, z: 1},
        rotation: {x: 0, y: 180, z: 0}, // degrees, optional
      },
      renderer: xb.core.renderer,
    });
    model.position.set(0, 0.7, -1.2);
  }
}
```

## From a Gaussian splat (.spz)

```js
const model = new xb.ModelViewer({castShadow: false, receiveShadow: false});
this.add(model);
await model.loadSplatModel({
  data: {
    model: BASE_URL + 'lego/lego.spz',
    scale: {x: 0.6, y: 0.6, z: 0.6},
    rotation: {x: 0, y: 180, z: 0},
  },
});
```

## Wrap your own geometry (with a draggable platform)

```js
const model = new xb.ModelViewer({});
model.add(new THREE.Mesh(geometry, material));
model.setupBoundingBox();
model.setupRaycastCylinder();
model.setupPlatform(); // draggable base so users can move it in XR
model.position.set(-0.6, 0.5, -1.5);
this.add(model);
```

## Place on a real surface

Defer placement until the session starts, then drop the model onto a detected horizontal
surface:

```js
onXRSessionStarted() { this.place(model); }
onSimulatorStarted() { this.onXRSessionStarted(); }
place(model) {
  return xb.world.placeOnHorizontalSurface(model, /*timeout*/ {seconds: 30});
}
```

## Notes

- Pass `{setupPlatform: false}` to `loadGLTFModel` to embed a model inside a UI panel
  (`panel.add(model)`); use `model.bbox.getSize(v)` to normalize scale.
- GLTF loads need `renderer: xb.core.renderer`. Splats require the Spark dependency in your
  importmap.
- Add `THREE` lights — `ModelViewer` does not add lighting for you.

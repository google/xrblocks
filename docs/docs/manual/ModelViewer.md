---
sidebar_position: 11
title: Model Viewer
---

The [`ModelViewer`](/api/classes/ModelViewer) class provides a convenient way to display 3D models in the scene and provide standard interactions for moving, rotating, and scaling the 3D model similar to [ARCore Scene Viewer](https://developers.google.com/ar/develop/scene-viewer).
See [`DragManager`](DragManager.md) for details about these interactions.

## Usage

Model Viewer can be used with a GLTF model file or an existing [`THREE.Object3D`](https://threejs.org/docs/#api/en/core/Object3D) object.

### Loading a GLTF Model

To load a GLTF model, call `loadGLTFModel` with an options object providing the path and model filename.
Internally, this will load the GLTF model using [`GLTFLoader`](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) with [`DracoLoader`](https://threejs.org/docs/#examples/en/loaders/DRACOLoader) and [`KTX2Loader`](https://threejs.org/docs/#examples/en/loaders/KTX2Loader) addons.

Once loaded, the model viewer will have a `gltf` property and add the `gltf.scene` as a child.

```js
const model = new xb.ModelViewer({});
this.add(model);
await model.loadGLTFModel({
  data: {
    scale: {x: 0.015, y: 0.015, z: 0.015},
    path: './',
    model: 'chess_compressed.glb',
  },
  renderer: xb.core.renderer,
});
```

### Adding an existing Object3D

If you have an existing loaded `THREE.Object3D` object, it can be added as a child of the `ModelViewer` object.
In this case, the model viewer will require some setup to make it interactable.
After adding the object or objects, please call `setupBoundingBox`.
Then call `setupRaycastCylinder` or `setupRaycastBox` to enable raycasting to the ModelViewer and `setupPlatform` to add a platform below the model.

```js
const model = new xb.ModelViewer({});
model.add(
  new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.4),
    new THREE.MeshPhongMaterial({color: 0xdb5461})
  )
);
model.setupBoundingBox();
model.setupRaycastCylinder();
model.setupPlatform();
this.add(model);
```

### Loading a Gaussian splat

`ModelViewer` can load `.spz` Gaussian splats when the optional
`@sparkjsdev/spark` dependency is available:

```js
const model = new xb.ModelViewer({castShadow: false, receiveShadow: false});
this.add(model);
await model.loadSplatModel({
  data: {
    model: './scene.spz',
    scale: {x: 0.6, y: 0.6, z: 0.6},
  },
});
```

### Placing a model on a detected surface

Wait until XR or the simulator has started before placing against detected
world geometry:

```js
onXRSessionStarted() {
  return xb.world.placeOnHorizontalSurface(this.model, {seconds: 30});
}

onSimulatorStarted() {
  return this.onXRSessionStarted();
}
```

### Sample

See [`/samples/modelviewer/`](/samples/ModelViewer) for a sample of model viewer with both a GLTF model and a loaded three.js object.

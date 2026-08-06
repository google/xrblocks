---
sidebar_position: 11
title: Model Viewer
---

# Model Viewer

[`ModelViewer`](/api/classes/ModelViewer) loads and presents one glTF, GLB, or Gaussian
splat model. It can also present an existing `THREE.Object3D`. The viewer normalizes the
model origin and supplies standard move, rotate, and scale interaction.

## Load a model

Add the viewer to the scene before awaiting `load()`:

```js
class ModelScene extends xb.Script {
  async init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x555555, 3));

    const viewer = new xb.ModelViewer({
      origin: 'bottom-center',
      manipulation: true,
      autoplay: true,
      occlusion: false,
    });
    viewer.position.set(0, 0.7, -1.2);
    this.add(viewer);

    await viewer.load({
      url: 'models/Cat/cat.gltf',
      path: 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/',
      scale: 0.5,
      rotation: {x: 0, y: Math.PI, z: 0},
    });
  }
}
```

`load()` accepts a URL string or a `ModelSource` object. Supported file extensions are
`.gltf`, `.glb`, `.ply`, `.spz`, `.splat`, and `.ksplat`. Rotation values are radians.

Splat models require `@sparkjsdev/spark` in the application dependency set or import map.

## Present an existing object

```js
const viewer = new xb.ModelViewer({origin: 'center'});
viewer.setContent(new THREE.Mesh(geometry, material));
viewer.position.set(0, 1.2, -1);
this.add(viewer);
```

`setContent()` replaces the active model. `ModelViewer` owns and disposes its active
content when it is replaced or when the viewer is disposed.

## Options

- `origin`: `'bottom-center'`, `'center'`, or `'source'`.
- `manipulation`: `true`, `false`, or a `ManipulationOptions` object.
- `platformMargin`: extra width and depth around the model.
- `autoplay`: play loaded glTF animations automatically.
- `occlusion`: register supported materials with the depth occlusion system.
- `castShadow` and `receiveShadow`: apply shadow settings to loaded content.

Use `viewer.boundingBox` after loading when the application must inspect normalized size.

## Animation

```js
viewer.playAnimation();
viewer.playAnimation({once: true});
```

`playAnimation()` restarts all clips stored in the loaded glTF. Applications that require
named clip control should load and own the glTF in a dedicated `Script`.

## Manipulation

`manipulation: true` enables the standard move, Y-axis rotate, and scale actions. Use a
narrow configuration when the model must allow only selected actions:

```js
viewer.manipulation = {
  actions: {rotate: {axis: 'y'}},
  handle: {action: 'rotate'},
};
```

Set `manipulation: false` when another object owns interaction.

For complete examples, see the [Model Viewer sample](/samples/ModelViewer) and
`samples/spatial_ui/modelviewer/` in the repository.

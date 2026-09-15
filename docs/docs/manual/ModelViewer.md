---
sidebar_position: 11
title: Model Viewer
---

# Model Viewer

[`ModelViewer`](/api/classes/ModelViewer) loads and presents one glTF, GLB, or
Gaussian splat model. It can also present an existing `THREE.Object3D`. The
viewer normalizes origin, records local bounds, and supplies standard move,
rotate, and scale interaction without exposing its private hit meshes.

## Load a model

Add the viewer to the scene before awaiting `load()` so its engine dependencies
are initialized:

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

`load()` accepts a URL string or a `ModelSource` object. Supported extensions
are `.gltf`, `.glb`, `.ply`, `.spz`, `.splat`, and `.ksplat`. Rotation values
are radians. `path` is only for glTF related-resource resolution.

Splat models require `@sparkjsdev/spark` in the application dependency graph.

## Transform and scale pipeline

The viewer applies transforms in this order:

```text
source file transforms
  -> ModelSource scale and rotation
  -> local bounds calculation
  -> origin alignment translation
  -> ModelViewer local transform
  -> ancestor transforms
  -> world-space rendered size
```

These scale concepts are different:

| Layer                             | Owner                          | Effect                                                    |
| --------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Authored asset units              | glTF or splat file             | Establishes the source dimensions                         |
| `ModelSource.scale`               | Loaded content root            | Normalizes asset units before bounds and origin alignment |
| Animated node scale               | glTF animation                 | Changes animated hierarchy nodes after load               |
| `viewer.scale` and ancestor scale | Scene hierarchy                | Changes the complete presented viewer in world space      |
| Manipulation scale                | User interaction on the viewer | Updates viewer hierarchy scale within configured limits   |

Use `ModelSource.scale` to correct the asset's authored units or orientation.
Use the viewer transform for application placement and user-controlled physical
size. XR Blocks does not currently provide a meter-based `fit()` operation or a
physical-width option. Measure `viewer.boundingBox`, compute the required scale,
and set `viewer.scale` when the application needs a specific world size.

For example, fit the loaded local height to 0.8 meters before ancestor scaling:

```js
const size = viewer.boundingBox.getSize(new THREE.Vector3());
if (size.y > 0) viewer.scale.setScalar(0.8 / size.y);
```

## Origin alignment

`origin` controls the content root after asset transform and bounds calculation:

| Origin          | Result                                                                              |
| --------------- | ----------------------------------------------------------------------------------- |
| `bottom-center` | Places the horizontal center at local X/Z zero and the lowest bound at local Y zero |
| `center`        | Places the bounds center at local origin                                            |
| `source`        | Preserves the transformed source origin                                             |

Origin alignment changes the loaded content below the viewer. It does not move
the viewer object itself.

## Bounds and non-Mesh content

`viewer.boundingBox` is the normalized local box captured when content loads or
is set. It is the contract applications should inspect. Do not assume the
presented content is one `THREE.Mesh`: glTF roots are object hierarchies and
splat renderables have their own bounds path.

Three.js hierarchy bounds depend on renderable children with computable
geometry bounds. Custom shaders, procedural rendering, empty groups, helpers,
and renderables without geometry bounds can produce an empty box. When bounds
are empty, the viewer cannot create bounds-derived interaction proxies or
calculate a physical fit. Supply a bounded wrapper or manage interaction in a
dedicated `Script` for that content.

The captured box does not automatically expand for later animation extremes or
arbitrary hierarchy edits. Recreate or reload the presentation when the app
needs new canonical bounds.

## Present an existing object

```js
const viewer = new xb.ModelViewer({origin: 'center'});
viewer.setContent(new THREE.Mesh(geometry, material));
viewer.position.set(0, 1.2, -1);
this.add(viewer);
```

`setContent()` replaces the active presentation and aligns its current bounds.
The caller retains ownership of geometry, materials, and textures supplied this
way. The viewer removes the object when it is replaced or disposed but does not
dispose caller-owned resources.

Models loaded through `load()` are viewer-owned and are disposed when replaced
or when the viewer is disposed.

## Animation

```js
viewer.playAnimation();
viewer.playAnimation({once: true});
```

`playAnimation()` restarts every clip stored in the loaded glTF. `autoplay`
starts all clips after load. Applications that require named clip selection or
independent animation ownership should load and own the glTF in a dedicated
`Script`.

Animation node transforms and viewer manipulation are separate hierarchy
layers. Manipulation changes the viewer; animation continues inside the loaded
content root.

## Interaction ownership

`manipulation: true` enables move, Y-axis rotate, and scale. The viewer creates
private bounds-derived surfaces for translation and rotation and registers them
as physical surfaces whose logical target is the public `ModelViewer`.

```js
viewer.manipulation = {
  actions: {rotate: {axis: 'y'}},
  handle: {action: 'rotate'},
};
```

Event code sees the viewer through the public `event.target` and
`event.surface` contract. XR Blocks normalizes private proxy hits to the viewer;
do not traverse or retain private proxy children.

Set `manipulation: false` when another object owns interaction. Read
[Interaction and Manipulation](Interaction.md) for concurrent owners,
two-source scale, event phases, and cancellation.

## Placement and occlusion

Place and manipulate the `ModelViewer` root, not the loaded content root. Use
[Placement scripts](Placement.md) when the viewer must follow, face, or orbit a
target. Direct placement scripts suspend and rebase during manipulation.

Set `occlusion: true` only with depth enabled. The viewer registers supported
loaded glTF materials with the depth occlusion system. Splat and arbitrary
caller-owned material behavior can require a separate rendering path.

For complete examples, see the [Model Viewer sample](/samples/ModelViewer) and
`samples/spatial_ui/modelviewer`.

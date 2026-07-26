# World-sensing branches

Read the selection table first, then only the section for the selected branch.
All APIs below are public through
[`src/xrblocks.ts`](../../../src/xrblocks.ts).

## Selection table

| Signal                                                | Branch       | Enable before `xb.init()`                          | Cadence                       | Empty / unavailable                       |
| ----------------------------------------------------- | ------------ | -------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| Bounded floors, walls, tables                         | Planes       | `options.enablePlaneDetection()`                   | engine-updated                | `xb.world.planes?.get()` is empty         |
| Reconstructed room geometry                           | Scene meshes | `options.world.enableMeshDetection()`              | engine-updated                | mesh map is empty                         |
| Per-pixel distance or a camera-relative room mesh     | Depth        | `options.enableDepth()`                            | engine-updated                | no depth array; `getDepth()` returns `0`  |
| Named physical items in world space                   | Objects      | camera + depth + `options.enableObjectDetection()` | one-shot or client-controlled | `[]`                                      |
| World-space body joints                               | Humans       | `options.enableHumanDetection()`                   | one-shot or client-controlled | `[]`                                      |
| World-space face landmarks and expressions            | Faces        | `options.enableFaceDetection()`                    | one-shot or client-controlled | `[]`                                      |
| Per-pixel person categories                           | Segmentation | `options.enableSegmentation()`                     | automatic polling or one-shot | `null`                                    |
| Semantic scene tree, visibility, or Set-of-Mark image | Context      | one of the `enable*Context()` methods              | one-shot or client-controlled | empty output; detector absent if disabled |

## Planes

Use planes for coarse, semantically labelled surfaces and placement. The top-
level and nested enable methods are equivalent:

```js
options.enablePlaneDetection();
options.world.planes.showDebugVisualizations = true;

const floors = xb.world.planes?.get('floor') ?? [];
const placed = await xb.world.placeOnHorizontalSurface(model, {seconds: 30});
```

`placeOnHorizontalSurface()` resolves to a boolean; treat `false` as a normal
no-surface result. Plane detection is requested as the optional WebXR feature
`plane-detection`, so a native session can continue without plane data.

The simulator injects planes from the active environment's `scenePlanesPath`.
Use [`templates/planes/main.js`](../../../templates/planes/main.js) and
[`docs/docs/manual/World.mdx`](../../../docs/docs/manual/World.mdx). For precise
placement, the source recommends the depth-mesh pattern over plane anchoring.

## Scene meshes

Use scene meshes for platform-reconstructed room geometry:

```js
options.world.enableMeshDetection();
options.world.meshes.showDebugVisualizations = true;

for (const mesh of xb.world.meshes?.xrMeshToThreeMesh.values() ?? []) {
  console.log(mesh.semanticLabel);
}
```

XR Blocks requests `mesh-detection` as an optional WebXR feature. Missing
native support therefore yields no meshes rather than intentionally making the
session feature required. Device/browser support remains experimental; include
the current target in the device handoff rather than promising universal
availability.

The simulator exposes the room scene and simulator objects through the same
mesh map. If Rapier is configured, detected scene meshes create their Rapier
trimesh colliders automatically. Start from
[`samples/scene_mesh/main.js`](../../../samples/scene_mesh/main.js),
[`src/world/mesh/MeshDetector.ts`](../../../src/world/mesh/MeshDetector.ts), and
[`docs/docs/manual/World.mdx`](../../../docs/docs/manual/World.mdx).

## Depth, reticles, occlusion, and world collision

Use depth for live distance, depth-mesh raycasts, visual occlusion, or a
camera-relative physical surface:

```js
options.enableDepth();

const meters = xb.depth.getDepth(u, v);
xb.showReticleOnDepthMesh(true);
```

`enableDepth()` installs `xb.xrDepthMeshOptions` and requests the required
WebXR features `depth-sensing` and `local-floor`. Unsupported native depth can
therefore prevent XR session entry. The simulator renders a synthetic depth
source from its current environment.

Rapier plus any enabled depth mesh automatically creates and updates the depth
collider:

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

options.enableDepth();
options.physics.RAPIER = RAPIER;
options.depth.depthMesh.colliderUpdateFps = 5;
```

`xb.xrDepthMeshPhysicsOptions` does **not** switch physics on. It is a legacy
rendering/geometry preset that adds received shadows and upper-edge hole
patching; use it only when those choices are wanted. Use custom `DepthOptions`
only for an actual depth-mesh, texture, resolution, or occlusion requirement.

For built-in material occlusion, follow the shader-injection recipe in
[`docs/docs/manual/Depth.md`](../../../docs/docs/manual/Depth.md). Working
geometry examples are
[`templates/3_depth/main.js`](../../../templates/3_depth/main.js),
[`samples/depthmesh/main.js`](../../../samples/depthmesh/main.js), and
[`samples/depthmap/main.js`](../../../samples/depthmap/main.js).

## Objects

Object detection needs a camera frame and a depth mesh to lift 2D detections
into world space. Prefer the top-level helper because it also declares camera
permission:

```js
options.enableCamera('environment');
options.enableDepth();
options.enableObjectDetection();
options.world.objects.backendConfig.activeBackend = 'mediapipe';

const objects = await xb.world.objects.runDetection();
```

The default backend is `gemini`; add `options.enableAI()` and the AI dependency
and key path for that branch. Gemini sends camera frames to Google. The
`mediapipe` backend runs locally and needs `@mediapipe/tasks-vision`. Both real
camera paths need camera permission before the immersive session and may
return `[]` while the camera warms up, when initialization fails, or when
nothing is detected.

For deterministic desktop evidence, mark simulator object definitions with
`detectObject: true` and a `label`, then set:

```js
options.enableObjectDetection();
options.world.objects.simulatorOverride = true;
```

The override uses simulator ground truth with frustum and occlusion checks;
native XR continues to use the selected backend. Use
[`templates/8_objects/main.js`](../../../templates/8_objects/main.js),
[`docs/docs/manual/Simulator.mdx`](../../../docs/docs/manual/Simulator.mdx),
and [`src/world/objects/ObjectDetector.ts`](../../../src/world/objects/ObjectDetector.ts).

## Humans and faces

These helpers enable the environment camera, camera permission, depth, and the
on-device MediaPipe branch:

```js
options.enableHumanDetection();
options.enableFaceDetection();

const poses = await xb.world.humans.runDetection();
const wrist = poses[0]?.getJointPosition(xb.PoseJointName.LeftWrist);

const faces = await xb.world.faces.runDetection();
const nose = faces[0]?.getLandmarkPosition(xb.FaceLandmarkName.NoseTip);
const jawOpen = faces[0]?.getBlendshape('jawOpen');
```

Human detection loads `@mediapipe/tasks-vision` through the app. Face detection
runs MediaPipe in a worker using the backend's configured CDN URL; its TypeScript
types still come from `@mediapipe/tasks-vision`. Face projection can use
`three-mesh-bvh` and falls back to Three.js raycasting if it is absent. Results
may be empty while camera or depth data warms up. Continuous polling uses
`start(client)` / `stop(client)` and the matching
`options.world.humans.pollingIntervalMs` or
`options.world.faces.pollingIntervalMs`.

The simulator supplies camera and depth plumbing, but it has no human/face
ground-truth override. Use it for state wiring with a suitable visible fixture;
hand off real projection, permission, and tracking to the target device.
See [`demos/face_mirror/`](../../../demos/face_mirror/) and
[`docs/docs/manual/World.mdx`](../../../docs/docs/manual/World.mdx).

## Segmentation

Segmentation is 2D, on-device MediaPipe inference. It requires the camera and
`@mediapipe/tasks-vision`, but not depth:

```js
options.enableSegmentation();

const mask = await xb.world.segmentation.runSegmentation();
const latest = xb.world.segmentation.latestMask;
```

The engine automatically polls at
`options.world.segmentation.pollingIntervalMs` (66 ms by default). Concurrent
explicit calls share one inference. A result is `{data, width, height}` with
values from `xb.SegmentCategory`; `null` means no ready frame or backend. Use
[`src/world/segmentation/Segmenter.ts`](../../../src/world/segmentation/Segmenter.ts).

## Agent-facing scene context

Context observes the XR Blocks/Three.js scene for agents and automation; it is
not a replacement for detecting previously unknown physical objects.

```js
options.enableContext(); // semantic tree + visible objects + Set of Mark
// Or choose enableSceneContext(), enableVisibleObjectsContext(), or
// enableSetOfMarkContext().

const result = await xb.context.scene.runContextDetection({
  semanticTree: true,
  visibleObjects: true,
  setOfMark: true,
});
const object = xb.context.scene.resolveNodeObject(
  result.semanticTree.nodes[0].id
);
```

Use one `runContextDetection()` call when outputs must describe the same
snapshot. Treat stable `ctx_*` ids as opaque. Continuous polling uses
`start(client)` / `stop(client)` and
`options.context.scene.pollingIntervalMs`. Disabled context leaves
`xb.context.scene` undefined.

Context works in simulator and native scenes. Automation mode enables it by
default; `?xrAutomation=1&debug=1` also exposes `window.xbReady` for a browser
driver. Use [`docs/docs/manual/Context.mdx`](../../../docs/docs/manual/Context.mdx)
and [`src/context/scene/SceneDetector.ts`](../../../src/context/scene/SceneDetector.ts).

## Imports and permission timing

Declare camera use before `xb.init()` so XR Blocks can request browser camera
permission from the flat page before entering immersive XR. The top-level
object, human, face, and segmentation helpers do this; nested
`options.world.enableObjectDetection()` only enables the detector, so pair it
with `options.enableCamera('environment')` when using that lower-level form.

For import-map apps, start from the map in the matching working artifact and
add only the selected branch's externals:

- Gemini objects: `@google/genai`;
- MediaPipe objects, humans, or segmentation: `@mediapipe/tasks-vision`;
- face detection: the backend worker has a CDN module URL; npm/TypeScript builds
  still need `@mediapipe/tasks-vision` for its imported types;
- accelerated face projection: `three-mesh-bvh`;
- world collision: the same Rapier specifier imported by the app.

Keep `three` aligned with the repository peer dependency and map it once. For
npm/bundler apps, install or externalize these optional dependencies as
described in [`docs/docs/manual/Intro.mdx`](../../../docs/docs/manual/Intro.mdx).

---
name: xb-world
description: >-
  Understand the real world in an XR Blocks app via `xb.world` — detect horizontal/
  vertical planes, reconstruct scene meshes, and recognize physical objects (with a
  Gemini or MediaPipe backend) as `THREE.Object3D`s positioned in 3D. Use to place
  virtual content on real surfaces, react to room geometry, or attach affordances to
  recognized objects. Covers `enablePlaneDetection()`, `enableObjectDetection()`,
  `options.world.*`, `xb.world.objects.runDetection()`, and
  `xb.world.placeOnHorizontalSurface()`. For raw depth/occlusion use xb-depth.
---

# xb-world — world understanding (planes, meshes, objects)

`xb.world` exposes the real environment to your app. See `templates/8_objects`,
`samples/depthmesh`, and `src/world/`.

## Plane detection

```js
const options = new xb.Options();
options.enablePlaneDetection(); // detected planes become part of the world
xb.init(options);
```

Auto-place a model on a detected horizontal surface (e.g. the floor/a table):

```js
xb.world.placeOnHorizontalSurface(model, /*timeout*/ {seconds: 30});
```

## Object detection (Gemini / MediaPipe)

Object detection needs AI, the environment camera, and depth (to lift 2D detections into 3D):

```js
options.enableAI(); // detection backend (see xb-ai — needs a key)
options.enableCamera('environment'); // video feed for the model
options.enableDepth(); // project detections into 3D
options.world.enableObjectDetection();
options.world.objects.showDebugVisualizations = true;
```

Run detection on demand (e.g. on pinch/click) — it resolves to an array of `THREE.Object3D`
placed at the detected world positions:

```js
async onSelectEnd() {
  const detected = await xb.world.objects.runDetection();
  // each entry is a THREE.Object3D with the detected world pose + metadata
  console.log('detected', detected.length);
}
```

## Scene meshes

```js
options.world.enableMeshDetection();
options.world.meshes.showDebugVisualizations = true; // visualize reconstructed geometry
```

## Notes

- Backends live in [`src/world/objects/backends/`](../../src/world/objects/backends)
  (`GeminiDetectorBackend`, `MediaPipeDetectorBackend`); choose via `options.world.objects`.
- Plane / mesh / object detection are independent — enable only what you need.
- Object detection with the Gemini backend sends camera frames to Gemini (see
  [`xb-ai`](../xb-ai/SKILL.md) and the API-key guidance in `AGENTS.md`).

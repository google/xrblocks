> **Experimental in Android XR. More robust detection is required for on-device showcase.**

# 3D Object Boxes

Run the existing 2D object detector, sample the depth mesh inside each
detection's 2D box, and fit an oriented 3D bounding box around the
points. No new ML model — just a small PCA on the points the device's
own depth sensor already gives us.

## Why not Objectron / Cube R-CNN / etc

Most monocular 3D detectors exist because their target platform doesn't
have depth. xrblocks does (`xb.core.depth`), so we can skip the model
entirely and use real metric depth + the SDK's existing 2D detector.

That gets us:

- Categories = whatever the 2D detector recognises (lots, with the
  Gemini backend), not just shoe / chair / cup / camera.
- Real metric scale from the headset's depth sensor, not estimated
  relative depth.
- Real yaw orientation from PCA on the actual points.
- Zero model download.

## How the box gets fit

1. `xb.core.world.objects.runDetection()` returns 2D boxes + a
   centre-point world position per object.
2. Sample an 18×18 grid of normalised UVs inside the 2D box and call
   `xb.core.depth.getVertex(u, v)` for each to get world-space points.
3. Drop points more than ~1.2 m from the SDK's centre point — that
   peels off background / foreground bleeding through the box.
4. PCA in the horizontal plane (XZ) gives the yaw of the dominant
   axis. Y is left gravity-aligned. Min/max along the rotated axes
   gives the footprint, min/max world-Y gives the height.
5. Render as `THREE.LineSegments(EdgesGeometry(BoxGeometry))` rotated
   to the PCA yaw, with the label floating above.

## Running

Serve the repo root and open `/demos/objects_3d/`. Press **Detect**
(in the screen panel or the spatial panel). Works in the simulator and
on Android XR.

## SAM device selection

The default SlimSAM mask path runs entirely in a same-origin module worker, including WASM inference, so CPU fallback does not block XR rendering. It tries WebGPU/fp16, WebGPU/fp32, then WASM/fp32 without checking browser names or GPU vendors. The execution adapter and device must expose both `maxStorageBufferBindingSize` and `maxBufferSize` of at least 384 MiB for fp16 or 768 MiB for fp32; fp16 also requires `shader-f16`. The checked adapter is supplied to ORT before model initialization, and ORT's resulting device is checked before encoding. These are minimum attention-buffer requirements, not a guarantee of enough total GPU memory.

Each failed loading, encoding, or decoding attempt disposes its model and starts a fresh worker for the next candidate, replaying the same snapshot and box prompt. This isolates the pinned Transformers.js 3.0.0 runtime's cached initialization failures. The processor loads before the model, once per worker rather than per snapshot; fallback needs a new processor instance, while browser download caching can reuse its files and weights. Only a completed encoder run establishes the cached worker. Worker errors or unresponsive workers are terminated, and a later Detect press can retry after all candidates fail. `?mask=segmenter` remains an explicit alternative, not an automatic fallback.

Mocked tests cover selection, lifecycle, replay, serialization, and mask output. Transformers.js 3.0.0 also performs a separate default-adapter fp16 probe, which can reject fp16 even when the supplied execution adapter supports it; the next candidate is still tried. Actual headset validation is still needed for driver-specific dispatch errors, available GPU memory, WASM latency, and XR frame pacing; an exposed WebGPU API or passing desktop tests alone does not establish device support.

## What's next

If this lands well, the natural follow-up is a `box3d: true` option
on `world.objects.runDetection()` so apps can ask for oriented 3D
boxes alongside the existing 2D box + centre point — same primitive,
in the SDK rather than each demo redoing it.

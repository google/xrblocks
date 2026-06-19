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

## What's next

If this lands well, the natural follow-up is a `box3d: true` option
on `world.objects.runDetection()` so apps can ask for oriented 3D
boxes alongside the existing 2D box + centre point — same primitive,
in the SDK rather than each demo redoing it.

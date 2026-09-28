# Photo Depth

Most smart glasses have an RGB camera but no depth sensor. This demo turns one
photo from the device camera into **metric depth, aligned with the room**, fully
on-device: [MoGe-2](https://huggingface.co/litert-community/MoGe-2-LiteRT)
(monocular geometry) runs through [LiteRT.js](https://www.npmjs.com/package/@litertjs/core)
on WebGPU, and the result is placed back exactly where the camera saw it, as a
colored point cloud overlaying the real scene. On a headset that also senses
depth, the photo depth is scored against the sensor so its precision can be
judged by eye and in numbers.

This is phase 1 of a larger demo: next come a mesh built from the depth map
(with a visualization), then virtual annotations and a ball pit that use the
photo depth instead of sensed depth.

## Run

Serve the repository (`npm run dev` from the repo root) and open
`http://localhost:8080/demos/photo_depth/`. Allow camera access.

- **Capture** photographs the scene and places its depth in the room. Walk
  around: where the colored points drift off the real surfaces is where the
  depth is wrong.
- **Hide/Show cloud** toggles the overlay.
- **Nearer 5% / 1%, 1% / Farther 5%** adjust the depth by hand until the
  points sit on the real surfaces. They scale all depths about the capture
  point, so every point slides along its own camera ray and the cloud stays
  aligned with the photo; this is the one correction MoGe usually needs (see
  [Accuracy to expect](#accuracy-to-expect)).
- **Fit to sensed** rescales the depth by the median sensed/photo ratio (needs
  sensed depth). **Snap floor** rescales it so the photographed floor lands on
  the real floor, without any depth sensor (the floor must be in the photo).
  **Reset scale** undoes both.
- **Camera: SDK / ArUco** switches the camera model used by the next capture
  (below). **Calibrate** runs the ArUco calibration.

The first visit downloads the fp16 weights (71 MB) from Hugging Face and the
LiteRT.js wasm runtime (9 MB) from jsDelivr, both cached afterwards. Nothing is
checked in.

## How the photo is aligned

1. The photo is captured with the head pose of the frame's capture time (a pose
   history is recorded every frame, as the objects3d addon does).
2. MoGe predicts an _affine_ point map: right up to a global scale and a shift
   along the optical axis. The shift is recovered by making the points project
   back onto their own pixels (MoGe's own focal + shift fit, as in MoGe's
   `recover_focal_shift`); MoGe's metric-scale output then turns it into meters.
3. Each pixel's depth is unprojected along the **real camera's** ray (camera
   model intrinsics) and placed with the camera's world pose, so the points line
   up with the photo from the capture viewpoint by construction; errors show up
   when viewed from elsewhere.

The status panel reports the pieces: inference time, the camera model in use and
the pose-to-frame time match, MoGe's field-of-view estimate next to the camera
model's, the recovered shift and reprojection error, the scale, and (with
sensed depth) the median / 90th-percentile relative error, the median error in
centimeters, and the error that would remain after a scale fit (the shape
error).

`?shift=camera` instead solves the shift with the camera model's focal length
(MoGe's known-FOV path). That degenerates when MoGe disagrees with the camera
about the field of view: in the simulator, one view MoGe saw at 69° instead of
the true 90° left 8.8% median error after a scale fit this way, against 3.5%
with the default; views where MoGe got the FOV right score the same either way.

## Camera model and ArUco calibration

The camera intrinsics and camera-to-eye extrinsics come from the SDK's per-device
estimates (`src/camera/`: Galaxy XR and Quest 3 profiles, picked from the
browser). They are estimates; a printed ArUco marker refines the extrinsics with
the `aruco` addon's self-calibration, the same flow as the objects_3d demo:

1. Print an `ARUCO_MIP_36h12` marker (ID 0 by default) from the
   [js-aruco2 marker creator](https://damianofalcioni.github.io/js-aruco2/samples/marker-creator/marker-creator.html?dictionary=ARUCO_MIP_36h12),
   mount it flat, and measure the black square (150 mm by default, `?markerSize=`
   in meters otherwise).
2. Press **Calibrate**, walk a couple of meters around the marker looking at it
   from several angles until the card says the calibration converged, then
   press **Freeze**. Capture again to use it.

A converged calibration is stored per device by the addon, and the demo applies
the stored one at start-up (`?cal=sdk` starts with the SDK estimate instead).
**Camera: SDK / ArUco** compares the two on the next capture. Only the
extrinsics transfer; the calibration's range scale is not applied.

## Query parameters

| Parameter         | Effect                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| `?sensedDepth=0`  | Do not request depth sensing (run like a depthless device; no accuracy readout).        |
| `?cal=sdk`        | Start with the SDK camera estimate even if an ArUco calibration is stored.              |
| `?markerId=<n>`   | ArUco marker ID for calibration (default 0).                                            |
| `?markerSize=<m>` | Printed black-square width in meters (default 0.15).                                    |
| `?fov=<deg>`      | Override the camera's horizontal field of view; `?fov=auto` uses MoGe's estimate.       |
| `?shift=camera`   | Solve MoGe's shift with the camera focal length (see above).                            |
| `?autoScale=`     | `sensed` or `floor`: apply Fit to sensed / Snap floor after every capture.              |
| `?floorY=<m>`     | Floor height for Snap floor (0 on headsets; about 0.307 in the desktop simulator room). |
| `?stride=<n>`     | Keep every n-th pixel in the cloud (default 1: all 448² pixels).                        |
| `?img=<url>`      | Run on that image at start-up (MoGe's own focal; placed in front of the camera).        |
| `?backend=wasm`   | Force the wasm build even when WebGPU is available.                                     |

## Accuracy to expect

MoGe's metric scale is its weakest output; the shape it predicts is much
better. The MoGe-2 paper ([arXiv 2507.02546](https://arxiv.org/abs/2507.02546),
Table 2) reports, for its largest model (ViT-L) averaged over 7 benchmarks, a
relative error of 8.2% on metric point maps and 15.7% on metric depth. This demo
runs the smallest variant (ViT-S, 35M parameters, `moge-2-vits-normal`) at a
fixed 448² input, which is 1024 tokens, below the 1200 to 3600 tokens MoGe-2
was trained on. No per-variant numbers are published, but it should do no
better.

A sweep of 24 simulator views (8 headings × 3 pitches) agrees:

- **The error is mostly one scale factor.** Median raw error was 10% (3.9% to
  49%, plus one outlier at 174% looking across the room at 6 m), which is
  tens of centimeters at 2 to 3 m. The scale fit ranged from ×0.37 to ×1.14.
  After that single factor the median shape error was 4% (2.6% to 7.3%, worse
  only when looking steeply down at close furniture: 9 to 20%).
- **It is not a pipeline error.** Re-capturing the same view gives
  bit-identical results, and a wrong pose or wrong intrinsics would show up as
  shape error, which stays at a few percent.
- **The scale error follows MoGe's field-of-view error.** Views where MoGe
  guessed a narrow field of view (63° to 72° instead of 90°) all came out too
  far away.
- **Snap floor lands within 5% of the best scale in 18 of 24 views.**

So the order of corrections is: Snap floor when the floor is in view (or Fit
to sensed on a headset), then Nearer / Farther by eye.

## Simulator results

Four simulator views of the default room (desktop, 512² camera, true 90° FOV),
scored against the simulator's rendered depth:

| View                     | MoGe FOV | Raw median error | After Snap floor | After scale fit |
| ------------------------ | -------- | ---------------- | ---------------- | --------------- |
| straight ahead           | 69°      | 19.1%            | 3.4%             | 3.5%            |
| yaw 0.6, pitch −0.3 rad  | 91°      | 8.3%             | 5.1%             | 4.8%            |
| yaw −0.8, pitch −0.5 rad | 90°      | 4.1%             | 4.2%             | 2.4%            |
| yaw 0.3, pitch −0.9 rad  | 75°      | 6.5%             | 4.1%             | 4.0%            |

(`?floorY=0.307`: the simulator room's floor is not at y = 0.)

## Notes

- Sensed depth is requested with the depth mesh enabled but invisible: devices
  with GPU-only depth (Quest 3) read depth back to the CPU only for the mesh.
  That readback costs frame time; `?sensedDepth=0` avoids it.
- The depth map lives on the 448² letterboxed model grid; padding, a two-pixel
  rim and low-confidence pixels have no depth.
- Panel text is ASCII only: the UI font lacks glyphs such as `°` or `·`.

## Credits

MoGe-2 pre- and post-processing adapted from the Photo → 3D web demo in
[google-ai-edge/litert-samples](https://github.com/google-ai-edge/litert-samples/tree/main/samples/web_demos)
(Apache-2.0). Model weights: `litert-community/MoGe-2-LiteRT` (MIT), converted
from [MoGe-2](https://github.com/microsoft/MoGe). See `LICENSE` in this folder.

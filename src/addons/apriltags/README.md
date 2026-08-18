# AprilTag spatial anchors

`AprilTagTracker` recognizes the `tag25h9` family from the device camera and
places itself at the selected tag's world pose. It is an optional addon: the
reference detector runs in a worker and its WebAssembly payload is not included
in the main `xrblocks` bundle.

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {AprilTagTracker} from 'xrblocks/addons/apriltags/AprilTagTracker.js';

const anchor = new AprilTagTracker({
  tagId: 17,
  // The black-and-white code width, not the page size.
  tagSizeMeters: 0.1556,
});
anchor.add(new THREE.AxesHelper(0.12));
xb.add(anchor);
```

Enable the environment camera before initializing XRBlocks. The tracker starts
with tag25h9 ID 17 and a 0.1556 m (155.6 mm) tag width. tag25h9 IDs range from
0 through 34.

```js
const options = new xb.Options();
options.enableCamera('environment');
options.deviceCamera.willCaptureFrequently = true;
xb.init(options);
```

The tracker keeps its most recently measured transform when the tag leaves the
camera view. `state === 'tracked'` means the current result has a visual
observation; `state === 'anchored'` means the retained spatial-anchor pose is
being used. Call `resetAnchor()`, `setTagId()`, or `setTagSizeMeters()` to clear
the cached pose intentionally.

## How drift is handled: self-calibration

Platforms with first-class marker tracking (the Quest passthrough camera
API, HoloLens QR tracking) are accurate because the runtime supplies a
calibrated camera: exact intrinsics, exact camera-to-head extrinsics, and
per-frame synchronized poses. A WebXR `getUserMedia` stream supplies none of
those, so the SDK's device-camera model is a hand-measured estimate — and
every degree of extrinsics error moves a tag anchor by centimetres in a
direction that changes with the viewpoint, which reads as the anchor
"swimming" while the viewer walks.

The tracker therefore recovers the missing calibration from the tag itself
(`TagAnchorCalibrator`). Accepted detections become viewpoint-diverse
keyframes, and a damped Gauss–Newton fit jointly estimates the tag's world
pose, a 6-DOF correction to the assumed camera extrinsics, and a range-scale
correction for the assumed focal length / printed tag size, using the
headset's SLAM poses as the reference. The rendered anchor is the optimized
world pose — world-fixed by construction rather than chasing per-frame
measurements — so walking around the tag _tightens_ the anchor instead of
swinging it. Priors hold the calibration at the SDK model along directions
the current viewpoint diversity cannot observe.

The recovered camera calibration describes the device, not the tag: it is
kept across `resetAnchor()`/`setTagId()` and persisted in `localStorage`, so
later sessions on the same headset start out calibrated.

Observations are paired with the head pose at the video frame's capture time
and deweighted when the head was moving quickly at capture. A persistent run
of outlier detections (the printed tag was physically moved) re-seeds the
anchor while keeping the calibration.

`tracker.diagnosticsSummary` is a one-line string (keyframes, baseline, fit
residuals, recovered calibration, range scale, frame latency, pose-match
error) intended for an on-headset panel; `tracker.diagnostics` exposes the
raw values. Walk a couple of metres around the tag: `res` should drop to a
centimetre or two and the `?` after `k` should disappear once the fit is
trusted.

The anchor keeps the official AprilTag tag frame, centered on the tag: X
(red) points to the right and Y (green) points _down_ as the printed tag is
viewed, with Z (blue) into the tag. Attach children accordingly, or parent
them under a corrective rotation if Y-up is preferred. A constant camera
registration offset does not matter when the tag is used as a relative
anchor (storing other objects' transforms relative to it): the bias cancels
as long as placement and restoration go through the same tracker.

## Regenerating the detector

The checked-in `wasm/apriltag_wasm.{js,wasm}` artifacts are generated from the
official [AprilTag reference implementation](https://github.com/AprilRobotics/apriltag)
at `b7c0ebe9aa20f82ec7a828579004f9e706bfecd9` (BSD-2-Clause). Maintainers with
Emscripten installed can refresh them with:

```sh
npm run build:apriltag-wasm
```

See [NOTICE.md](./NOTICE.md) for attribution.

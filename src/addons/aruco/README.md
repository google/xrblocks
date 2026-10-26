# ArUco spatial anchors

`ArucoTracker` recognizes a printed ArUco marker from the device camera and
places itself at the marker's world pose. It is an optional addon: detection
runs in a worker on top of [js-aruco2](https://github.com/damianofalcioni/js-aruco2)
(MIT), which the worker imports at runtime. Nothing from that library is
bundled into `xrblocks` or checked into this repository.

```js
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ArucoTracker} from 'xrblocks/addons/aruco/ArucoTracker.js';

const anchor = new ArucoTracker({
  dictionary: 'ARUCO_MIP_36h12',
  markerId: 0,
  // The width of the black square, not the page size.
  markerSizeMeters: 0.15,
});
anchor.add(new THREE.AxesHelper(0.12));
xb.add(anchor);
```

Enable the environment camera before initializing XRBlocks:

```js
const options = new xb.Options();
options.enableCamera('environment');
options.deviceCamera.willCaptureFrequently = true;
xb.init(options);
```

The tracker keeps its most recently measured transform when the marker leaves
the camera view. `state === 'tracked'` means the current result has a visual
observation; `state === 'anchored'` means the retained spatial-anchor pose is
being used. Call `resetAnchor()`, `setMarkerId()`, `setDictionary()` or
`setMarkerSizeMeters()` to clear the cached pose intentionally.

## Dictionaries and printing

| Dictionary                  | Grid (with border) | IDs    | Min. Hamming distance | Default `maxHamming` |
| --------------------------- | ------------------ | ------ | --------------------- | -------------------- |
| `ARUCO_MIP_36h12` (default) | 8 × 8              | 0–249  | 12                    | 4                    |
| `ARUCO`                     | 7 × 7              | 0–1022 | 3                     | 0                    |

`ARUCO_MIP_36h12` is the default because its codes are far apart: a few
misread cells are corrected instead of turning into some other marker's ID,
which matters in a cluttered passthrough image. The original `ARUCO`
dictionary has slightly larger cells at the same print size (a little more
range) but cannot correct any error, so it is accepted on exact matches only.

Print markers from the js-aruco2
[marker creator](https://damianofalcioni.github.io/js-aruco2/samples/marker-creator/marker-creator.html?dictionary=ARUCO_MIP_36h12)
(or `await tracker.markerSvg(id)`, which returns the same SVG). Keep the white
margin around the black square, mount the print flat, then **measure the black
square's side** and pass it as `markerSizeMeters`: the range of every
observation scales with it.

## Acceptance gates

js-aruco2 reports marker corners at integer-pixel accuracy. The worker refines
them to sub-pixel accuracy (`refineCorners`, on by default), solves the pose
with js-aruco2's coplanar POSIT, and keeps whichever of the two planar
solutions reprojects closer to the observed corners. A detection is used only
when it matches the selected ID with at most `maxHamming` corrected bits, its
quad is at least `minSidePixels` (24) wide on average, and its RMS reprojection
error is at most `maxReprojectionErrorPx` (3).

## How drift is handled: self-calibration

Platforms with first-class marker tracking (the Quest passthrough camera
API, HoloLens QR tracking) are accurate because the runtime supplies a
calibrated camera: exact intrinsics, exact camera-to-head extrinsics, and
per-frame synchronized poses. A WebXR `getUserMedia` stream supplies none of
those, so the SDK's device-camera model is a hand-measured estimate — and
every degree of extrinsics error moves a marker anchor by centimetres in a
direction that changes with the viewpoint, which reads as the anchor
"swimming" while the viewer walks.

The tracker therefore recovers the missing calibration from the marker itself
(`MarkerAnchorCalibrator`). Accepted detections become viewpoint-diverse
keyframes, and a damped Gauss–Newton fit jointly estimates the marker's world
pose, a 6-DOF correction to the assumed camera extrinsics, and a range-scale
correction for the assumed focal length / printed marker size, using the
headset's SLAM poses as the reference. The rendered anchor is the optimized
world pose — world-fixed by construction rather than chasing per-frame
measurements — so walking around the marker _tightens_ the anchor instead of
swinging it. Priors hold the calibration at the SDK model along directions
the current viewpoint diversity cannot observe.

The recovered camera calibration describes the device, not the marker: it is
kept across `resetAnchor()`/`setMarkerId()`/`setDictionary()` and persisted in
`localStorage` (disable with `persistCalibration: false`), so later sessions
on the same headset start out calibrated.

Observations are paired with the head pose at the video frame's capture time
and deweighted when the head was moving quickly at capture. A persistent run
of outlier detections (the print was physically moved) re-seeds the anchor
while keeping the calibration.

`tracker.diagnosticsSummary` is a one-line string (keyframes, baseline, fit
residuals, recovered calibration, range scale, frame latency, pose-match
error) intended for an on-headset panel; `tracker.diagnostics` exposes the
raw values. Walk a couple of metres around the marker: `res` should drop to a
centimetre or two and the `?` after `k` should disappear once the fit is
trusted.

The anchor is centered on the marker: X (red) points to the right and Y
(green) points _down_ as the print is viewed, with Z (blue) into the marker.
Attach children accordingly, or parent them under a corrective rotation if
Y-up is preferred. A constant camera registration offset does not matter when
the marker is used as a relative anchor (storing other objects' transforms
relative to it): the bias cancels as long as placement and restoration go
through the same tracker.

## Runtime dependency and deploying

Import maps do not apply inside workers, so the worker imports js-aruco2 by
absolute URL rather than by package name. The defaults
(`DEFAULT_ARUCO_MODULE_URLS`) point at jsDelivr's ES-module build of
`js-aruco2@2.0.0`. To self-host or run offline, serve ES-module builds of the
package's `src/aruco.js` and `src/posit1.js` and pass their URLs:

```js
new ArucoTracker({
  moduleUrls: {
    aruco: '/vendor/js-aruco2/aruco.esm.js',
    posit: '/vendor/js-aruco2/posit1.esm.js',
  },
});
```

Each module may expose its namespace (`AR`, `POS`) either as a named export or
on its default export. If the import fails the tracker reports
`state === 'error'` with the reason in `status`.

The addon is built into `build/addons/aruco/` together with its Web Worker
(`ArucoWorker.js`), which the tracker resolves relative to its own URL. The SDK
build is code-split into `build/internal/`, so deploy the whole `build/` tree
(not just `xrblocks.js`).

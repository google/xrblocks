# Magic Cutout

This demo captures the live device camera or desktop simulator frame, runs on-device tap-to-segment using MediaPipe `InteractiveSegmenter` (MagicTouch, ~6.2 MB `.tflite`), renders a transparent sticker cutout locally, and pins it into 3D room space via XR depth raycasting.

## Running Locally

Run `npm run dev` from the repository root, then open `http://127.0.0.1:8080/demos/magic_cutout/` in Chrome.

- **Tap to Cut Out**: Click or pinch anywhere on the left viewfinder (or press **Segment Center**) to isolate the object under your tap.
- **Cutout Styles**: Switch between **Sticker** (white die-cut border), **Glow** (cyan spatial aura), and **Clean** (feathered alpha cutout) without re-running inference.
- **Pin in Room**: Press **Pin in Room** to drop the cutout into 3D space at the captured depth pose. Each pinned cutout supports native `xb.manipulation` (grab, drag, push/pull, rotate, and scale). Press **Live View** to resume the live viewfinder, or **Undo** / **Clear** to remove pinned cutouts.

## Privacy & Runtime Notes

- Runs 100% on-device in the browser using WebGL/GPU (with automatic CPU/WASM fallback when WebGPU/GPU delegates are unavailable).
- Camera frames never leave the browser and no API key is required.
- Uses `options.enableDepth()` and `xb.transformRgbUvToWorld` when depth is available, falling back to `1.10 m` along the captured camera ray if no depth hit exists. Tested in the XR Blocks desktop simulator; physical XR headset behavior is unverified on hardware.

## Credits

- [MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)](https://github.com/google-ai-edge/mediapipe) — Apache-2.0.
- [Google MediaPipe MagicTouch Interactive Segmenter](https://developers.google.com/mediapipe/solutions/vision/interactive_segmenter) (`magic_touch.tflite`, ~6.2 MB) — Apache-2.0.

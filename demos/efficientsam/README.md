# XR Circle to Search | EfficientSAM × LiteRT × XR Blocks

Interactive **WebXR / XR Blocks (`v0.20.0+`)** Circle to Search segmentation demo of [yformer/EfficientSAM](https://github.com/yformer/EfficientSAM) (`EfficientSAM-Ti`) written in TypeScript and running 100% client-side via **Google LiteRT (`@litertjs/core@2.5.3`)** inside a dedicated Web Worker (`build/efficientsam_worker.js`).

## Features

- **Hand Pinch / Desktop Cursor Invisible Quad (`index.html` / `xr_main.ts`)**:
  - When pinching in XR (`30 cm` in front of your hand) or clicking in the XR Blocks Desktop Simulator (`1.0 m` in front of the `MouseController`), an invisible raycastable quad (`THREE.Mesh` with `PlaneGeometry` and `xb = { pointerEvents: 'auto', reticleMode: 'auto' }`) spawns oriented toward your viewpoint.
- **XR Blocks Reticle Drawing**:
  - As you move your pinching hand or mouse cursor, the **XR Blocks `Reticle`** glides across the invisible quad and draws a glowing Circle to Search trail at the reticle's UV intersection (`event.intersection` / `xb.user.getIntersectionAt`).
- **Web Worker LiteRT Segmentation (`efficientsam_worker.ts`)**:
  - Releasing the pinch captures the `512×512` view framed directly behind the quad and transfers the buffer to `build/efficientsam_worker.js`, which runs the LiteRT `EfficientSAM-Ti` encoder & decoder off the main thread, projects the segmentation mask & glowing contour back onto the 3D quad in space, and updates the `xb.UICard` spatial HUD with the transparent cutout and runtime metrics.

## Building & Running Locally

From the repository root:

```bash
npm run dev
```

This builds the SDK and demo TypeScript files (`xr_main.ts` -> `build/xr_main.js` and `efficientsam_worker.ts` -> `build/efficientsam_worker.js`) and starts the local server.

Then open:

- `http://127.0.0.1:8080/demos/efficientsam/`

## Re-exporting the LiteRT `.tflite` Models

```bash
python3 export_tflite.py \
  --checkpoint /path/to/efficient_sam_vitt.pt \
  --output-dir ./models \
  --img-size 512 \
  --max-points 6
```

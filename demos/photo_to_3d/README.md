# Photo to 3D

Turns one photo from the headset camera into a point-cloud miniature, fully
on-device: [MoGe-2](https://huggingface.co/litert-community/MoGe-2-LiteRT)
(monocular geometry, ViT-S) runs through [LiteRT.js](https://www.npmjs.com/package/@litertjs/core)
on WebGPU and recovers a per-pixel 3D point map in one forward pass. The cloud
is colored from the photo and presented on a `ModelViewer` platform, so it can
be moved, rotated and scaled like any other model.

The LiteRT plumbing (runtime from a CDN, cached model download, compile with
wasm fallback, tensor handling) is the `litert` addon
(`src/addons/litert/`); `moge.js` holds the model-specific pre- and
post-processing and `PhotoTo3D.js` the spatial UI and capture flow.

## Run

Serve the repository (`npm run dev` from the repo root) and open
`http://localhost:8080/demos/photo_to_3d/`. Allow camera access when prompted.

- **Capture** grabs the current camera frame and runs the model. In the desktop
  simulator the frame comes from the simulator's virtual camera.
- **Clear** removes the miniature.
- Grab the platform to move it, the ring to rotate it, and use two hands (or
  the scale edge) to resize it.

Nothing is committed for the model: the first visit downloads the fp16 weights
(71 MB) from Hugging Face and the LiteRT.js wasm runtime (9 MB) from jsDelivr,
both kept in the browser cache afterwards. Without WebGPU the demo falls back
to the fp32 model (136 MB) on wasm, which is much slower.

## Query parameters

| Parameter       | Effect                                                       |
| --------------- | ------------------------------------------------------------ |
| `?img=<url>`    | Run the model on that image right after start-up (CORS URL). |
| `?backend=wasm` | Force the wasm build even when WebGPU is available.          |

Example:
`http://localhost:8080/demos/photo_to_3d/?img=https://images.pexels.com/photos/16948625/pexels-photo-16948625.jpeg?auto=compress&cs=tinysrgb&w=1200`

## Notes

- The whole photo is letterboxed into the 448×448 model input; the padding
  and a two-pixel rim are excluded from the cloud, as are pixels below the
  model's confidence threshold and depths beyond 3.5× (or below 0.45×) the
  median.
- The cloud is scaled so its larger robust extent is 0.4 m and the point size
  follows the viewer's scale, so a resized miniature keeps a solid surface.
- The first inference after compiling is a throwaway warm-up (shader
  compilation); the latency shown after a capture is a real run.

## Credits

Ported from the Photo → 3D web demo in
[google-ai-edge/litert-samples](https://github.com/google-ai-edge/litert-samples/tree/main/samples/web_demos)
(Apache-2.0). Model weights: `litert-community/MoGe-2-LiteRT` (MIT), converted
from [MoGe-2](https://github.com/microsoft/MoGe). See `LICENSE` in this folder.

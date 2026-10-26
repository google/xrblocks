# Super-resolution

This demo captures the current live device camera or desktop simulator frame, crops the selected square region locally, and upscales it 4x on-device with LiteRT.js and Real-ESRGAN general-x4v3.

Run `npm run dev` from the repository root, then open `http://127.0.0.1:8080/demos/super_resolution/` in Chrome. Use the crop-size buttons to choose a 64, 128, or 256 px source crop. The square starts centered; tap the viewfinder to move it, then press Enhance to compare the bilinear before image with the super-resolved after image.

WebGPU is recommended. The demo falls back to WASM when WebGPU is unavailable or fails the startup self-check, but the CPU path can take several seconds per tile. Phone AR uses WebXR raw camera access when ARCore owns the camera, and headset behavior is untested.

## Credits

- Real-ESRGAN by Xintao Wang et al. is BSD-3-Clause, https://github.com/xinntao/Real-ESRGAN.
- LiteRT conversion by litert-community, https://huggingface.co/litert-community/real-esrgan-x4v3-litert.
- LiteRT.js is Apache-2.0, https://github.com/google-ai-edge/LiteRT.

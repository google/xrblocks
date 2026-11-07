# Visual search

Type what you are looking for, such as "cup" or "my keys", or tap a suggestion, and the demo finds it in the camera view. [CLIP](https://github.com/openai/CLIP) compares your words with overlapping crops of the frame in a module worker, so camera frames never leave the browser. The best region is outlined on a floating card, and a labeled ring is pinned on the object in the room, using the depth mesh when depth sensing is available. There is no cloud service and no API key, and searching keeps working with the network off once the model is loaded.

It differs from the SDK's object detection, which labels a fixed set of classes with MediaPipe or asks Gemini in the cloud: here the query is free text, and everything runs on this device.

## Run

Build the SDK with `npm run build:sdk`, start `npm run serve`, and open `http://127.0.0.1:8080/demos/visual_search/` in Chrome. The camera needs a secure context (HTTPS or localhost).

Press **Download search model (~183 MB)** on the 2D panel. Nothing downloads automatically. The page checks storage quota, asks the browser to persist the cache, shows progress, and verifies the size and SHA-256 digest of every file before saving it to the Cache API. Later visits offer **Load cached search model**, which only reads the cache; if files were evicted, it asks for another explicit Download. On desktop, XR Blocks starts the simulator behind the panel, so press **Continue in simulator**, or enter XR on a headset.

On the card, type a query and press Enter or **Search**, or tap one of the suggestions. All suggestions except "keys" are in the simulator's living room. The card shows the frame that was searched with the match outlined, the status says **Found**, **Maybe** or **No clear …**, and the metrics line shows the number of crops, the best score and the time taken. **Live view** returns the viewfinder to the live camera.

With `?debug=1`, `window.visualSearch.search(query)` runs a search and resolves with the match. It is a test hook only.

## How it works

1. `VisualSearchDemo.js` waits for a fresh camera frame, captures it as `ImageData`, and records the camera pose and a copy of the depth mesh at the same moment.
2. `search.js` covers the frame with square crops of 40% of the shorter side that overlap by half (25 crops for a 512 x 512 simulator frame, 32 for 1280 x 720). Squares match CLIP's input, so nothing is stretched.
3. `SearchRuntime.js` runs in `searchWorker.js`. It embeds all crops in one batch with the CLIP vision model, and embeds the query with the text model as the mean of five captions ("a photo of a cup.", "a cup in a room." and so on), the prompt ensembling trick from the CLIP paper. Query embeddings are cached, so repeating a query costs no text model call.
4. Each crop is also compared with eight fixed background captions ("a wall", "a floor", "furniture" and others) embedded once at load. Per crop, a softmax at CLIP's logit scale gives the probability that the query beats the background. That probability, not the raw score, decides where the object is, which stops plain crops that score high for any text from winning.
5. `locate()` takes the most query-like crop and refines it with its direct neighbors that score nearly as well: their weighted center is the marker point, and the region they share is the outline. Strong crops elsewhere are treated as a second instance and ignored, so the marker never lands between two objects.
6. Confidence comes from the best raw cosine similarity: 0.265 or more is **Found**, 0.255 or more is **Maybe**, and anything lower is **No clear …** with no marker.
7. The marker is placed by raycasting the match center through the captured camera pose onto the captured depth mesh, with the same helpers and depth geometry as the SDK's `ObjectDetector`. Without a usable depth hit it sits on the camera ray 1.5 m away.

## Model and runtime

| Pin          | Value                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model        | [`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/d15189d7028b43f1d3e65039190477f6af591c2a) at revision `d15189d7028b43f1d3e65039190477f6af591c2a`, `q8` text and vision |
| Runtime      | `@huggingface/transformers@4.3.0`, standalone `dist/transformers.min.js` imported by URL in the worker (workers do not get import maps)                                                                          |
| ONNX Runtime | `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`, `ort-wasm-simd-threaded.asyncify` WASM backend, one thread                                                                                                      |

| Cached asset                                                                   |           Bytes |
| ------------------------------------------------------------------------------ | --------------: |
| `onnx/vision_model_quantized.onnx`                                             |      89,117,001 |
| `onnx/text_model_quantized.onnx`                                               |      64,504,507 |
| ORT `ort-wasm-simd-threaded.asyncify.wasm`                                     |      26,861,777 |
| `tokenizer.json`                                                               |       2,224,119 |
| `config.json`, `preprocessor_config.json`, `tokenizer_config.json`, ORT `.mjs` |          58,876 |
| Total                                                                          | **182,766,280** |

The worker builds `CLIPTokenizer` and `CLIPImageProcessor` from the cached JSON and loads `CLIPTextModelWithProjection` and `CLIPVisionModelWithProjection` directly, because Transformers.js 4.3.0's `Auto*` loaders also request files from the `main` branch. During loading, `env.fetch` refuses every network request, so a cached load either reads the pinned files or fails.

CLIP ViT-B/32 was chosen because its 32 px patches make it about four times cheaper per crop than patch-16 models, and many crops are needed per search. [SigLIP base patch16](https://huggingface.co/Xenova/siglip-base-patch16-224) (Apache-2.0) would be a drop-in alternative at about 238 MB and roughly four times the compute. Apple's MobileCLIP is smaller and faster but its weights are under a research-only license.

## Accuracy

Thresholds and crop sizes were calibrated in Node with the same `SearchRuntime`, crops and `locate()` the page uses, on 81 query and image pairs: 9 photos from the [Transformers.js docs dataset](https://huggingface.co/datasets/Xenova/transformers.js-docs) (cats, a city street, a football match, a corgi, an airport, a tiger, a savanna and a house) plus the simulator's living room frame, each with 1 to 7 objects that are present and 7 that are not (laptop, keys, potted plant, guitar, dog, toothbrush, umbrella).

- All 19 present objects were reported: 16 as **Found** and 3 (television, painting and cup in the simulator) as **Maybe**.
- Of 62 absent objects, 2 were reported as **Found** and 3 as **Maybe**, all at scores below 0.27. The rest were **No clear …**.
- Where the location was labeled, 8 of 9 outlines contained the object. The ninth outlined the other of two cats.
- In the simulator, the depth raycast pinned the cup marker at table height (0.81 m) next to the cup, the lamp marker on the lowest pendant lamp (2.68 m) and the television marker on the wall 3.25 m away.

Smaller crops (30% of the frame) found the cup more confidently but misplaced the lamp, and a single grid with less overlap missed the television entirely, because it sat between crop centers.

CLIP gives coarse locations: the outline is a region of the frame, not a tight box. Objects smaller than about a tenth of the frame width, like a cup across the room, score near the threshold, so move closer when the result is **Maybe**.

## Measured results

These were measured in headless Chromium 153 on a 2 vCPU Linux cloud machine with no GPU, served over localhost. Treat them as a slow lower bound; desktop CPUs are typically two to three times faster per thread.

- The explicit download and load took 16-22 s from the click. Loading with warmup took 6.6-9.8 s, including embedding the background captions.
- With no 3D scene running, embedding the crops took 5.9-6.5 s for 25 crops (512 x 512), 5.7-6.5 s for 24 crops (640 x 480) and 7.8-8.3 s for 32 crops (1280 x 720), about 240 ms per crop. The text model took 0.1-0.3 s for a new query and nothing for a repeated one.
- With the simulator rendering through SwiftShader on the same two CPU cores, a search took about 75 s, because software rendering and the worker competed for the CPU. This does not happen on machines that render on a GPU.

## Device note

Inference is single-threaded WASM, like the other on-device demos, because the dev server does not send the cross-origin isolation headers that multithreaded WASM needs. A WebGPU path with fp16 weights would be much faster on a GPU but would add a separate ~200 MB download, so it is left as a follow-up. Phones and standalone headsets have not been measured. The page, three.js and the Transformers.js script come from the network or the HTTP cache; only the model and ONNX Runtime files are pinned in the Cache API.

## Credits

- [CLIP](https://github.com/openai/CLIP) by OpenAI (Radford et al., 2021), MIT license. The [ONNX conversion](https://huggingface.co/Xenova/clip-vit-base-patch32) is by Xenova.
- [Transformers.js](https://github.com/huggingface/transformers.js) is Apache-2.0, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) is MIT.
- The explicit download, Cache API, worker lifecycle and preload panel patterns follow the [offline captions](../offline_captions/) demo and the on-device Gemma demos in [#634](https://github.com/google/xrblocks/pull/634) and [#642](https://github.com/google/xrblocks/pull/642). The model store is a copy of the captions one, so the two demos stay independent.
- Created for [#629](https://github.com/google/xrblocks/issues/629), the call for on-device machine learning demos.

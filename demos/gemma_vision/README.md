# What am I looking at?

Capture a camera image and ask an on-device vision model to describe it or read its text. Pick **Gemma 4 E2B** for the best quality, including translation to English, or **Lite** (SmolVLM2 500M, about a tenth of the download) for phones and headsets with less memory. The model runs on-device in a WebGPU worker. It receives actual image pixels, not simulator scene metadata, and has no cloud fallback.

## Run

Build the SDK with `npm run build:sdk`, start `npm run serve`, and open `http://127.0.0.1:8080/demos/gemma_vision/` in desktop Chrome with hardware acceleration enabled. WebGPU, `shader-f16`, and a secure context (HTTPS or localhost) are required.

Choose a model on the 2D page or the spatial card, then press its Download button, **Download Gemma 4 (~3.4 GB)** or **Download Lite (~360 MB)**, before entering XR or continuing to the spatial controls. The choice is saved in the browser. Gemma 4 is the default on desktops; Lite is the default on phones, headsets, and devices that report less than 8 GB of memory. On desktop, XR Blocks starts the simulator behind this panel; press **Continue in simulator** when ready. Nothing downloads the model automatically. The page checks storage, requests persistence when available, and reports progress. Each model has its own cache entries, and later visits offer **Load cached Gemma 4** or **Load cached Lite** when all of that model's files are present. Browser persistence can be denied, and cached files can be evicted; a missing model asset requires another explicit Download action.

In the spatial card, press **Capture**, then choose a preset or type a question and press **Ask**. The live viewfinder and frozen thumbnail are separate: questions refer to the thumbnail, not the changing live view. Follow-ups use the same image and completed conversation. **Capture** replaces the image and clears the conversation; **Clear conversation** retains the image and loaded model.

Switching models unloads the current model in the same worker before loading the other one, so only one model is in memory and switching between cached models also works offline. The captured image is kept; the conversation starts fresh.

**Stop** interrupts generation cooperatively. A GPU operation already in progress may need to finish first. An unresponsive worker is terminated after five seconds, requiring an explicit model reload and another capture.

## Models and runtime

### Gemma 4 E2B

The model is [`onnx-community/gemma-4-E2B-it-ONNX`](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/9f4bef82ea6e296bc69f8a2f5939f73af81b07a6), pinned to revision `9f4bef82ea6e296bc69f8a2f5939f73af81b07a6`, with `q4f16` weights. Transformers.js is pinned to `4.3.0`; the worker imports its standalone ESM bundle directly because workers do not inherit page importmaps.

| Required assets                                              |             Bytes |
| ------------------------------------------------------------ | ----------------: |
| Token embeddings                                             |     1,590,695,413 |
| Decoder                                                      |     1,520,374,223 |
| Audio encoder                                                |       171,518,558 |
| Vision encoder                                               |        99,378,564 |
| Used processor, tokenizer, template, and configuration files |        19,481,851 |
| Total model assets                                           | **3,401,448,609** |

The public conditional-generation loader downloads all four sessions, including audio, even though this demo never supplies audio. There is no supported audio-only exclusion option in this runtime version. Runtime downloads, working memory, GPU allocations, and transient loading buffers are additional to the model's disk size. A successful cache check does not prove sufficient RAM.

### Lite

The Lite model is [`HuggingFaceTB/SmolVLM2-500M-Video-Instruct`](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct/tree/7b375e1b73b11138ff12fe22c8f2822d8fe03467), pinned to revision `7b375e1b73b11138ff12fe22c8f2822d8fe03467`, with `q4f16` weights loaded through `Idefics3ForConditionalGeneration`.

| Required assets                                              |           Bytes |
| ------------------------------------------------------------ | --------------: |
| Decoder                                                      |     205,328,508 |
| Token embeddings                                             |      94,618,005 |
| Vision encoder                                               |      57,691,749 |
| Used processor, tokenizer, template, and configuration files |       3,581,881 |
| Total model assets                                           | **361,220,143** |

The worker builds `GPT2Tokenizer`, `Idefics3ImageProcessor`, and `Idefics3Processor` from the pinned files. Lite sees the capture as a single 512 px view (64 image tokens). A 320-token budget splits it into up to four 512 px tiles plus the overview; that reads small text more exactly but roughly doubles the time to first text and was weaker at describing whole scenes. The translation preset is offered only with Gemma 4, because Lite repeated the original text instead of translating it.

SmolVLM 500M (the original release) and SmolVLM 256M were also tried. On the same simulator captures, the 500M model hallucinated and looped on the read and describe presets, and the 256M model produced unusable output.

### Processor and generation

The worker constructs the processor from pinned metadata using public `GemmaTokenizer`, `Gemma4ImageProcessor`, and `Gemma4Processor` constructors. This avoids a Transformers.js 4.3.0 automatic-tokenizer discovery path that queries `main` despite a requested revision. Model fetches are restricted to the pinned manifest, and cache-only loading disallows network fallback.

Frames are captured through `xb.core.deviceCamera.captureSnapshot({outputFormat: 'imageData', width, height})`, preserving aspect ratio and limiting the longest side to 768 pixels. The worker uses the public processor constructor's **140-soft-token budget**; actual image token counts depend on aspect ratio. Simply reducing capture dimensions would not lower the default processor's patch budget.

Generation is greedy for both models, with Gemma thinking disabled, a 128-token output cap, and a 4,096-token input-plus-output limit. Questions are limited to 2,000 characters. A capped answer is marked as truncated; long documents and tiny or blurry text may not be read completely or correctly. These are model-generated descriptions and translations, not safety-critical guidance.

## Performance

Inference runs off the main thread, but rendering and inference still share the GPU. The transcript is one retained text node, with streamed display updates limited to 10 Hz. Markdown is projected to inert display text using pinned `marked`, not rendered as HTML or active links.

The runtime was exercised in a persistent Chrome 154 profile on a 16 GB Apple Silicon Mac using real SDK simulator captures. An original rendered French sign was transcribed exactly as `BONJOUR / LE CHAT EST ROUGE`, translated correctly, and its red square and blue circle identified. A follow-up with the network blocked returned the correct left-hand shape with zero network requests.

With the same 512x512 sign capture and question, three warm runs per budget produced the following results before attaching the full spatial card:

| Image budget      | First visible text | Decode rate            | Maximum frame interval |
| ----------------- | ------------------ | ---------------------- | ---------------------- |
| 280               | 2.19-3.06 s        | 9.3-14.9 tokens/s      | 182-269 ms             |
| **140 (default)** | **0.82-0.85 s**    | **28.0-28.6 tokens/s** | **18.9-19.6 ms**       |
| 70                | 0.48-0.49 s        | 28.5-29.6 tokens/s     | 18.6-20.0 ms           |

All three budgets read that sign correctly. The 140-token default preserves more image detail than 70 while avoiding the larger budget's measured stalls. These few scenes do not establish accuracy on arbitrary photographs or documents.

With the final spatial card attached, three warm runs of the **Read the text** preset returned the exact sign in 0.79-1.36 seconds to first text, at 21.7-25.8 tokens/s. Frame p95 was 18.8-19.2 ms and frame maximum 19.8-24.5 ms. The transcript node and card structure stayed identical throughout generation, and intermediate text writes were at least 100 ms apart. The final card also passed translation and an offline typed follow-up submitted through its real text input. Results depend on the image, prompt, compilation state, and other GPU activity.

On the same Mac and card, Lite read a sign placed in the simulator room as `"Bonjour Le Chat Est Rouge"`, described the room and poster, and answered in 0.46-0.60 seconds to first text at 31-46 tokens/s. Frame p95 and maximum both stayed at 17.8 ms or below during Lite generation. Its 361 MB download took 9 seconds on a fast connection, and a cache-only load took 2-5 seconds. Lite sometimes repeats a phrase and is less reliable on follow-up questions; in one run it gave the wrong color for a shape. Switching Gemma 4 to Lite and back with the network disabled loaded both models with zero network requests.

## Device notes

Desktop simulator captures come from its virtual environment. The existing SDK snapshot API also supports ordinary device video and phone WebXR raw camera access. Pick Gemma 4 on desktops with 16 GB or more and for translation. Pick Lite on phones, Android XR headsets such as Galaxy XR, and devices with less than 8 GB of memory; its download is about a tenth the size, and the loaded model is far smaller too. Neither model has been qualified on phones or headsets yet. Quest camera input is not a supported target.

The first answer can take longer while GPU shaders compile, including after a cached reload. On the test Mac, a cache-only load took 8.5 seconds without model network requests; the first answer then took 8.1 seconds to first text, with a 319 ms maximum frame interval.

## Privacy and storage

Images, questions, and answers remain on this device and are not persisted by the demo. The application, runtime, and initial model download require network requests to their hosting services. Once the model is loaded, further questions can run offline. **A fresh offline page reload is not guaranteed** because the application and CDN module graph are not installed as an offline app. Only model/runtime assets are cached, not conversations or camera captures.

Private/incognito browser storage may be too small for this model. Use a regular or dedicated persistent profile; off-the-record browser automation can fail to cache multi-GB files even when inference itself succeeds.

## Credits

- [Gemma 4](https://ai.google.dev/gemma/docs/gemma_4_license) by Google is Apache-2.0.
- The [ONNX conversion](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) by onnx-community is Apache-2.0.
- [SmolVLM2](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct) by Hugging Face, including its ONNX weights, is Apache-2.0.
- [Transformers.js](https://github.com/huggingface/transformers.js) is Apache-2.0; [ONNX Runtime](https://github.com/microsoft/onnxruntime) is MIT.
- Markdown tokenization uses MIT-licensed [`marked@14.1.4`](https://github.com/markedjs/marked).
- Camera capture follows the XR Blocks super-resolution demo. The preload, worker lifecycle, and text-only markdown approach build on the Apache-2.0 Gemma on-device demo in [#634](https://github.com/google/xrblocks/pull/634), without importing its unmerged files.
- Created for [#629](https://github.com/google/xrblocks/issues/629), the call for on-device machine learning demos.

# What am I looking at?

Capture a camera image and ask an on-device vision model to describe it or read its text. On desktops, pick **Gemma 4 E2B** for the best quality, including translation to English, or **Lite** (SmolVLM2 500M, about a tenth of the download). Phones and headsets get Lite only. The model runs on-device in a WebGPU worker. It receives actual image pixels, not simulator scene metadata, and has no cloud fallback.

## Run

Build the SDK with `npm run build:sdk`, start `npm run serve`, and open `http://127.0.0.1:8080/demos/gemma_vision/` in desktop Chrome with hardware acceleration enabled. WebGPU, `shader-f16`, and a secure context (HTTPS or localhost) are required.

Choose a model on the 2D page or the spatial card, then press its Download button, **Download Gemma 4 (~3.4 GB)** or **Download Lite (~360 MB)**, before entering XR or continuing to the spatial controls. The choice is saved in the browser. Gemma 4 is the default on desktops. Phones, headsets, and devices that report less than 8 GB of memory are offered only Lite, without the model picker or the translation preset. On desktop, XR Blocks starts the simulator behind this panel; press **Continue in simulator** when ready. Nothing downloads the model automatically. The page checks storage, requests persistence when available, and reports progress. Each model has its own cache entries, and later visits offer **Load cached Gemma 4** or **Load cached Lite** when all of that model's files are present. Browser persistence can be denied, and cached files can be evicted; a missing model asset requires another explicit Download action.

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

The worker builds `GPT2Tokenizer`, `Idefics3ImageProcessor`, and `Idefics3Processor` from the pinned files. Lite sees the capture as a single 512 px view (64 image tokens). A 320-token budget splits it into up to four 512 px tiles plus the overview. On photos it did not read more text, it misread signs that the single view got right, and it took about 3.5 times as long to first text, so Lite keeps the single view. The translation preset is offered only with Gemma 4, because Lite repeated the original text instead of translating it.

SmolVLM 500M (the original release) and SmolVLM 256M were also tried. On the same simulator captures, the 500M model hallucinated and looped on the read and describe presets, and the 256M model produced unusable output.

### Processor and generation

The worker constructs the processor from pinned metadata using public `GemmaTokenizer`, `Gemma4ImageProcessor`, and `Gemma4Processor` constructors. This avoids a Transformers.js 4.3.0 automatic-tokenizer discovery path that queries `main` despite a requested revision. Model fetches are restricted to the pinned manifest, and cache-only loading disallows network fallback.

Frames are captured through `xb.core.deviceCamera.captureSnapshot({outputFormat: 'imageData', width, height})`, preserving aspect ratio and limiting the longest side to 768 pixels. The worker uses the public processor constructor's **140-soft-token budget**; actual image token counts depend on aspect ratio. Simply reducing capture dimensions would not lower the default processor's patch budget.

Generation is greedy for both models, with Gemma thinking disabled and a 4,096-token input-plus-output limit. Gemma 4 has a 128-token output cap. Lite has a 64-token cap, asks the presets as short questions (`What text is written in this image?` and `What is in this image? Answer in one sentence.`), and stops an answer once its end starts repeating an earlier span, keeping the first copy. Questions are limited to 2,000 characters. A capped answer is marked as truncated; long documents and tiny or blurry text may not be read completely or correctly. These are model-generated descriptions and translations, not safety-critical guidance.

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

### Lite reading

On a Galaxy Z Fold8 (Android Chrome), Lite took about 6.3 seconds to first text and decoded at about 4.7 tokens/s. With the original long preset prompts, **Read the text** on a red book cover printed `PLATFORM 9 3/4` and `TRAVEL JOURNAL` invented a title and repeated it until the 128-token cap, about half a minute of output.

Transformers.js 4.3.0 accepts `repetition_penalty` and `no_repeat_ngram_size` for this model. Both were compared on the same images: a 1.1 penalty sometimes made loops longer and added invented words, and 3- or 4-gram blocking broke words apart without ending the answer. Short questions worked best, and every answer under them stopped on its own except one, which the repeat stop caught.

On the test Mac, the real demo read photos placed in the simulator room before and after the change:

| Photo                       | Read before                                           | Read after                                                             |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Book capture from the phone | `9.3.4.1.1.2.3.4.5.6...`, 128 tokens                  | `"9 3 4"`, 14 tokens                                                   |
| Rendered angled book        | invented a "Golden Ratio" label, 128 tokens           | `Platform 9 3/4` and `TRAVEL JOURNAL`, 26 tokens                       |
| Rendered tea box            | `ORGANIC GREEN TEA`, then kept describing, 128 tokens | misread `ORGANIC GREEN CAVE CAVE`, cut by the repeat stop at 26 tokens |
| Rendered door sign          | `PLEASE KEEP THIS DOOR CLOSED`, 15 tokens             | the same plus a repeated `THIS DOOR CLOSED`, 29 tokens                 |

Describe answers fell from 91-128 tokens to 12-63. Time to first text stayed at 0.29-0.44 seconds and decode at 58-72 tokens/s, with frame p95 at 18.7 ms or below. Lite still reads only the large numbers on the phone's book capture, not its smaller words; pick Gemma 4 for small text in real photos.

## Device notes

Desktop simulator captures come from its virtual environment. The existing SDK snapshot API also supports ordinary device video and phone WebXR raw camera access. Pick Gemma 4 on desktops with 16 GB or more and for translation. Phones, headsets such as Galaxy XR and Meta Quest, and devices that report less than 8 GB of memory get only Lite: its download is about a tenth the size, and the loaded model is far smaller too. The same user-agent and memory check also picks the smaller GPU batches described below. Lite has been tried on a Galaxy Z Fold8 (Android Chrome) and a Meta Quest 3.

On Meta Quest, allow Browser to use the headset cameras in the headset's app permission settings (Privacy & safety > App permissions). The site's own camera prompt is not enough. Without that permission, Quest Browser lists only the front-facing avatar camera, which fails in XR with `NotReadableError: Could not start video source`. With it, the demo uses the passthrough camera labelled `camera 2, facing back` at 1280x720.

Gemma 4 needs far more memory than its download. In desktop Chrome on the test Mac, loading it raised the page's process to 5.3-8.2 GB at its peak and left the GPU process holding 5.4 GB; Lite peaked at 1.3-1.7 GB and added 0.3-0.45 GB to the GPU process. On a Galaxy XR, the tab crashed while Gemma 4 was loading. On a Meta Quest 3 (Quest Browser 152), the browser closed the tab at 94-97% of loading, both in XR and on the 2D page. Loading its four weight files one at a time did not lower these peaks, so the demo does not offer Gemma 4 on those devices. The text-only Gemma 4 E2B in the on-device Gemma demo fits because its LiteRT-LM web build keeps far less in memory; that build does not take images yet.

On phones, headsets, and devices that report less than 8 GB of memory, the worker splits model GPU work into short batches with the timeslicing helper from the on-device Gemma demo, so page and XR frames keep getting GPU time during inference. Without it, the runtime queued up to 143-185 ms of GPU work at once on the test Mac; with the helper's defaults, no submission waited longer than 18-42 ms. Batching costs decode speed (on the Mac, Lite dropped from 59 to 42 tokens/s and Gemma 4 from 30 to 18), so desktops skip it. Phone and headset GPUs run the same work many times slower, so the demo uses smaller batches than the defaults: 8 dispatches per command buffer, a GPU sync every 16 dispatches, and a 4 ms work budget. In one Mac comparison with a headset user agent, the smaller batches decoded Lite at 19 tokens/s against 28.6 with the defaults, with identical answers.

Before batching, Lite stalled XR rendering on a Galaxy XR. On a Meta Quest 3 at 90 Hz, with the default batches, Lite answered in 5-7 seconds (2.9-4.1 seconds to first text, 4.2-5.4 tokens/s), but the first seconds of each answer had 9-13 frames over 50 ms and a worst frame of 90-100 ms. With the smaller batches, answers took 6.5-7.5 seconds, with at most one frame over 50 ms per answer and a worst frame of 53-58 ms. Lite loaded from cache in 7-9 seconds. Loading it inside XR caused single 0.5-0.7 second pauses while its weights were copied to the GPU, so load it on the 2D page before entering XR. The batched worker has not been retried on a Galaxy XR.

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

# Gemma 4 on-device assistant

Gemma 4 E2B runs fully on this device. Ask anything; presets use the scene. Type general questions into the spatial chat card, or move and select a cube, sphere, or cylinder to ask about them. The public scene-context API supplies optional object names, shapes, and rounded coordinates as text. The model does not see camera images or execute actions.

## Run

Build the SDK with `npm run build:sdk`, serve the repository on an available localhost port, and open `/demos/gemma_on_device/`. HTTPS or localhost and WebGPU are required. Allow approximately 4 GB of available RAM and space for the 2 GB model download plus runtime assets.

Choose **Download Gemma 4** to fetch the model from Hugging Face. The model never downloads automatically. Progress and cancellation are available during the download; initialization cannot be canceled.

On an XR-capable browser, load the model from the ordinary page before choosing **ENTER XR**. Wait for **Model ready**; entry reuses the loaded engine. Desktop simulator users can load from the spatial card.

Tested in desktop Chrome, on an Android phone, and on Quest 3. Rendering and inference share the GPU, so there can be brief pauses while the model loads or starts a reply, especially on standalone headsets. Hand tracking is optional.

Complete weights are stored in the Cache API. Use a persistent browser profile so later visits offer **Load cached Gemma 4**. The cache belongs to the page's origin, including its port, and the browser can evict it or reject storage with `QuotaExceededError`. Incomplete downloads are discarded and restart from the beginning. Browser site-data settings can remove the stored model.

## Interaction

Type a general question, use a scene preset, or open the optional panel keyboard. General questions are answered normally; presets ask about the selected object or compare the scene. Select or move objects with the normal XR Blocks interaction controls. Native and panel keyboards can conflict on some headsets, so the panel keyboard starts closed.

Every **Send** attaches fresh optional metadata for the three demo objects: names, shapes, rounded coordinates, and the selected object inline. Internal IDs are omitted. Gemma uses this context when relevant, without keyword routing. The context summary appears after metadata is sent. Camera images, microphone audio, and viewer position are not included.

Chat uses greedy sampling, with one generation at a time, 2,000 characters per prompt, and 256 output tokens per reply. **New chat** clears the conversation while keeping the model loaded; it is also required near the context limit. **Stop** preserves the partial response and resets the model conversation before the next prompt. Chat history is not saved across reloads.

Replies use a token-based Markdown projection in the existing transcript text element: uppercase headings, indented bullets and numbered lists, labeled code blocks, and link labels. Inline emphasis keeps its original case without the markers; code keeps its literal contents. The string-only UI does not provide rich inline fonts or clickable links. Incomplete streaming syntax is handled without displaying its delimiters, and no HTML is rendered.

Replies stream into the spatial card. **Time to first text** measures the delay until the first nonempty text arrives; it is not a tokenizer measurement. **Decode tokens/sec** comes from the runtime's benchmark data, not a count of streamed chunks. Missing metrics are shown as unavailable.

## Local inference and network access

Inference runs on-device through `@litert-lm/core@0.17.1` in a dedicated WebGPU worker. The worker owns the engine and conversation; the main thread owns the scene and UI. Prompts and metadata are not sent to an AI service. There is no cloud inference, speech recognition, telemetry, or API key, and worker failure does not trigger main-thread inference.

Initial setup fetches browser modules and weights from public CDNs and Hugging Face. Once the page, runtime, and model are loaded, inference works without network access. Offline page reload is not supported: only the model is explicitly cached, not the SDK, fonts, simulator assets, JavaScript, or WASM.

## Observed desktop behavior

In Chrome 154 on an Apple M4 with 16 GB RAM, a 14-turn check correctly described each object three times, a moved cube twice, and answered three general questions. The network-blocked follow-up made zero requests.

Retaining one transcript text element removed repeated whole-card UIKit rebuilds. Updates run at most 10 times per second. The following comparison used the same default GPU settings on a shared host:

| Reply  | Before: maximum frame interval | After: maximum frame interval | After: time to first text | After: decode tokens/sec |
| ------ | ------------------------------ | ----------------------------- | ------------------------- | ------------------------ |
| Cold   | 2,617.5 ms                     | 116.7 ms                      | 10.676 s                  | 8.24                     |
| Warm 1 | 683.3 ms                       | 49.1 ms                       | 1.949 s                   | 14.90                    |
| Warm 2 | 483.1 ms                       | 33.3 ms                       | 1.065 s                   | 18.79                    |
| Warm 3 | 583.3 ms                       | 33.6 ms                       | 1.474 s                   | 17.80                    |

The later run included warm frame intervals up to 433 ms and an initialization interval of 933 ms. GPU batch-size and weight-upload experiments did not improve the results, so defaults remain.

A completed-reply Markdown block prototype reintroduced 249–299 ms frame intervals; the stable formatted-text comparison stayed around 18 ms. Pointer-driven presets, Send, and New chat produced no structural rebuilds or long tasks in an inference-isolated check. One initial keyboard opening spent 615 ms in rendering rather than UI reconciliation. The demo now omits the keyboard's decorative shadow, removing one shader program.

## Model and dependencies

The text-only [`gemma-4-E2B-it-web.litertlm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1) conversion is pinned to revision `b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1`. Gemma 4 and the conversion are Apache-2.0. Credit goes to Google for Gemma and LiteRT-LM, and the `litert-community` contributors for the conversion. Weights are not included in this repository.

Workers do not inherit document import maps. The dedicated classic worker dynamically imports `https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle`, pinning both the runtime and its bundled dependency. A classic worker is required because the runtime's helper uses `importScripts`; its `Module.locateFile` resolves the matching core `0.17.1` WASM binary on jsDelivr. Both packages are Apache-2.0. The document import map pins SDK/UI and Markdown dependencies, including its single `three@0.186.0` peer.

Markdown tokenization uses MIT-licensed `marked@14.1.4`, pinned in the browser import map and the test dependency.

Gemma can produce incorrect descriptions or spatial reasoning. Treat replies as suggestions about synthetic scene metadata, not reliable perception or instructions for safety-critical activities.

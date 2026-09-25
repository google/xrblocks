# Gemma 4 on-device scene assistant

A spatial assistant that uses Gemma 4 E2B to discuss three selectable objects in an XR Blocks scene. Move a cube, sphere, or cylinder, select it, and ask a question. The public scene-context API supplies names, positions, and bounds as text. The model does not see camera images or execute actions.

## Run

Build the SDK with `npm run build:sdk`, serve the repository on an available localhost port, and open `/demos/gemma_on_device/` in desktop Chrome with WebGPU. HTTPS or localhost is required. The desktop simulator is the primary target; headset performance, keyboard behavior, and compatibility are untested.

Select **Download Gemma 4 (~2 GB)** to fetch the model from Hugging Face. Nothing downloads automatically beyond the page and its normal XR dependencies. Keep approximately 4 GB of RAM available and at least 2.01 GB of browser storage free, plus room for the runtime. These are guidelines, not a guarantee that a device can run the model. GPU memory pressure can still cause initialization or generation to fail.

The download shows progress and can be canceled. A complete model is stored in the browser's Cache API. Use a persistent Chrome profile to retain this ~2 GB cache between visits; later visits offer **Load cached Gemma 4** without downloading the weights again. Browser storage is origin-specific and can be evicted; changing the localhost port also changes the origin. A canceled download restarts from the beginning. Use browser site-data settings to remove the cached model.

Storage estimates are advisory. A browser can still reject this large cache entry with `QuotaExceededError`, even when its estimate reports enough space. If this happens in a private or isolated automation context, try a regular Chrome window with a persistent profile. The demo reports the failure and does not mark an incomplete download as ready. There is no uncached or alternative-storage fallback.

## Interaction

Select or move an object with the normal XR Blocks interaction controls. Type into the spatial prompt field, use a preset, or open the optional panel keyboard. Native and panel keyboards can conflict on some headsets, so the panel keyboard starts closed. **Send** supplies the latest metadata for only the three demo objects, with the selected object identified. No screenshot, microphone audio, or other scene content is included.

Chat supports one generation at a time, up to 2,000 characters per user prompt and 256 output tokens per reply. **New chat** clears the conversation while keeping the model loaded. Near the model's context limit, the demo asks you to start a new chat rather than silently removing earlier messages. **Stop** preserves the partial response but resets the model conversation before the next prompt. Chat history is not saved across reloads.

Replies stream into the spatial card. **Time to first text** measures the delay until the first nonempty text arrives; it is not a tokenizer measurement. **Decode tokens/sec** comes from the runtime's benchmark data, not a count of streamed chunks. Missing metrics are shown as unavailable.

## Local inference and network access

Inference runs on-device through the WebGPU backend of `@litert-lm/core@0.17.1` in a dedicated worker. The worker opens the cached model stream and owns the engine and conversation; the main thread owns the scene, download consent/progress, and spatial UI. Prompts and scene metadata are not sent to an AI service. The demo does not use native vision, speech recognition, generated actions, cloud AI, telemetry, or an API key.

The first visit downloads browser modules and the model from public CDNs and Hugging Face. Only the model is explicitly cached by this demo. Once the page, runtime, and model have loaded, inference can continue without network access. **Offline page reload is not supported by this version**: the browser may need to fetch the SDK, fonts, simulator assets, runtime JavaScript, or WASM again. There is no service worker.

The renderer uses the normal XR Blocks configuration and simulator environment. Inference never falls back to the main thread: worker unavailability or initialization failures are shown explicitly. Display updates are batched to avoid rebuilding the text on every chunk. Moving runtime work off the UI thread does not isolate GPU resources: rendering and inference still share the device, so worker support alone does not establish responsiveness or throughput. Desktop results do not establish headset performance.

## Observed desktop behavior

Real scene prompts and a follow-up with browser networking disabled worked in persistent Chrome 154 on an Apple M4 with 16 GB RAM. The network-blocked reply made no network requests. With the default simulator room and physics, the first reply took 24.2 seconds to first text at 10.4 decode tokens/sec; a warm reply took 1.9 seconds at 11.5 tokens/sec.

The test machine was heavily contended (load averages around 35-40), so these are observations, not a performance guarantee or a controlled comparison against main-thread inference. Frame intervals had a p95 of about 19 ms, but maximum pauses were 2.35 seconds for the cold reply and 0.55 seconds for the warm reply. Main-thread long tasks remained observable with the worker. The demo is not hitch-free, and the contribution from shared GPU/driver work versus host contention has not been isolated.

## Model and dependencies

The demo uses the text-only [`gemma-4-E2B-it-web.litertlm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1) conversion, pinned to revision `b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1`. Its file size is 2,008,432,640 bytes. Gemma 4 and this conversion are published under **Apache-2.0**. Credit goes to Google for Gemma and LiteRT-LM, and the `litert-community` contributors for the converted model. Model weights are downloaded at runtime and are not included in this repository.

Workers do not inherit document import maps. The dedicated classic worker dynamically imports `https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle`, pinning both the runtime and its bundled dependency. A classic worker is required because the runtime's helper uses `importScripts`; its `Module.locateFile` resolves the matching core `0.17.1` WASM binary on jsDelivr. Both packages are Apache-2.0. The document import map contains only SDK/UI dependencies, including its single `three@0.186.0` peer.

Gemma can produce incorrect descriptions or spatial reasoning. Treat replies as suggestions about synthetic scene metadata, not reliable perception or instructions for safety-critical activities.

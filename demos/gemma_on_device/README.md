# Gemma 4 on-device assistant

Gemma 4 E2B runs fully on this device. Ask anything; presets use the scene. Type general questions into the spatial chat card, or move and select a cube, sphere, or cylinder to ask about them. The public scene-context API supplies optional object names, shapes, and rounded coordinates as text. The model does not see camera images or execute actions.

## Run

Build the SDK with `npm run build:sdk`, serve the repository on an available localhost port, and open `/demos/gemma_on_device/` in desktop Chrome with WebGPU. HTTPS or localhost is required. The desktop simulator remains the primary target. Quest 3 testing of the earlier worker build found visible freezes during initialization and sending prompts; the latest transcript update still needs a Quest retest.

Select **Download Gemma 4 (~2 GB)** to fetch the model from Hugging Face. Nothing downloads automatically beyond the page and its normal XR dependencies. Keep approximately 4 GB of RAM available and at least 2.01 GB of browser storage free, plus room for the runtime. These are guidelines, not a guarantee that a device can run the model. GPU memory pressure can still cause initialization or generation to fail.

On an XR-capable browser, the ordinary HTML page offers **Download Gemma 4 (~2 GB)** or **Load cached Gemma 4** before you enter XR. Wait for **Model ready**, then choose the existing **ENTER XR** button. This reuses the same scene, worker, model cache, and load/cancel flow; entering XR does not create another engine or reload the model. Downloads can be canceled, but initialization cannot. The spatial controls remain available after entry, and desktop simulator users can load from the spatial card.

Preloading moves model initialization out of the immersive session; it does **not** promise to eliminate freezing. The desktop UI-rebuild stall described below has been fixed, but rendering and generation still share GPU resources, and standalone headsets may still pause. Quest retesting is pending, headset keyboard caveats remain, and other headsets have not been verified. Phones need WebXR, WebGPU, and approximately 4 GB of available RAM. Hand tracking is optional; physical phone XR entry, input, and inference remain unverified.

The download shows progress and can be canceled. A complete model is stored in the browser's Cache API. Use a persistent Chrome profile to retain this ~2 GB cache between visits; later visits offer **Load cached Gemma 4** without downloading the weights again. Browser storage is origin-specific and can be evicted; changing the localhost port also changes the origin. A canceled download restarts from the beginning. Use browser site-data settings to remove the cached model.

Storage estimates are advisory. A browser can still reject this large cache entry with `QuotaExceededError`, even when its estimate reports enough space. If this happens in a private or isolated automation context, try a regular Chrome window with a persistent profile. The demo reports the failure and does not mark an incomplete download as ready. There is no uncached or alternative-storage fallback.

## Interaction

Type a general question, use a scene preset, or open the optional panel keyboard. General questions are answered normally; presets ask about the selected object or compare the scene. Select or move objects with the normal XR Blocks interaction controls. Native and panel keyboards can conflict on some headsets, so the panel keyboard starts closed.

Every **Send**, whether typed or from a preset, attaches fresh optional metadata for only the three demo objects: names, shapes, and rounded coordinates, with selection marked inline alongside the selected object's name and shape. Internal object IDs are not sent to the model. There is no keyword-based routing: the model is instructed to use this context only when relevant to the question. The context summary appears after metadata is first sent. No screenshot, microphone audio, viewer position, or other scene content is included; questions needing missing information cannot be answered reliably.

Chat uses greedy sampling and supports one generation at a time, up to 2,000 characters per user prompt and 256 output tokens per reply. Greedy sampling does not guarantee correct answers. **New chat** clears the conversation while keeping the model loaded. Near the model's context limit, the demo asks you to start a new chat rather than silently removing earlier messages. **Stop** preserves the partial response but resets the model conversation before the next prompt. Chat history is not saved across reloads.

Replies stream into the spatial card. **Time to first text** measures the delay until the first nonempty text arrives; it is not a tokenizer measurement. **Decode tokens/sec** comes from the runtime's benchmark data, not a count of streamed chunks. Missing metrics are shown as unavailable.

## Local inference and network access

Inference runs on-device through the WebGPU backend of `@litert-lm/core@0.17.1` in a dedicated worker. The worker opens the cached model stream and owns the engine and conversation; the main thread owns the scene, download consent/progress, and spatial UI. Prompts and scene metadata are not sent to an AI service. The demo does not use native vision, speech recognition, generated actions, cloud AI, telemetry, or an API key.

The first visit downloads browser modules and the model from public CDNs and Hugging Face. Only the model is explicitly cached by this demo. Once the page, runtime, and model have loaded, inference can continue without network access. **Offline page reload is not supported by this version**: the browser may need to fetch the SDK, fonts, simulator assets, runtime JavaScript, or WASM again. There is no service worker.

The renderer uses the normal XR Blocks configuration and simulator environment. Inference never falls back to the main thread: worker unavailability or initialization failures are shown explicitly. Display updates are batched to avoid rebuilding the text on every chunk. Moving runtime work off the UI thread does not isolate GPU resources: rendering and inference still share the device, so worker support alone does not establish responsiveness or throughput. Desktop results do not establish headset performance.

## Observed desktop behavior

Validation used persistent Chrome 154 on an Apple M4 with 16 GB RAM. Six general replies in mixed conversations answered the questions without mentioning scene objects despite receiving optional metadata. The final 14-turn production check correctly handled each of the three objects three times, the moved cube twice, and three general questions. The network-blocked check made zero network requests. These are observed results, not a guarantee that every answer will be correct.

Profiling isolated the earlier long warm-response pauses to the app adding transcript panels, which triggered whole-card UIKit binding reconciliation. UI reconciliation took 476–658 ms in the baseline runs; WebGL rendering took 9–11 ms, and worker-message handling took 0.4–2.5 ms. These measured stalls were app-level UI rebuilds, not evidence that worker dispatch or shared GPU work caused them.

The transcript now retains one text element and updates its contents at most 10 times per second, preserving roles, history, and scrolling without rebuilding the card tree. This removed the regular 500–700 ms UI-rebuild stall. UI reconciliation fell to 31–41 ms, with no structural binding-tree reconciliations during generation in the initial diagnostic runs. Those before/after comparisons used unchanged default GPU settings:

| Reply  | Before: maximum frame interval | After: maximum frame interval | After: time to first text | After: decode tokens/sec |
| ------ | ------------------------------ | ----------------------------- | ------------------------- | ------------------------ |
| Cold   | 2,617.5 ms                     | 116.7 ms                      | 10.676 s                  | 8.24                     |
| Warm 1 | 683.3 ms                       | 49.1 ms                       | 1.949 s                   | 14.90                    |
| Warm 2 | 483.1 ms                       | 33.3 ms                       | 1.065 s                   | 18.79                    |
| Warm 3 | 583.3 ms                       | 33.6 ms                       | 1.474 s                   | 17.80                    |

The initial updated cold reply's p95 frame interval was 17.6 ms. **The demo is not hitch-free:** the later production run still had sporadic warm frame-interval outliers of 233, 166, and 433 ms. Initialization reached a maximum frame interval of 933 ms in the latest loaded-host run, so preloading before XR remains useful. The regular UI-rebuild stall is fixed; the remaining outliers have not been fully attributed.

A shorter prompt alone did not fix the UI stall. Trials with a GPU batch size of 32 or waiting for weight uploads showed worse pauses without a clear benefit, so the demo keeps the runtime defaults. The host was not controlled, and these M4 observations are not guarantees for other workloads or devices. Quest retesting is pending, and rendering and inference still share GPU resources.

## Model and dependencies

The demo uses the text-only [`gemma-4-E2B-it-web.litertlm`](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1) conversion, pinned to revision `b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1`. Its file size is 2,008,432,640 bytes. Gemma 4 and this conversion are published under **Apache-2.0**. Credit goes to Google for Gemma and LiteRT-LM, and the `litert-community` contributors for the converted model. Model weights are downloaded at runtime and are not included in this repository.

Workers do not inherit document import maps. The dedicated classic worker dynamically imports `https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle`, pinning both the runtime and its bundled dependency. A classic worker is required because the runtime's helper uses `importScripts`; its `Module.locateFile` resolves the matching core `0.17.1` WASM binary on jsDelivr. Both packages are Apache-2.0. The document import map contains only SDK/UI dependencies, including its single `three@0.186.0` peer.

Gemma can produce incorrect descriptions or spatial reasoning. Treat replies as suggestions about synthetic scene metadata, not reliable perception or instructions for safety-critical activities.

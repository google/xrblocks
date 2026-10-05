# Offline captions

Speak into the microphone and live captions appear on a floating spatial card. Speech recognition runs on this device with [Moonshine](https://github.com/moonshine-ai/moonshine) in a module worker, so audio never leaves the browser. Each finished line can also be translated into Spanish, French, German or Mandarin (Simplified Chinese) with an [Opus-MT](https://github.com/Helsinki-NLP/Opus-MT) model in a second worker, shown under the English line on the same card. There is no cloud service and no API key, and captioning and translation keep working with the network off once the models are loaded.

This is speech-to-text and translation from the microphone, fully in the browser. It differs from the SDK's `xb.SpeechRecognizer`, which wraps the Web Speech API (Chrome sends that audio to Google servers), and from the Read Aloud and Translate Aloud demo in [#639](https://github.com/google/xrblocks/pull/639), which reads and translates camera text with Gemini or Ollama and speaks it with text-to-speech on a tethered laptop.

## Run

Build the SDK with `npm run build:sdk`, start `npm run serve`, and open `http://127.0.0.1:8080/demos/offline_captions/` in Chrome. The microphone needs a secure context (HTTPS or localhost).

Press **Download captions model (~94 MB)** on the 2D panel. Nothing downloads automatically. The page checks storage quota, asks the browser to persist the cache, shows progress, and verifies the size and SHA-256 digest of every file before saving it to the Cache API. Later visits offer **Load cached captions model**, which only reads the cache; if files were evicted, it asks for another explicit Download. On desktop, XR Blocks starts the simulator behind the panel, so press **Continue in simulator**, or enter XR on a headset.

On the card, press **Start listening** and speak. The current utterance shows as an interim line ending in `…`, and it is replaced by the final text after a short pause. **Stop listening** finalizes any speech in progress, and **Clear** empties the transcript. The level bar shows the microphone input, and the metrics line shows the latest first-caption latency, end-of-speech-to-text latency and real-time factor. The card lazily follows your head so the captions stay in view.

Translation is off by default. Choose a language with **Translate** on the card, or with the language menu on the 2D panel, then press **Download Spanish (~119 MB)** (or French, ~113 MB, German, ~112 MB, or Mandarin, ~119 MB). Each language is its own explicit download, verified and cached like the captions model, and later visits offer **Load cached Spanish**. Changing the language never downloads anything. Once a language is ready, each new final line shows its translation under it, marked with `→`, and the metrics line adds the latest translation time. Choosing **Translate: Off** hides the translations and frees the translation model.

## How it works

1. `microphone.js` opens `getUserMedia` with echo cancellation, noise suppression and auto gain, and an `AudioWorklet` (`captureProcessor.js`) posts transferred mono chunks at the device sample rate.
2. `audio.js` resamples to 16 kHz with a stateful box filter, and `vad.js` segments speech with an energy detector: a 300 ms noise calibration, an adaptive threshold, 300 ms of pre-roll, and 600 ms of trailing silence to end an utterance (12 s maximum).
3. `scheduler.js` serializes work on the single worker. Finished utterances queue in order. While someone is still talking, an interim transcription of the growing utterance runs every 700 ms whenever the worker is idle. Noises shorter than 300 ms are dropped.
4. `CaptionsRuntime.js` runs in `captionsWorker.js` and decodes greedily with Moonshine (`do_sample: false`, one beam, about six tokens per second of audio). The client uses request IDs, ignores stale replies, cancels downloads cooperatively, resets the worker on crashes and disposes it on exit.
5. `captions.js` renders finalized lines plus the interim line into one retained `UIText` inside one `UIScrollView`. Text writes are throttled to 10 Hz, and no panels are added per line.
6. `translation.js` queues only finalized lines for `TranslationRuntime.js`, which runs in its own `translationWorker.js` so translation never delays speech recognition. One line translates at a time and at most two wait, so a long burst of speech skips the oldest waiting lines instead of falling behind. Results from before a Clear or a language change are dropped. Decoding is greedy (one beam) with at most about twice the input length in new tokens (256 maximum), and input is truncated at 256 tokens. Switching languages frees the old model inside the same worker, so an offline switch to another cached language still works.

With `?debug=1`, `window.offlineCaptions.feedUrl(url)` plays a 16-bit PCM WAV through the same resampler, segmenter and worker as the microphone, paced in real time. It is a test hook only and is not used by the normal page.

## Model and runtime

| Pin          | Value                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model        | [`onnx-community/moonshine-base-ONNX`](https://huggingface.co/onnx-community/moonshine-base-ONNX/tree/b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad) at revision `b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad`, `q8` weights |
| Runtime      | `@huggingface/transformers@4.3.0`, standalone `dist/transformers.min.js` imported by URL in the worker (workers do not get import maps)                                                                              |
| ONNX Runtime | `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`, `ort-wasm-simd-threaded.asyncify` WASM backend, one thread                                                                                                          |

| Cached asset                                                                 |          Bytes |
| ---------------------------------------------------------------------------- | -------------: |
| `onnx/decoder_model_merged_quantized.onnx`                                   |     42,498,870 |
| ORT `ort-wasm-simd-threaded.asyncify.wasm`                                   |     26,861,777 |
| `onnx/encoder_model_quantized.onnx`                                          |     20,513,063 |
| `tokenizer.json`                                                             |      3,761,754 |
| `tokenizer_config.json`, `config.json`, `generation_config.json`, ORT `.mjs` |        189,861 |
| Total                                                                        | **93,825,325** |

The worker builds the tokenizer from the cached JSON with `PreTrainedTokenizer` and loads `MoonshineForConditionalGeneration` directly. Transformers.js 4.3.0's `pipeline()` and `AutoTokenizer` also request files from the `main` branch even when a revision is given. During loading, `env.fetch` refuses every network request, so a cached load either reads the pinned files or fails.

| Translation                      | Model                                                                                                               | Revision                                   | License (upstream Helsinki-NLP) | Cached bytes |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- | -----------: |
| English to Spanish               | [`Xenova/opus-mt-en-es`](https://huggingface.co/Xenova/opus-mt-en-es/tree/4b002a4c7edd54a7ced58877258b87f7efd3f892) | `4b002a4c7edd54a7ced58877258b87f7efd3f892` | Apache-2.0                      |  119,377,271 |
| English to French                | [`Xenova/opus-mt-en-fr`](https://huggingface.co/Xenova/opus-mt-en-fr/tree/28726206f80896b90035bd99cccd5cc1e151f916) | `28726206f80896b90035bd99cccd5cc1e151f916` | Apache-2.0                      |  113,111,733 |
| English to German                | [`Xenova/opus-mt-en-de`](https://huggingface.co/Xenova/opus-mt-en-de/tree/1ca130c44c4c5441ef16d48aae521a424ab644f7) | `1ca130c44c4c5441ef16d48aae521a424ab644f7` | CC-BY-4.0                       |  111,519,780 |
| English to Mandarin (Simplified) | [`Xenova/opus-mt-en-zh`](https://huggingface.co/Xenova/opus-mt-en-zh/tree/046f55aec303cdee3e0318604406d4df20f1e8ea) | `046f55aec303cdee3e0318604406d4df20f1e8ea` | Apache-2.0                      |  119,495,576 |

Each language caches six files with pinned sizes and SHA-256 digests: `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json`, and the `q8` `onnx/encoder_model_quantized.onnx` and `onnx/decoder_model_merged_quantized.onnx`. They run on the same Transformers.js and ONNX Runtime pins as captions, and the ONNX Runtime files are shared, so they are cached once. The worker builds `MarianTokenizer` from the cached JSON and loads `MarianMTModel` directly, with the same cache-only `env.fetch`. The pinned `generation_config.json` asks for four beams, and the worker overrides it to one.

The English to Chinese model has several targets and selects one with a target token, `>>cmn_Hans<<` for Simplified Mandarin. Transformers.js 4.3.0 encodes that tag as ordinary text when it is written into the input, so the worker prepends the token's ID to the encoded input instead, and removes any tag or stray spaces that show up in the Chinese output. Chinese text is drawn by the SDK's canvas text fallback with the device's system font, because the card's default MSDF font has no CJK glyphs, so no extra font is downloaded.

Opus-MT was chosen because each pair is small, fast on WASM, and permissively licensed. Other candidates did not fit: `nllb-200-distilled-600M` is CC-BY-NC, `m2m100_418M` is about 630 MB at `q8`, and the English to Japanese Opus-MT model was trained mostly on Bible text.

Moonshine base with WASM was chosen after a smoke test on generated speech. Moonshine tiny was about twice as fast but made visible mistakes ("Caption stay", stray capitals). WebGPU was slower for these short utterances and would share the GPU with rendering.

| Candidate (same three clips)                      | Real-time factor | Accuracy                                     |
| ------------------------------------------------- | ---------------- | -------------------------------------------- |
| **moonshine-base q8, WASM**                       | **0.12-0.17**    | All three exact apart from `7:30` formatting |
| moonshine-tiny q8, WASM                           | 0.06-0.09        | Word and casing errors                       |
| moonshine-base, WebGPU (fp32 encoder, q4 decoder) | 0.19-0.31        | Not faster                                   |

## Measured results

These were measured in a persistent Chrome 154 profile on an Apple M4 Mac mini with 16 GB, served over localhost. The test speech is three sentences generated with macOS `say` (13.6 s, with 1.2 s pauses). It went through the debug feed and also through Chrome's fake microphone (`--use-file-for-fake-audio-capture`), which exercises the real `getUserMedia` and AudioWorklet path.

- The explicit download and load took 6.3 s. A cached load took 3.2 s, including a 2.6 s model load and warmup, with zero model or ONNX Runtime network requests.
- With the network blocked after loading, all three sentences were captioned exactly (apart from punctuation) with zero network requests.
- The first interim caption appeared 0.6-0.8 s after speech started.
- End of speech to final text was 1.2-1.6 s, which includes the 600 ms pause that ends an utterance.
- The real-time factor was 0.13-0.21 (0.43-0.62 s of inference for 2.9-4.2 s utterances).
- In the simulator, frame p95 was 18.4-18.6 ms and the maximum was 18.7-18.8 ms, both idle and while captioning.

Translation was measured on the same Mac and the same sentences, later and while the machine was busy with other work, so the captions numbers in this run are slower than above. The unchanged captions-only demo measured in that same session had a real-time factor of 0.29-0.52.

- Choosing a language made zero network requests. The explicit Spanish download and load took 10 s from the click, and French from the card took about 10 s. A cached Spanish load took 5.2 s from the click (4.2 s model load plus warmup), with zero model or ONNX Runtime network requests.
- With the network blocked after loading, all three sentences were captioned and translated with zero network requests, through both the debug feed and the fake microphone. Switching from Spanish to French while listening, with the network still blocked, loaded the cached French model and translated the following lines.
- Translations were accurate, for example "Please turn left at the second traffic light." became "Por favor, gire a la izquierda en el segundo semáforo." and "Veuillez tourner à gauche au deuxième feu."
- Translating one line took 1.1-1.7 s in this run and 0.5-1.4 s in an earlier, quieter smoke test. End of speech to translated line was 3.7-5.0 s, of which 2.4-3.5 s was captioning.
- Captioning was not slowed by translation: with translation off the real-time factor was 0.54-0.69 and end of speech to text was 2.7-3.6 s, and with Spanish on it was 0.52-0.65 and 2.6-3.5 s.
- Frame p95 stayed at 18.6 ms with translation on. The maximum was 18.7-32.5 ms with the debug feed and 34-52 ms with the microphone.
- Mandarin was added later. Its explicit download and load took 9.3 s from the click, and the cached model loaded in 3.5-3.8 s. A line took 0.3-0.9 s to translate in the worker, and end of speech to translated line was 2.2-3.7 s. Every output was in Simplified characters. Ten everyday sentences came out fluent and correct, for example "Where is the nearest train station?" became "最近的火车站在哪里?" and "Turn off the lights when you leave the room." became "离开房间的时候把灯关了". It is weaker on wording than the European pairs: "captions" became 标题 ("titles") and "the second traffic light" became 第二道路灯.

## Device note

The first load compiles the WASM runtime and runs a one-second warmup, so it takes a few seconds even from the cache. The page, three.js and the Transformers.js script come from the network or the HTTP cache; only the model and ONNX Runtime files are pinned in the Cache API. Phones and standalone headsets have not been measured, and single-threaded WASM will be slower there than on a desktop CPU. The translation worker ran about 2.5 times slower than the same code on the main thread on the Mac, which keeps rendering and captions smooth at the cost of translation speed.

## Credits

- [Moonshine](https://github.com/moonshine-ai/moonshine) speech recognition models by Useful Sensors, MIT license. The [ONNX conversion](https://huggingface.co/onnx-community/moonshine-base-ONNX) is by onnx-community.
- [Opus-MT](https://github.com/Helsinki-NLP/Opus-MT) translation models by Helsinki-NLP (Jörg Tiedemann and the OPUS-MT team, University of Helsinki), trained on [OPUS](https://opus.nlpl.eu/) data: English to Spanish, French and Chinese are Apache-2.0, and English to German is CC-BY-4.0. The ONNX conversions are by [Xenova](https://huggingface.co/Xenova).
- [Transformers.js](https://github.com/huggingface/transformers.js) is Apache-2.0, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) is MIT.
- The explicit download, Cache API, worker lifecycle and preload panel patterns follow the on-device Gemma demos in [#634](https://github.com/google/xrblocks/pull/634) and [#642](https://github.com/google/xrblocks/pull/642), without importing their files.
- Created for [#629](https://github.com/google/xrblocks/issues/629), the call for on-device machine learning demos.
